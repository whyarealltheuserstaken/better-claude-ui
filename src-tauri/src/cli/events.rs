//! Typed events parsed from `claude` stream-json stdout. This is the ONLY place that
//! knows the CLI's JSON shapes. Parsing is tolerant: unknown shapes become `Event::Unknown`.

use serde::Serialize;
use serde_json::Value;

/// Per-model usage as reported in a `result` event. NOTE: the CLI reports these cumulatively
/// for the whole session process, so consumers must diff successive values.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct ModelUsage {
    pub model: String,
    pub input: u64,
    pub output: u64,
    pub cache_read: u64,
    pub cache_write: u64,
    pub web_searches: u64,
    pub cost_usd: f64,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct Described {
    pub name: String,
    pub description: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct ModelInfo {
    /// Value to pass to `--model`.
    pub value: String,
    pub display_name: String,
    pub description: String,
}

/// Answer to the `initialize` control request: available before the first message.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct InitInfo {
    pub commands: Vec<Described>,
    pub agents: Vec<Described>,
    pub models: Vec<ModelInfo>,
    pub output_styles: Vec<String>,
    pub version: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct McpServer {
    pub name: String,
    pub status: String,
}

/// What this session can do, from the `init` event.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct Capabilities {
    pub slash_commands: Vec<String>,
    pub skills: Vec<String>,
    pub agents: Vec<String>,
    pub tools: Vec<String>,
    pub mcp_servers: Vec<McpServer>,
    pub plugins: Vec<String>,
    pub version: String,
}

/// One subscription usage window from a `rate_limit_event` (e.g. `five_hour`, `seven_day`).
#[derive(Debug, Clone, PartialEq, Serialize, serde::Deserialize)]
pub struct RateWindow {
    pub name: String,
    /// 0.0 ..= 1.0
    pub utilization: f64,
    /// Unix seconds.
    pub resets_at: Option<u64>,
    pub status: String,
}

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
        caps: Box<Capabilities>,
    },
    TextDelta {
        text: String,
        parent_tool_use_id: Option<String>,
    },
    /// Token counts for one model step. A `start` opens the step; later reports carry running
    /// totals for that same step, so they replace the counts and must not be added to them.
    StepUsage {
        start: bool,
        input: u64,
        output: u64,
        cache_read: u64,
        cache_write: u64,
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
        duration_ms: Option<u64>,
        num_turns: Option<u64>,
        /// Cumulative per-model usage for the session process.
        models: Vec<ModelUsage>,
    },
    /// Reply to the initialize control request.
    Initialized {
        info: Box<InitInfo>,
    },
    /// Subscription usage windows and overage state.
    RateLimit {
        status: String,
        windows: Vec<RateWindow>,
        using_overage: bool,
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
                    caps: Box::new(parse_caps(&v)),
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
            let usage = match ety.as_str() {
                "message_start" => ev.pointer("/message/usage"),
                "message_delta" => ev.get("usage"),
                _ => None,
            };
            if let Some(u) = usage.filter(|u| u.is_object()) {
                let n = |k: &str| u.get(k).and_then(Value::as_u64).unwrap_or(0);
                return vec![Event::StepUsage {
                    start: ety == "message_start",
                    input: n("input_tokens"),
                    output: n("output_tokens"),
                    cache_read: n("cache_read_input_tokens"),
                    cache_write: n("cache_creation_input_tokens"),
                    parent_tool_use_id: parent(&v),
                }];
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
            duration_ms: v.get("duration_ms").and_then(Value::as_u64),
            num_turns: v.get("num_turns").and_then(Value::as_u64),
            models: parse_model_usage(&v),
        }],
        "rate_limit_event" => vec![parse_rate_limit(&v)],
        "control_response" => parse_initialized(&v).map_or_else(
            || {
                vec![Event::Info {
                    subtype: "control_response".into(),
                }]
            },
            |info| {
                vec![Event::Initialized {
                    info: Box::new(info),
                }]
            },
        ),
        _ => vec![Event::Unknown { raw: v }],
    }
}

fn described(v: &Value, key: &str) -> Vec<Described> {
    v.get(key)
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(|x| {
                    Some(Described {
                        name: x.get("name")?.as_str()?.to_string(),
                        description: x
                            .get("description")
                            .and_then(Value::as_str)
                            .unwrap_or("")
                            .to_string(),
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

/// Parse a successful `initialize` reply; None for any other control response.
fn parse_initialized(v: &Value) -> Option<InitInfo> {
    let r = v.get("response")?;
    if r.get("subtype")?.as_str()? != "success" {
        return None;
    }
    let body = r.get("response")?;
    body.get("commands")?;
    let models = body
        .get("models")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(|m| {
                    let value = m.get("value")?.as_str()?.to_string();
                    Some(ModelInfo {
                        display_name: m
                            .get("displayName")
                            .and_then(Value::as_str)
                            .unwrap_or(&value)
                            .to_string(),
                        description: m
                            .get("description")
                            .and_then(Value::as_str)
                            .unwrap_or("")
                            .to_string(),
                        value,
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    Some(InitInfo {
        commands: described(body, "commands"),
        agents: described(body, "agents"),
        models,
        output_styles: str_list(body, "available_output_styles"),
        version: s(body, "claude_code_version"),
    })
}

fn str_list(v: &Value, key: &str) -> Vec<String> {
    v.get(key)
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(|x| x.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default()
}

fn parse_caps(v: &Value) -> Capabilities {
    let named = |key: &str| -> Vec<(String, String)> {
        v.get(key)
            .and_then(Value::as_array)
            .map(|a| {
                a.iter()
                    .filter_map(|x| {
                        let name = x.get("name")?.as_str()?.to_string();
                        let status = x
                            .get("status")
                            .and_then(Value::as_str)
                            .unwrap_or("")
                            .to_string();
                        Some((name, status))
                    })
                    .collect()
            })
            .unwrap_or_default()
    };
    Capabilities {
        slash_commands: str_list(v, "slash_commands"),
        skills: str_list(v, "skills"),
        agents: str_list(v, "agents"),
        tools: str_list(v, "tools"),
        mcp_servers: named("mcp_servers")
            .into_iter()
            .map(|(name, status)| McpServer { name, status })
            .collect(),
        plugins: named("plugins").into_iter().map(|(n, _)| n).collect(),
        version: s(v, "claude_code_version"),
    }
}

fn parse_model_usage(v: &Value) -> Vec<ModelUsage> {
    let Some(map) = v.get("modelUsage").and_then(Value::as_object) else {
        return vec![];
    };
    let n = |m: &Value, k: &str| m.get(k).and_then(Value::as_u64).unwrap_or(0);
    let mut out: Vec<ModelUsage> = map
        .iter()
        .map(|(model, m)| ModelUsage {
            model: model.clone(),
            input: n(m, "inputTokens"),
            output: n(m, "outputTokens"),
            cache_read: n(m, "cacheReadInputTokens"),
            cache_write: n(m, "cacheCreationInputTokens"),
            web_searches: n(m, "webSearchRequests"),
            cost_usd: m.get("costUSD").and_then(Value::as_f64).unwrap_or(0.0),
        })
        .collect();
    out.sort_by(|a, b| a.model.cmp(&b.model));
    out
}

fn parse_rate_limit(v: &Value) -> Event {
    let info = v.get("rate_limit_info").unwrap_or(&Value::Null);
    let mut windows: Vec<RateWindow> = info
        .get("unifiedWindows")
        .and_then(Value::as_object)
        .map(|m| {
            m.iter()
                .map(|(name, w)| RateWindow {
                    name: name.clone(),
                    utilization: w.get("utilization").and_then(Value::as_f64).unwrap_or(0.0),
                    resets_at: w.get("resetsAt").and_then(Value::as_u64),
                    status: w
                        .get("status")
                        .and_then(Value::as_str)
                        .unwrap_or("unknown")
                        .to_string(),
                })
                .collect()
        })
        .unwrap_or_default();
    windows.sort_by(|a, b| a.name.cmp(&b.name));
    Event::RateLimit {
        status: info
            .get("status")
            .and_then(Value::as_str)
            .unwrap_or("unknown")
            .to_string(),
        windows,
        using_overage: info
            .get("isUsingOverage")
            .and_then(Value::as_bool)
            .unwrap_or(false),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SIMPLE: &str = include_str!("../../tests/fixtures/simple_reply.jsonl");
    const ALLOW: &str = include_str!("../../tests/fixtures/tool_permission_allow.jsonl");
    const ERROR: &str = include_str!("../../tests/fixtures/error_model.jsonl");
    const USAGE: &str = include_str!("../../tests/fixtures/usage_subagent.jsonl");

    fn all(fixture: &str) -> Vec<Event> {
        fixture
            .lines()
            .flat_map(|l| parse_line(l).expect("fixture line parses"))
            .collect()
    }

    fn step(
        start: bool,
        input: u64,
        output: u64,
        cache_read: u64,
        cache_write: u64,
        parent: Option<&str>,
    ) -> Event {
        Event::StepUsage {
            start,
            input,
            output,
            cache_read,
            cache_write,
            parent_tool_use_id: parent.map(str::to_string),
        }
    }

    #[test]
    fn parses_step_usage_from_the_recorded_fixture() {
        let steps: Vec<Event> = all(USAGE)
            .into_iter()
            .filter(|e| matches!(e, Event::StepUsage { .. }))
            .collect();
        assert_eq!(
            steps,
            vec![
                step(true, 2, 4, 15027, 7567, None),
                step(false, 2, 291, 15027, 7567, None),
                step(true, 2, 8, 22594, 559, None),
                step(false, 2, 44, 22594, 559, None),
            ]
        );
    }

    #[test]
    fn step_usage_treats_missing_fields_as_zero_and_keeps_the_parent() {
        let line = r#"{"type":"stream_event","event":{"type":"message_delta","usage":{"output_tokens":7}},"parent_tool_use_id":"toolu_1"}"#;
        assert_eq!(
            parse_line(line).unwrap(),
            vec![step(false, 0, 7, 0, 0, Some("toolu_1"))]
        );
    }

    #[test]
    fn stream_events_without_usage_stay_informational() {
        for line in [
            r#"{"type":"stream_event","event":{"type":"message_start","message":{}}}"#,
            r#"{"type":"stream_event","event":{"type":"message_delta","usage":null}}"#,
            r#"{"type":"stream_event","event":{"type":"message_delta","usage":"lots"}}"#,
            r#"{"type":"stream_event","event":{"type":"message_stop"}}"#,
        ] {
            let ev = parse_line(line).unwrap();
            assert!(
                matches!(ev.as_slice(), [Event::Info { .. }]),
                "{line}: {ev:?}"
            );
        }
    }

    #[test]
    fn parses_session_init_from_fixture() {
        let ev = all(SIMPLE);
        let init = ev.iter().find_map(|e| match e {
            Event::SessionInit {
                session_id,
                model,
                cwd,
                ..
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

    #[test]
    fn result_carries_per_model_usage_and_duration() {
        let line = r#"{"type":"result","is_error":false,"result":"ok","total_cost_usd":0.5,"session_id":"s","duration_ms":1200,"num_turns":3,"modelUsage":{"claude-haiku-5-5":{"inputTokens":4,"outputTokens":71,"cacheReadInputTokens":10,"cacheCreationInputTokens":20,"webSearchRequests":2,"costUSD":0.25},"a-model":{"inputTokens":1}}}"#;
        match parse_line(line).unwrap().remove(0) {
            Event::TurnResult {
                models,
                duration_ms,
                num_turns,
                cost_usd,
                ..
            } => {
                assert_eq!(duration_ms, Some(1200));
                assert_eq!(num_turns, Some(3));
                assert_eq!(cost_usd, Some(0.5));
                assert_eq!(models.len(), 2);
                assert_eq!(models[0].model, "a-model");
                let h = &models[1];
                assert_eq!(
                    (
                        h.input,
                        h.output,
                        h.cache_read,
                        h.cache_write,
                        h.web_searches
                    ),
                    (4, 71, 10, 20, 2)
                );
                assert!((h.cost_usd - 0.25).abs() < 1e-9);
            }
            other => panic!("unexpected {other:?}"),
        }
    }

    #[test]
    fn result_without_usage_still_parses() {
        let line = r#"{"type":"result","is_error":true,"result":"boom","session_id":"s"}"#;
        match parse_line(line).unwrap().remove(0) {
            Event::TurnResult {
                models, cost_usd, ..
            } => {
                assert!(models.is_empty());
                assert_eq!(cost_usd, None);
            }
            other => panic!("unexpected {other:?}"),
        }
    }

    #[test]
    fn parses_rate_limit_windows() {
        let line = r#"{"type":"rate_limit_event","rate_limit_info":{"status":"allowed","isUsingOverage":false,"unifiedWindows":{"seven_day":{"utilization":0.09,"resetsAt":1795989600,"status":"allowed"},"five_hour":{"utilization":0.3,"resetsAt":1795635600,"status":"allowed"}}}}"#;
        match parse_line(line).unwrap().remove(0) {
            Event::RateLimit {
                status,
                windows,
                using_overage,
            } => {
                assert_eq!(status, "allowed");
                assert!(!using_overage);
                assert_eq!(windows.len(), 2);
                assert_eq!(windows[0].name, "five_hour");
                assert!((windows[0].utilization - 0.3).abs() < 1e-9);
                assert_eq!(windows[0].resets_at, Some(1795635600));
            }
            other => panic!("unexpected {other:?}"),
        }
    }

    #[test]
    fn malformed_rate_limit_is_tolerated() {
        let line = r#"{"type":"rate_limit_event"}"#;
        assert!(matches!(
            parse_line(line).unwrap().remove(0),
            Event::RateLimit { .. }
        ));
    }

    #[test]
    fn init_event_exposes_capabilities() {
        let line = r#"{"type":"system","subtype":"init","session_id":"s","model":"m","cwd":"c","claude_code_version":"2.1.332","slash_commands":["review","ecc:plan"],"skills":["a:b"],"agents":["claude"],"tools":["Bash","Read"],"mcp_servers":[{"name":"gh","status":"connected"},{"name":"x"}],"plugins":[{"name":"superpowers","path":"p"}]}"#;
        match parse_line(line).unwrap().remove(0) {
            Event::SessionInit { caps, .. } => {
                assert_eq!(caps.slash_commands, vec!["review", "ecc:plan"]);
                assert_eq!(caps.tools.len(), 2);
                assert_eq!(
                    caps.mcp_servers[0],
                    McpServer {
                        name: "gh".into(),
                        status: "connected".into()
                    }
                );
                assert_eq!(caps.mcp_servers[1].status, "");
                assert_eq!(caps.plugins, vec!["superpowers"]);
                assert_eq!(caps.version, "2.1.332");
            }
            other => panic!("unexpected {other:?}"),
        }
    }

    #[test]
    fn init_without_capability_fields_still_parses() {
        let line = r#"{"type":"system","subtype":"init","session_id":"s","model":"m","cwd":"c"}"#;
        match parse_line(line).unwrap().remove(0) {
            Event::SessionInit { caps, .. } => assert_eq!(*caps, Capabilities::default()),
            other => panic!("unexpected {other:?}"),
        }
    }

    #[test]
    fn initialize_response_gives_commands_models_and_agents() {
        let line = r#"{"type":"control_response","response":{"subtype":"success","request_id":"bcu-init","response":{"commands":[{"name":"review","description":"Review a PR"},{"name":"init"}],"agents":[{"name":"claude","description":"General"}],"models":[{"value":"default","displayName":"Default (recommended)","description":"Opus"},{"value":"sonnet"}],"available_output_styles":["default","Concise"],"claude_code_version":"2.1.332","account":{"email":"x@y.z"}}}}"#;
        match parse_line(line).unwrap().remove(0) {
            Event::Initialized { info } => {
                assert_eq!(info.commands.len(), 2);
                assert_eq!(info.commands[0].description, "Review a PR");
                assert_eq!(info.commands[1].description, "");
                assert_eq!(info.agents[0].name, "claude");
                assert_eq!(info.models[0].display_name, "Default (recommended)");
                assert_eq!(info.models[1].display_name, "sonnet");
                assert_eq!(info.output_styles, vec!["default", "Concise"]);
                assert_eq!(info.version, "2.1.332");
                // The account email must never be carried into events.
                assert!(!format!("{info:?}").contains("x@y.z"));
            }
            other => panic!("unexpected {other:?}"),
        }
    }

    #[test]
    fn other_control_responses_are_info_not_initialized() {
        let line = r#"{"type":"control_response","response":{"subtype":"success","request_id":"int-1","response":{}}}"#;
        assert!(matches!(
            parse_line(line).unwrap().remove(0),
            Event::Info { .. }
        ));
        let err = r#"{"type":"control_response","response":{"subtype":"error","request_id":"x","error":"no"}}"#;
        assert!(matches!(
            parse_line(err).unwrap().remove(0),
            Event::Info { .. }
        ));
    }
}
