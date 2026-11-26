//! Importers for other assistants' exports. These formats are not officially documented, so every
//! parser is tolerant: unknown fields are ignored, odd entries are skipped and counted as warnings,
//! and nothing here panics on hostile input. Formats are described from community documentation and
//! tested against fixtures built from those descriptions, not against real exports.

use super::model::*;
use serde_json::Value;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Format {
    /// This app's own backup file.
    Backup,
    ClaudeAi,
    ChatGpt,
    /// The documented universal format this app exports (see docs/EXPORT_FORMAT.md).
    Universal,
    /// Best effort for other JSON shapes (for example third-party exporters).
    Generic,
    Markdown,
    Unknown,
}

impl Format {
    pub fn label(self) -> &'static str {
        match self {
            Format::Backup => "BetterClaudeUI backup",
            Format::ClaudeAi => "Claude.ai export",
            Format::ChatGpt => "ChatGPT export",
            Format::Universal => "Universal chat export",
            Format::Generic => "Chat export (best-effort)",
            Format::Markdown => "Text or Markdown transcript",
            Format::Unknown => "Unrecognised file",
        }
    }
    pub fn source(self) -> &'static str {
        match self {
            Format::Backup => "better-claude-ui",
            Format::ClaudeAi => "claude.ai",
            Format::ChatGpt => "chatgpt",
            Format::Universal => "universal",
            Format::Generic => "other",
            Format::Markdown => "markdown",
            Format::Unknown => "unknown",
        }
    }
}

#[derive(Debug, Default)]
pub struct Parsed {
    pub conversations: Vec<Conversation>,
    pub projects: Vec<ImportedProject>,
    pub warnings: Vec<String>,
}

fn s<'a>(v: &'a Value, key: &str) -> Option<&'a str> {
    v.get(key).and_then(Value::as_str)
}

fn push_msg(out: &mut Vec<Message>, role: &str, text: &str, at: Option<i64>) {
    let t = text.trim_end().trim_start_matches(['\r', '\n']);
    if t.trim().is_empty() || out.len() >= MAX_MESSAGES {
        return;
    }
    out.push(Message {
        role: role.into(),
        text: clamp_text(t),
        at,
    });
}

/// Detect the format of a parsed JSON document.
pub fn detect(v: &Value) -> Format {
    match v {
        Value::Object(o) => match o.get("format").and_then(Value::as_str) {
            Some("better-claude-ui-backup") => Format::Backup,
            Some("universal-chat-export") => Format::Universal,
            _ => ["conversations", "chats", "data"]
                .iter()
                .find_map(|k| o.get(*k).filter(|x| x.is_array()))
                .map(detect)
                .unwrap_or(Format::Unknown),
        },
        Value::Array(a) => match a.iter().find(|x| x.is_object()) {
            Some(first) if first.get("chat_messages").is_some() => Format::ClaudeAi,
            Some(first) if first.get("mapping").is_some() => Format::ChatGpt,
            Some(first)
                if ["messages", "chat_messages", "history", "turns"]
                    .iter()
                    .any(|k| first.get(*k).is_some()) =>
            {
                Format::Generic
            }
            Some(first)
                if first.get("name").is_some()
                    && (first.get("prompt_template").is_some()
                        || first.get("description").is_some()) =>
            {
                Format::ClaudeAi
            }
            _ => Format::Unknown,
        },
        _ => Format::Unknown,
    }
}

pub fn parse_json(v: &Value) -> (Format, Parsed) {
    let f = detect(v);
    let inner = |v: &Value| -> Value {
        match v {
            Value::Object(o) => ["conversations", "chats", "data"]
                .iter()
                .find_map(|k| o.get(*k).filter(|x| x.is_array()).cloned())
                .unwrap_or(Value::Null),
            other => other.clone(),
        }
    };
    let p = match f {
        Format::ClaudeAi => parse_claude_ai(&inner(v)),
        Format::ChatGpt => parse_chatgpt(&inner(v)),
        Format::Universal => parse_universal(v),
        Format::Generic => parse_generic(&inner(v)),
        _ => Parsed::default(),
    };
    (f, p)
}

fn limit_note(p: &mut Parsed) {
    if p.conversations.len() > MAX_CONVERSATIONS {
        p.conversations.truncate(MAX_CONVERSATIONS);
        p.warnings.push(format!(
            "Only the first {MAX_CONVERSATIONS} conversations were read."
        ));
    }
}

// ---------------------------------------------------------------- Claude.ai

/// Claude.ai's `conversations.json`: `[{uuid, name, created_at, updated_at, chat_messages:[{sender, text, content, created_at}]}]`
/// and `projects.json`: `[{uuid, name, description, prompt_template}]`.
pub fn parse_claude_ai(v: &Value) -> Parsed {
    let mut p = Parsed::default();
    let Some(arr) = v.as_array() else { return p };
    let mut skipped_roles = 0usize;
    let mut with_attachments = 0usize;
    for item in arr {
        if let Some(msgs) = item.get("chat_messages").and_then(Value::as_array) {
            let mut out = Vec::new();
            for m in msgs {
                let role = match s(m, "sender").or_else(|| s(m, "role")) {
                    Some("human") | Some("user") => "user",
                    Some("assistant") => "assistant",
                    _ => {
                        skipped_roles += 1;
                        continue;
                    }
                };
                let mut text = s(m, "text").unwrap_or("").to_string();
                if text.trim().is_empty() {
                    text = m
                        .get("content")
                        .and_then(Value::as_array)
                        .map(|blocks| {
                            blocks
                                .iter()
                                .filter(|b| s(b, "type") == Some("text"))
                                .filter_map(|b| s(b, "text"))
                                .collect::<Vec<_>>()
                                .join("\n")
                        })
                        .unwrap_or_default();
                }
                let names: Vec<&str> = ["attachments", "files"]
                    .iter()
                    .filter_map(|k| m.get(*k).and_then(Value::as_array))
                    .flatten()
                    .filter_map(|a| s(a, "file_name").or_else(|| s(a, "name")))
                    .collect();
                if !names.is_empty() {
                    with_attachments += 1;
                    text.push_str(&format!("\n\n[Attached: {}]", names.join(", ")));
                }
                push_msg(
                    &mut out,
                    role,
                    &text,
                    s(m, "created_at").and_then(parse_iso8601),
                );
            }
            if out.is_empty() {
                continue;
            }
            let uuid = s(item, "uuid").unwrap_or("");
            let title = s(item, "name")
                .map(clean_title)
                .filter(|t| !t.is_empty())
                .unwrap_or_else(|| title_from_messages(&out));
            let key = if uuid.is_empty() {
                format!("{title}{}", out.len())
            } else {
                uuid.to_string()
            };
            p.conversations.push(Conversation {
                id: conversation_id("claude.ai", &key),
                title,
                source: "claude.ai".into(),
                created: s(item, "created_at")
                    .and_then(parse_iso8601)
                    .or(out.first().and_then(|m| m.at)),
                updated: s(item, "updated_at")
                    .and_then(parse_iso8601)
                    .or(out.last().and_then(|m| m.at)),
                messages: out,
            });
        } else if let Some(name) = s(item, "name") {
            // A project entry (projects.json).
            let instructions = s(item, "prompt_template")
                .filter(|t| !t.trim().is_empty())
                .or_else(|| s(item, "description"))
                .unwrap_or("")
                .to_string();
            p.projects.push(ImportedProject {
                name: clean_title(name),
                instructions: instructions.chars().take(20_000).collect(),
            });
        }
    }
    if skipped_roles > 0 {
        p.warnings.push(format!(
            "{skipped_roles} message(s) from other senders were skipped."
        ));
    }
    if with_attachments > 0 {
        p.warnings.push(
            "Attached files are listed by name only; their contents are not imported.".into(),
        );
    }
    if !p.projects.is_empty() {
        p.warnings.push(
            "Project documents are not imported, only project names and instructions.".into(),
        );
    }
    limit_note(&mut p);
    p
}

// ------------------------------------------------------------------ ChatGPT

fn chatgpt_text(content: &Value) -> Option<String> {
    match s(content, "content_type") {
        Some("text") | Some("multimodal_text") | None => {
            let parts = content.get("parts")?.as_array()?;
            let text: Vec<String> = parts
                .iter()
                .map(|p| match p {
                    Value::String(t) => t.clone(),
                    Value::Object(_) => "[image or file]".to_string(),
                    _ => String::new(),
                })
                .filter(|t| !t.trim().is_empty())
                .collect();
            (!text.is_empty()).then(|| text.join("\n"))
        }
        Some("code") => {
            let code = s(content, "text")?;
            let lang = s(content, "language")
                .filter(|l| *l != "unknown")
                .unwrap_or("");
            Some(format!("```{lang}\n{code}\n```"))
        }
        _ => None, // tool output, reasoning, system context, ...
    }
}

/// ChatGPT's `conversations.json`: a tree in `mapping` (edits and regenerations make branches).
/// The branch ending at `current_node` is the one the user saw.
pub fn parse_chatgpt(v: &Value) -> Parsed {
    let mut p = Parsed::default();
    let Some(arr) = v.as_array() else { return p };
    let mut branched = 0usize;
    for item in arr {
        let Some(mapping) = item.get("mapping").and_then(Value::as_object) else {
            continue;
        };
        let multi = mapping.values().any(|n| {
            n.get("children")
                .and_then(Value::as_array)
                .is_some_and(|c| c.len() > 1)
        });
        // Start from current_node, else the newest leaf.
        let start = s(item, "current_node")
            .filter(|id| mapping.contains_key(*id))
            .map(String::from)
            .or_else(|| {
                mapping
                    .iter()
                    .filter(|(_, n)| {
                        n.get("children")
                            .and_then(Value::as_array)
                            .is_none_or(|c| c.is_empty())
                    })
                    .max_by(|a, b| {
                        let t = |n: &Value| {
                            n.get("message")
                                .and_then(|m| m.get("create_time"))
                                .and_then(Value::as_f64)
                                .unwrap_or(0.0)
                        };
                        t(a.1)
                            .partial_cmp(&t(b.1))
                            .unwrap_or(std::cmp::Ordering::Equal)
                    })
                    .map(|(k, _)| k.clone())
            });
        let Some(mut cur) = start else { continue };
        let mut chain: Vec<&Value> = Vec::new();
        let mut seen = std::collections::HashSet::new();
        while let Some(node) = mapping.get(&cur) {
            if !seen.insert(cur.clone()) || chain.len() > 100_000 {
                break; // cycle or absurd depth in a hostile file
            }
            chain.push(node);
            match s(node, "parent") {
                Some(parent) => cur = parent.to_string(),
                None => break,
            }
        }
        chain.reverse();
        let mut out = Vec::new();
        for node in chain {
            let Some(m) = node.get("message") else {
                continue;
            };
            if m.get("metadata")
                .and_then(|x| x.get("is_visually_hidden_from_conversation"))
                .and_then(Value::as_bool)
                == Some(true)
            {
                continue;
            }
            let role = match m.get("author").and_then(|a| s(a, "role")) {
                Some("user") => "user",
                Some("assistant") => "assistant",
                _ => continue,
            };
            let Some(text) = m.get("content").and_then(chatgpt_text) else {
                continue;
            };
            push_msg(
                &mut out,
                role,
                &text,
                m.get("create_time")
                    .and_then(Value::as_f64)
                    .map(|t| t as i64),
            );
        }
        if out.is_empty() {
            continue;
        }
        if multi {
            branched += 1;
        }
        let key = s(item, "conversation_id")
            .or_else(|| s(item, "id"))
            .map(String::from)
            .unwrap_or_else(|| format!("{}{}", s(item, "title").unwrap_or(""), out.len()));
        let title = s(item, "title")
            .map(clean_title)
            .filter(|t| !t.is_empty())
            .unwrap_or_else(|| title_from_messages(&out));
        p.conversations.push(Conversation {
            id: conversation_id("chatgpt", &key),
            title,
            source: "chatgpt".into(),
            created: item
                .get("create_time")
                .and_then(Value::as_f64)
                .map(|t| t as i64)
                .or(out.first().and_then(|m| m.at)),
            updated: item
                .get("update_time")
                .and_then(Value::as_f64)
                .map(|t| t as i64)
                .or(out.last().and_then(|m| m.at)),
            messages: out,
        });
    }
    if branched > 0 {
        p.warnings.push(format!("{branched} conversation(s) had edited or regenerated replies; only the latest branch was imported."));
    }
    limit_note(&mut p);
    p
}

// ---------------------------------------------------------------- Universal

/// This app's documented portable format: `{format:"universal-chat-export", version:1, conversations:[{title, messages:[{role,text}]}]}`.
pub fn parse_universal(v: &Value) -> Parsed {
    let mut p = Parsed::default();
    let Some(arr) = v.get("conversations").and_then(Value::as_array) else {
        return p;
    };
    for item in arr {
        let Some(msgs) = item.get("messages").and_then(Value::as_array) else {
            continue;
        };
        let mut out = Vec::new();
        for m in msgs {
            let role = match s(m, "role") {
                Some("user") => "user",
                Some("assistant") => "assistant",
                _ => continue,
            };
            push_msg(
                &mut out,
                role,
                s(m, "text").unwrap_or(""),
                m.get("at").and_then(Value::as_i64),
            );
        }
        if out.is_empty() {
            continue;
        }
        let title = s(item, "title")
            .map(clean_title)
            .filter(|t| !t.is_empty())
            .unwrap_or_else(|| title_from_messages(&out));
        let key = s(item, "id")
            .map(String::from)
            .unwrap_or_else(|| format!("{title}{}", out.len()));
        p.conversations.push(Conversation {
            id: conversation_id("universal", &key),
            title,
            source: s(item, "source")
                .unwrap_or("universal")
                .chars()
                .take(40)
                .collect(),
            created: item.get("created").and_then(Value::as_i64),
            updated: item.get("updated").and_then(Value::as_i64),
            messages: out,
        });
    }
    limit_note(&mut p);
    p
}

// ------------------------------------------------------------------ Generic

fn generic_role(m: &Value) -> Option<&'static str> {
    let raw = s(m, "role")
        .or_else(|| s(m, "sender"))
        .or_else(|| s(m, "from"))
        .or_else(|| s(m, "author"))
        .or_else(|| m.get("author").and_then(|a| s(a, "role")))?;
    match raw.to_lowercase().as_str() {
        "user" | "human" | "me" | "you" | "prompt" => Some("user"),
        "assistant" | "ai" | "bot" | "model" | "grok" | "claude" | "chatgpt" | "gpt" | "gemini"
        | "response" => Some("assistant"),
        _ => None,
    }
}

fn generic_text(m: &Value) -> String {
    for k in ["text", "content", "message", "body", "value"] {
        match m.get(k) {
            Some(Value::String(t)) if !t.trim().is_empty() => return t.clone(),
            Some(Value::Array(a)) => {
                let t: Vec<&str> = a
                    .iter()
                    .filter_map(|b| b.as_str().or_else(|| s(b, "text")))
                    .collect();
                if !t.is_empty() {
                    return t.join("\n");
                }
            }
            _ => {}
        }
    }
    String::new()
}

/// Best effort for JSON shapes we do not know: a list of conversations, each with a list of
/// messages that have some kind of role and text.
pub fn parse_generic(v: &Value) -> Parsed {
    let mut p = Parsed::default();
    let Some(arr) = v.as_array() else { return p };
    let mut skipped = 0usize;
    for item in arr {
        let Some(msgs) = ["messages", "chat_messages", "history", "turns"]
            .iter()
            .find_map(|k| item.get(*k).and_then(Value::as_array))
        else {
            continue;
        };
        let mut out = Vec::new();
        for m in msgs {
            match generic_role(m) {
                Some(role) => {
                    let at = m
                        .get("created_at")
                        .or_else(|| m.get("timestamp"))
                        .and_then(|t| t.as_str().and_then(parse_iso8601).or(t.as_i64()));
                    push_msg(&mut out, role, &generic_text(m), at);
                }
                None => skipped += 1,
            }
        }
        if out.is_empty() {
            continue;
        }
        let title = ["title", "name", "subject"]
            .iter()
            .find_map(|k| s(item, k))
            .map(clean_title)
            .filter(|t| !t.is_empty())
            .unwrap_or_else(|| title_from_messages(&out));
        let key = ["id", "uuid", "conversation_id"]
            .iter()
            .find_map(|k| s(item, k))
            .map(String::from)
            .unwrap_or_else(|| format!("{title}{}", out.len()));
        p.conversations.push(Conversation {
            id: conversation_id("other", &key),
            title,
            source: "other".into(),
            created: out.first().and_then(|m| m.at),
            updated: out.last().and_then(|m| m.at),
            messages: out,
        });
    }
    p.warnings.push("This file's format isn't one we know exactly, so it was read on a best-effort basis. Check the preview before importing.".into());
    if skipped > 0 {
        p.warnings.push(format!(
            "{skipped} message(s) with an unknown sender were skipped."
        ));
    }
    limit_note(&mut p);
    p
}

// ----------------------------------------------------------------- Markdown

fn heading_role(line: &str) -> Option<&'static str> {
    let t = line
        .trim()
        .trim_start_matches('#')
        .trim()
        .trim_matches('*')
        .trim()
        .trim_end_matches(':')
        .trim()
        .to_lowercase();
    let is_heading = line.trim_start().starts_with('#')
        || (line.trim().starts_with("**") && line.trim().ends_with(":**"))
        || (line.trim().starts_with("**") && line.trim().ends_with("**"));
    if !is_heading {
        return None;
    }
    match t.as_str() {
        "you" | "user" | "human" | "me" => Some("user"),
        "assistant" | "claude" | "chatgpt" | "grok" | "ai" | "gemini" | "model" => {
            Some("assistant")
        }
        _ => None,
    }
}

/// Plain text or Markdown. Headings such as `## You` / `## Assistant` split turns (this is the format
/// the app exports); text with no such headings becomes a single message you can continue from.
pub fn parse_markdown(text: &str, file_name: &str) -> Parsed {
    let mut p = Parsed::default();
    let mut out: Vec<Message> = Vec::new();
    let mut role: Option<&str> = None;
    let mut buf = String::new();
    let mut title: Option<String> = None;
    let mut saw_headings = false;
    let flush = |out: &mut Vec<Message>, role: Option<&str>, buf: &mut String| {
        if let Some(r) = role {
            push_msg(out, r, buf, None);
        }
        buf.clear();
    };
    for (i, line) in text.lines().enumerate() {
        if i == 0 && line.starts_with("# ") && heading_role(line).is_none() {
            title = Some(clean_title(&line[2..]));
            continue;
        }
        if let Some(r) = heading_role(line) {
            flush(&mut out, role, &mut buf);
            role = Some(r);
            saw_headings = true;
        } else {
            buf.push_str(line);
            buf.push('\n');
        }
    }
    flush(&mut out, role, &mut buf);
    if !saw_headings {
        out.clear();
        push_msg(&mut out, "user", text, None);
        p.warnings.push("No speaker headings (like \"## You\") were found, so the whole file was imported as a single message to continue from.".into());
    }
    if out.is_empty() {
        return p;
    }
    let stem = file_name.rsplit(['/', '\\']).next().unwrap_or(file_name);
    let stem = stem.rsplit_once('.').map_or(stem, |(a, _)| a);
    let title = title
        .filter(|t| !t.is_empty())
        .or_else(|| Some(clean_title(stem)).filter(|t| !t.is_empty()))
        .unwrap_or_else(|| title_from_messages(&out));
    let key = format!(
        "{title}{}{}",
        out.len(),
        out.iter().map(|m| m.text.len()).sum::<usize>()
    );
    p.conversations.push(Conversation {
        id: conversation_id("markdown", &key),
        title,
        source: "markdown".into(),
        created: None,
        updated: None,
        messages: out,
    });
    p
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn claude_fixture() -> Value {
        json!([
          {"uuid":"c1","name":"Fix login bug","created_at":"2024-05-01T10:00:00.000000Z","updated_at":"2024-05-01T10:05:00Z",
           "chat_messages":[
             {"uuid":"m1","sender":"human","text":"How do I fix the login redirect?","created_at":"2024-05-01T10:00:00Z","attachments":[{"file_name":"spec.pdf","extracted_content":"HUGE"}],"files":[]},
             {"uuid":"m2","sender":"assistant","text":"","content":[{"type":"text","text":"Use a relative URL."},{"type":"tool_use","name":"x"}],"created_at":"2024-05-01T10:00:30Z"},
             {"uuid":"m3","sender":"system","text":"ignored"}
           ]},
          {"uuid":"c2","name":"","chat_messages":[{"sender":"human","text":"Untitled question here"}]},
          {"uuid":"c3","name":"Empty","chat_messages":[]}
        ])
    }

    #[test]
    fn claude_ai_conversations_roles_titles_and_attachments() {
        let p = parse_claude_ai(&claude_fixture());
        assert_eq!(p.conversations.len(), 2, "empty conversation skipped");
        let c = &p.conversations[0];
        assert_eq!(c.title, "Fix login bug");
        assert_eq!(c.source, "claude.ai");
        assert_eq!(c.messages.len(), 2);
        assert_eq!(c.messages[0].role, "user");
        assert!(c.messages[0].text.contains("[Attached: spec.pdf]"));
        assert!(
            !c.messages[0].text.contains("HUGE"),
            "attachment contents are not imported"
        );
        assert_eq!(c.messages[1].text, "Use a relative URL.");
        assert_eq!(c.created, Some(1_714_557_600));
        assert_eq!(p.conversations[1].title, "Untitled question here");
        assert!(p.warnings.iter().any(|w| w.contains("other senders")));
        assert!(p.warnings.iter().any(|w| w.contains("Attached files")));
    }

    #[test]
    fn claude_ai_projects_become_name_plus_instructions() {
        let v = json!([{"uuid":"p1","name":"Marketing","description":"desc","prompt_template":"Write plainly."},{"uuid":"p2","name":"Only desc","description":"Fallback","prompt_template":""}]);
        let (f, p) = parse_json(&v);
        assert_eq!(f, Format::ClaudeAi);
        assert_eq!(
            p.projects[0],
            ImportedProject {
                name: "Marketing".into(),
                instructions: "Write plainly.".into()
            }
        );
        assert_eq!(p.projects[1].instructions, "Fallback");
        assert!(p.warnings.iter().any(|w| w.contains("Project documents")));
    }

    fn chatgpt_fixture() -> Value {
        json!([{
        "title":"Plan a trip","create_time":1700000000.5,"update_time":1700000100.0,"conversation_id":"g1","current_node":"a2b",
        "mapping":{
          "root":{"id":"root","message":null,"parent":null,"children":["sys"]},
          "sys":{"id":"sys","parent":"root","children":["u1"],"message":{"author":{"role":"system"},"content":{"content_type":"text","parts":["hidden"]},"metadata":{"is_visually_hidden_from_conversation":true}}},
          "u1":{"id":"u1","parent":"sys","children":["a1","a2"],"message":{"author":{"role":"user"},"create_time":1700000001.0,"content":{"content_type":"text","parts":["Where should I go?"]}}},
          "a1":{"id":"a1","parent":"u1","children":[],"message":{"author":{"role":"assistant"},"content":{"content_type":"text","parts":["OLD regenerated answer"]}}},
          "a2":{"id":"a2","parent":"u1","children":["u2"],"message":{"author":{"role":"assistant"},"create_time":1700000002.0,"content":{"content_type":"text","parts":["Try Lisbon."]}}},
          "u2":{"id":"u2","parent":"a2","children":["tool"],"message":{"author":{"role":"user"},"content":{"content_type":"multimodal_text","parts":["Look at this",{"content_type":"image_asset_pointer"}]}}},
          "tool":{"id":"tool","parent":"u2","children":["a2b"],"message":{"author":{"role":"tool"},"content":{"content_type":"text","parts":["tool noise"]}}},
          "a2b":{"id":"a2b","parent":"tool","children":[],"message":{"author":{"role":"assistant"},"content":{"content_type":"code","language":"python","text":"print(1)"}}}
        }}])
    }

    #[test]
    fn chatgpt_follows_the_latest_branch_and_skips_hidden_and_tool_messages() {
        let p = parse_chatgpt(&chatgpt_fixture());
        assert_eq!(p.conversations.len(), 1);
        let c = &p.conversations[0];
        assert_eq!(c.title, "Plan a trip");
        let roles: Vec<&str> = c.messages.iter().map(|m| m.role.as_str()).collect();
        assert_eq!(roles, vec!["user", "assistant", "user", "assistant"]);
        assert!(
            !c.messages.iter().any(|m| m.text.contains("OLD regenerated")
                || m.text.contains("hidden")
                || m.text.contains("tool noise"))
        );
        assert_eq!(c.messages[2].text, "Look at this\n[image or file]");
        assert_eq!(c.messages[3].text, "```python\nprint(1)\n```");
        assert_eq!(c.created, Some(1_700_000_000));
        assert!(p.warnings.iter().any(|w| w.contains("latest branch")));
    }

    #[test]
    fn chatgpt_without_current_node_uses_the_newest_leaf_and_survives_cycles() {
        let mut v = chatgpt_fixture();
        v[0].as_object_mut().unwrap().remove("current_node");
        v[0]["mapping"]["a1"]["message"]["create_time"] = json!(1.0);
        v[0]["mapping"]["a2b"]["message"]["create_time"] = json!(99.0);
        assert_eq!(parse_chatgpt(&v).conversations[0].messages.len(), 4);
        // hostile: a node that is its own parent
        let cyc = json!([{"mapping":{"x":{"id":"x","parent":"x","children":[],"message":{"author":{"role":"user"},"content":{"content_type":"text","parts":["hi"]}}}}}]);
        assert_eq!(parse_chatgpt(&cyc).conversations[0].messages.len(), 1);
    }

    #[test]
    fn universal_format_roundtrips_fields() {
        let v = json!({"format":"universal-chat-export","version":1,"conversations":[{"id":"u","title":"T","source":"claude.ai","created":5,"messages":[{"role":"user","text":"a"},{"role":"assistant","text":"b","at":7},{"role":"tool","text":"x"}]}]});
        let (f, p) = parse_json(&v);
        assert_eq!(f, Format::Universal);
        assert_eq!(p.conversations[0].messages.len(), 2);
        assert_eq!(p.conversations[0].created, Some(5));
        assert_eq!(p.conversations[0].source, "claude.ai");
    }

    #[test]
    fn generic_handles_unknown_shapes_and_says_so() {
        let v = json!({"conversations":[{"id":"g","title":"Grok chat","messages":[{"role":"human","message":"hi"},{"sender":"Grok","content":[{"text":"hello"}]},{"role":"mystery","text":"?"}]}]});
        let (f, p) = parse_json(&v);
        assert_eq!(f, Format::Generic);
        assert_eq!(
            p.conversations[0]
                .messages
                .iter()
                .map(|m| m.role.as_str())
                .collect::<Vec<_>>(),
            vec!["user", "assistant"]
        );
        assert!(p.warnings.iter().any(|w| w.contains("best-effort")));
        assert!(p.warnings.iter().any(|w| w.contains("unknown sender")));
    }

    #[test]
    fn markdown_with_headings_becomes_turns_and_the_title_comes_from_h1() {
        let md = "# My chat\n\n## You\n\nHello\n\n## Assistant\n\nHi there\n\n**You:**\nBye\n";
        let p = parse_markdown(md, "notes.md");
        let c = &p.conversations[0];
        assert_eq!(c.title, "My chat");
        assert_eq!(
            c.messages
                .iter()
                .map(|m| m.role.as_str())
                .collect::<Vec<_>>(),
            vec!["user", "assistant", "user"]
        );
        assert_eq!(c.messages[1].text, "Hi there");
    }

    #[test]
    fn markdown_without_headings_is_one_message_titled_by_file_name() {
        let p = parse_markdown("just some notes\nmore", "C:\\x\\project notes.txt");
        assert_eq!(p.conversations[0].title, "project notes");
        assert_eq!(p.conversations[0].messages.len(), 1);
        assert!(p.warnings.iter().any(|w| w.contains("single message")));
        assert!(parse_markdown("   \n", "e.md").conversations.is_empty());
    }

    #[test]
    fn detection_is_conservative_and_junk_never_panics() {
        assert_eq!(detect(&json!({"a":1})), Format::Unknown);
        assert_eq!(detect(&json!("text")), Format::Unknown);
        assert_eq!(detect(&json!([])), Format::Unknown);
        assert_eq!(detect(&json!([1, 2, 3])), Format::Unknown);
        assert_eq!(
            detect(&json!({"format":"better-claude-ui-backup"})),
            Format::Backup
        );
        for junk in [
            json!(null),
            json!([null, {"chat_messages": 5}]),
            json!([{"mapping": []}]),
            json!([{"messages": [1, "x", null]}]),
        ] {
            let _ = parse_json(&junk); // must not panic
        }
    }

    #[test]
    fn ids_make_reimports_idempotent() {
        let a = parse_claude_ai(&claude_fixture());
        let b = parse_claude_ai(&claude_fixture());
        assert_eq!(a.conversations[0].id, b.conversations[0].id);
        assert_ne!(a.conversations[0].id, a.conversations[1].id);
    }
}
