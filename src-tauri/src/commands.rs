//! Tauri IPC surface: thin glue between the UI and the session/permission core.

use crate::cli::detect::{self, CliStatus};
use crate::cli::events::Event;
use crate::config::{self, AppConfig};
use crate::features::{FeatureInfo, builtin_registry};
use crate::permissions::{Decision, PendingPermission, PermissionBroker};
use crate::platform;
use crate::presets::{self, Preset};
use crate::session::{SessionEvent, SessionManager, SessionOptions};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::Mutex;

#[derive(Default)]
pub struct AppState {
    manager: Mutex<Option<Arc<SessionManager>>>,
    broker: Arc<Mutex<PermissionBroker>>,
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
        spawn_forwarder(app, mgr.clone(), state.broker.clone());
        *slot = Some(mgr);
    }
    Ok(status)
}

fn spawn_forwarder(app: AppHandle, mgr: Arc<SessionManager>, broker: Arc<Mutex<PermissionBroker>>) {
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
                SessionEvent::Exited { .. } => broker.lock().await.clear_session(&sid),
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
    let mut extra_args = opts.extra_args;
    if let Some(id) = &opts.preset {
        let all = presets::load_all(&platform::config_dir().join("presets"));
        let p = all
            .iter()
            .find(|p| &p.id == id)
            .ok_or_else(|| format!("unknown preset `{id}`"))?;
        let mut a = presets::cli_args(p);
        a.extend(extra_args);
        extra_args = a;
    }
    m.start(SessionOptions {
        cwd,
        model: opts.model,
        permission_mode: opts.permission_mode,
        resume: opts.resume,
        no_tools: opts.no_tools,
        extra_args,
        ..Default::default()
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn send_message(
    state: State<'_, AppState>,
    session_id: String,
    text: String,
) -> Result<(), String> {
    manager(&state)
        .await?
        .send(&session_id, &text)
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
