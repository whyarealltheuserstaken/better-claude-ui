//! "Export all my data": writes a new folder containing `backup.json` (everything, restorable by this
//! app: settings, projects, conversations with tool activity, usage history and your agent-team
//! presets), `universal.json` (conversations in a simple documented format other tools can read, see
//! docs/EXPORT_FORMAT.md), `conversations/` (one readable Markdown file per conversation, to paste into
//! any assistant) and `README.txt` (what each file is, plus a privacy note).
//!
//! It never overwrites anything: the folder name is unique.

use super::archive;
use super::model::*;
use crate::{config, presets, usage};
use serde::Serialize;
use serde_json::{Value, json};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize)]
pub struct ExportResult {
    pub folder: String,
    pub conversations: usize,
    pub files: usize,
    pub bytes: u64,
}

/// One conversation gathered for export (from saved sessions or the archive).
#[derive(Debug, Clone)]
pub struct ExportConv {
    pub id: String,
    pub title: String,
    pub source: String,
    pub created: Option<i64>,
    pub updated: Option<i64>,
    pub mode: Option<String>,
    pub cwd: Option<String>,
    pub messages: Vec<Message>,
    /// The app's own transcript items (tool cards and all), for lossless restore.
    pub items: Option<Vec<Value>>,
}

fn items_to_messages(items: &[Value]) -> Vec<Message> {
    items
        .iter()
        .filter_map(|it| {
            let kind = it.get("kind")?.as_str()?;
            let text = it.get("text")?.as_str()?;
            let nested = it.get("nested").and_then(Value::as_bool).unwrap_or(false);
            let role = match kind {
                "user" => "user",
                "assistant" if !nested => "assistant",
                _ => return None,
            };
            (!text.trim().is_empty()).then(|| Message {
                role: role.into(),
                text: clamp_text(text),
                at: None,
            })
        })
        .collect()
}

/// Every conversation the app knows about: saved sessions first, then the archive.
pub fn gather(dir: &Path) -> Vec<ExportConv> {
    let cfg = config::load(dir);
    let mut out = Vec::new();
    for r in &cfg.recents {
        let items: Vec<Value> = config::load_transcript(dir, &r.cli_session_id)
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default();
        let messages = items_to_messages(&items);
        if messages.is_empty() {
            continue;
        }
        out.push(ExportConv {
            id: r.cli_session_id.clone(),
            title: clean_title(&r.title),
            source: "better-claude-ui".into(),
            created: None,
            updated: Some((r.updated_at / 1000) as i64),
            mode: Some(r.mode.clone()),
            cwd: r.cwd.clone(),
            messages,
            items: Some(items),
        });
    }
    for e in archive::list(dir) {
        if let Some(doc) = archive::get(dir, &e.id) {
            out.push(ExportConv {
                id: e.id,
                title: e.title,
                source: e.source,
                created: e.created,
                updated: e.updated,
                mode: None,
                cwd: None,
                messages: doc.messages,
                items: doc.items,
            });
        }
    }
    out
}

pub fn conversation_markdown(c: &ExportConv) -> String {
    let mut s = format!("# {}\n\n", c.title);
    let when = c.updated.or(c.created).map(pretty_utc);
    s.push_str(&format!(
        "_Source: {}{} · exported from BetterClaudeUI_\n\n",
        c.source,
        when.map(|w| format!(" · {w}")).unwrap_or_default()
    ));
    for m in &c.messages {
        s.push_str(if m.role == "user" {
            "## You\n\n"
        } else {
            "## Assistant\n\n"
        });
        s.push_str(m.text.trim_end());
        s.push_str("\n\n");
    }
    s
}

pub fn universal_json(convs: &[ExportConv], exported_at: i64) -> Value {
    json!({
        "format": "universal-chat-export",
        "version": 1,
        "exported_at": exported_at,
        "exported_by": "BetterClaudeUI",
        "conversations": convs.iter().map(|c| json!({
            "id": c.id, "title": c.title, "source": c.source, "created": c.created, "updated": c.updated,
            "messages": c.messages.iter().map(|m| json!({"role": m.role, "text": m.text, "at": m.at})).collect::<Vec<_>>(),
        })).collect::<Vec<_>>(),
    })
}

pub fn backup_json(dir: &Path, convs: &[ExportConv], exported_at: i64, app_version: &str) -> Value {
    let cfg = config::load(dir);
    let custom_presets: Vec<presets::Preset> = presets::load_all(&dir.join("presets"))
        .into_iter()
        .filter(|p| p.custom)
        .collect();
    json!({
        "format": "better-claude-ui-backup",
        "version": 1,
        "exported_at": exported_at,
        "app_version": app_version,
        "config": cfg,
        "conversations": convs.iter().map(|c| json!({
            "id": c.id, "title": c.title, "source": c.source, "created": c.created, "updated": c.updated,
            "mode": c.mode, "cwd": c.cwd, "messages": c.messages, "items": c.items,
        })).collect::<Vec<_>>(),
        "usage": usage::load(dir),
        "presets": custom_presets,
    })
}

const README: &str = "This folder is an export from BetterClaudeUI.\n\n\
backup.json        Everything, so BetterClaudeUI can restore it (Settings > Your data > Import).\n\
universal.json     Your conversations in a simple format other tools can read. Described in\n\
                   docs/EXPORT_FORMAT.md in the BetterClaudeUI project.\n\
conversations/     One Markdown file per conversation. Open them in any editor, or paste one into\n\
                   another assistant to continue from it.\n\n\
PRIVACY: these files contain your conversations (and possibly file paths and the text of files you\n\
attached). Anyone who gets this folder can read them. Keep it somewhere private.\n\n\
A restored backup never re-enables risky settings: \"always allow\" rules, extra command-line flags and\n\
permission-bypass defaults are not imported.\n";

fn unique_folder(parent: &Path, stamp: &str) -> std::io::Result<PathBuf> {
    for n in 0..100 {
        let name = if n == 0 {
            format!("better-claude-ui-export-{stamp}")
        } else {
            format!("better-claude-ui-export-{stamp}-{}", n + 1)
        };
        let p = parent.join(name);
        match std::fs::create_dir(&p) {
            Ok(()) => return Ok(p),
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e),
        }
    }
    Err(std::io::Error::other(
        "could not find an unused folder name",
    ))
}

pub fn export_all(
    dir: &Path,
    parent: &Path,
    now_secs: i64,
    app_version: &str,
) -> std::io::Result<ExportResult> {
    if !parent.is_dir() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "the chosen folder does not exist",
        ));
    }
    let convs = gather(dir);
    let folder = unique_folder(parent, &stamp_utc(now_secs))?;
    let mut bytes = 0u64;
    let mut files = 0usize;
    let mut put = |path: PathBuf, data: Vec<u8>| -> std::io::Result<()> {
        bytes += data.len() as u64;
        files += 1;
        std::fs::write(path, data)
    };
    put(
        folder.join("backup.json"),
        serde_json::to_vec_pretty(&backup_json(dir, &convs, now_secs, app_version))?,
    )?;
    put(
        folder.join("universal.json"),
        serde_json::to_vec_pretty(&universal_json(&convs, now_secs))?,
    )?;
    put(folder.join("README.txt"), README.as_bytes().to_vec())?;
    std::fs::create_dir(folder.join("conversations"))?;
    for (i, c) in convs.iter().enumerate() {
        // A number prefix keeps names unique and avoids reserved Windows names like CON.
        let name = format!("{:03}-{}.md", i + 1, safe_filename(&c.title, 60));
        put(
            folder.join("conversations").join(name),
            conversation_markdown(c).into_bytes(),
        )?;
    }
    Ok(ExportResult {
        folder: folder.to_string_lossy().to_string(),
        conversations: convs.len(),
        files,
        bytes,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::exchange::parse;

    fn setup(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("bcu-export-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        let cfg = config::AppConfig {
            theme: "midnight".into(),
            recents: vec![config::SavedSession {
                cli_session_id: "sess-1".into(),
                title: "Fix the login bug".into(),
                cwd: Some("C:\\demo".into()),
                mode: "code".into(),
                model: None,
                preset: None,
                effort: None,
                web_search: false,
                project: None,
                updated_at: 1_700_000_000_000,
            }],
            ..Default::default()
        };
        config::save(&d, &cfg).unwrap();
        config::save_transcript(
            &d,
            "sess-1",
            &json!([
                {"kind":"user","id":"i1","text":"How do I fix it?"},
                {"kind":"tool","id":"t1","name":"Bash","input":{},"output":"ok","status":"done","nested":false},
                {"kind":"assistant","id":"i2","text":"Use a relative URL.","streaming":false,"nested":false},
                {"kind":"assistant","id":"i3","text":"helper chatter","streaming":false,"nested":true}
            ])
            .to_string(),
        )
        .unwrap();
        archive::add(
            &d,
            vec![(
                archive::ArchiveEntry {
                    id: "imp-abc".into(),
                    title: "From Claude.ai".into(),
                    source: "claude.ai".into(),
                    created: Some(1),
                    updated: Some(2),
                    messages: 2,
                    imported_at: 3,
                },
                archive::ArchiveDoc {
                    messages: vec![
                        Message {
                            role: "user".into(),
                            text: "q".into(),
                            at: None,
                        },
                        Message {
                            role: "assistant".into(),
                            text: "a".into(),
                            at: None,
                        },
                    ],
                    items: None,
                },
            )],
        )
        .unwrap();
        d
    }

    #[test]
    fn gather_collects_saved_sessions_and_the_archive_without_tool_noise() {
        let d = setup("gather");
        let c = gather(&d);
        assert_eq!(c.len(), 2);
        assert_eq!(
            c[0].messages
                .iter()
                .map(|m| m.text.as_str())
                .collect::<Vec<_>>(),
            vec!["How do I fix it?", "Use a relative URL."]
        );
        assert!(c[0].items.is_some() && c[1].items.is_none());
        assert_eq!(c[1].source, "claude.ai");
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn export_writes_all_files_into_a_new_folder_and_never_overwrites() {
        let d = setup("write");
        let out = std::env::temp_dir().join(format!("bcu-export-out-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&out);
        std::fs::create_dir_all(&out).unwrap();
        let a = export_all(&d, &out, 1_795_608_000, "0.1.0").unwrap();
        let b = export_all(&d, &out, 1_795_608_000, "0.1.0").unwrap();
        assert_ne!(a.folder, b.folder, "same-second exports must not collide");
        let f = PathBuf::from(&a.folder);
        assert!(f.ends_with("better-claude-ui-export-20261125-120000"));
        for name in ["backup.json", "universal.json", "README.txt"] {
            assert!(f.join(name).is_file(), "{name}");
        }
        let md: Vec<_> = std::fs::read_dir(f.join("conversations"))
            .unwrap()
            .flatten()
            .collect();
        assert_eq!(md.len(), 2);
        assert_eq!((a.conversations, a.files), (2, 5));
        let _ = std::fs::remove_dir_all(&d);
        let _ = std::fs::remove_dir_all(&out);
    }

    #[test]
    fn universal_json_and_markdown_read_back_through_the_importers() {
        let d = setup("roundtrip");
        let convs = gather(&d);
        let (f, p) = parse::parse_json(&universal_json(&convs, 5));
        assert_eq!(f, parse::Format::Universal);
        assert_eq!(p.conversations.len(), 2);
        assert_eq!(p.conversations[0].messages.len(), 2);
        let md = parse::parse_markdown(&conversation_markdown(&convs[0]), "x.md");
        assert_eq!(md.conversations[0].title, "Fix the login bug");
        assert_eq!(
            md.conversations[0]
                .messages
                .iter()
                .map(|m| m.role.as_str())
                .collect::<Vec<_>>(),
            vec!["user", "assistant"]
        );
        assert_eq!(md.conversations[0].messages[1].text, "Use a relative URL.");
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn backup_carries_settings_conversations_with_items_and_the_format_marker() {
        let d = setup("backup");
        let b = backup_json(&d, &gather(&d), 1, "0.1.0");
        assert_eq!(b["format"], "better-claude-ui-backup");
        assert_eq!(b["config"]["theme"], "midnight");
        assert_eq!(b["conversations"][0]["items"][1]["kind"], "tool");
        assert_eq!(parse::detect(&b), parse::Format::Backup);
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn exporting_into_a_missing_folder_is_a_clear_error_and_an_empty_app_still_exports() {
        let d = std::env::temp_dir().join(format!("bcu-export-empty-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        assert!(export_all(&d, Path::new("/definitely/not/here"), 0, "x").is_err());
        let r = export_all(&d, &d, 0, "x").unwrap();
        assert_eq!(r.conversations, 0);
        let _ = std::fs::remove_dir_all(&d);
    }
}
