//! Test double for the `claude` CLI (built only with `--features test-support`).
//!
//! Env:
//! - `FAKE_CLAUDE_FIXTURE`: path of a recorded stream-json file to replay after the first user turn.
//! - `FAKE_CLAUDE_DIE_AFTER=n`: exit abruptly (code 1) after printing n lines.
//! - `FAKE_CLAUDE_LOG`: append every stdin line received to this file.
//! - `FAKE_CLAUDE_BAD_LINE_AT=n`: print a garbage line before replayed line n (0-based).
//!
//! After printing a `control_request` the fake blocks until a `control_response` arrives on stdin.

use std::fs::OpenOptions;
use std::io::{BufRead, Write};

fn log(path: &Option<String>, line: &str) {
    if let Some(p) = path
        && let Ok(mut f) = OpenOptions::new().create(true).append(true).open(p)
    {
        let _ = writeln!(f, "{line}");
    }
}

fn main() {
    if std::env::args().any(|a| a == "--version") {
        println!("2.1.332 (Claude Code)");
        return;
    }
    let fixture = std::env::var("FAKE_CLAUDE_FIXTURE").ok();
    let die_after: Option<usize> = std::env::var("FAKE_CLAUDE_DIE_AFTER")
        .ok()
        .and_then(|v| v.parse().ok());
    let bad_at: Option<usize> = std::env::var("FAKE_CLAUDE_BAD_LINE_AT")
        .ok()
        .and_then(|v| v.parse().ok());
    let log_path = std::env::var("FAKE_CLAUDE_LOG").ok();

    let stdin = std::io::stdin();
    let mut input = stdin.lock();
    let mut line = String::new();
    let mut replayed = false;
    loop {
        line.clear();
        if input.read_line(&mut line).unwrap_or(0) == 0 {
            return; // stdin closed
        }
        let received = line.trim().to_string();
        log(&log_path, &received);
        if replayed || !received.contains("\"type\":\"user\"") {
            continue;
        }
        replayed = true;
        let Some(path) = &fixture else { continue };
        let text = std::fs::read_to_string(path).expect("fixture readable");
        let out = std::io::stdout();
        let mut printed = 0usize;
        for (i, l) in text.lines().enumerate() {
            if l.trim().is_empty() || l.starts_with("//") {
                continue;
            }
            if bad_at == Some(i) {
                let mut o = out.lock();
                let _ = writeln!(o, "{{this is not json");
                let _ = o.flush();
            }
            {
                let mut o = out.lock();
                let _ = writeln!(o, "{l}");
                let _ = o.flush();
            }
            printed += 1;
            if die_after == Some(printed) {
                std::process::exit(1);
            }
            if l.contains("\"type\":\"control_request\"") {
                loop {
                    line.clear();
                    if input.read_line(&mut line).unwrap_or(0) == 0 {
                        return;
                    }
                    log(&log_path, line.trim());
                    if line.contains("control_response") {
                        break;
                    }
                }
            }
            std::thread::sleep(std::time::Duration::from_millis(2));
        }
    }
}
