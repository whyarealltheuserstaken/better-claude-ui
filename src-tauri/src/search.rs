//! Full-text search over saved transcripts (`<config>/transcripts/*.json`).

use serde::Serialize;
use serde_json::Value;
use std::path::Path;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Hit {
    pub cli_session_id: String,
    /// A short excerpt around the first match.
    pub snippet: String,
}

pub const MAX_HITS: usize = 30;
const CONTEXT: usize = 60;

fn snippet(text: &str, needle_lc: &str) -> Option<String> {
    let lc = text.to_lowercase();
    // Byte offsets in the lowercased text can differ from the original for some scripts,
    // so work on char indices of the lowercased copy and slice that copy.
    let at = lc.find(needle_lc)?;
    let chars: Vec<char> = lc.chars().collect();
    let start_char = lc[..at].chars().count();
    let end_char = start_char + needle_lc.chars().count();
    let from = start_char.saturating_sub(CONTEXT);
    let to = (end_char + CONTEXT).min(chars.len());
    let mut s: String = chars[from..to].iter().collect();
    s = s.split_whitespace().collect::<Vec<_>>().join(" ");
    Some(format!(
        "{}{}{}",
        if from > 0 { "…" } else { "" },
        s,
        if to < chars.len() { "…" } else { "" }
    ))
}

/// Search user and assistant messages. Newest transcripts first; at most `MAX_HITS`.
pub fn search(dir: &Path, query: &str) -> Vec<Hit> {
    let q = query.trim().to_lowercase();
    if q.chars().count() < 2 {
        return vec![];
    }
    let Ok(rd) = std::fs::read_dir(dir.join("transcripts")) else {
        return vec![];
    };
    let mut files: Vec<_> = rd
        .flatten()
        .filter(|e| e.path().extension().is_some_and(|x| x == "json"))
        .map(|e| {
            let m = e.metadata().and_then(|m| m.modified()).ok();
            (m, e.path())
        })
        .collect();
    files.sort_by_key(|f| std::cmp::Reverse(f.0));
    let mut hits = vec![];
    for (_, path) in files {
        let Some(id) = path.file_stem().and_then(|s| s.to_str()).map(String::from) else {
            continue;
        };
        let Ok(raw) = std::fs::read_to_string(&path) else {
            continue;
        };
        let Ok(Value::Array(items)) = serde_json::from_str::<Value>(&raw) else {
            continue;
        };
        let found = items.iter().find_map(|it| {
            let kind = it.get("kind")?.as_str()?;
            if kind != "user" && kind != "assistant" {
                return None;
            }
            snippet(it.get("text")?.as_str()?, &q)
        });
        if let Some(snippet) = found {
            hits.push(Hit {
                cli_session_id: id,
                snippet,
            });
            if hits.len() >= MAX_HITS {
                break;
            }
        }
    }
    hits
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup(name: &str, files: &[(&str, &str)]) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("bcu-search-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(d.join("transcripts")).unwrap();
        for (id, body) in files {
            std::fs::write(d.join("transcripts").join(format!("{id}.json")), body).unwrap();
        }
        d
    }

    #[test]
    fn finds_text_in_user_and_assistant_messages_case_insensitively() {
        let d = setup(
            "basic",
            &[
                (
                    "a1",
                    r#"[{"kind":"user","id":"i1","text":"How do I fix the Login redirect?"}]"#,
                ),
                (
                    "b2",
                    r#"[{"kind":"assistant","id":"i1","text":"Use a relative URL.","streaming":false,"nested":false}]"#,
                ),
                ("c3", r#"[{"kind":"user","id":"i1","text":"unrelated"}]"#),
            ],
        );
        let hits = search(&d, "login REDIRECT");
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].cli_session_id, "a1");
        assert!(hits[0].snippet.contains("login redirect"));
        assert_eq!(search(&d, "relative url")[0].cli_session_id, "b2");
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn ignores_tool_output_short_queries_and_bad_files() {
        let d = setup(
            "ignore",
            &[
                (
                    "t1",
                    r#"[{"kind":"tool","id":"t","name":"Bash","input":{},"output":"secretword","status":"done","nested":false}]"#,
                ),
                ("bad", "{nope"),
            ],
        );
        assert!(search(&d, "secretword").is_empty());
        assert!(search(&d, "a").is_empty());
        assert!(search(&d, "  ").is_empty());
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn snippet_is_trimmed_around_the_match_with_ellipses() {
        let long = format!("{} NEEDLE {}", "x ".repeat(100), "y ".repeat(100));
        let s = snippet(&long, "needle").unwrap();
        assert!(s.starts_with('…') && s.ends_with('…'));
        assert!(s.contains("needle"));
        assert!(s.chars().count() < 200);
    }

    #[test]
    fn non_ascii_text_does_not_panic() {
        let s = snippet("İstanbul ünïcödé 日本語のテキスト needle ここ", "needle").unwrap();
        assert!(s.contains("needle"));
    }

    #[test]
    fn missing_directory_is_empty() {
        assert!(search(Path::new("/definitely/not/here"), "anything").is_empty());
    }
}
