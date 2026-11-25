//! All OS-specific behaviour lives here. Nothing outside this module may use `cfg(windows)` etc.

use std::path::PathBuf;

pub const APP_DIR_NAME: &str = "better-claude-ui";

pub fn home() -> Option<PathBuf> {
    #[cfg(windows)]
    let v = std::env::var_os("USERPROFILE");
    #[cfg(not(windows))]
    let v = std::env::var_os("HOME");
    v.map(PathBuf::from)
}

/// Per-user config directory for this app (not created).
pub fn config_dir() -> PathBuf {
    #[cfg(windows)]
    let base = std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .or_else(|| home().map(|h| h.join("AppData").join("Roaming")));
    #[cfg(target_os = "macos")]
    let base = home().map(|h| h.join("Library").join("Application Support"));
    #[cfg(all(unix, not(target_os = "macos")))]
    let base = std::env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .or_else(|| home().map(|h| h.join(".config")));
    base.unwrap_or_else(std::env::temp_dir).join(APP_DIR_NAME)
}

/// The official one-line installer for Claude Code on this OS.
pub struct InstallerCommand {
    pub program: &'static str,
    pub args: Vec<String>,
    /// What to show the user, so they can see exactly what will run.
    pub display: &'static str,
}

pub fn installer_command() -> InstallerCommand {
    #[cfg(windows)]
    {
        InstallerCommand {
            program: "powershell",
            args: [
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                "irm https://claude.ai/install.ps1 | iex",
            ]
            .map(String::from)
            .to_vec(),
            display: "irm https://claude.ai/install.ps1 | iex",
        }
    }
    #[cfg(not(windows))]
    {
        InstallerCommand {
            program: "sh",
            args: vec![
                "-c".into(),
                "curl -fsSL https://claude.ai/install.sh | bash".into(),
            ],
            display: "curl -fsSL https://claude.ai/install.sh | bash",
        }
    }
}

/// True when spawning failed only because the executable was momentarily open for writing
/// (Linux `ETXTBSY`); such a spawn is safe to retry shortly after.
pub fn is_transient_spawn_error(e: &std::io::Error) -> bool {
    #[cfg(unix)]
    {
        e.raw_os_error() == Some(26)
    }
    #[cfg(not(unix))]
    {
        let _ = e;
        false
    }
}

/// File names the `claude` executable may have on this OS, in preference order.
pub fn cli_file_names() -> &'static [&'static str] {
    #[cfg(windows)]
    {
        &["claude.exe", "claude.cmd"]
    }
    #[cfg(not(windows))]
    {
        &["claude"]
    }
}

/// Directories to search for `claude`: PATH entries first, then well-known install locations.
pub fn cli_search_dirs() -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = std::env::var_os("PATH")
        .map(|p| std::env::split_paths(&p).collect())
        .unwrap_or_default();
    if let Some(h) = home() {
        dirs.push(h.join(".local").join("bin"));
        dirs.push(h.join(".claude").join("local"));
        dirs.push(h.join(".npm-global").join("bin"));
        #[cfg(windows)]
        if let Some(app) = std::env::var_os("APPDATA") {
            dirs.push(PathBuf::from(app).join("npm"));
        }
    }
    #[cfg(not(windows))]
    {
        dirs.push(PathBuf::from("/usr/local/bin"));
        dirs.push(PathBuf::from("/opt/homebrew/bin"));
    }
    dirs
}

/// Apply OS-specific spawn settings (e.g. hide the console window on Windows).
pub fn configure_command(cmd: &mut tokio::process::Command) {
    #[cfg(windows)]
    {
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    #[cfg(not(windows))]
    {
        let _ = cmd;
    }
}

/// Same as [`configure_command`] for blocking `std::process::Command`.
pub fn configure_std_command(cmd: &mut std::process::Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    #[cfg(not(windows))]
    {
        let _ = cmd;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_dir_ends_with_app_name() {
        assert!(config_dir().ends_with(APP_DIR_NAME));
    }

    #[test]
    fn cli_file_names_is_not_empty() {
        assert!(!cli_file_names().is_empty());
    }

    #[test]
    fn search_dirs_include_path_entries() {
        let dirs = cli_search_dirs();
        let first_path = std::env::var_os("PATH").and_then(|p| std::env::split_paths(&p).next());
        if let Some(fp) = first_path {
            assert!(dirs.contains(&fp));
        }
    }
}
