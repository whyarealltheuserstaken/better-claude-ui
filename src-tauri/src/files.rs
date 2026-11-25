//! Editing of Claude Code's instruction and settings files. Only four fixed targets can be
//! read or written (never an arbitrary path), settings files are validated as JSON before
//! saving, and the previous contents are kept in a `.bak` file next to the original.

use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Target {
    UserInstructions,
    ProjectInstructions,
    UserSettings,
    ProjectSettings,
}

impl Target {
    pub fn parse(s: &str) -> Option<Self> {
        Some(match s {
            "user_instructions" => Self::UserInstructions,
            "project_instructions" => Self::ProjectInstructions,
            "user_settings" => Self::UserSettings,
            "project_settings" => Self::ProjectSettings,
            _ => return None,
        })
    }

    fn is_settings(self) -> bool {
        matches!(self, Self::UserSettings | Self::ProjectSettings)
    }

    fn needs_project(self) -> bool {
        matches!(self, Self::ProjectInstructions | Self::ProjectSettings)
    }
}

#[derive(Debug, thiserror::Error, PartialEq)]
pub enum FileError {
    #[error("unknown file target")]
    UnknownTarget,
    #[error("this file belongs to a project folder; open a Code session first")]
    NoProject,
    #[error("settings must be valid JSON: {0}")]
    InvalidJson(String),
    #[error("settings.json must be a JSON object")]
    NotObject,
    #[error("{0}")]
    Io(String),
}

/// `home` is the user's home directory (`~`); `project` is the session folder, if any.
pub fn resolve(target: Target, home: &Path, project: Option<&Path>) -> Result<PathBuf, FileError> {
    if target.needs_project() && project.is_none() {
        return Err(FileError::NoProject);
    }
    let claude = home.join(".claude");
    Ok(match target {
        Target::UserInstructions => claude.join("CLAUDE.md"),
        Target::UserSettings => claude.join("settings.json"),
        Target::ProjectInstructions => project.unwrap().join("CLAUDE.md"),
        Target::ProjectSettings => project.unwrap().join(".claude").join("settings.json"),
    })
}

/// File contents, or an empty string when the file does not exist yet.
pub fn read(path: &Path) -> Result<String, FileError> {
    match std::fs::read_to_string(path) {
        Ok(s) => Ok(s),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(e) => Err(FileError::Io(e.to_string())),
    }
}

pub fn validate(target: Target, content: &str) -> Result<(), FileError> {
    if !target.is_settings() || content.trim().is_empty() {
        return Ok(());
    }
    match serde_json::from_str::<serde_json::Value>(content) {
        Ok(v) if v.is_object() => Ok(()),
        Ok(_) => Err(FileError::NotObject),
        Err(e) => Err(FileError::InvalidJson(e.to_string())),
    }
}

pub fn write(target: Target, path: &Path, content: &str) -> Result<(), FileError> {
    validate(target, content)?;
    let io = |e: std::io::Error| FileError::Io(e.to_string());
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(io)?;
    }
    if path.exists() {
        let mut bak = path.as_os_str().to_owned();
        bak.push(".bak");
        std::fs::copy(path, PathBuf::from(bak)).map_err(io)?;
    }
    std::fs::write(path, content).map_err(io)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("bcu-files-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn targets_parse_and_unknown_is_rejected() {
        assert_eq!(Target::parse("user_settings"), Some(Target::UserSettings));
        assert_eq!(Target::parse("../../etc/passwd"), None);
    }

    #[test]
    fn paths_are_fixed_and_project_targets_need_a_project() {
        let home = Path::new("/h");
        let proj = Path::new("/p");
        assert_eq!(
            resolve(Target::UserInstructions, home, None).unwrap(),
            Path::new("/h/.claude/CLAUDE.md")
        );
        assert_eq!(
            resolve(Target::ProjectSettings, home, Some(proj)).unwrap(),
            Path::new("/p/.claude/settings.json")
        );
        assert_eq!(
            resolve(Target::ProjectInstructions, home, None),
            Err(FileError::NoProject)
        );
    }

    #[test]
    fn settings_must_be_a_json_object() {
        assert!(validate(Target::UserSettings, "{\"a\":1}").is_ok());
        assert!(validate(Target::UserSettings, "").is_ok());
        assert!(matches!(
            validate(Target::UserSettings, "{oops"),
            Err(FileError::InvalidJson(_))
        ));
        assert_eq!(
            validate(Target::UserSettings, "[1]"),
            Err(FileError::NotObject)
        );
        assert!(validate(Target::UserInstructions, "anything {goes").is_ok());
    }

    #[test]
    fn write_creates_dirs_keeps_a_backup_and_rejects_bad_json() {
        let d = tmp("write");
        let p = d.join(".claude").join("settings.json");
        assert_eq!(read(&p).unwrap(), "");
        write(Target::UserSettings, &p, "{\"v\":1}").unwrap();
        write(Target::UserSettings, &p, "{\"v\":2}").unwrap();
        assert_eq!(read(&p).unwrap(), "{\"v\":2}");
        assert_eq!(
            std::fs::read_to_string(d.join(".claude").join("settings.json.bak")).unwrap(),
            "{\"v\":1}"
        );
        assert!(write(Target::UserSettings, &p, "{bad").is_err());
        assert_eq!(read(&p).unwrap(), "{\"v\":2}");
        let _ = std::fs::remove_dir_all(&d);
    }
}
