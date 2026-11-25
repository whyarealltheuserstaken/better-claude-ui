//! Session manager: one `claude -p` child process per session, events broadcast to subscribers.

use crate::cli::events::{self, Event};
use crate::platform;
use serde::Serialize;
use serde_json::{Value, json};
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::{Mutex, broadcast};

pub type SessionId = String;

#[derive(Debug, Clone, Default)]
pub struct SessionOptions {
    pub cwd: PathBuf,
    pub model: Option<String>,
    pub permission_mode: Option<String>,
    pub resume: Option<String>,
    /// Run with no tools at all (Chat mode).
    pub no_tools: bool,
    pub extra_args: Vec<String>,
    /// Extra environment variables for the child process.
    pub env: Vec<(String, String)>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SessionEvent {
    Cli { event: Event },
    Stderr { text: String },
    Error { message: String },
    Exited { code: Option<i32> },
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "behavior", rename_all = "snake_case")]
pub enum PermissionReply {
    Allow { updated_input: Value },
    Deny { message: String },
}

#[derive(Debug, thiserror::Error)]
pub enum SessionError {
    #[error("unknown session {0}")]
    UnknownSession(String),
    #[error("failed to start claude: {0}")]
    Spawn(String),
    #[error("failed to write to session: {0}")]
    Write(String),
}

/// Command-line arguments for a session (everything after the executable).
pub fn build_args(o: &SessionOptions) -> Vec<String> {
    let mut a: Vec<String> = [
        "-p",
        "--input-format",
        "stream-json",
        "--output-format",
        "stream-json",
        "--include-partial-messages",
        "--verbose",
        "--permission-prompt-tool",
        "stdio",
    ]
    .iter()
    .map(|s| s.to_string())
    .collect();
    if let Some(m) = &o.model {
        a.extend(["--model".into(), m.clone()]);
    }
    if let Some(m) = &o.permission_mode {
        a.extend(["--permission-mode".into(), m.clone()]);
    }
    if let Some(r) = &o.resume {
        a.extend(["--resume".into(), r.clone()]);
    }
    if o.no_tools {
        a.extend(["--tools".into(), String::new()]);
    }
    a.extend(o.extra_args.iter().cloned());
    a
}

/// A file sent along with a message (images and PDFs as base64).
#[derive(Debug, Clone, PartialEq, serde::Deserialize)]
pub struct Attachment {
    pub name: String,
    pub media_type: String,
    /// Base64 without the `data:` prefix.
    pub data: String,
}

pub const MAX_ATTACHMENTS: usize = 10;
/// Base64 length limit per attachment (about 7.5 MB of raw data).
pub const MAX_ATTACHMENT_B64: usize = 10_000_000;
pub const MAX_TOTAL_B64: usize = 28_000_000;
const IMAGE_TYPES: [&str; 4] = ["image/png", "image/jpeg", "image/gif", "image/webp"];

#[derive(Debug, thiserror::Error, PartialEq)]
pub enum AttachmentError {
    #[error("too many attachments (limit {MAX_ATTACHMENTS})")]
    TooMany,
    #[error("{0} is too large to send")]
    TooLarge(String),
    #[error("{0}: unsupported file type `{1}`")]
    Unsupported(String, String),
    #[error("{0} is not valid base64")]
    BadData(String),
}

fn is_b64(s: &str) -> bool {
    !s.is_empty()
        && s.bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'+' | b'/' | b'='))
}

pub fn validate_attachments(list: &[Attachment]) -> Result<(), AttachmentError> {
    if list.len() > MAX_ATTACHMENTS {
        return Err(AttachmentError::TooMany);
    }
    let mut total = 0;
    for a in list {
        let ok_type =
            IMAGE_TYPES.contains(&a.media_type.as_str()) || a.media_type == "application/pdf";
        if !ok_type {
            return Err(AttachmentError::Unsupported(
                a.name.clone(),
                a.media_type.clone(),
            ));
        }
        if a.data.len() > MAX_ATTACHMENT_B64 {
            return Err(AttachmentError::TooLarge(a.name.clone()));
        }
        if !is_b64(&a.data) {
            return Err(AttachmentError::BadData(a.name.clone()));
        }
        total += a.data.len();
    }
    if total > MAX_TOTAL_B64 {
        return Err(AttachmentError::TooLarge("the attachments together".into()));
    }
    Ok(())
}

/// Message content: a plain string when there are no attachments, else content blocks.
pub fn user_turn_content(text: &str, attachments: &[Attachment]) -> Value {
    if attachments.is_empty() {
        return Value::String(text.to_string());
    }
    let mut blocks: Vec<Value> = attachments
        .iter()
        .map(|a| {
            let kind = if a.media_type == "application/pdf" { "document" } else { "image" };
            json!({"type": kind, "source": {"type":"base64","media_type": a.media_type, "data": a.data}})
        })
        .collect();
    if !text.trim().is_empty() {
        blocks.push(json!({"type":"text","text":text}));
    }
    Value::Array(blocks)
}

/// JSON line for a user turn.
pub fn user_turn_line(text: &str) -> String {
    user_turn_line_with(text, &[])
}

pub fn user_turn_line_with(text: &str, attachments: &[Attachment]) -> String {
    json!({"type":"user","message":{"role":"user","content":user_turn_content(text, attachments)}})
        .to_string()
}

/// JSON line answering a `can_use_tool` request.
pub fn permission_reply_line(request_id: &str, reply: &PermissionReply) -> String {
    let response = match reply {
        PermissionReply::Allow { updated_input } => {
            json!({"behavior":"allow","updatedInput":updated_input})
        }
        PermissionReply::Deny { message } => json!({"behavior":"deny","message":message}),
    };
    json!({"type":"control_response","response":{"subtype":"success","request_id":request_id,"response":response}}).to_string()
}

/// JSON line asking the CLI for its commands, agents and models (works before the first turn).
pub fn initialize_line(request_id: &str) -> String {
    json!({"type":"control_request","request_id":request_id,"request":{"subtype":"initialize"}})
        .to_string()
}

/// JSON line asking the CLI to interrupt the current turn.
pub fn interrupt_line(request_id: &str) -> String {
    json!({"type":"control_request","request_id":request_id,"request":{"subtype":"interrupt"}})
        .to_string()
}

struct Handle {
    stdin: Arc<Mutex<ChildStdin>>,
    child: Arc<Mutex<Child>>,
}

pub struct SessionManager {
    cli_path: PathBuf,
    sessions: Mutex<HashMap<SessionId, Handle>>,
    tx: broadcast::Sender<(SessionId, SessionEvent)>,
    next_id: AtomicU64,
}

impl SessionManager {
    pub fn new(cli_path: PathBuf) -> Self {
        let (tx, _) = broadcast::channel(4096);
        Self {
            cli_path,
            sessions: Mutex::new(HashMap::new()),
            tx,
            next_id: AtomicU64::new(1),
        }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<(SessionId, SessionEvent)> {
        self.tx.subscribe()
    }

    pub async fn start(&self, opts: SessionOptions) -> Result<SessionId, SessionError> {
        let mut cmd = Command::new(&self.cli_path);
        cmd.args(build_args(&opts))
            .current_dir(&opts.cwd)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        for (k, v) in &opts.env {
            cmd.env(k, v);
        }
        platform::configure_command(&mut cmd);
        let mut child = cmd
            .spawn()
            .map_err(|e| SessionError::Spawn(e.to_string()))?;
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| SessionError::Spawn("no stdin".into()))?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| SessionError::Spawn("no stdout".into()))?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| SessionError::Spawn("no stderr".into()))?;
        let id = format!("s{}", self.next_id.fetch_add(1, Ordering::Relaxed));
        let child = Arc::new(Mutex::new(child));
        self.sessions.lock().await.insert(
            id.clone(),
            Handle {
                stdin: Arc::new(Mutex::new(stdin)),
                child: child.clone(),
            },
        );

        let tx = self.tx.clone();
        let sid = id.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(stdout).lines();
            loop {
                match lines.next_line().await {
                    Ok(Some(line)) => match events::parse_line(&line) {
                        Ok(evs) => {
                            for event in evs {
                                let _ = tx.send((sid.clone(), SessionEvent::Cli { event }));
                            }
                        }
                        Err(e) => {
                            let _ = tx.send((
                                sid.clone(),
                                SessionEvent::Error {
                                    message: e.to_string(),
                                },
                            ));
                        }
                    },
                    Ok(None) => break,
                    Err(e) => {
                        let _ = tx.send((
                            sid.clone(),
                            SessionEvent::Error {
                                message: e.to_string(),
                            },
                        ));
                        break;
                    }
                }
            }
            let code = child.lock().await.wait().await.ok().and_then(|s| s.code());
            let _ = tx.send((sid, SessionEvent::Exited { code }));
        });

        let tx = self.tx.clone();
        let sid = id.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(text)) = lines.next_line().await {
                let _ = tx.send((sid.clone(), SessionEvent::Stderr { text }));
            }
        });
        // Ask for commands/models up front so menus work before the first message.
        let _ = self.write_line(&id, initialize_line("bcu-init")).await;
        Ok(id)
    }

    async fn write_line(&self, id: &str, line: String) -> Result<(), SessionError> {
        let stdin = {
            let sessions = self.sessions.lock().await;
            sessions
                .get(id)
                .map(|h| h.stdin.clone())
                .ok_or_else(|| SessionError::UnknownSession(id.to_string()))?
        };
        let mut w = stdin.lock().await;
        w.write_all(line.as_bytes())
            .await
            .map_err(|e| SessionError::Write(e.to_string()))?;
        w.write_all(b"\n")
            .await
            .map_err(|e| SessionError::Write(e.to_string()))?;
        w.flush()
            .await
            .map_err(|e| SessionError::Write(e.to_string()))
    }

    pub async fn send(&self, id: &str, text: &str) -> Result<(), SessionError> {
        self.write_line(id, user_turn_line(text)).await
    }

    pub async fn send_with(
        &self,
        id: &str,
        text: &str,
        attachments: &[Attachment],
    ) -> Result<(), SessionError> {
        validate_attachments(attachments).map_err(|e| SessionError::Write(e.to_string()))?;
        self.write_line(id, user_turn_line_with(text, attachments))
            .await
    }

    pub async fn respond_permission(
        &self,
        id: &str,
        request_id: &str,
        reply: PermissionReply,
    ) -> Result<(), SessionError> {
        self.write_line(id, permission_reply_line(request_id, &reply))
            .await
    }

    pub async fn interrupt(&self, id: &str) -> Result<(), SessionError> {
        let rid = format!("int-{}", self.next_id.fetch_add(1, Ordering::Relaxed));
        self.write_line(id, interrupt_line(&rid)).await
    }

    /// Kill the child and forget the session.
    pub async fn stop(&self, id: &str) -> Result<(), SessionError> {
        let handle = self
            .sessions
            .lock()
            .await
            .remove(id)
            .ok_or_else(|| SessionError::UnknownSession(id.to_string()))?;
        let _ = handle.child.lock().await.start_kill();
        Ok(())
    }

    /// Kill every session (app shutdown).
    pub async fn stop_all(&self) {
        let all: Vec<Handle> = self.sessions.lock().await.drain().map(|(_, h)| h).collect();
        for h in all {
            let _ = h.child.lock().await.start_kill();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_args_has_streaming_and_permission_flags() {
        let a = build_args(&SessionOptions::default());
        for f in [
            "-p",
            "--input-format",
            "--output-format",
            "--include-partial-messages",
            "--verbose",
            "--permission-prompt-tool",
        ] {
            assert!(a.iter().any(|x| x == f), "missing {f}");
        }
        assert!(!a.contains(&"--model".to_string()));
    }

    #[test]
    fn build_args_adds_optional_flags_and_chat_mode_disables_tools() {
        let a = build_args(&SessionOptions {
            model: Some("sonnet".into()),
            permission_mode: Some("plan".into()),
            resume: Some("abc".into()),
            no_tools: true,
            extra_args: vec!["--add-dir".into(), "x".into()],
            ..Default::default()
        });
        let pos = |f: &str| a.iter().position(|x| x == f).unwrap();
        assert_eq!(a[pos("--model") + 1], "sonnet");
        assert_eq!(a[pos("--permission-mode") + 1], "plan");
        assert_eq!(a[pos("--resume") + 1], "abc");
        assert_eq!(a[pos("--tools") + 1], "");
        assert_eq!(a[pos("--add-dir") + 1], "x");
    }

    fn att(name: &str, mt: &str, data: &str) -> Attachment {
        Attachment {
            name: name.into(),
            media_type: mt.into(),
            data: data.into(),
        }
    }

    #[test]
    fn plain_text_turn_keeps_string_content() {
        let v: Value = serde_json::from_str(&user_turn_line("hi")).unwrap();
        assert_eq!(v["message"]["content"], "hi");
    }

    #[test]
    fn attachments_become_image_document_and_text_blocks() {
        let line = user_turn_line_with(
            "look",
            &[
                att("a.png", "image/png", "AAAA"),
                att("b.pdf", "application/pdf", "BBBB"),
            ],
        );
        let v: Value = serde_json::from_str(&line).unwrap();
        let c = v["message"]["content"].as_array().unwrap();
        assert_eq!(c[0]["type"], "image");
        assert_eq!(c[0]["source"]["media_type"], "image/png");
        assert_eq!(c[1]["type"], "document");
        assert_eq!(c[2]["type"], "text");
        assert_eq!(c[2]["text"], "look");
    }

    #[test]
    fn attachment_only_message_has_no_empty_text_block() {
        let v = user_turn_content("  ", &[att("a.png", "image/png", "AAAA")]);
        assert_eq!(v.as_array().unwrap().len(), 1);
    }

    #[test]
    fn validation_rejects_bad_input() {
        assert!(validate_attachments(&[att("a.png", "image/png", "AAAA")]).is_ok());
        assert!(matches!(
            validate_attachments(&[att("a.exe", "application/x-msdownload", "AAAA")]),
            Err(AttachmentError::Unsupported(..))
        ));
        assert!(matches!(
            validate_attachments(&[att("a.png", "image/png", "not base64!!")]),
            Err(AttachmentError::BadData(_))
        ));
        assert!(matches!(
            validate_attachments(&[att("a.png", "image/png", "")]),
            Err(AttachmentError::BadData(_))
        ));
        let big = "A".repeat(MAX_ATTACHMENT_B64 + 1);
        assert!(matches!(
            validate_attachments(&[att("big.png", "image/png", &big)]),
            Err(AttachmentError::TooLarge(_))
        ));
        let many: Vec<_> = (0..11)
            .map(|i| att(&format!("{i}.png"), "image/png", "AAAA"))
            .collect();
        assert_eq!(validate_attachments(&many), Err(AttachmentError::TooMany));
    }

    #[test]
    fn user_turn_is_valid_json_with_text() {
        let v: Value = serde_json::from_str(&user_turn_line("hi \"there\"\nnewline")).unwrap();
        assert_eq!(v["type"], "user");
        assert_eq!(v["message"]["content"], "hi \"there\"\nnewline");
    }

    #[test]
    fn permission_reply_shapes_match_protocol() {
        let allow: Value = serde_json::from_str(&permission_reply_line(
            "r1",
            &PermissionReply::Allow {
                updated_input: json!({"a":1}),
            },
        ))
        .unwrap();
        assert_eq!(allow["response"]["request_id"], "r1");
        assert_eq!(allow["response"]["response"]["behavior"], "allow");
        assert_eq!(allow["response"]["response"]["updatedInput"]["a"], 1);
        let deny: Value = serde_json::from_str(&permission_reply_line(
            "r2",
            &PermissionReply::Deny {
                message: "no".into(),
            },
        ))
        .unwrap();
        assert_eq!(deny["response"]["response"]["behavior"], "deny");
        assert_eq!(deny["response"]["response"]["message"], "no");
    }
}
