#![cfg(feature = "test-support")]
//! Session manager integration tests against the `fake-claude` test double.

use better_claude_ui_lib::cli::events::Event;
use better_claude_ui_lib::session::{
    PermissionReply, SessionEvent, SessionId, SessionManager, SessionOptions,
};
use std::path::PathBuf;
use std::time::Duration;
use tokio::sync::broadcast::Receiver;

const FAKE: &str = env!("CARGO_BIN_EXE_fake-claude");

fn fixture(name: &str) -> String {
    format!("{}/tests/fixtures/{name}", env!("CARGO_MANIFEST_DIR"))
}

fn opts(env: &[(&str, String)]) -> SessionOptions {
    SessionOptions {
        cwd: std::env::temp_dir(),
        env: env
            .iter()
            .map(|(k, v)| (k.to_string(), v.clone()))
            .collect(),
        ..Default::default()
    }
}

fn log_path(tag: &str) -> PathBuf {
    let p = std::env::temp_dir().join(format!("bcu-fakelog-{tag}-{}.txt", std::process::id()));
    let _ = std::fs::remove_file(&p);
    p
}

/// Collect events for `sid` until `stop` matches one (inclusive) or 10 s pass.
async fn collect_until(
    rx: &mut Receiver<(SessionId, SessionEvent)>,
    sid: &str,
    stop: impl Fn(&SessionEvent) -> bool,
) -> Vec<SessionEvent> {
    let mut out = vec![];
    let deadline = tokio::time::Instant::now() + Duration::from_secs(10);
    loop {
        let left = deadline.saturating_duration_since(tokio::time::Instant::now());
        match tokio::time::timeout(left, rx.recv()).await {
            Ok(Ok((id, ev))) if id == sid => {
                let done = stop(&ev);
                out.push(ev);
                if done {
                    return out;
                }
            }
            Ok(Ok(_)) => {}
            Ok(Err(_)) | Err(_) => return out,
        }
    }
}

fn is_turn_result(e: &SessionEvent) -> bool {
    matches!(
        e,
        SessionEvent::Cli {
            event: Event::TurnResult { .. }
        }
    )
}
fn is_exited(e: &SessionEvent) -> bool {
    matches!(e, SessionEvent::Exited { .. })
}

#[tokio::test]
async fn start_emits_session_init_and_events_in_order() {
    let m = SessionManager::new(FAKE.into());
    let mut rx = m.subscribe();
    let id = m
        .start(opts(&[(
            "FAKE_CLAUDE_FIXTURE",
            fixture("simple_reply.jsonl"),
        )]))
        .await
        .unwrap();
    m.send(&id, "hello").await.unwrap();
    let evs = collect_until(&mut rx, &id, is_turn_result).await;
    let pos = |f: fn(&SessionEvent) -> bool| evs.iter().position(f);
    let init = pos(|e| {
        matches!(
            e,
            SessionEvent::Cli {
                event: Event::SessionInit { .. }
            }
        )
    })
    .expect("init");
    let text = pos(|e| {
        matches!(
            e,
            SessionEvent::Cli {
                event: Event::TextDelta { .. }
            }
        )
    })
    .expect("text");
    let result = pos(is_turn_result).expect("result");
    assert!(init < text && text < result);
    m.stop(&id).await.unwrap();
}

#[tokio::test]
async fn send_writes_json_user_turn_to_stdin() {
    let log = log_path("send");
    let m = SessionManager::new(FAKE.into());
    let id = m
        .start(opts(&[("FAKE_CLAUDE_LOG", log.to_string_lossy().into())]))
        .await
        .unwrap();
    m.send(&id, "hello \"world\"").await.unwrap();
    for _ in 0..100 {
        if std::fs::read_to_string(&log)
            .map(|t| t.contains("hello"))
            .unwrap_or(false)
        {
            break;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    let text = std::fs::read_to_string(&log).expect("fake logged stdin");
    let v: serde_json::Value = serde_json::from_str(text.lines().next().unwrap()).unwrap();
    assert_eq!(v["type"], "user");
    assert_eq!(v["message"]["content"], "hello \"world\"");
    m.stop(&id).await.unwrap();
}

#[tokio::test]
async fn child_crash_emits_exited_and_does_not_hang() {
    let m = SessionManager::new(FAKE.into());
    let mut rx = m.subscribe();
    let id = m
        .start(opts(&[
            ("FAKE_CLAUDE_FIXTURE", fixture("simple_reply.jsonl")),
            ("FAKE_CLAUDE_DIE_AFTER", "3".into()),
        ]))
        .await
        .unwrap();
    m.send(&id, "hi").await.unwrap();
    let evs = collect_until(&mut rx, &id, is_exited).await;
    assert!(
        matches!(evs.last(), Some(SessionEvent::Exited { code: Some(1) })),
        "got {evs:?}"
    );
    assert!(!evs.iter().any(is_turn_result));
}

#[tokio::test]
async fn invalid_json_line_emits_error_and_stream_continues() {
    let m = SessionManager::new(FAKE.into());
    let mut rx = m.subscribe();
    let id = m
        .start(opts(&[
            ("FAKE_CLAUDE_FIXTURE", fixture("simple_reply.jsonl")),
            ("FAKE_CLAUDE_BAD_LINE_AT", "2".into()),
        ]))
        .await
        .unwrap();
    m.send(&id, "hi").await.unwrap();
    let evs = collect_until(&mut rx, &id, is_turn_result).await;
    assert!(evs.iter().any(|e| matches!(e, SessionEvent::Error { .. })));
    assert!(
        evs.iter().any(is_turn_result),
        "stream continued after the bad line"
    );
    m.stop(&id).await.unwrap();
}

#[tokio::test]
async fn stop_kills_child_and_emits_exited() {
    let m = SessionManager::new(FAKE.into());
    let mut rx = m.subscribe();
    let id = m.start(opts(&[])).await.unwrap();
    m.stop(&id).await.unwrap();
    let evs = collect_until(&mut rx, &id, is_exited).await;
    assert!(
        evs.iter().any(is_exited),
        "child exited after stop: {evs:?}"
    );
    assert!(
        m.send(&id, "x").await.is_err(),
        "session forgotten after stop"
    );
}

#[tokio::test]
async fn sessions_are_independent() {
    let m = SessionManager::new(FAKE.into());
    let mut rx = m.subscribe();
    let env = [("FAKE_CLAUDE_FIXTURE", fixture("simple_reply.jsonl"))];
    let a = m.start(opts(&env)).await.unwrap();
    let b = m.start(opts(&env)).await.unwrap();
    assert_ne!(a, b);
    m.stop(&a).await.unwrap();
    m.send(&b, "hi").await.unwrap();
    let evs = collect_until(&mut rx, &b, is_turn_result).await;
    assert!(evs.iter().any(is_turn_result));
    m.stop(&b).await.unwrap();
}

#[tokio::test]
async fn permission_request_can_be_answered_and_turn_completes() {
    let log = log_path("perm");
    let m = SessionManager::new(FAKE.into());
    let mut rx = m.subscribe();
    let id = m
        .start(opts(&[
            (
                "FAKE_CLAUDE_FIXTURE",
                fixture("tool_permission_allow.jsonl"),
            ),
            ("FAKE_CLAUDE_LOG", log.to_string_lossy().into()),
        ]))
        .await
        .unwrap();
    m.send(&id, "write a file").await.unwrap();
    let evs = collect_until(&mut rx, &id, |e| {
        matches!(
            e,
            SessionEvent::Cli {
                event: Event::PermissionRequest { .. }
            }
        )
    })
    .await;
    let (rid, input) = match evs.last() {
        Some(SessionEvent::Cli {
            event: Event::PermissionRequest {
                request_id, input, ..
            },
        }) => (request_id.clone(), input.clone()),
        other => panic!("expected permission request, got {other:?}"),
    };
    m.respond_permission(
        &id,
        &rid,
        PermissionReply::Allow {
            updated_input: input,
        },
    )
    .await
    .unwrap();
    let rest = collect_until(&mut rx, &id, is_turn_result).await;
    assert!(
        rest.iter().any(is_turn_result),
        "turn completed after answering"
    );
    let logged = std::fs::read_to_string(&log).unwrap();
    assert!(logged.contains("control_response") && logged.contains("\"behavior\":\"allow\""));
    m.stop(&id).await.unwrap();
}

#[tokio::test]
async fn unknown_session_errors() {
    let m = SessionManager::new(FAKE.into());
    assert!(m.send("nope", "x").await.is_err());
    assert!(m.stop("nope").await.is_err());
}
