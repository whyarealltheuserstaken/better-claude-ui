//! Smoke tests against the REAL `claude` CLI. Ignored by default (they use your login and tokens):
//!   cargo test --features test-support --test real_cli -- --ignored --nocapture

use better_claude_ui_lib::cli::detect::{CliStatus, detect};
use better_claude_ui_lib::cli::events::Event;
use better_claude_ui_lib::session::{
    PermissionReply, SessionEvent, SessionManager, SessionOptions,
};
use std::time::Duration;

fn real_cli() -> std::path::PathBuf {
    match detect(None) {
        CliStatus::Found { path, .. } => path,
        other => panic!("claude CLI not usable: {other:?}"),
    }
}

async fn run_until<F: Fn(&SessionEvent) -> bool>(
    rx: &mut tokio::sync::broadcast::Receiver<(String, SessionEvent)>,
    sid: &str,
    stop: F,
    secs: u64,
) -> Vec<SessionEvent> {
    let mut out = vec![];
    let deadline = tokio::time::Instant::now() + Duration::from_secs(secs);
    while let Ok(Ok((id, ev))) = tokio::time::timeout_at(deadline, rx.recv()).await {
        if id != sid {
            continue;
        }
        let done = stop(&ev);
        out.push(ev);
        if done {
            break;
        }
    }
    out
}

#[tokio::test]
#[ignore]
async fn real_cli_answers_a_simple_prompt() {
    let m = SessionManager::new(real_cli());
    let mut rx = m.subscribe();
    let id = m
        .start(SessionOptions {
            cwd: std::env::temp_dir(),
            ..Default::default()
        })
        .await
        .unwrap();
    m.send(&id, "Reply with exactly: pong").await.unwrap();
    let evs = run_until(
        &mut rx,
        &id,
        |e| {
            matches!(
                e,
                SessionEvent::Cli {
                    event: Event::TurnResult { .. }
                }
            )
        },
        90,
    )
    .await;
    m.stop(&id).await.unwrap();
    let text: String = evs
        .iter()
        .filter_map(|e| match e {
            SessionEvent::Cli {
                event: Event::TextDelta { text, .. },
            } => Some(text.as_str()),
            _ => None,
        })
        .collect();
    assert!(
        text.to_lowercase().contains("pong"),
        "streamed text: {text:?}"
    );
    assert!(matches!(
        evs.last(),
        Some(SessionEvent::Cli {
            event: Event::TurnResult {
                is_error: false,
                ..
            }
        })
    ));
}

#[tokio::test]
#[ignore]
async fn real_cli_interrupt_ends_the_turn_early() {
    let m = SessionManager::new(real_cli());
    let mut rx = m.subscribe();
    let id = m
        .start(SessionOptions {
            cwd: std::env::temp_dir(),
            ..Default::default()
        })
        .await
        .unwrap();
    m.send(
        &id,
        "Write the numbers 1 to 400, one per line, no other text.",
    )
    .await
    .unwrap();
    let first = run_until(
        &mut rx,
        &id,
        |e| {
            matches!(
                e,
                SessionEvent::Cli {
                    event: Event::TextDelta { .. }
                }
            )
        },
        90,
    )
    .await;
    assert!(!first.is_empty(), "no streaming started");
    let started = std::time::Instant::now();
    m.interrupt(&id).await.unwrap();
    let rest = run_until(
        &mut rx,
        &id,
        |e| {
            matches!(
                e,
                SessionEvent::Cli {
                    event: Event::TurnResult { .. }
                }
            ) || matches!(e, SessionEvent::Exited { .. })
        },
        30,
    )
    .await;
    m.stop(&id).await.unwrap();
    let streamed: usize = rest
        .iter()
        .filter(|e| {
            matches!(
                e,
                SessionEvent::Cli {
                    event: Event::TextDelta { .. }
                }
            )
        })
        .count();
    println!(
        "after interrupt: {} events, {streamed} deltas, {:?}",
        rest.len(),
        started.elapsed()
    );
    assert!(
        matches!(
            rest.last(),
            Some(SessionEvent::Cli {
                event: Event::TurnResult { .. }
            })
        ),
        "turn ended cleanly after interrupt: {:?}",
        rest.last()
    );
}

#[tokio::test]
#[ignore]
async fn real_cli_permission_deny_blocks_the_write() {
    let dir = std::env::temp_dir().join(format!("bcu-real-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let m = SessionManager::new(real_cli());
    let mut rx = m.subscribe();
    let id = m
        .start(SessionOptions {
            cwd: dir.clone(),
            ..Default::default()
        })
        .await
        .unwrap();
    m.send(
        &id,
        "Create a file named x.txt containing hi, using the Write tool.",
    )
    .await
    .unwrap();
    let evs = run_until(
        &mut rx,
        &id,
        |e| {
            matches!(
                e,
                SessionEvent::Cli {
                    event: Event::PermissionRequest { .. }
                }
            )
        },
        90,
    )
    .await;
    let Some(SessionEvent::Cli {
        event: Event::PermissionRequest { request_id, .. },
    }) = evs.last()
    else {
        panic!("no permission request arrived: {evs:?}");
    };
    m.respond_permission(
        &id,
        request_id,
        PermissionReply::Deny {
            message: "no".into(),
        },
    )
    .await
    .unwrap();
    run_until(
        &mut rx,
        &id,
        |e| {
            matches!(
                e,
                SessionEvent::Cli {
                    event: Event::TurnResult { .. }
                }
            )
        },
        90,
    )
    .await;
    m.stop(&id).await.unwrap();
    assert!(
        !dir.join("x.txt").exists(),
        "denied write must not create the file"
    );
}
