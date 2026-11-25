//! Tracks pending tool-permission requests and per-session "always allow" rules.
//! Pure state; the Tauri layer feeds it session events and writes replies to sessions.

use crate::cli::events::Event;
use crate::session::{PermissionReply, SessionId};
use serde::Serialize;
use serde_json::Value;
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct PendingPermission {
    pub session_id: SessionId,
    pub request_id: String,
    pub tool: String,
    pub input: Value,
    pub description: String,
    pub tool_use_id: String,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Decision {
    Allow,
    AllowAlways,
    Deny(Option<String>),
}

#[derive(Debug, thiserror::Error, PartialEq)]
pub enum BrokerError {
    #[error("no pending permission request {0}")]
    Unknown(String),
}

#[derive(Default)]
pub struct PermissionBroker {
    pending: HashMap<String, PendingPermission>,
    always: HashSet<(SessionId, String)>,
    /// Tools the user allowed permanently in Settings (applies to every session).
    persistent: HashSet<String>,
}

impl PermissionBroker {
    pub fn new() -> Self {
        Self::default()
    }

    /// Feed a session event. Returns an automatic reply when an always-allow rule matches;
    /// otherwise a new permission request becomes pending and `None` is returned.
    pub fn on_event(&mut self, session: &str, event: &Event) -> Option<(String, PermissionReply)> {
        let Event::PermissionRequest {
            request_id,
            tool,
            input,
            description,
            tool_use_id,
        } = event
        else {
            return None;
        };
        if self.persistent.contains(tool)
            || self.always.contains(&(session.to_string(), tool.clone()))
        {
            return Some((
                request_id.clone(),
                PermissionReply::Allow {
                    updated_input: input.clone(),
                },
            ));
        }
        self.pending.insert(
            request_id.clone(),
            PendingPermission {
                session_id: session.to_string(),
                request_id: request_id.clone(),
                tool: tool.clone(),
                input: input.clone(),
                description: description.clone(),
                tool_use_id: tool_use_id.clone(),
            },
        );
        None
    }

    pub fn set_persistent(&mut self, tools: impl IntoIterator<Item = String>) {
        self.persistent = tools.into_iter().collect();
    }

    pub fn pending(&self) -> Vec<PendingPermission> {
        let mut v: Vec<_> = self.pending.values().cloned().collect();
        v.sort_by(|a, b| a.request_id.cmp(&b.request_id));
        v
    }

    /// Resolve a pending request, returning the request and the reply to write to its session.
    pub fn resolve(
        &mut self,
        request_id: &str,
        decision: Decision,
    ) -> Result<(PendingPermission, PermissionReply), BrokerError> {
        let p = self
            .pending
            .remove(request_id)
            .ok_or_else(|| BrokerError::Unknown(request_id.to_string()))?;
        let reply = match decision {
            Decision::Allow => PermissionReply::Allow {
                updated_input: p.input.clone(),
            },
            Decision::AllowAlways => {
                self.always.insert((p.session_id.clone(), p.tool.clone()));
                PermissionReply::Allow {
                    updated_input: p.input.clone(),
                }
            }
            Decision::Deny(reason) => PermissionReply::Deny {
                message: reason.unwrap_or_else(|| "The user denied this action.".into()),
            },
        };
        Ok((p, reply))
    }

    /// Forget everything about a session (it exited or was stopped).
    pub fn clear_session(&mut self, session: &str) {
        self.pending.retain(|_, p| p.session_id != session);
        self.always.retain(|(s, _)| s != session);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn req(id: &str, tool: &str) -> Event {
        Event::PermissionRequest {
            request_id: id.into(),
            tool: tool.into(),
            input: json!({"file_path": "a.txt", "content": "hi"}),
            description: "a.txt".into(),
            tool_use_id: "tu1".into(),
        }
    }

    #[test]
    fn persistent_rule_auto_allows_in_any_session() {
        let mut b = PermissionBroker::new();
        b.set_persistent(["Read".to_string()]);
        assert!(b.on_event("s9", &req("r1", "Read")).is_some());
        assert!(b.on_event("s9", &req("r2", "Write")).is_none());
    }

    #[test]
    fn request_becomes_pending() {
        let mut b = PermissionBroker::new();
        assert!(b.on_event("s1", &req("r1", "Write")).is_none());
        let p = b.pending();
        assert_eq!(p.len(), 1);
        assert_eq!(
            (
                p[0].session_id.as_str(),
                p[0].request_id.as_str(),
                p[0].tool.as_str()
            ),
            ("s1", "r1", "Write")
        );
    }

    #[test]
    fn non_permission_events_are_ignored() {
        let mut b = PermissionBroker::new();
        assert!(
            b.on_event(
                "s1",
                &Event::Info {
                    subtype: "x".into()
                }
            )
            .is_none()
        );
        assert!(b.pending().is_empty());
    }

    #[test]
    fn resolve_allow_returns_reply_with_original_input_and_clears_pending() {
        let mut b = PermissionBroker::new();
        b.on_event("s1", &req("r1", "Write"));
        let (p, reply) = b.resolve("r1", Decision::Allow).unwrap();
        assert_eq!(p.session_id, "s1");
        assert_eq!(
            reply,
            PermissionReply::Allow {
                updated_input: json!({"file_path": "a.txt", "content": "hi"})
            }
        );
        assert!(b.pending().is_empty());
    }

    #[test]
    fn deny_includes_reason_or_default() {
        let mut b = PermissionBroker::new();
        b.on_event("s1", &req("r1", "Write"));
        b.on_event("s1", &req("r2", "Write"));
        let (_, r1) = b
            .resolve("r1", Decision::Deny(Some("too risky".into())))
            .unwrap();
        assert_eq!(
            r1,
            PermissionReply::Deny {
                message: "too risky".into()
            }
        );
        let (_, r2) = b.resolve("r2", Decision::Deny(None)).unwrap();
        assert!(matches!(r2, PermissionReply::Deny { message } if !message.is_empty()));
    }

    #[test]
    fn allow_always_auto_answers_same_tool_in_same_session_only() {
        let mut b = PermissionBroker::new();
        b.on_event("s1", &req("r1", "Write"));
        b.resolve("r1", Decision::AllowAlways).unwrap();
        let auto = b.on_event("s1", &req("r2", "Write"));
        assert!(matches!(auto, Some((id, PermissionReply::Allow { .. })) if id == "r2"));
        assert!(b.pending().is_empty());
        assert!(
            b.on_event("s2", &req("r3", "Write")).is_none(),
            "other session still asks"
        );
        assert!(
            b.on_event("s1", &req("r4", "Bash")).is_none(),
            "other tool still asks"
        );
    }

    #[test]
    fn resolving_unknown_request_errors() {
        let mut b = PermissionBroker::new();
        assert_eq!(
            b.resolve("nope", Decision::Allow).unwrap_err(),
            BrokerError::Unknown("nope".into())
        );
    }

    #[test]
    fn clear_session_drops_pending_and_rules() {
        let mut b = PermissionBroker::new();
        b.on_event("s1", &req("r1", "Write"));
        b.resolve("r1", Decision::AllowAlways).unwrap();
        b.on_event("s1", &req("r2", "Bash"));
        b.on_event("s2", &req("r3", "Bash"));
        b.clear_session("s1");
        assert_eq!(b.pending().len(), 1);
        assert!(b.on_event("s1", &req("r5", "Write")).is_none(), "rule gone");
    }
}
