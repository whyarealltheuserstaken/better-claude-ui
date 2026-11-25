//! Typed events parsed from `claude` stream-json stdout. This is the ONLY place that
//! knows the CLI's JSON shapes. Parsing is tolerant: unknown shapes become `Event::Unknown`.

use serde::Serialize;
use serde_json::Value;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Block {
    Text {
        text: String,
    },
    Thinking {
        text: String,
    },
    ToolUse {
        id: String,
        name: String,
        input: Value,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Event {
    SessionInit {
        session_id: String,
        model: String,
        cwd: String,
    },
    TextDelta {
        text: String,
        parent_tool_use_id: Option<String>,
    },
    ThinkingDelta {
        text: String,
        parent_tool_use_id: Option<String>,
    },
    AssistantMessage {
        blocks: Vec<Block>,
        parent_tool_use_id: Option<String>,
    },
    ToolResult {
        tool_use_id: String,
        output: String,
        is_error: bool,
        parent_tool_use_id: Option<String>,
    },
    PermissionRequest {
        request_id: String,
        tool: String,
        input: Value,
        description: String,
        tool_use_id: String,
    },
    PermissionDenied {
        tool: String,
        message: String,
    },
    TurnResult {
        is_error: bool,
        result: String,
        cost_usd: Option<f64>,
        session_id: String,
    },
    /// Recognised but not interesting to the UI (hooks, status, rate limits, other stream events).
    Info {
        subtype: String,
    },
    Unknown {
        raw: Value,
    },
}

#[derive(Debug, thiserror::Error, PartialEq)]
pub enum ParseError {
    #[error("invalid JSON: {0}")]
    InvalidJson(String),
}

/// Parse one stdout line into zero or more events. Blank lines and `//` annotation lines yield none.
pub fn parse_line(line: &str) -> Result<Vec<Event>, ParseError> {
    let line = line.trim();
    if line.is_empty() || line.starts_with("//") {
        return Ok(vec![]);
    }
    let v: Value =
        serde_json::from_str(line).map_err(|e| ParseError::InvalidJson(e.to_string()))?;
    Ok(interpret(v))
}

fn s(v: &Value, key: &str) -> String {
    v.get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn parent(v: &Value) -> Option<String> {
    v.get("parent_tool_use_id")
        .and_then(Value::as_str)
        .map(str::to_string)
}

/// Tool result content is either a string or an array of `{type:"text", text}` blocks.
fn flatten_content(c: &Value) -> String {
    match c {
        Value::String(t) => t.clone(),
        Value::Array(items) => items
            .iter()
            .filter_map(|i| i.get("text").and_then(Value::as_str))
            .collect::<Vec<_>>()
            .join("\n"),
        Value::Null => String::new(),
        other => other.to_string(),
    }
}

fn interpret(v: Value) -> Vec<Event> {
    let ty = v.get("type").and_then(Value::as_str).unwrap_or_default();
    match ty {
        "system" => {
            let sub = s(&v, "subtype");
            match sub.as_str() {
                "init" => vec![Event::SessionInit {
                    session_id: s(&v, "session_id"),
                    model: s(&v, "model"),
                    cwd: s(&v, "cwd"),
                }],
                "permission_denied" => vec![Event::PermissionDenied {
                    tool: s(&v, "tool_name"),
                    message: s(&v, "message"),
                }],
                _ => vec![Event::Info { subtype: sub }],
            }
        }
        "stream_event" => {
            let ev = v.get("event").cloned().unwrap_or(Value::Null);
            let ety = s(&ev, "type");
            if ety == "content_block_delta" {
                let d = ev.get("delta").cloned().unwrap_or(Value::Null);
                match s(&d, "type").as_str() {
                    "text_delta" => {
                        return vec![Event::TextDelta {
                            text: s(&d, "text"),
                            parent_tool_use_id: parent(&v),
                        }];
                    }
                    "thinking_delta" => {
                        return vec![Event::ThinkingDelta {
                            text: s(&d, "thinking"),
                            parent_tool_use_id: parent(&v),
                        }];
                    }
                    _ => {}
                }
            }
            vec![Event::Info {
                subtype: if ety.is_empty() {
                    "stream_event".into()
                } else {
                    ety
                },
            }]
        }
        "assistant" => {
            let blocks: Vec<Block> = v
                .pointer("/message/content")
                .and_then(Value::as_array)
                .map(|items| {
                    items
                        .iter()
                        .filter_map(|b| match s(b, "type").as_str() {
                            "text" => Some(Block::Text { text: s(b, "text") }),
                            "thinking" => Some(Block::Thinking {
                                text: s(b, "thinking"),
                            }),
                            "tool_use" => Some(Block::ToolUse {
                                id: s(b, "id"),
                                name: s(b, "name"),
                                input: b.get("input").cloned().unwrap_or(Value::Null),
                            }),
                            _ => None,
                        })
                        .collect()
                })
                .unwrap_or_default();
            if blocks.is_empty() {
                vec![Event::Info {
                    subtype: "assistant_empty".into(),
                }]
            } else {
                vec![Event::AssistantMessage {
                    blocks,
                    parent_tool_use_id: parent(&v),
                }]
            }
        }
        "user" => {
            let results: Vec<Event> = v
                .pointer("/message/content")
                .and_then(Value::as_array)
                .map(|items| {
                    items
                        .iter()
                        .filter(|b| s(b, "type") == "tool_result")
                        .map(|b| Event::ToolResult {
                            tool_use_id: s(b, "tool_use_id"),
                            output: flatten_content(b.get("content").unwrap_or(&Value::Null)),
                            is_error: b.get("is_error").and_then(Value::as_bool).unwrap_or(false),
                            parent_tool_use_id: parent(&v),
                        })
                        .collect()
                })
                .unwrap_or_default();
            if results.is_empty() {
                vec![Event::Info {
                    subtype: "user".into(),
                }]
            } else {
                results
            }
        }
        "control_request"
            if v.pointer("/request/subtype").and_then(Value::as_str) == Some("can_use_tool") =>
        {
            let r = v.get("request").cloned().unwrap_or(Value::Null);
            vec![Event::PermissionRequest {
                request_id: s(&v, "request_id"),
                tool: s(&r, "tool_name"),
                input: r.get("input").cloned().unwrap_or(Value::Null),
                description: s(&r, "description"),
                tool_use_id: s(&r, "tool_use_id"),
            }]
        }
        "result" => vec![Event::TurnResult {
            is_error: v.get("is_error").and_then(Value::as_bool).unwrap_or(false),
            result: s(&v, "result"),
            cost_usd: v.get("total_cost_usd").and_then(Value::as_f64),
            session_id: s(&v, "session_id"),
        }],
        "rate_limit_event" => vec![Event::Info {
            subtype: "rate_limit".into(),
        }],
        _ => vec![Event::Unknown { raw: v }],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SIMPLE: &str = include_str!("../../tests/fixtures/simple_reply.jsonl");
    const ALLOW: &str = include_str!("../../tests/fixtures/tool_permission_allow.jsonl");
    const ERROR: &str = include_str!("../../tests/fixtures/error_model.jsonl");

    fn all(fixture: &str) -> Vec<Event> {
        fixture
            .lines()
            .flat_map(|l| parse_line(l).expect("fixture line parses"))
            .collect()
    }

    #[test]
    fn parses_session_init_from_fixture() {
        let ev = all(SIMPLE);
        let init = ev.iter().find_map(|e| match e {
            Event::SessionInit {
                session_id,
                model,
                cwd,
            } => Some((session_id, model, cwd)),
            _ => None,
        });
        let (id, model, cwd) = init.expect("init event present");
        assert!(!id.is_empty());
        assert!(!model.is_empty());
        assert!(!cwd.is_empty());
    }

    #[test]
    fn parses_text_delta() {
        let ev = all(SIMPLE);
        assert!(ev.contains(&Event::TextDelta {
            text: "pong".into(),
            parent_tool_use_id: None
        }));
    }

    #[test]
    fn parses_assistant_tool_use_and_tool_result() {
        let ev = all(ALLOW);
        let tools: Vec<(String, String, Value)> = ev
            .iter()
            .flat_map(|e| match e {
                Event::AssistantMessage { blocks, .. } => blocks.clone(),
                _ => vec![],
            })
            .filter_map(|b| match b {
                Block::ToolUse { id, name, input } => Some((id, name, input)),
                _ => None,
            })
            .collect();
        let write = tools
            .iter()
            .find(|(_, n, _)| n == "Write")
            .expect("Write tool_use block");
        assert_eq!(write.2["content"], "hi");
        let linked = tools.iter().any(|(id, _, _)| {
            ev.iter()
                .any(|e| matches!(e, Event::ToolResult { tool_use_id, .. } if tool_use_id == id))
        });
        assert!(linked, "some tool_result links to a tool_use by id");
    }

    #[test]
    fn parses_permission_request() {
        let ev = all(ALLOW);
        let req = ev.iter().find_map(|e| match e {
            Event::PermissionRequest {
                request_id,
                tool,
                input,
                ..
            } => Some((request_id, tool, input)),
            _ => None,
        });
        let (rid, tool, input) = req.expect("permission request");
        assert!(!rid.is_empty());
        assert_eq!(tool, "Write");
        assert_eq!(input["content"], "hi");
    }

    #[test]
    fn parses_turn_result_and_error_result() {
        let ok = all(SIMPLE);
        assert!(matches!(
            ok.last(),
            Some(Event::TurnResult {
                is_error: false,
                ..
            })
        ));
        let err = all(ERROR);
        match err.last() {
            Some(Event::TurnResult {
                is_error: true,
                result,
                ..
            }) => assert!(result.contains("selected model")),
            other => panic!("expected error TurnResult, got {other:?}"),
        }
    }

    #[test]
    fn parses_permission_denied_system_event() {
        let line = r#"{"type":"system","subtype":"permission_denied","tool_name":"Write","tool_use_id":"t","message":"nope"}"#;
        assert_eq!(
            parse_line(line).unwrap(),
            vec![Event::PermissionDenied {
                tool: "Write".into(),
                message: "nope".into()
            }]
        );
    }

    #[test]
    fn unknown_type_becomes_unknown_event() {
        let ev = parse_line(r#"{"type":"zzz","x":1}"#).unwrap();
        assert!(matches!(ev.as_slice(), [Event::Unknown { .. }]));
    }

    #[test]
    fn hook_and_status_system_events_are_info() {
        let ev = parse_line(r#"{"type":"system","subtype":"hook_started"}"#).unwrap();
        assert_eq!(
            ev,
            vec![Event::Info {
                subtype: "hook_started".into()
            }]
        );
    }

    #[test]
    fn invalid_json_returns_parse_error_not_panic() {
        assert!(matches!(
            parse_line("{not json"),
            Err(ParseError::InvalidJson(_))
        ));
    }

    #[test]
    fn blank_and_annotation_lines_are_skipped() {
        assert!(parse_line("").unwrap().is_empty());
        assert!(parse_line("   ").unwrap().is_empty());
        assert!(parse_line("// SENT {}").unwrap().is_empty());
    }

    #[test]
    fn wrong_field_types_never_panic() {
        for l in [
            r#"{"type":"assistant","message":5}"#,
            r#"{"type":"stream_event","event":"x"}"#,
            r#"{"type":"control_request"}"#,
            r#"[1,2]"#,
            r#"null"#,
        ] {
            let _ = parse_line(l);
        }
    }
}
