//! Persistent app settings, recent sessions and saved transcripts (JSON files in the config dir).
//! Everything here is tolerant: a missing or corrupt file yields defaults, never a crash.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct AppConfig {
    /// "beginner" | "intermediate" | "advanced"
    pub tier: String,
    pub onboarded: bool,
    pub default_model: Option<String>,
    pub default_permission_mode: Option<String>,
    /// Tools the user chose to always allow (persisted across sessions).
    pub always_allow: Vec<String>,
    /// Advanced: extra CLI args appended to every session.
    pub extra_args: Vec<String>,
    pub recents: Vec<SavedSession>,
    /// Selected theme id ("auto" follows the system light/dark setting).
    pub theme: String,
    /// Selected style id (layout/typography preset).
    pub style: String,
    /// User-made themes and styles; the UI validates their shape.
    pub custom_themes: Vec<serde_json::Value>,
    pub custom_styles: Vec<serde_json::Value>,
    /// Optional spending alerts (API-equivalent USD). None means no budget.
    pub budget_daily_usd: Option<f64>,
    pub budget_monthly_usd: Option<f64>,
    /// Ordered ids of the widgets shown on the Home page.
    pub home_widgets: Vec<String>,
    /// Named projects (instructions + optional folder); the UI validates their shape.
    pub projects: Vec<serde_json::Value>,
    /// Check for app updates automatically (at most once a day).
    pub auto_update_check: bool,
    /// Unix milliseconds of the last update check (manual or automatic).
    pub last_update_check: Option<u64>,
    /// A version the user chose to skip; automatic checks stay quiet about it.
    pub skipped_version: Option<String>,
    /// Refresh the plan-allowance meters on a timer (opt-in; each refresh is one tiny request).
    pub auto_refresh_limits: bool,
    /// Minutes between automatic refreshes (5 to 180).
    pub refresh_limits_minutes: u32,
    /// Layout preferences.
    pub sidebar_hidden: bool,
    pub panel_hidden: bool,
    /// The Settings category last shown.
    pub settings_category: String,
    /// Usage widget and tray settings; the UI validates their shape.
    pub usage_widget: serde_json::Value,
    pub tray: serde_json::Value,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            tier: "beginner".into(),
            onboarded: false,
            default_model: None,
            default_permission_mode: None,
            always_allow: vec![],
            extra_args: vec![],
            recents: vec![],
            theme: "auto".into(),
            style: "modern".into(),
            custom_themes: vec![],
            custom_styles: vec![],
            budget_daily_usd: None,
            budget_monthly_usd: None,
            home_widgets: [
                "quick-start",
                "projects",
                "limits",
                "spend-today",
                "spend-month",
                "daily-chart",
                "by-model",
                "by-project",
                "recent",
                "status",
            ]
            .map(String::from)
            .to_vec(),
            projects: vec![],
            auto_update_check: true,
            last_update_check: None,
            skipped_version: None,
            auto_refresh_limits: false,
            refresh_limits_minutes: 15,
            sidebar_hidden: false,
            panel_hidden: false,
            settings_category: "general".into(),
            usage_widget: serde_json::Value::Null,
            tray: serde_json::Value::Null,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SavedSession {
    pub cli_session_id: String,
    pub title: String,
    pub cwd: Option<String>,
    /// "code" | "chat"
    pub mode: String,
    pub model: Option<String>,
    pub preset: Option<String>,
    #[serde(default)]
    pub effort: Option<String>,
    #[serde(default)]
    pub web_search: bool,
    #[serde(default)]
    pub project: Option<String>,
    pub updated_at: u64,
}

const MAX_RECENTS: usize = 50;

pub fn config_path(dir: &Path) -> PathBuf {
    dir.join("config.json")
}

pub fn load(dir: &Path) -> AppConfig {
    std::fs::read_to_string(config_path(dir))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save(dir: &Path, cfg: &AppConfig) -> std::io::Result<()> {
    let mut cfg = cfg.clone();
    cfg.recents.sort_by_key(|r| std::cmp::Reverse(r.updated_at));
    cfg.recents.truncate(MAX_RECENTS);
    std::fs::create_dir_all(dir)?;
    let tmp = dir.join("config.json.tmp");
    std::fs::write(&tmp, serde_json::to_vec_pretty(&cfg)?)?;
    std::fs::rename(tmp, config_path(dir))
}

fn safe_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

fn transcript_path(dir: &Path, id: &str) -> Option<PathBuf> {
    safe_id(id).then(|| dir.join("transcripts").join(format!("{id}.json")))
}

pub fn save_transcript(dir: &Path, id: &str, json: &str) -> std::io::Result<()> {
    let p = transcript_path(dir, id).ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::InvalidInput, "invalid session id")
    })?;
    serde_json::from_str::<serde_json::Value>(json)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
    std::fs::create_dir_all(p.parent().unwrap())?;
    std::fs::write(p, json)
}

pub fn load_transcript(dir: &Path, id: &str) -> Option<String> {
    std::fs::read_to_string(transcript_path(dir, id)?).ok()
}

pub fn delete_transcript(dir: &Path, id: &str) {
    if let Some(p) = transcript_path(dir, id) {
        let _ = std::fs::remove_file(p);
    }
}

/// Scratch working directory for Chat mode (created on demand).
pub fn chat_scratch_dir(dir: &Path) -> std::io::Result<PathBuf> {
    let p = dir.join("chat");
    std::fs::create_dir_all(&p)?;
    Ok(p)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> PathBuf {
        let p = std::env::temp_dir().join(format!("bcu-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&p);
        p
    }

    fn sess(id: &str, t: u64) -> SavedSession {
        SavedSession {
            cli_session_id: id.into(),
            title: id.into(),
            cwd: None,
            mode: "code".into(),
            model: None,
            preset: None,
            effort: None,
            web_search: false,
            project: None,
            updated_at: t,
        }
    }

    #[test]
    fn an_old_config_without_the_new_fields_gets_their_defaults() {
        let d = tmp("cfg-old");
        std::fs::create_dir_all(&d).unwrap();
        std::fs::write(config_path(&d), r#"{"tier":"advanced","theme":"midnight"}"#).unwrap();
        let c = load(&d);
        assert_eq!(c.theme, "midnight");
        assert!(!c.sidebar_hidden && !c.panel_hidden);
        assert_eq!(c.settings_category, "general");
        assert!(c.usage_widget.is_null() && c.tray.is_null());
    }

    #[test]
    fn missing_or_corrupt_file_gives_defaults() {
        let d = tmp("missing");
        assert_eq!(load(&d), AppConfig::default());
        std::fs::create_dir_all(&d).unwrap();
        std::fs::write(config_path(&d), "{not json").unwrap();
        assert_eq!(load(&d), AppConfig::default());
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn partial_file_fills_defaults_and_unknown_keys_are_ignored() {
        let d = tmp("partial");
        std::fs::create_dir_all(&d).unwrap();
        std::fs::write(config_path(&d), r#"{"tier":"advanced","future_key":1}"#).unwrap();
        let c = load(&d);
        assert_eq!(c.tier, "advanced");
        assert!(!c.onboarded);
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn save_roundtrips_sorts_and_caps_recents() {
        let d = tmp("roundtrip");
        let mut c = AppConfig {
            tier: "intermediate".into(),
            always_allow: vec!["Read".into()],
            ..Default::default()
        };
        c.recents = (0..60).map(|i| sess(&format!("s{i}"), i)).collect();
        save(&d, &c).unwrap();
        let back = load(&d);
        assert_eq!(back.tier, "intermediate");
        assert_eq!(back.always_allow, vec!["Read".to_string()]);
        assert_eq!(back.recents.len(), MAX_RECENTS);
        assert_eq!(back.recents[0].cli_session_id, "s59");
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn transcripts_roundtrip_and_reject_unsafe_ids() {
        let d = tmp("transcript");
        save_transcript(&d, "abc-123", r#"[{"kind":"user"}]"#).unwrap();
        assert_eq!(
            load_transcript(&d, "abc-123").unwrap(),
            r#"[{"kind":"user"}]"#
        );
        assert!(save_transcript(&d, "../evil", "[]").is_err());
        assert!(save_transcript(&d, "ok", "not json").is_err());
        assert!(load_transcript(&d, "a/b").is_none());
        delete_transcript(&d, "abc-123");
        assert!(load_transcript(&d, "abc-123").is_none());
        let _ = std::fs::remove_dir_all(&d);
    }
}
