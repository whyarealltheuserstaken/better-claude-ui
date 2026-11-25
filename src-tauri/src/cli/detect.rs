//! Locate the `claude` CLI and report its version.

use crate::platform;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum CliStatus {
    Found { path: PathBuf, version: String },
    NotFound,
    Unusable { reason: String },
}

/// "2.1.332 (Claude Code)" -> "2.1.332".
pub fn parse_version(output: &str) -> Option<String> {
    let first = output.split_whitespace().next()?;
    if first.chars().next()?.is_ascii_digit() {
        Some(first.to_string())
    } else {
        None
    }
}

/// Find `claude` (override path first, then PATH and known locations) and check it runs.
pub fn detect(override_path: Option<&Path>) -> CliStatus {
    detect_in(override_path, &platform::cli_search_dirs())
}

pub fn detect_in(override_path: Option<&Path>, dirs: &[PathBuf]) -> CliStatus {
    if let Some(p) = override_path {
        return if p.is_file() {
            probe(p)
        } else {
            CliStatus::NotFound
        };
    }
    for d in dirs {
        for name in platform::cli_file_names() {
            let candidate = d.join(name);
            if candidate.is_file() {
                return probe(&candidate);
            }
        }
    }
    CliStatus::NotFound
}

fn probe(path: &Path) -> CliStatus {
    let mut cmd = Command::new(path);
    cmd.arg("--version")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    platform::configure_std_command(&mut cmd);
    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            return CliStatus::Unusable {
                reason: e.to_string(),
            };
        }
    };
    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(20)),
            Ok(None) => {
                let _ = child.kill();
                return CliStatus::Unusable {
                    reason: "`--version` timed out".into(),
                };
            }
            Err(e) => {
                return CliStatus::Unusable {
                    reason: e.to_string(),
                };
            }
        }
    }
    let out = match child.wait_with_output() {
        Ok(o) => o,
        Err(e) => {
            return CliStatus::Unusable {
                reason: e.to_string(),
            };
        }
    };
    if !out.status.success() {
        return CliStatus::Unusable {
            reason: format!("`--version` exited with {}", out.status),
        };
    }
    match parse_version(&String::from_utf8_lossy(&out.stdout)) {
        Some(version) => CliStatus::Found {
            path: path.to_path_buf(),
            version,
        },
        None => CliStatus::Unusable {
            reason: "unrecognised `--version` output".into(),
        },
    }
}

#[cfg(test)]
pub(crate) mod test_support {
    use std::path::{Path, PathBuf};

    /// Create an executable fake `claude` that prints `stdout` and exits with `code`.
    pub fn make_fake_cli(dir: &Path, stdout: &str, code: i32) -> PathBuf {
        #[cfg(windows)]
        {
            let p = dir.join("claude.cmd");
            std::fs::write(
                &p,
                format!("@echo off\r\necho {stdout}\r\nexit /b {code}\r\n"),
            )
            .unwrap();
            p
        }
        #[cfg(not(windows))]
        {
            use std::os::unix::fs::PermissionsExt;
            let p = dir.join("claude");
            std::fs::write(&p, format!("#!/bin/sh\necho '{stdout}'\nexit {code}\n")).unwrap();
            std::fs::set_permissions(&p, std::fs::Permissions::from_mode(0o755)).unwrap();
            p
        }
    }
}

#[cfg(test)]
mod tests {
    use super::test_support::make_fake_cli;
    use super::*;

    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("bcu-detect-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn parses_version_output() {
        assert_eq!(
            parse_version("2.1.332 (Claude Code)\n"),
            Some("2.1.332".into())
        );
        assert_eq!(parse_version("garbage"), None);
        assert_eq!(parse_version(""), None);
    }

    #[test]
    fn finds_cli_via_override() {
        let d = tmp("override");
        let p = make_fake_cli(&d, "2.1.332 (Claude Code)", 0);
        match detect_in(Some(&p), &[]) {
            CliStatus::Found { path, version } => {
                assert_eq!(path, p);
                assert_eq!(version, "2.1.332");
            }
            other => panic!("unexpected {other:?}"),
        }
    }

    #[test]
    fn finds_cli_in_search_dirs() {
        let d = tmp("search");
        make_fake_cli(&d, "9.9.9 (Claude Code)", 0);
        assert!(matches!(detect_in(None, &[d]), CliStatus::Found { .. }));
    }

    #[test]
    fn reports_not_found_when_absent() {
        let d = tmp("absent");
        assert_eq!(
            detect_in(None, std::slice::from_ref(&d)),
            CliStatus::NotFound
        );
        assert_eq!(detect_in(Some(&d.join("nope")), &[]), CliStatus::NotFound);
    }

    #[test]
    fn unusable_when_version_command_fails() {
        let d = tmp("fails");
        let p = make_fake_cli(&d, "boom", 3);
        assert!(matches!(
            detect_in(Some(&p), &[]),
            CliStatus::Unusable { .. }
        ));
    }

    #[test]
    fn unusable_when_output_is_not_a_version() {
        let d = tmp("weird");
        let p = make_fake_cli(&d, "hello world", 0);
        assert!(matches!(
            detect_in(Some(&p), &[]),
            CliStatus::Unusable { .. }
        ));
    }
}
