//! Tauri IPC surface: thin glue between the UI and the session/permission core.

use crate::cli::detect::{self, CliStatus};
use crate::cli::events::Event;
use crate::cli::setup::{self, AuthStatus};
use crate::config::{self, AppConfig};
use crate::features::{FeatureInfo, builtin_registry};
use crate::files;
use crate::permissions::{Decision, PendingPermission, PermissionBroker};
use crate::platform;
use crate::presets::{self, Preset};
use crate::session::{SessionEvent, SessionManager, SessionOptions};
use crate::updates::{self, ProblemKind, UpdateInfo, UpdateProblem};
use crate::usage::{self, DeltaTracker, LimitsSnapshot, Record, Summary};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::Mutex as StdMutex;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_updater::UpdaterExt;
use tokio::process::Command;
use tokio::sync::Mutex;

/// What the usage ledger needs to know about a session.
#[derive(Clone)]
struct SessionInfo {
    project: Option<String>,
    mode: &'static str,
    preset: Option<String>,
}

/// Shared state for recording usage from the event forwarder.
#[derive(Clone, Default)]
struct UsageCtx {
    tracker: Arc<StdMutex<DeltaTracker>>,
    info: Arc<StdMutex<HashMap<String, SessionInfo>>>,
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// An update found by the last check, and its downloaded (already verified) bytes.
#[derive(Default)]
struct PendingUpdate {
    update: Option<tauri_plugin_updater::Update>,
    bytes: Option<Vec<u8>>,
}

#[derive(Default)]
pub struct AppState {
    pending_update: Mutex<PendingUpdate>,
    manager: Mutex<Option<Arc<SessionManager>>>,
    broker: Arc<Mutex<PermissionBroker>>,
    usage: UsageCtx,
}

impl AppState {
    pub async fn shutdown(&self) {
        if let Some(m) = self.manager.lock().await.as_ref() {
            m.stop_all().await;
        }
    }
}

#[derive(Serialize, Clone)]
struct SessionEventPayload {
    session_id: String,
    event: SessionEvent,
}

#[derive(Deserialize)]
pub struct StartOptions {
    pub cwd: Option<String>,
    pub model: Option<String>,
    pub permission_mode: Option<String>,
    pub resume: Option<String>,
    #[serde(default)]
    pub no_tools: bool,
    #[serde(default)]
    pub extra_args: Vec<String>,
    #[serde(default)]
    pub web_search: bool,
    pub effort: Option<String>,
    /// Project instructions, appended to the system prompt (max 20,000 characters).
    pub instructions: Option<String>,
    /// Preset id (see `presets`), resolved to `--agents` + a coordinator system prompt.
    pub preset: Option<String>,
}

async fn manager(state: &State<'_, AppState>) -> Result<Arc<SessionManager>, String> {
    state
        .manager
        .lock()
        .await
        .clone()
        .ok_or_else(|| "claude CLI not available; run cli_status first".to_string())
}

/// Detect the CLI; when usable, (re)create the session manager and start forwarding events.
#[tauri::command]
pub async fn cli_status(
    app: AppHandle,
    state: State<'_, AppState>,
    override_path: Option<String>,
) -> Result<CliStatus, String> {
    let ov = override_path.map(PathBuf::from);
    let status = tokio::task::spawn_blocking(move || detect::detect(ov.as_deref()))
        .await
        .map_err(|e| e.to_string())?;
    if let CliStatus::Found { path, .. } = &status {
        let mut slot = state.manager.lock().await;
        if let Some(old) = slot.take() {
            old.stop_all().await;
        }
        let mgr = Arc::new(SessionManager::new(path.clone()));
        spawn_forwarder(app, mgr.clone(), state.broker.clone(), state.usage.clone());
        *slot = Some(mgr);
    }
    Ok(status)
}

fn spawn_forwarder(
    app: AppHandle,
    mgr: Arc<SessionManager>,
    broker: Arc<Mutex<PermissionBroker>>,
    ctx: UsageCtx,
) {
    let mut rx = mgr.subscribe();
    tokio::spawn(async move {
        loop {
            let (sid, ev) = match rx.recv().await {
                Ok(x) => x,
                Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                Err(_) => break,
            };
            let mut emit = true;
            match &ev {
                SessionEvent::Cli {
                    event: e @ Event::PermissionRequest { .. },
                } => {
                    let auto = broker.lock().await.on_event(&sid, e);
                    if let Some((request_id, reply)) = auto {
                        let _ = mgr.respond_permission(&sid, &request_id, reply).await;
                        emit = false;
                    }
                }
                SessionEvent::Cli {
                    event:
                        Event::TurnResult {
                            session_id, models, ..
                        },
                } => record_usage(&ctx, &sid, session_id, models),
                SessionEvent::Cli {
                    event:
                        Event::RateLimit {
                            status,
                            windows,
                            using_overage,
                        },
                } if !windows.is_empty() => {
                    let _ = usage::save_limits(
                        &platform::config_dir(),
                        &LimitsSnapshot {
                            captured_at: now_ms(),
                            status: status.clone(),
                            using_overage: *using_overage,
                            windows: windows.clone(),
                        },
                    );
                }
                SessionEvent::Exited { .. } => {
                    broker.lock().await.clear_session(&sid);
                    ctx.info.lock().unwrap().remove(&sid);
                    ctx.tracker.lock().unwrap().forget(&sid);
                }
                _ => {}
            }
            if emit {
                let _ = app.emit(
                    "session-event",
                    SessionEventPayload {
                        session_id: sid,
                        event: ev,
                    },
                );
            }
        }
    });
}

#[tauri::command]
pub async fn start_session(
    state: State<'_, AppState>,
    opts: StartOptions,
) -> Result<String, String> {
    let m = manager(&state).await?;
    let cwd = match (opts.cwd, opts.no_tools) {
        (Some(c), _) => PathBuf::from(c),
        // Chat mode has no project: use a private scratch directory.
        (None, true) => {
            config::chat_scratch_dir(&platform::config_dir()).map_err(|e| e.to_string())?
        }
        (None, false) => std::env::current_dir().unwrap_or_else(|_| std::env::temp_dir()),
    };
    if !cwd.is_dir() {
        return Err(format!(
            "working directory does not exist: {}",
            cwd.display()
        ));
    }
    let is_chat = opts.no_tools;
    let project = if is_chat {
        None
    } else {
        Some(cwd.to_string_lossy().to_string())
    };
    let preset_id = opts.preset.clone();
    let instructions = opts.instructions.clone();
    if instructions
        .as_ref()
        .is_some_and(|t| t.chars().count() > 20_000)
    {
        return Err("project instructions are too long (limit 20,000 characters)".into());
    }
    let mut extra_args = opts.extra_args;
    if let Some(id) = &opts.preset {
        let all = presets::load_all(&platform::config_dir().join("presets"));
        let p = all
            .iter()
            .find(|p| &p.id == id)
            .ok_or_else(|| format!("unknown preset `{id}`"))?;
        let mut a = presets::cli_args_with(p, instructions.as_deref());
        a.extend(extra_args);
        extra_args = a;
    } else if let Some(text) = instructions.as_deref().filter(|t| !t.trim().is_empty()) {
        let mut a = vec!["--append-system-prompt".to_string(), text.to_string()];
        a.extend(extra_args);
        extra_args = a;
    }
    let id = m
        .start(SessionOptions {
            cwd,
            model: opts.model,
            permission_mode: opts.permission_mode,
            resume: opts.resume,
            no_tools: opts.no_tools,
            extra_args,
            web_search: opts.web_search,
            effort: opts.effort,
            ..Default::default()
        })
        .await
        .map_err(|e| e.to_string())?;
    state.usage.info.lock().unwrap().insert(
        id.clone(),
        SessionInfo {
            project,
            mode: if is_chat { "chat" } else { "code" },
            preset: preset_id,
        },
    );
    Ok(id)
}

#[tauri::command]
pub async fn send_message(
    state: State<'_, AppState>,
    session_id: String,
    text: String,
    attachments: Option<Vec<crate::session::Attachment>>,
) -> Result<(), String> {
    manager(&state)
        .await?
        .send_with(&session_id, &text, &attachments.unwrap_or_default())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn interrupt(state: State<'_, AppState>, session_id: String) -> Result<(), String> {
    manager(&state)
        .await?
        .interrupt(&session_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn stop_session(state: State<'_, AppState>, session_id: String) -> Result<(), String> {
    state.broker.lock().await.clear_session(&session_id);
    manager(&state)
        .await?
        .stop(&session_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn resolve_permission(
    state: State<'_, AppState>,
    request_id: String,
    decision: String,
    reason: Option<String>,
) -> Result<(), String> {
    let d = match decision.as_str() {
        "allow" => Decision::Allow,
        "allow_always" => Decision::AllowAlways,
        "deny" => Decision::Deny(reason),
        other => return Err(format!("unknown decision `{other}`")),
    };
    let (p, reply) = state
        .broker
        .lock()
        .await
        .resolve(&request_id, d)
        .map_err(|e| e.to_string())?;
    manager(&state)
        .await?
        .respond_permission(&p.session_id, &p.request_id, reply)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn pending_permissions(
    state: State<'_, AppState>,
) -> Result<Vec<PendingPermission>, String> {
    Ok(state.broker.lock().await.pending())
}

#[tauri::command]
pub fn list_features() -> Vec<FeatureInfo> {
    builtin_registry().list().to_vec()
}

#[tauri::command]
pub async fn get_config(state: State<'_, AppState>) -> Result<AppConfig, String> {
    let cfg = config::load(&platform::config_dir());
    state
        .broker
        .lock()
        .await
        .set_persistent(cfg.always_allow.clone());
    Ok(cfg)
}

#[tauri::command]
pub async fn set_config(state: State<'_, AppState>, config: AppConfig) -> Result<(), String> {
    state
        .broker
        .lock()
        .await
        .set_persistent(config.always_allow.clone());
    config::save(&platform::config_dir(), &config).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_transcript(cli_session_id: String, json: String) -> Result<(), String> {
    config::save_transcript(&platform::config_dir(), &cli_session_id, &json)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_transcript(cli_session_id: String) -> Option<String> {
    config::load_transcript(&platform::config_dir(), &cli_session_id)
}

#[tauri::command]
pub fn delete_transcript(cli_session_id: String) {
    config::delete_transcript(&platform::config_dir(), &cli_session_id)
}

#[tauri::command]
pub fn list_presets() -> Vec<Preset> {
    presets::load_all(&platform::config_dir().join("presets"))
}

/// Is the user signed in to Claude Code? (Uses `claude auth status`.)
#[tauri::command]
pub async fn auth_status() -> Result<AuthStatus, String> {
    tokio::task::spawn_blocking(|| match detect::detect(None) {
        CliStatus::Found { path, .. } => setup::auth_status(&path),
        _ => AuthStatus::Unknown {
            reason: "claude is not installed".into(),
        },
    })
    .await
    .map_err(|e| e.to_string())
}

/// What the installer step will run, shown to the user before they confirm.
#[tauri::command]
pub fn installer_preview() -> String {
    platform::installer_command().display.to_string()
}

/// Run a setup step ("install" or "login") and stream its output as `setup-log` events.
/// Returns the process exit code. Only ever called from an explicit button in the wizard.
#[tauri::command]
pub async fn run_setup_step(app: AppHandle, step: String) -> Result<Option<i32>, String> {
    let cmd = match step.as_str() {
        "install" => {
            let ic = platform::installer_command();
            let mut c = Command::new(ic.program);
            c.args(&ic.args);
            c
        }
        "login" => {
            let CliStatus::Found { path, .. } =
                tokio::task::spawn_blocking(|| detect::detect(None))
                    .await
                    .map_err(|e| e.to_string())?
            else {
                return Err("claude is not installed yet".into());
            };
            let mut c = Command::new(path);
            c.args(["auth", "login"]);
            c
        }
        other => return Err(format!("unknown setup step `{other}`")),
    };
    setup::run_streaming(cmd, move |line| {
        let _ = app.emit("setup-log", line);
    })
    .await
}

fn record_usage(
    ctx: &UsageCtx,
    ui_session: &str,
    cli_session: &str,
    models: &[crate::cli::events::ModelUsage],
) {
    let info = ctx.info.lock().unwrap().get(ui_session).cloned();
    let deltas = ctx.tracker.lock().unwrap().deltas(ui_session, models);
    let ts = now_ms();
    let records: Vec<Record> = deltas
        .into_iter()
        .map(|d| Record {
            ts,
            session: cli_session.to_string(),
            project: info.as_ref().and_then(|i| i.project.clone()),
            mode: info.as_ref().map_or("code", |i| i.mode).to_string(),
            preset: info.as_ref().and_then(|i| i.preset.clone()),
            model: d.model,
            input: d.input,
            output: d.output,
            cache_read: d.cache_read,
            cache_write: d.cache_write,
            cost_usd: d.cost_usd,
        })
        .collect();
    let _ = usage::append(&platform::config_dir(), &records);
}

/// Dashboard numbers. offset_minutes is the local UTC offset (east is positive).
#[tauri::command]
pub async fn usage_summary(offset_minutes: i32, days: u32) -> Result<Summary, String> {
    tokio::task::spawn_blocking(move || {
        let recs = usage::load(&platform::config_dir());
        usage::summarize(&recs, now_ms(), offset_minutes, days)
    })
    .await
    .map_err(|e| e.to_string())
}

/// Create or remove the tray icon. Not async: tray work belongs on the main thread.
#[tauri::command]
pub fn tray_apply(app: tauri::AppHandle, enabled: bool, keep_running: bool) -> Result<(), String> {
    crate::tray::apply(&app, enabled, keep_running)
}

#[tauri::command]
pub fn tray_update(
    app: tauri::AppHandle,
    waiting: bool,
    running: u32,
    pending: u32,
    title: Option<String>,
    lines: Vec<String>,
) -> Result<(), String> {
    crate::tray::update(
        &app,
        crate::tray::Status {
            waiting,
            running,
            pending,
            title,
            lines,
        },
    )
}

/// The tray panel asks the main window, and the main window calls these.
#[tauri::command]
pub fn tray_open(app: tauri::AppHandle) {
    crate::tray::hide_panel(&app);
    crate::tray::show_main(&app);
}

#[tauri::command]
pub fn tray_quit(app: tauri::AppHandle) {
    crate::tray::hide_panel(&app);
    crate::tray::request_quit(&app);
}

/// Totals for one conversation, by the CLI's session id.
#[tauri::command]
pub async fn usage_session(session_id: String) -> Result<usage::Totals, String> {
    tokio::task::spawn_blocking(move || {
        usage::session_totals(&usage::load(&platform::config_dir()), &session_id)
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn usage_limits() -> Option<LimitsSnapshot> {
    usage::load_limits(&platform::config_dir())
}

#[tauri::command]
pub fn usage_clear() -> Result<(), String> {
    usage::clear(&platform::config_dir()).map_err(|e| e.to_string())
}

fn config_target(
    target: &str,
    project: Option<String>,
) -> Result<(files::Target, PathBuf), String> {
    let t =
        files::Target::parse(target).ok_or_else(|| files::FileError::UnknownTarget.to_string())?;
    let home = platform::home().ok_or_else(|| "could not find your home folder".to_string())?;
    let proj = project.map(PathBuf::from);
    let path = files::resolve(t, &home, proj.as_deref()).map_err(|e| e.to_string())?;
    Ok((t, path))
}

/// Read one of the four editable Claude Code files (empty text if it does not exist yet).
#[tauri::command]
pub fn read_config_file(target: String, project: Option<String>) -> Result<String, String> {
    let (_, path) = config_target(&target, project)?;
    files::read(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_config_file(
    target: String,
    project: Option<String>,
    content: String,
) -> Result<(), String> {
    let (t, path) = config_target(&target, project)?;
    files::write(t, &path, &content).map_err(|e| e.to_string())
}

#[derive(Serialize)]
pub struct CliOutput {
    code: Option<i32>,
    output: String,
}

/// Run an allow-listed `claude` management command (MCP servers, plugin list).
#[tauri::command]
pub async fn run_cli(args: Vec<String>, cwd: Option<String>) -> Result<CliOutput, String> {
    if !setup::is_allowed_cli_args(&args) {
        return Err("that command is not available from the app".into());
    }
    let CliStatus::Found { path, .. } = tokio::task::spawn_blocking(|| detect::detect(None))
        .await
        .map_err(|e| e.to_string())?
    else {
        return Err("claude is not installed".into());
    };
    let mut cmd = Command::new(path);
    cmd.args(&args);
    if let Some(c) = cwd.filter(|c| PathBuf::from(c).is_dir()) {
        cmd.current_dir(c);
    }
    let lines = Arc::new(std::sync::Mutex::new(Vec::<String>::new()));
    let sink = lines.clone();
    let run = setup::run_streaming(cmd, move |l| sink.lock().unwrap().push(l));
    let code = tokio::time::timeout(std::time::Duration::from_secs(90), run)
        .await
        .map_err(|_| "the command took too long".to_string())??;
    let output = lines.lock().unwrap().join("\n");
    Ok(CliOutput { code, output })
}

/// Open the user's own terminal and continue this conversation there (escape hatch).
#[tauri::command]
pub fn open_in_terminal(cli_session_id: String, cwd: Option<String>) -> Result<(), String> {
    let valid = !cli_session_id.is_empty()
        && cli_session_id.len() <= 128
        && cli_session_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if !valid {
        return Err("invalid session id".into());
    }
    let dir = cwd
        .map(PathBuf::from)
        .filter(|p| p.is_dir())
        .or_else(platform::home)
        .ok_or_else(|| "no folder to open".to_string())?;
    let (program, args) = platform::terminal_launch(&dir, &cli_session_id);
    std::process::Command::new(program)
        .args(args)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("could not open a terminal: {e}"))
}

/// Search saved conversations by text (user and assistant messages).
#[tauri::command]
pub async fn search_conversations(query: String) -> Result<Vec<crate::search::Hit>, String> {
    tokio::task::spawn_blocking(move || crate::search::search(&platform::config_dir(), &query))
        .await
        .map_err(|e| e.to_string())
}

/// The version of the running app.
#[tauri::command]
pub fn app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

fn build_updater(app: &AppHandle) -> Result<tauri_plugin_updater::Updater, UpdateProblem> {
    #[allow(unused_mut)]
    let mut builder = app.updater_builder();
    // Debug builds only: point the updater at a local test server. Release builds can only
    // ever use the HTTPS endpoint compiled into tauri.conf.json.
    #[cfg(debug_assertions)]
    if let Ok(raw) = std::env::var("BCU_UPDATE_ENDPOINT") {
        match updates::parse_endpoint(&raw) {
            Some(url) => {
                builder = builder
                    .endpoints(vec![url])
                    .map_err(|e| updates::classify(&e))?
            }
            None => {
                return Err(UpdateProblem::other(
                    "BCU_UPDATE_ENDPOINT is not a valid http(s) URL",
                ));
            }
        }
    }
    builder.build().map_err(|e| updates::classify(&e))
}

/// Ask the update server whether a newer version exists. Remembers the result for
/// `download_update`. Does not download anything.
#[tauri::command]
pub async fn check_for_update(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<UpdateInfo, UpdateProblem> {
    let current_version = app.package_info().version.to_string();
    let found = build_updater(&app)?
        .check()
        .await
        .map_err(|e| updates::classify(&e))?;
    let mut pending = state.pending_update.lock().await;
    match found {
        Some(u) => {
            let info = UpdateInfo {
                available: true,
                current_version,
                version: Some(u.version.clone()),
                notes: updates::trim_notes(u.body.as_deref()),
                date: u.date.map(|d| d.unix_timestamp()),
            };
            // A different version than before invalidates any downloaded bytes.
            if pending.update.as_ref().map(|p| &p.version) != Some(&u.version) {
                pending.bytes = None;
            }
            pending.update = Some(u);
            Ok(info)
        }
        None => {
            *pending = PendingUpdate::default();
            Ok(UpdateInfo {
                available: false,
                current_version,
                version: None,
                notes: None,
                date: None,
            })
        }
    }
}

#[derive(Serialize, Clone)]
struct UpdateProgress {
    downloaded: u64,
    total: Option<u64>,
}

/// Download the update found by `check_for_update` and verify its signature. Emits
/// `update-progress` events. Nothing is installed.
#[tauri::command]
pub async fn download_update(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), UpdateProblem> {
    let update = state
        .pending_update
        .lock()
        .await
        .update
        .clone()
        .ok_or_else(|| {
            UpdateProblem::other("There is no update to download. Check for updates first.")
        })?;
    if !updates::download_url_allowed(update.download_url.scheme(), cfg!(debug_assertions)) {
        return Err(UpdateProblem {
            kind: ProblemKind::BuildConfig,
            message:
                "This update isn't offered over a secure connection, so it was not downloaded."
                    .into(),
            detail: format!("download url scheme {}", update.download_url.scheme()),
        });
    }
    let mut downloaded: u64 = 0;
    let handle = app.clone();
    let bytes = update
        .download(
            move |chunk, total| {
                downloaded += chunk as u64;
                let _ = handle.emit("update-progress", UpdateProgress { downloaded, total });
            },
            || {},
        )
        .await
        .map_err(|e| updates::classify(&e))?;
    state.pending_update.lock().await.bytes = Some(bytes);
    Ok(())
}

/// Install the verified, downloaded update and relaunch. On Windows the installer takes over
/// and this process exits; the `claude` child processes are stopped first so none are orphaned.
#[tauri::command]
pub async fn install_update(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), UpdateProblem> {
    let (update, bytes) = {
        let p = state.pending_update.lock().await;
        match (p.update.clone(), p.bytes.clone()) {
            (Some(u), Some(b)) => (u, b),
            _ => {
                return Err(UpdateProblem::other(
                    "The update hasn't been downloaded yet.",
                ));
            }
        }
    };
    state.shutdown().await;
    update.install(&bytes).map_err(|e| updates::classify(&e))?;
    app.restart()
}

// ---- Export / import / archive ----------------------------------------------------------

/// Write a full export (backup, universal JSON, Markdown files) into a new folder inside `folder`.
#[tauri::command]
pub async fn export_data(
    app: AppHandle,
    folder: String,
) -> Result<crate::exchange::export::ExportResult, String> {
    let version = app.package_info().version.to_string();
    tokio::task::spawn_blocking(move || {
        crate::exchange::export::export_all(
            &platform::config_dir(),
            std::path::Path::new(&folder),
            (now_ms() / 1000) as i64,
            &version,
        )
        .map_err(|e| format!("Couldn't write the export: {e}"))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Read a file, folder or ZIP and describe what is in it, without saving anything.
#[tauri::command]
pub async fn inspect_import(path: String) -> Result<crate::exchange::import::Inspection, String> {
    tokio::task::spawn_blocking(move || {
        let src = crate::exchange::import::read_source(std::path::Path::new(&path))?;
        Ok(crate::exchange::import::inspect(
            &crate::exchange::import::analyze(&src)?,
        ))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Import into the Archive. Settings and projects are returned for the UI to merge into its own
/// config (the UI owns the config file); usage and presets are written here.
#[tauri::command]
pub async fn run_import(
    path: String,
    options: crate::exchange::import::ImportOptions,
) -> Result<crate::exchange::import::ImportResult, String> {
    tokio::task::spawn_blocking(move || {
        let dir = platform::config_dir();
        let src = crate::exchange::import::read_source(std::path::Path::new(&path))?;
        let analysis = crate::exchange::import::analyze(&src)?;
        let native: std::collections::HashSet<String> = config::load(&dir)
            .recents
            .into_iter()
            .map(|r| r.cli_session_id)
            .collect();
        crate::exchange::import::apply(analysis, &options, &dir, &native, (now_ms() / 1000) as i64)
            .map_err(|e| format!("Couldn't save the imported data: {e}"))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn archive_list() -> Vec<crate::exchange::archive::ArchiveEntry> {
    crate::exchange::archive::list(&platform::config_dir())
}

#[tauri::command]
pub fn archive_get(id: String) -> Option<crate::exchange::archive::ArchiveDoc> {
    crate::exchange::archive::get(&platform::config_dir(), &id)
}

#[tauri::command]
pub fn archive_delete(id: String) -> Result<(), String> {
    crate::exchange::archive::delete(&platform::config_dir(), &id).map_err(|e| e.to_string())
}

/// Ask Claude Code for the current plan allowance with one tiny request (about a tenth of a cent
/// in API-equivalent cost). The CLI reports allowance only alongside a reply, so this is the only
/// way to refresh it without sending a real message. The cost is recorded in the usage ledger.
#[tauri::command]
pub async fn refresh_limits() -> Result<LimitsSnapshot, String> {
    let CliStatus::Found { path, .. } = tokio::task::spawn_blocking(|| detect::detect(None))
        .await
        .map_err(|e| e.to_string())?
    else {
        return Err("Claude Code isn't installed.".into());
    };
    let dir = platform::config_dir();
    let cwd = config::chat_scratch_dir(&dir).map_err(|e| e.to_string())?;
    let mut cmd = Command::new(path);
    cmd.args(usage::refresh_args()).current_dir(cwd);
    let lines = Arc::new(std::sync::Mutex::new(Vec::<String>::new()));
    let sink = lines.clone();
    let run = setup::run_streaming(cmd, move |l| sink.lock().unwrap().push(l));
    tokio::time::timeout(std::time::Duration::from_secs(60), run)
        .await
        .map_err(|_| "That took too long. Try again in a moment.".to_string())??;
    let lines = lines.lock().unwrap().clone();
    // Record the (tiny) spend honestly. Each of these processes starts from zero, so the
    // reported per-model totals are already per-request.
    let ts = now_ms();
    let records: Vec<Record> = lines
        .iter()
        .filter_map(|l| crate::cli::events::parse_line(l).ok())
        .flatten()
        .filter_map(|e| match e {
            Event::TurnResult { models, .. } => Some(models),
            _ => None,
        })
        .flatten()
        .map(|m| Record {
            ts,
            session: "limits-refresh".into(),
            project: None,
            mode: "chat".into(),
            preset: None,
            model: m.model,
            input: m.input,
            output: m.output,
            cache_read: m.cache_read,
            cache_write: m.cache_write,
            cost_usd: m.cost_usd,
        })
        .collect();
    let _ = usage::append(&dir, &records);
    let snap = usage::snapshot_from_lines(&lines, ts).ok_or_else(|| {
        "Claude Code didn't report your allowance this time. Please try again.".to_string()
    })?;
    usage::save_limits(&dir, &snap).map_err(|e| e.to_string())?;
    Ok(snap)
}
