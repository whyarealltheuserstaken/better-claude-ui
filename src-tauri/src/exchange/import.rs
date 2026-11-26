//! "Import data": reads a file, a folder or a ZIP exported from another assistant (or from this app),
//! shows a preview, and on request adds the conversations to the Archive.
//!
//! Imported files are UNTRUSTED. Size limits apply to everything read; ZIP entries are only ever read
//! into memory by an allow-listed base name (never extracted to disk); and settings from a restored
//! backup are filtered so a crafted file cannot re-enable risky behaviour (see `sanitize_settings`).

use super::archive::{self, ArchiveDoc, ArchiveEntry};
use super::model::*;
use super::parse::{self, Format, Parsed};
use crate::{presets, usage};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::io::Read;
use std::path::Path;

pub const MAX_FILE_BYTES: u64 = 300 * 1024 * 1024;
pub const MAX_TOTAL_BYTES: u64 = 600 * 1024 * 1024;
const MAX_ZIP_ENTRIES: usize = 5_000;
const MAX_USAGE_RECORDS: usize = 200_000;

/// File contents by lowercase base name.
#[derive(Debug)]
pub struct Source {
    pub files: Vec<(String, Vec<u8>)>,
}

fn wanted_in_container(name: &str) -> bool {
    name == "conversations.json"
        || (name.starts_with("conversations-") && name.ends_with(".json"))
        || matches!(name, "projects.json" | "backup.json" | "universal.json")
}

fn read_limited(r: &mut impl Read, budget: &mut u64) -> Result<Vec<u8>, String> {
    let mut buf = Vec::new();
    let cap = (*budget).min(MAX_FILE_BYTES);
    r.take(cap + 1)
        .read_to_end(&mut buf)
        .map_err(|e| e.to_string())?;
    if buf.len() as u64 > cap {
        return Err("This file is too large to import (limit about 300 MB).".into());
    }
    *budget -= buf.len() as u64;
    Ok(buf)
}

pub fn read_source(path: &Path) -> Result<Source, String> {
    let mut budget = MAX_TOTAL_BYTES;
    let lower = path
        .file_name()
        .map(|n| n.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    let mut files = Vec::new();
    if path.is_dir() {
        let rd = std::fs::read_dir(path).map_err(|e| e.to_string())?;
        for e in rd.flatten() {
            let name = e.file_name().to_string_lossy().to_lowercase();
            if e.path().is_file() && wanted_in_container(&name) {
                files.push((
                    name,
                    read_limited(
                        &mut std::fs::File::open(e.path()).map_err(|e| e.to_string())?,
                        &mut budget,
                    )?,
                ));
            }
        }
    } else if lower.ends_with(".zip") {
        let mut zip = zip::ZipArchive::new(
            std::fs::File::open(path).map_err(|e| format!("Couldn't open the file: {e}"))?,
        )
        .map_err(|_| "That doesn't look like a valid ZIP file.".to_string())?;
        if zip.len() > MAX_ZIP_ENTRIES {
            return Err("This ZIP has too many files to be a chat export.".into());
        }
        for i in 0..zip.len() {
            let mut entry = zip.by_index(i).map_err(|e| e.to_string())?;
            if entry.is_dir() {
                continue;
            }
            // Only the base name matters; nothing is ever written to disk from a ZIP.
            let full = entry.name().map(|n| n.into_owned()).unwrap_or_default();
            let name = full.rsplit(['/', '\\']).next().unwrap_or("").to_lowercase();
            if wanted_in_container(&name) {
                files.push((name, read_limited(&mut entry, &mut budget)?));
            }
        }
    } else if path.is_file() {
        files.push((
            lower,
            read_limited(
                &mut std::fs::File::open(path)
                    .map_err(|e| format!("Couldn't open the file: {e}"))?,
                &mut budget,
            )?,
        ));
    } else {
        return Err("That file or folder doesn't exist.".into());
    }
    if files.is_empty() {
        return Err("No chat export files were found there. Look for conversations.json (Claude.ai, ChatGPT), backup.json (this app) or a Markdown/text file.".into());
    }
    Ok(Source { files })
}

#[derive(Debug, Clone)]
pub struct BackupExtras {
    pub config: Value,
    pub usage: Vec<usage::Record>,
    pub presets: Vec<presets::Preset>,
}

#[derive(Debug)]
pub struct Analysis {
    pub format: Format,
    pub parsed: Parsed,
    pub backup: Option<BackupExtras>,
    /// Original app session id by archive id, for restored backups (to skip ones already here).
    pub original_ids: HashMap<String, String>,
    /// The app's transcript items by archive id (restored backups keep tool activity).
    pub items: HashMap<String, Vec<Value>>,
    pub files: Vec<String>,
}

fn merge(into: &mut Parsed, from: Parsed) {
    for c in from.conversations {
        if !into.conversations.iter().any(|x| x.id == c.id) {
            into.conversations.push(c);
        }
    }
    for p in from.projects {
        if !into.projects.iter().any(|x| x.name == p.name) {
            into.projects.push(p);
        }
    }
    for w in from.warnings {
        if !into.warnings.contains(&w) {
            into.warnings.push(w);
        }
    }
}

fn analyze_backup(bytes: &[u8]) -> Result<Analysis, String> {
    let v: Value =
        serde_json::from_slice(bytes).map_err(|_| "backup.json isn't valid JSON.".to_string())?;
    if parse::detect(&v) != Format::Backup {
        return Err("backup.json isn't a BetterClaudeUI backup.".into());
    }
    if v.get("version")
        .and_then(Value::as_u64)
        .is_some_and(|n| n > 1)
    {
        return Err("This backup was made by a newer version of BetterClaudeUI. Update the app, then try again.".into());
    }
    let mut parsed = Parsed::default();
    let mut original_ids = HashMap::new();
    let mut items = HashMap::new();
    for c in v
        .get("conversations")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .take(MAX_CONVERSATIONS)
    {
        let orig = c.get("id").and_then(Value::as_str).unwrap_or("");
        let messages: Vec<Message> = c
            .get("messages")
            .and_then(|m| serde_json::from_value(m.clone()).ok())
            .unwrap_or_default();
        let messages: Vec<Message> = messages
            .into_iter()
            .filter(|m| m.role == "user" || m.role == "assistant")
            .take(MAX_MESSAGES)
            .map(|m| Message {
                text: clamp_text(&m.text),
                ..m
            })
            .collect();
        if messages.is_empty() {
            continue;
        }
        let title = c
            .get("title")
            .and_then(Value::as_str)
            .map(clean_title)
            .filter(|t| !t.is_empty())
            .unwrap_or_else(|| title_from_messages(&messages));
        // Archive conversations keep their id (so restoring on the same or another computer never
        // duplicates them); saved sessions get a stable id derived from their session id.
        let id = if orig.starts_with("imp-") && archive::valid_id(orig) {
            orig.to_string()
        } else {
            conversation_id("better-claude-ui", orig)
        };
        if let Some(it) = c.get("items").and_then(Value::as_array) {
            items.insert(id.clone(), it.clone());
        }
        original_ids.insert(id.clone(), orig.to_string());
        parsed.conversations.push(Conversation {
            id,
            title,
            source: c
                .get("source")
                .and_then(Value::as_str)
                .unwrap_or("better-claude-ui")
                .chars()
                .take(40)
                .collect(),
            created: c.get("created").and_then(Value::as_i64),
            updated: c.get("updated").and_then(Value::as_i64),
            messages,
        });
    }
    for p in v
        .get("config")
        .and_then(|c| c.get("projects"))
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        if let Some(name) = p.get("name").and_then(Value::as_str) {
            parsed.projects.push(ImportedProject {
                name: clean_title(name),
                instructions: p
                    .get("instructions")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .chars()
                    .take(20_000)
                    .collect(),
            });
        }
    }
    if !parsed.projects.is_empty() {
        parsed.warnings.push("Project folders are not restored (they belong to the other computer), only names and instructions.".into());
    }
    let usage: Vec<usage::Record> = v
        .get("usage")
        .and_then(|u| serde_json::from_value(u.clone()).ok())
        .unwrap_or_default();
    let presets: Vec<presets::Preset> = v
        .get("presets")
        .and_then(|u| serde_json::from_value(u.clone()).ok())
        .unwrap_or_default();
    Ok(Analysis {
        format: Format::Backup,
        parsed,
        backup: Some(BackupExtras {
            config: v.get("config").cloned().unwrap_or(Value::Null),
            usage,
            presets,
        }),
        original_ids,
        items,
        files: vec!["backup.json".into()],
    })
}

pub fn analyze(src: &Source) -> Result<Analysis, String> {
    if let Some((_, bytes)) = src.files.iter().find(|(n, _)| n == "backup.json") {
        return analyze_backup(bytes);
    }
    let mut parsed = Parsed::default();
    let mut format = Format::Unknown;
    let mut files = Vec::new();
    for (name, bytes) in &src.files {
        let part = if name.ends_with(".md") || name.ends_with(".markdown") || name.ends_with(".txt")
        {
            let f = Format::Markdown;
            (
                f,
                parse::parse_markdown(&String::from_utf8_lossy(bytes), name),
            )
        } else {
            match serde_json::from_slice::<Value>(bytes) {
                Ok(v) => parse::parse_json(&v),
                Err(_) => {
                    parsed
                        .warnings
                        .push(format!("{name} isn't valid JSON and was skipped."));
                    continue;
                }
            }
        };
        if !part.1.conversations.is_empty() || !part.1.projects.is_empty() {
            if format == Format::Unknown {
                format = part.0;
            }
            files.push(name.clone());
        }
        merge(&mut parsed, part.1);
    }
    if parsed.conversations.is_empty() && parsed.projects.is_empty() {
        return Err("This file doesn't look like a chat export we can read. Supported: Claude.ai and ChatGPT exports (the .zip or conversations.json), this app's backup, and Markdown or text transcripts.".into());
    }
    parsed.conversations.truncate(MAX_CONVERSATIONS);
    Ok(Analysis {
        format,
        parsed,
        backup: None,
        original_ids: HashMap::new(),
        items: HashMap::new(),
        files,
    })
}

#[derive(Debug, Clone, Serialize)]
pub struct Inspection {
    pub format: String,
    pub source: String,
    pub conversations: usize,
    pub messages: usize,
    pub projects: usize,
    pub has_settings: bool,
    pub usage_records: usize,
    pub presets: usize,
    pub date_from: Option<i64>,
    pub date_to: Option<i64>,
    pub samples: Vec<String>,
    pub warnings: Vec<String>,
    pub files: Vec<String>,
}

pub fn inspect(a: &Analysis) -> Inspection {
    let dates: Vec<i64> = a
        .parsed
        .conversations
        .iter()
        .filter_map(|c| c.updated.or(c.created))
        .collect();
    let b = a.backup.as_ref();
    Inspection {
        format: a.format.label().into(),
        source: a.format.source().into(),
        conversations: a.parsed.conversations.len(),
        messages: a
            .parsed
            .conversations
            .iter()
            .map(|c| c.messages.len())
            .sum(),
        projects: a.parsed.projects.len(),
        has_settings: b.is_some_and(|b| {
            !sanitize_settings(&b.config)
                .as_object()
                .is_none_or(|o| o.is_empty())
        }),
        usage_records: b.map_or(0, |b| b.usage.len()),
        presets: b.map_or(0, |b| b.presets.len()),
        date_from: dates.iter().min().copied(),
        date_to: dates.iter().max().copied(),
        samples: a
            .parsed
            .conversations
            .iter()
            .take(5)
            .map(|c| c.title.clone())
            .collect(),
        warnings: a.parsed.warnings.clone(),
        files: a.files.clone(),
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct ImportOptions {
    pub conversations: bool,
    pub projects: bool,
    pub settings: bool,
    pub usage: bool,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct ImportResult {
    pub conversations_added: usize,
    pub duplicates_skipped: usize,
    /// For the UI to merge into its own config (it owns the config file).
    pub projects: Vec<ImportedProject>,
    pub settings: Option<Value>,
    pub usage_added: usize,
    pub presets_added: usize,
    pub warnings: Vec<String>,
}

fn word(v: Option<&Value>, max: usize, extra: &[char]) -> Option<String> {
    let s = v?.as_str()?;
    (!s.is_empty()
        && s.chars().count() <= max
        && s.chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || extra.contains(&c)))
    .then(|| s.to_string())
}

/// The ONLY settings a restored backup may change. Deliberately left out, so a crafted backup cannot
/// weaken safety: `always_allow` (auto-approved tools), `extra_args` (raw CLI flags),
/// `default_permission_mode` (could be bypass), `onboarded`, `recents`, update bookkeeping, and
/// `projects` (handled separately, instructions only).
pub fn sanitize_settings(cfg: &Value) -> Value {
    let mut out = serde_json::Map::new();
    let Some(o) = cfg.as_object() else {
        return Value::Object(out);
    };
    if let Some(t) = o
        .get("tier")
        .and_then(Value::as_str)
        .filter(|t| matches!(*t, "beginner" | "intermediate" | "advanced"))
    {
        out.insert("tier".into(), t.into());
    }
    for k in ["theme", "style"] {
        if let Some(v) = word(o.get(k), 48, &[]) {
            out.insert(k.into(), v.into());
        }
    }
    if let Some(v) = word(o.get("default_model"), 48, &['.', '[', ']']) {
        out.insert("default_model".into(), v.into());
    }
    for k in ["auto_update_check", "auto_refresh_limits"] {
        if let Some(b) = o.get(k).and_then(Value::as_bool) {
            out.insert(k.into(), b.into());
        }
    }
    if let Some(n) = o
        .get("refresh_limits_minutes")
        .and_then(Value::as_u64)
        .filter(|n| (5..=180).contains(n))
    {
        out.insert("refresh_limits_minutes".into(), n.into());
    }
    for k in ["budget_daily_usd", "budget_monthly_usd"] {
        if let Some(n) = o
            .get(k)
            .and_then(Value::as_f64)
            .filter(|n| n.is_finite() && (0.0..=1_000_000.0).contains(n))
        {
            out.insert(k.into(), serde_json::json!(n));
        }
    }
    for k in ["custom_themes", "custom_styles"] {
        if let Some(a) = o.get(k).and_then(Value::as_array) {
            out.insert(
                k.into(),
                Value::Array(
                    a.iter()
                        .filter(|x| x.is_object())
                        .take(100)
                        .cloned()
                        .collect(),
                ),
            );
        }
    }
    if let Some(a) = o.get("home_widgets").and_then(Value::as_array) {
        out.insert(
            "home_widgets".into(),
            Value::Array(
                a.iter()
                    .filter(|x| x.as_str().is_some_and(|s| s.len() <= 40))
                    .take(30)
                    .cloned()
                    .collect(),
            ),
        );
    }
    Value::Object(out)
}

fn valid_preset_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 48
        && id
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '_')
}

/// Apply an analysis. `native_ids` are the saved-session ids already on this computer (restored
/// backups skip those); `now` is Unix seconds.
pub fn apply(
    a: Analysis,
    opts: &ImportOptions,
    dir: &Path,
    native_ids: &HashSet<String>,
    now: i64,
) -> std::io::Result<ImportResult> {
    let mut r = ImportResult {
        warnings: a.parsed.warnings.clone(),
        ..Default::default()
    };
    if opts.conversations {
        let mut batch = Vec::new();
        for c in &a.parsed.conversations {
            if a.original_ids
                .get(&c.id)
                .is_some_and(|o| native_ids.contains(o))
            {
                r.duplicates_skipped += 1;
                continue;
            }
            batch.push((
                ArchiveEntry {
                    id: c.id.clone(),
                    title: c.title.clone(),
                    source: c.source.clone(),
                    created: c.created,
                    updated: c.updated,
                    messages: c.messages.len(),
                    imported_at: now,
                },
                ArchiveDoc {
                    messages: c.messages.clone(),
                    items: a.items.get(&c.id).cloned(),
                },
            ));
        }
        let (added, skipped) = archive::add(dir, batch)?;
        r.conversations_added = added;
        r.duplicates_skipped += skipped;
    }
    if opts.projects {
        r.projects = a.parsed.projects.clone();
    }
    if let Some(b) = &a.backup {
        if opts.settings {
            let s = sanitize_settings(&b.config);
            if s.as_object().is_some_and(|o| !o.is_empty()) {
                r.settings = Some(s);
            }
            for p in &b.presets {
                let path = dir.join("presets").join(format!("{}.json", p.id));
                if valid_preset_id(&p.id)
                    && !presets::builtin().iter().any(|x| x.id == p.id)
                    && !path.exists()
                    && !p.agents.is_empty()
                {
                    std::fs::create_dir_all(dir.join("presets"))?;
                    std::fs::write(path, serde_json::to_vec_pretty(p)?)?;
                    r.presets_added += 1;
                }
            }
        }
        if opts.usage && !b.usage.is_empty() {
            let key =
                |x: &usage::Record| (x.ts, x.session.clone(), x.model.clone(), x.input, x.output);
            let have: HashSet<_> = usage::load(dir).iter().map(key).collect();
            let fresh: Vec<usage::Record> = b
                .usage
                .iter()
                .take(MAX_USAGE_RECORDS)
                .filter(|x| !have.contains(&key(x)))
                .cloned()
                .collect();
            r.usage_added = fresh.len();
            usage::append(dir, &fresh)?;
        }
    }
    Ok(r)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config;
    use serde_json::json;
    use std::io::Write;

    fn tmp(name: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("bcu-import-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    fn zip_of(path: &Path, files: &[(&str, &[u8])]) {
        let mut w = zip::ZipWriter::new(std::fs::File::create(path).unwrap());
        for (name, data) in files {
            w.start_file(*name, zip::write::SimpleFileOptions::default())
                .unwrap();
            w.write_all(data).unwrap();
        }
        w.finish().unwrap();
    }

    fn claude_conversations() -> Value {
        json!([{"uuid":"c1","name":"Fix login","created_at":"2024-05-01T10:00:00Z","chat_messages":[{"sender":"human","text":"hi"},{"sender":"assistant","text":"hello"}]}])
    }

    const ALL: ImportOptions = ImportOptions {
        conversations: true,
        projects: true,
        settings: true,
        usage: true,
    };

    #[test]
    fn reads_a_zip_picking_only_known_files_and_ignoring_the_rest() {
        let d = tmp("zip");
        let z = d.join("data-2024.zip");
        zip_of(
            &z,
            &[
                (
                    "conversations.json",
                    claude_conversations().to_string().as_bytes(),
                ),
                ("users.json", b"{\"email\":\"private\"}"),
                ("nested/dir/projects.json", b"[]"),
                ("../evil.json", b"[]"),
            ],
        );
        let src = read_source(&z).unwrap();
        let names: Vec<&str> = src.files.iter().map(|(n, _)| n.as_str()).collect();
        assert_eq!(names, vec!["conversations.json", "projects.json"]);
        assert!(
            !names.contains(&"users.json"),
            "account details are never read"
        );
        let a = analyze(&src).unwrap();
        assert_eq!(a.format, Format::ClaudeAi);
        assert_eq!(inspect(&a).conversations, 1);
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn reads_single_json_markdown_and_folders() {
        let d = tmp("single");
        std::fs::write(
            d.join("conversations.json"),
            claude_conversations().to_string(),
        )
        .unwrap();
        std::fs::write(
            d.join("notes.md"),
            "## You\n\nhi\n\n## Assistant\n\nhello\n",
        )
        .unwrap();
        assert_eq!(
            analyze(&read_source(&d.join("conversations.json")).unwrap())
                .unwrap()
                .format,
            Format::ClaudeAi
        );
        assert_eq!(
            analyze(&read_source(&d.join("notes.md")).unwrap())
                .unwrap()
                .format,
            Format::Markdown
        );
        assert_eq!(
            analyze(&read_source(&d).unwrap())
                .unwrap()
                .parsed
                .conversations
                .len(),
            1,
            "folder: only the known file names"
        );
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn friendly_errors_for_junk() {
        let d = tmp("junk");
        std::fs::write(d.join("a.json"), "{not json").unwrap();
        std::fs::write(d.join("b.json"), "{\"hello\":1}").unwrap();
        std::fs::write(d.join("bad.zip"), "not a zip").unwrap();
        assert!(
            analyze(&read_source(&d.join("a.json")).unwrap())
                .unwrap_err()
                .contains("doesn't look like a chat export")
        );
        assert!(analyze(&read_source(&d.join("b.json")).unwrap()).is_err());
        assert!(
            read_source(&d.join("bad.zip"))
                .unwrap_err()
                .contains("valid ZIP")
        );
        assert!(
            read_source(&d.join("missing.json"))
                .unwrap_err()
                .contains("doesn't exist")
        );
        let empty_zip = d.join("e.zip");
        zip_of(&empty_zip, &[("readme.txt", b"x")]);
        assert!(
            read_source(&empty_zip)
                .unwrap_err()
                .contains("No chat export files")
        );
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn oversized_input_is_refused() {
        let mut budget = 10u64;
        assert!(
            read_limited(&mut std::io::Cursor::new(vec![0u8; 100]), &mut budget)
                .unwrap_err()
                .contains("too large")
        );
        let mut budget = 1000u64;
        assert_eq!(
            read_limited(&mut std::io::Cursor::new(vec![0u8; 100]), &mut budget)
                .unwrap()
                .len(),
            100
        );
        assert_eq!(budget, 900);
    }

    #[test]
    fn importing_adds_to_the_archive_and_reimporting_adds_nothing() {
        let d = tmp("apply");
        let src = Source {
            files: vec![(
                "conversations.json".into(),
                claude_conversations().to_string().into_bytes(),
            )],
        };
        let r1 = apply(analyze(&src).unwrap(), &ALL, &d, &HashSet::new(), 100).unwrap();
        assert_eq!((r1.conversations_added, r1.duplicates_skipped), (1, 0));
        let r2 = apply(analyze(&src).unwrap(), &ALL, &d, &HashSet::new(), 200).unwrap();
        assert_eq!((r2.conversations_added, r2.duplicates_skipped), (0, 1));
        let list = archive::list(&d);
        assert_eq!(list.len(), 1);
        assert_eq!(
            (list[0].source.as_str(), list[0].imported_at),
            ("claude.ai", 100)
        );
        assert_eq!(archive::get(&d, &list[0].id).unwrap().messages.len(), 2);
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn options_are_respected() {
        let d = tmp("opts");
        let v = json!([{"uuid":"c1","name":"x","chat_messages":[{"sender":"human","text":"hi"}]},{"uuid":"p","name":"Proj","prompt_template":"Be brief"}]);
        let src = Source {
            files: vec![("conversations.json".into(), v.to_string().into_bytes())],
        };
        let none = ImportOptions {
            conversations: false,
            projects: false,
            settings: false,
            usage: false,
        };
        let r = apply(analyze(&src).unwrap(), &none, &d, &HashSet::new(), 1).unwrap();
        assert_eq!((r.conversations_added, r.projects.len()), (0, 0));
        assert!(archive::list(&d).is_empty());
        let only_projects = ImportOptions {
            projects: true,
            ..none
        };
        let r = apply(
            analyze(&src).unwrap(),
            &only_projects,
            &d,
            &HashSet::new(),
            1,
        )
        .unwrap();
        assert_eq!(r.projects[0].instructions, "Be brief");
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn settings_from_a_backup_can_never_weaken_safety() {
        let hostile = json!({
            "tier":"advanced","theme":"midnight","style":"terminal","default_model":"opus","auto_update_check":false,"budget_daily_usd":5.5,
            "always_allow":["Bash","Write"],"extra_args":["--dangerously-skip-permissions"],"default_permission_mode":"bypassPermissions",
            "onboarded":false,"recents":[{"x":1}],"skipped_version":"9.9.9","last_update_check":1,"projects":[{"name":"p"}],
            "theme_bad":"x","custom_themes":[{"id":"a","name":"A"},"junk",5],
        });
        let s = sanitize_settings(&hostile);
        let o = s.as_object().unwrap();
        for forbidden in [
            "always_allow",
            "extra_args",
            "default_permission_mode",
            "onboarded",
            "recents",
            "skipped_version",
            "last_update_check",
            "projects",
            "theme_bad",
        ] {
            assert!(
                !o.contains_key(forbidden),
                "{forbidden} must not be restorable"
            );
        }
        assert_eq!(o["tier"], "advanced");
        assert_eq!(o["theme"], "midnight");
        assert_eq!(o["budget_daily_usd"], 5.5);
        assert_eq!(
            o["custom_themes"].as_array().unwrap().len(),
            1,
            "only objects survive"
        );
        assert!(!sanitize_settings(&json!({"tier":"root","theme":"../../x","default_model":"a b; rm -rf","budget_daily_usd":-1})).as_object().is_some_and(|o| o.contains_key("tier") || o.contains_key("theme") || o.contains_key("default_model") || o.contains_key("budget_daily_usd")));
        assert!(
            sanitize_settings(&json!("not an object"))
                .as_object()
                .unwrap()
                .is_empty()
        );
    }

    fn backup_doc() -> Value {
        json!({
            "format":"better-claude-ui-backup","version":1,"exported_at":1,"app_version":"0.1.0",
            "config":{"tier":"intermediate","theme":"midnight","always_allow":["Bash"],"projects":[{"id":"p1","name":"Site","instructions":"Plain English","cwd":"C:\\x"}]},
            "conversations":[
              {"id":"sess-1","title":"Native one","source":"better-claude-ui","updated":5,"messages":[{"role":"user","text":"q"},{"role":"assistant","text":"a"}],"items":[{"kind":"tool","id":"t"}]},
              {"id":"sess-2","title":"Native two","source":"better-claude-ui","messages":[{"role":"user","text":"q2"}]}
            ],
            "usage":[{"ts":1,"session":"s","project":null,"mode":"chat","preset":null,"model":"m","input":1,"output":2,"cache_read":0,"cache_write":0,"cost_usd":0.5}],
            "presets":[{"id":"my-team","title":"Mine","description":"d","agents":{"a":{"description":"x","prompt":"y"}},"system_prompt":"s"},{"id":"deep-research","title":"Hijack","description":"d","agents":{"a":{"description":"x","prompt":"y"}},"system_prompt":"s"},{"id":"../bad","title":"B","description":"d","agents":{"a":{"description":"x","prompt":"y"}},"system_prompt":"s"}]
        })
    }

    #[test]
    fn restoring_a_backup_skips_conversations_already_here_and_keeps_tool_items() {
        let d = tmp("backup");
        let src = Source {
            files: vec![("backup.json".into(), backup_doc().to_string().into_bytes())],
        };
        let a = analyze(&src).unwrap();
        let info = inspect(&a);
        assert_eq!(
            (
                info.conversations,
                info.projects,
                info.usage_records,
                info.has_settings
            ),
            (2, 1, 1, true)
        );
        let native: HashSet<String> = ["sess-1".to_string()].into();
        let r = apply(a, &ALL, &d, &native, 9).unwrap();
        assert_eq!(
            (r.conversations_added, r.duplicates_skipped),
            (1, 1),
            "sess-1 already exists here"
        );
        let two = archive::list(&d).pop().unwrap();
        assert_eq!(two.title, "Native two");
        assert_eq!(r.usage_added, 1);
        assert_eq!(r.settings.as_ref().unwrap()["tier"], "intermediate");
        assert!(r.settings.as_ref().unwrap().get("always_allow").is_none());
        assert_eq!(r.projects[0].name, "Site");
        assert_eq!(
            r.presets_added, 1,
            "only the valid, non-builtin, new preset"
        );
        assert!(d.join("presets").join("my-team.json").is_file());
        assert!(!d.join("presets").join("deep-research.json").exists());
        // restoring again must not double usage or conversations
        let a2 = analyze(&src).unwrap();
        let r2 = apply(a2, &ALL, &d, &native, 10).unwrap();
        assert_eq!(
            (r2.conversations_added, r2.usage_added, r2.presets_added),
            (0, 0, 0)
        );
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn exporting_then_importing_back_into_the_same_profile_adds_nothing() {
        use crate::exchange::export;
        let d = tmp("same");
        // an archived conversation (from a Claude.ai import) and a saved session
        let src = Source {
            files: vec![(
                "conversations.json".into(),
                claude_conversations().to_string().into_bytes(),
            )],
        };
        apply(analyze(&src).unwrap(), &ALL, &d, &HashSet::new(), 1).unwrap();
        let cfg = config::AppConfig {
            recents: vec![config::SavedSession {
                cli_session_id: "s1".into(),
                title: "Hello".into(),
                cwd: None,
                mode: "chat".into(),
                model: None,
                preset: None,
                effort: None,
                web_search: false,
                project: None,
                updated_at: 5000,
            }],
            ..Default::default()
        };
        config::save(&d, &cfg).unwrap();
        config::save_transcript(&d, "s1", &json!([{"kind":"user","id":"i1","text":"ping"},{"kind":"assistant","id":"i2","text":"pong","streaming":false,"nested":false}]).to_string()).unwrap();
        let out = tmp("same-out");
        let res = export::export_all(&d, &out, 1_795_608_000, "0.1.0").unwrap();
        let an = analyze(&read_source(Path::new(&res.folder)).unwrap()).unwrap();
        let native: HashSet<String> = ["s1".to_string()].into();
        let r = apply(an, &ALL, &d, &native, 2).unwrap();
        assert_eq!(r.conversations_added, 0, "nothing should be duplicated");
        assert_eq!(r.duplicates_skipped, 2);
        assert_eq!(archive::list(&d).len(), 1);
        for p in [d, out] {
            let _ = std::fs::remove_dir_all(p);
        }
    }

    #[test]
    fn backups_from_a_newer_app_or_with_the_wrong_marker_are_refused_clearly() {
        let newer = json!({"format":"better-claude-ui-backup","version":99});
        let e = analyze(&Source {
            files: vec![("backup.json".into(), newer.to_string().into_bytes())],
        })
        .err()
        .unwrap();
        assert!(e.contains("newer version"));
        let wrong = analyze(&Source {
            files: vec![("backup.json".into(), b"{\"format\":\"other\"}".to_vec())],
        })
        .err()
        .unwrap();
        assert!(wrong.contains("isn't a BetterClaudeUI backup"));
    }

    #[test]
    fn full_roundtrip_export_then_import_into_a_fresh_profile() {
        use crate::exchange::export;
        let a = tmp("rt-a");
        let cfg = config::AppConfig {
            theme: "terminal-green".into(),
            always_allow: vec!["Bash".into()],
            recents: vec![config::SavedSession {
                cli_session_id: "s1".into(),
                title: "Hello".into(),
                cwd: None,
                mode: "chat".into(),
                model: None,
                preset: None,
                effort: None,
                web_search: false,
                project: None,
                updated_at: 5000,
            }],
            ..Default::default()
        };
        config::save(&a, &cfg).unwrap();
        config::save_transcript(&a, "s1", &json!([{"kind":"user","id":"i1","text":"ping"},{"kind":"assistant","id":"i2","text":"pong","streaming":false,"nested":false}]).to_string()).unwrap();
        let out = tmp("rt-out");
        let res = export::export_all(&a, &out, 1_795_608_000, "0.1.0").unwrap();
        let b = tmp("rt-b");
        // import the exported FOLDER into a different, empty profile
        let an = analyze(&read_source(Path::new(&res.folder)).unwrap()).unwrap();
        let r = apply(an, &ALL, &b, &HashSet::new(), 1).unwrap();
        assert_eq!(r.conversations_added, 1);
        let entry = &archive::list(&b)[0];
        assert_eq!(entry.title, "Hello");
        let doc = archive::get(&b, &entry.id).unwrap();
        assert_eq!(
            doc.messages
                .iter()
                .map(|m| m.text.as_str())
                .collect::<Vec<_>>(),
            vec!["ping", "pong"]
        );
        assert!(
            doc.items.is_some(),
            "restored backups keep the original items"
        );
        assert_eq!(r.settings.unwrap()["theme"], "terminal-green");
        // and the universal file alone also imports
        let uni =
            analyze(&read_source(&Path::new(&res.folder).join("universal.json")).unwrap()).unwrap();
        assert_eq!(uni.format, Format::Universal);
        for p in [a, out, b] {
            let _ = std::fs::remove_dir_all(p);
        }
    }
}
