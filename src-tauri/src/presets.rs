//! Multi-agent presets: data files describing a team of subagents plus a coordinator prompt.
//! A preset turns into CLI flags (`--agents <json>` and `--append-system-prompt <text>`).
//! Built-ins are embedded; users can add their own `*.json` files in `<config>/presets/`.

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::BTreeMap;
use std::path::Path;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AgentDef {
    pub description: String,
    pub prompt: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Preset {
    pub id: String,
    pub title: String,
    pub description: String,
    #[serde(default)]
    pub cost_note: String,
    pub agents: BTreeMap<String, AgentDef>,
    pub system_prompt: String,
    /// True for user-supplied presets (set when loading, not read from files).
    #[serde(default, skip_deserializing)]
    pub custom: bool,
}

const BUILTIN: [&str; 3] = [
    include_str!("../presets/coordinator-workers.json"),
    include_str!("../presets/deep-research.json"),
    include_str!("../presets/code-review.json"),
];

pub fn builtin() -> Vec<Preset> {
    BUILTIN
        .iter()
        .map(|s| serde_json::from_str(s).expect("built-in preset is valid"))
        .collect()
}

/// Built-ins plus valid user presets (invalid files are skipped; a user preset with a
/// built-in's id replaces it).
pub fn load_all(user_dir: &Path) -> Vec<Preset> {
    let mut all = builtin();
    let Ok(rd) = std::fs::read_dir(user_dir) else {
        return all;
    };
    let mut files: Vec<_> = rd
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|x| x == "json"))
        .collect();
    files.sort();
    for f in files {
        let Some(mut p) = std::fs::read_to_string(&f)
            .ok()
            .and_then(|s| serde_json::from_str::<Preset>(&s).ok())
        else {
            continue;
        };
        if p.id.is_empty() || p.agents.is_empty() {
            continue;
        }
        p.custom = true;
        all.retain(|x| x.id != p.id);
        all.push(p);
    }
    all
}

/// The `--agents` JSON object for a preset.
pub fn agents_json(p: &Preset) -> Value {
    let mut m = serde_json::Map::new();
    for (name, a) in &p.agents {
        let mut o = json!({"description": a.description, "prompt": a.prompt});
        if let Some(t) = &a.tools {
            o["tools"] = json!(t);
        }
        if let Some(model) = &a.model {
            o["model"] = json!(model);
        }
        m.insert(name.clone(), o);
    }
    Value::Object(m)
}

/// CLI arguments that enable this preset for a session.
pub fn cli_args(p: &Preset) -> Vec<String> {
    vec![
        "--agents".into(),
        agents_json(p).to_string(),
        "--append-system-prompt".into(),
        p.system_prompt.clone(),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builtins_parse_and_have_unique_ids() {
        let all = builtin();
        assert_eq!(all.len(), 3);
        let ids: std::collections::HashSet<_> = all.iter().map(|p| p.id.clone()).collect();
        assert_eq!(ids.len(), 3);
        for p in &all {
            assert!(
                !p.agents.is_empty() && !p.system_prompt.is_empty(),
                "{}",
                p.id
            );
        }
    }

    #[test]
    fn deep_research_has_parallel_researchers_and_a_writer() {
        let p = builtin()
            .into_iter()
            .find(|p| p.id == "deep-research")
            .unwrap();
        assert!(p.agents.contains_key("researcher") && p.agents.contains_key("synthesizer"));
        assert!(p.system_prompt.contains("parallel"));
        assert!(
            p.agents["synthesizer"]
                .tools
                .as_ref()
                .unwrap()
                .contains(&"Write".to_string())
        );
    }

    #[test]
    fn reviewers_are_read_only() {
        for p in builtin() {
            if let Some(r) = p.agents.get("reviewer") {
                let t = r
                    .tools
                    .as_ref()
                    .expect("reviewer has an explicit tool list");
                assert!(
                    !t.iter()
                        .any(|x| matches!(x.as_str(), "Write" | "Edit" | "Bash"))
                );
            }
        }
    }

    #[test]
    fn cli_args_embed_valid_agents_json() {
        let p = builtin().remove(0);
        let a = cli_args(&p);
        assert_eq!(a[0], "--agents");
        let v: Value = serde_json::from_str(&a[1]).unwrap();
        assert!(v["researcher"]["description"].is_string());
        assert!(v["reviewer"]["tools"].is_array());
        assert!(v["coder"].get("tools").is_none());
        assert_eq!(a[2], "--append-system-prompt");
        assert_eq!(a[3], p.system_prompt);
    }

    #[test]
    fn user_presets_load_override_and_skip_bad_files() {
        let d = std::env::temp_dir().join(format!("bcu-presets-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        std::fs::write(d.join("bad.json"), "{nope").unwrap();
        std::fs::write(
            d.join("mine.json"),
            r#"{"id":"mine","title":"Mine","description":"d","agents":{"a":{"description":"x","prompt":"y"}},"system_prompt":"s"}"#,
        )
        .unwrap();
        std::fs::write(
            d.join("code.json"),
            r#"{"id":"code-review","title":"Mine2","description":"d","agents":{"a":{"description":"x","prompt":"y"}},"system_prompt":"s"}"#,
        )
        .unwrap();
        let all = load_all(&d);
        assert_eq!(all.len(), 4);
        assert!(all.iter().find(|p| p.id == "mine").unwrap().custom);
        assert_eq!(
            all.iter().find(|p| p.id == "code-review").unwrap().title,
            "Mine2"
        );
        let _ = std::fs::remove_dir_all(&d);
    }
}
