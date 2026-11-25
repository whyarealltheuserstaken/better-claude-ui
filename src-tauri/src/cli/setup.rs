//! First-run setup helpers: sign-in detection, and running the official installer / login flow
//! while streaming their output to the UI. Nothing here runs without an explicit user click.

use crate::platform;
use serde::Serialize;
use std::path::Path;
use std::process::Stdio;
use std::time::{Duration, Instant};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum AuthStatus {
    LoggedIn {
        method: String,
        /// Subscription plan, e.g. "pro" or "max", when the CLI reports it.
        plan: Option<String>,
    },
    LoggedOut,
    /// The status command failed or printed something unexpected. The UI lets the user continue.
    Unknown {
        reason: String,
    },
}

/// Parse the JSON printed by `claude auth status`.
pub fn parse_auth_status(stdout: &str) -> AuthStatus {
    let Ok(v) = serde_json::from_str::<serde_json::Value>(stdout.trim()) else {
        return AuthStatus::Unknown {
            reason: "unreadable output from `claude auth status`".into(),
        };
    };
    match v.get("loggedIn").and_then(|b| b.as_bool()) {
        Some(true) => AuthStatus::LoggedIn {
            method: v
                .get("authMethod")
                .and_then(|m| m.as_str())
                .unwrap_or("unknown")
                .to_string(),
            plan: v
                .get("subscriptionType")
                .and_then(|m| m.as_str())
                .map(String::from),
        },
        Some(false) => AuthStatus::LoggedOut,
        None => AuthStatus::Unknown {
            reason: "`loggedIn` missing from auth status".into(),
        },
    }
}

/// Ask the CLI whether the user is signed in (blocking; call from `spawn_blocking`).
pub fn auth_status(cli: &Path) -> AuthStatus {
    let mut cmd = std::process::Command::new(cli);
    cmd.args(["auth", "status"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    platform::configure_std_command(&mut cmd);
    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            return AuthStatus::Unknown {
                reason: e.to_string(),
            };
        }
    };
    let deadline = Instant::now() + Duration::from_secs(10);
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(25)),
            _ => {
                let _ = child.kill();
                return AuthStatus::Unknown {
                    reason: "timed out".into(),
                };
            }
        }
    }
    let mut out = String::new();
    if let Some(mut s) = child.stdout.take() {
        use std::io::Read;
        let _ = s.read_to_string(&mut out);
    }
    parse_auth_status(&out)
}

/// Spawn `cmd`, forwarding each stdout/stderr line to `on_line`, and return the exit code.
pub async fn run_streaming(
    mut cmd: Command,
    on_line: impl Fn(String) + Send + Sync + 'static,
) -> Result<Option<i32>, String> {
    cmd.stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    platform::configure_command(&mut cmd);
    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    let on_line = std::sync::Arc::new(on_line);
    let mut tasks = vec![];
    if let Some(out) = child.stdout.take() {
        let f = on_line.clone();
        tasks.push(tokio::spawn(async move {
            let mut l = BufReader::new(out).lines();
            while let Ok(Some(line)) = l.next_line().await {
                f(line);
            }
        }));
    }
    if let Some(err) = child.stderr.take() {
        let f = on_line.clone();
        tasks.push(tokio::spawn(async move {
            let mut l = BufReader::new(err).lines();
            while let Ok(Some(line)) = l.next_line().await {
                f(line);
            }
        }));
    }
    let status = child.wait().await.map_err(|e| e.to_string())?;
    for t in tasks {
        let _ = t.await;
    }
    Ok(status.code())
}

/// Only these `claude` subcommands can be run from the UI (no shell, fixed verbs).
pub fn is_allowed_cli_args(args: &[String]) -> bool {
    let a: Vec<&str> = args.iter().map(String::as_str).collect();
    match a.as_slice() {
        ["mcp", verb, ..] => matches!(*verb, "list" | "get" | "add" | "remove"),
        ["plugin", "list", ..] => true,
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    #[test]
    fn parses_logged_in_and_out() {
        assert_eq!(
            parse_auth_status(
                r#"{"loggedIn": true, "authMethod": "claude.ai", "subscriptionType": "pro"}"#
            ),
            AuthStatus::LoggedIn {
                method: "claude.ai".into(),
                plan: Some("pro".into())
            }
        );
        assert_eq!(
            parse_auth_status(r#"{"loggedIn": false}"#),
            AuthStatus::LoggedOut
        );
    }

    #[test]
    fn only_mcp_management_and_plugin_list_are_allowed() {
        let v = |s: &str| s.split(' ').map(String::from).collect::<Vec<_>>();
        assert!(is_allowed_cli_args(&v("mcp list")));
        assert!(is_allowed_cli_args(&v(
            "mcp add --transport http gh https://x"
        )));
        assert!(is_allowed_cli_args(&v("mcp remove gh")));
        assert!(is_allowed_cli_args(&v("plugin list")));
        assert!(!is_allowed_cli_args(&v("mcp serve")));
        assert!(!is_allowed_cli_args(&v("mcp add-from-claude-desktop")));
        assert!(!is_allowed_cli_args(&v("plugin install x")));
        assert!(!is_allowed_cli_args(&v("auth logout")));
        assert!(!is_allowed_cli_args(&v("-p hello")));
        assert!(!is_allowed_cli_args(&[]));
    }

    #[test]
    fn garbage_is_unknown_not_a_crash() {
        assert!(matches!(
            parse_auth_status("not json"),
            AuthStatus::Unknown { .. }
        ));
        assert!(matches!(
            parse_auth_status("{}"),
            AuthStatus::Unknown { .. }
        ));
        assert!(matches!(parse_auth_status(""), AuthStatus::Unknown { .. }));
    }

    #[tokio::test]
    async fn run_streaming_forwards_lines_and_exit_code() {
        let lines = Arc::new(Mutex::new(Vec::<String>::new()));
        let l2 = lines.clone();
        #[cfg(windows)]
        let cmd = {
            let mut c = Command::new("cmd");
            c.args(["/C", "echo hello&& echo world&& exit 3"]);
            c
        };
        #[cfg(not(windows))]
        let cmd = {
            let mut c = Command::new("sh");
            c.args(["-c", "echo hello; echo world; exit 3"]);
            c
        };
        let code = run_streaming(cmd, move |s| l2.lock().unwrap().push(s.trim().to_string()))
            .await
            .unwrap();
        assert_eq!(code, Some(3));
        let got = lines.lock().unwrap().clone();
        assert!(got.contains(&"hello".to_string()) && got.contains(&"world".to_string()));
    }

    /// Real CLI: `cargo test -- --ignored real_auth_status`
    #[test]
    #[ignore]
    fn real_auth_status() {
        let crate::cli::detect::CliStatus::Found { path, .. } = crate::cli::detect::detect(None)
        else {
            panic!("claude not installed");
        };
        let st = auth_status(&path);
        println!("{st:?}");
        assert!(matches!(
            st,
            AuthStatus::LoggedIn { .. } | AuthStatus::LoggedOut
        ));
    }

    #[tokio::test]
    async fn run_streaming_reports_missing_program() {
        let r = run_streaming(Command::new("definitely-not-a-real-program-xyz"), |_| {}).await;
        assert!(r.is_err());
    }
}
