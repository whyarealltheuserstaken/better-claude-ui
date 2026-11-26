//! The Archive: read-only conversations that came from an import or a restored backup. They are not
//! Claude Code sessions, so they cannot be resumed; they can be read, searched, and used as the
//! starting context of a new chat. Layout: `<config>/archive/index.json` + `<config>/archive/<id>.json`.

use super::model::Message;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ArchiveEntry {
    pub id: String,
    pub title: String,
    pub source: String,
    pub created: Option<i64>,
    pub updated: Option<i64>,
    pub messages: usize,
    /// Unix seconds when it was added to the archive.
    pub imported_at: i64,
}

/// The stored conversation: neutral messages, plus the original UI items when they exist (restored backups).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ArchiveDoc {
    pub messages: Vec<Message>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub items: Option<Vec<Value>>,
}

fn root(dir: &Path) -> PathBuf {
    dir.join("archive")
}

pub fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

pub fn list(dir: &Path) -> Vec<ArchiveEntry> {
    let mut v: Vec<ArchiveEntry> = std::fs::read_to_string(root(dir).join("index.json"))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    v.sort_by_key(|e| std::cmp::Reverse(e.updated.or(e.created).unwrap_or(e.imported_at)));
    v
}

fn write_index(dir: &Path, entries: &[ArchiveEntry]) -> std::io::Result<()> {
    let r = root(dir);
    std::fs::create_dir_all(&r)?;
    let tmp = r.join("index.json.tmp");
    std::fs::write(&tmp, serde_json::to_vec(entries)?)?;
    std::fs::rename(tmp, r.join("index.json"))
}

pub fn get(dir: &Path, id: &str) -> Option<ArchiveDoc> {
    if !valid_id(id) {
        return None;
    }
    serde_json::from_str(&std::fs::read_to_string(root(dir).join(format!("{id}.json"))).ok()?).ok()
}

/// Add entries, skipping ids already present. Returns (added, skipped).
pub fn add(dir: &Path, items: Vec<(ArchiveEntry, ArchiveDoc)>) -> std::io::Result<(usize, usize)> {
    let mut index = list(dir);
    let mut added = 0;
    let mut skipped = 0;
    std::fs::create_dir_all(root(dir))?;
    for (entry, doc) in items {
        if !valid_id(&entry.id) || index.iter().any(|e| e.id == entry.id) {
            skipped += 1;
            continue;
        }
        std::fs::write(
            root(dir).join(format!("{}.json", entry.id)),
            serde_json::to_vec(&doc)?,
        )?;
        index.push(entry);
        added += 1;
    }
    write_index(dir, &index)?;
    Ok((added, skipped))
}

pub fn delete(dir: &Path, id: &str) -> std::io::Result<()> {
    if !valid_id(id) {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "invalid id",
        ));
    }
    let mut index = list(dir);
    index.retain(|e| e.id != id);
    write_index(dir, &index)?;
    match std::fs::remove_file(root(dir).join(format!("{id}.json"))) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e),
        _ => Ok(()),
    }
}

pub fn clear(dir: &Path) -> std::io::Result<()> {
    match std::fs::remove_dir_all(root(dir)) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e),
        _ => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("bcu-archive-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        d
    }

    fn item(id: &str, updated: i64) -> (ArchiveEntry, ArchiveDoc) {
        (
            ArchiveEntry {
                id: id.into(),
                title: id.into(),
                source: "claude.ai".into(),
                created: None,
                updated: Some(updated),
                messages: 1,
                imported_at: 5,
            },
            ArchiveDoc {
                messages: vec![Message {
                    role: "user".into(),
                    text: format!("hello {id}"),
                    at: None,
                }],
                items: None,
            },
        )
    }

    #[test]
    fn add_list_get_delete_roundtrip_newest_first() {
        let d = tmp("rt");
        assert!(list(&d).is_empty());
        let (a, s) = add(
            &d,
            vec![item("imp-a", 10), item("imp-b", 30), item("imp-c", 20)],
        )
        .unwrap();
        assert_eq!((a, s), (3, 0));
        assert_eq!(
            list(&d).iter().map(|e| e.id.as_str()).collect::<Vec<_>>(),
            vec!["imp-b", "imp-c", "imp-a"]
        );
        assert_eq!(get(&d, "imp-b").unwrap().messages[0].text, "hello imp-b");
        delete(&d, "imp-b").unwrap();
        assert!(get(&d, "imp-b").is_none());
        assert_eq!(list(&d).len(), 2);
        delete(&d, "imp-b").unwrap(); // deleting twice is fine
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn re_adding_is_idempotent() {
        let d = tmp("dup");
        add(&d, vec![item("imp-a", 1)]).unwrap();
        let (a, s) = add(&d, vec![item("imp-a", 1), item("imp-z", 2)]).unwrap();
        assert_eq!((a, s), (1, 1));
        assert_eq!(list(&d).len(), 2);
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn hostile_ids_are_refused_everywhere() {
        let d = tmp("evil");
        for bad in ["../x", "a/b", "a\\b", "", "x.json", &"a".repeat(100)] {
            assert!(!valid_id(bad), "{bad}");
            assert!(get(&d, bad).is_none());
            assert!(delete(&d, bad).is_err());
        }
        let (a, s) = add(&d, vec![item("../../escape", 1)]).unwrap();
        assert_eq!((a, s), (0, 1));
        assert!(!d.join("escape.json").exists());
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn corrupt_index_or_doc_gives_empty_not_a_crash() {
        let d = tmp("corrupt");
        std::fs::create_dir_all(root(&d)).unwrap();
        std::fs::write(root(&d).join("index.json"), "{nope").unwrap();
        std::fs::write(root(&d).join("imp-x.json"), "[]").unwrap();
        assert!(list(&d).is_empty());
        assert!(get(&d, "imp-x").is_none());
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn clear_removes_everything() {
        let d = tmp("clear");
        add(&d, vec![item("imp-a", 1)]).unwrap();
        clear(&d).unwrap();
        assert!(list(&d).is_empty());
        clear(&d).unwrap();
        let _ = std::fs::remove_dir_all(&d);
    }
}
