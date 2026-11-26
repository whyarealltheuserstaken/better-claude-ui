//! The neutral conversation model shared by every importer and exporter, plus small helpers
//! (stable ids, timestamps, size limits). Imported files are untrusted: everything is clamped.

use serde::{Deserialize, Serialize};

pub const MAX_CONVERSATIONS: usize = 20_000;
pub const MAX_MESSAGES: usize = 20_000;
pub const MAX_MESSAGE_CHARS: usize = 200_000;
pub const MAX_TITLE_CHARS: usize = 120;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Message {
    /// "user" or "assistant"
    pub role: String,
    pub text: String,
    /// Unix seconds, when known.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Conversation {
    pub id: String,
    pub title: String,
    /// Where it came from: "claude.ai", "chatgpt", "better-claude-ui", "generic", "markdown", ...
    pub source: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updated: Option<i64>,
    pub messages: Vec<Message>,
}

/// A project found in an import (name + standing instructions).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ImportedProject {
    pub name: String,
    pub instructions: String,
}

/// Truncate over-long text (with a visible marker) so one huge message cannot exhaust memory.
pub fn clamp_text(s: &str) -> String {
    if s.chars().count() <= MAX_MESSAGE_CHARS {
        return s.to_string();
    }
    let cut: String = s.chars().take(MAX_MESSAGE_CHARS).collect();
    format!("{cut}\n\n[… truncated: the original message was longer]")
}

pub fn clean_title(s: &str) -> String {
    let t = s.split_whitespace().collect::<Vec<_>>().join(" ");
    if t.chars().count() <= MAX_TITLE_CHARS {
        return t;
    }
    let cut: String = t.chars().take(MAX_TITLE_CHARS - 1).collect();
    format!("{cut}…")
}

/// A title for a conversation with none: the first user message, shortened.
pub fn title_from_messages(messages: &[Message]) -> String {
    messages
        .iter()
        .find(|m| m.role == "user" && !m.text.trim().is_empty())
        .map(|m| clean_title(&m.text))
        .filter(|t| !t.is_empty())
        .unwrap_or_else(|| "Untitled conversation".into())
}

/// Stable 64-bit FNV-1a hash: the same input always gives the same id, so re-importing a file
/// recognises conversations it has already added.
fn fnv1a(bytes: &[u8]) -> u64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in bytes {
        h ^= *b as u64;
        h = h.wrapping_mul(0x0100_0000_01b3);
    }
    h
}

/// Archive id for an imported conversation (letters, digits and `-` only, so it is safe as a file name).
pub fn conversation_id(source: &str, key: &str) -> String {
    format!("imp-{:016x}", fnv1a(format!("{source}\0{key}").as_bytes()))
}

fn days_from_civil(y: i64, m: u32, d: u32) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let mp = (m as i64 + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d as i64 - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

/// Parse an ISO-8601 / RFC-3339 timestamp (`2024-05-01T12:30:00.123Z`, `+02:00` offsets) to Unix seconds.
pub fn parse_iso8601(s: &str) -> Option<i64> {
    let s = s.trim();
    if s.len() < 19 || !s.is_char_boundary(19) {
        return None;
    }
    let num = |r: std::ops::Range<usize>| s.get(r)?.parse::<i64>().ok();
    let (y, mo, d) = (num(0..4)?, num(5..7)?, num(8..10)?);
    let (h, mi, sec) = (num(11..13)?, num(14..16)?, num(17..19)?);
    let sep_ok = s.as_bytes()[4] == b'-'
        && s.as_bytes()[7] == b'-'
        && matches!(s.as_bytes()[10], b'T' | b't' | b' ')
        && s.as_bytes()[13] == b':'
        && s.as_bytes()[16] == b':';
    if !sep_ok || !(1..=12).contains(&mo) || !(1..=31).contains(&d) || h > 23 || mi > 59 || sec > 60
    {
        return None;
    }
    let mut rest = &s[19..];
    if let Some(r) = rest.strip_prefix('.') {
        let n = r.bytes().take_while(u8::is_ascii_digit).count();
        rest = &r[n..];
    }
    let offset = match rest {
        "" | "Z" | "z" => 0,
        r if (r.starts_with('+') || r.starts_with('-')) && r.len() >= 3 => {
            let sign = if r.starts_with('-') { -1 } else { 1 };
            let digits: String = r[1..].chars().filter(char::is_ascii_digit).collect();
            let (oh, om) = match digits.len() {
                2 => (digits[0..2].parse::<i64>().ok()?, 0),
                4 => (
                    digits[0..2].parse::<i64>().ok()?,
                    digits[2..4].parse::<i64>().ok()?,
                ),
                _ => return None,
            };
            sign * (oh * 3600 + om * 60)
        }
        _ => return None,
    };
    Some(days_from_civil(y, mo as u32, d as u32) * 86_400 + h * 3600 + mi * 60 + sec - offset)
}

/// Civil date from days since 1970-01-01 (Howard Hinnant's algorithm).
fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (yoe + era * 400 + i64::from(m <= 2), m, d)
}

/// `YYYYMMDD-HHMMSS` in UTC, for folder names.
pub fn stamp_utc(secs: i64) -> String {
    let (y, m, d) = civil_from_days(secs.div_euclid(86_400));
    let t = secs.rem_euclid(86_400);
    format!(
        "{y:04}{m:02}{d:02}-{:02}{:02}{:02}",
        t / 3600,
        (t % 3600) / 60,
        t % 60
    )
}

/// `YYYY-MM-DD HH:MM UTC` for human-readable files.
pub fn pretty_utc(secs: i64) -> String {
    let (y, m, d) = civil_from_days(secs.div_euclid(86_400));
    let t = secs.rem_euclid(86_400);
    format!(
        "{y:04}-{m:02}-{d:02} {:02}:{:02} UTC",
        t / 3600,
        (t % 3600) / 60
    )
}

/// A file-name-safe version of a title (no path separators or reserved characters).
pub fn safe_filename(title: &str, max: usize) -> String {
    let mut s: String = title
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == ' ' || c == '-' || c == '_' {
                c
            } else {
                '-'
            }
        })
        .collect();
    s = s.split_whitespace().collect::<Vec<_>>().join(" ");
    let s = s
        .trim_matches(|c| c == '-' || c == ' ' || c == '.')
        .to_string();
    let s: String = s.chars().take(max).collect();
    if s.is_empty() {
        "conversation".into()
    } else {
        s
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn iso_timestamps_parse_with_fraction_and_offsets() {
        assert_eq!(parse_iso8601("1970-01-01T00:00:00Z"), Some(0));
        assert_eq!(parse_iso8601("2024-02-29T00:00:00Z"), Some(1_709_164_800));
        assert_eq!(
            parse_iso8601("2024-02-29T00:00:00.123456Z"),
            Some(1_709_164_800)
        );
        assert_eq!(
            parse_iso8601("2024-02-29T02:00:00+02:00"),
            Some(1_709_164_800)
        );
        assert_eq!(
            parse_iso8601("2024-02-28T19:00:00-0500"),
            Some(1_709_164_800)
        );
    }

    #[test]
    fn utc_formatting_matches_known_instants() {
        assert_eq!(stamp_utc(0), "19700101-000000");
        assert_eq!(stamp_utc(1_709_164_800), "20240229-000000");
        assert_eq!(stamp_utc(1_795_608_000), "20261125-120000");
        assert_eq!(
            pretty_utc(1_709_164_800 + 3600 * 13 + 60 * 5),
            "2024-02-29 13:05 UTC"
        );
        // round trip with the parser
        assert_eq!(parse_iso8601("2026-11-25T12:00:00Z"), Some(1_795_608_000));
    }

    #[test]
    fn bad_timestamps_are_none_not_panics() {
        for s in [
            "",
            "yesterday",
            "2024-13-01T00:00:00Z",
            "2024-02-30",
            "2024-02-29T25:00:00Z",
            "2024/02/29T00:00:00Z",
            "日本語日本語日本語日本語日本語日本語",
        ] {
            assert_eq!(parse_iso8601(s), None, "{s}");
        }
    }

    #[test]
    fn ids_are_stable_distinct_and_file_safe() {
        let a = conversation_id("claude.ai", "uuid-1");
        assert_eq!(a, conversation_id("claude.ai", "uuid-1"));
        assert_ne!(a, conversation_id("chatgpt", "uuid-1"));
        assert_ne!(a, conversation_id("claude.ai", "uuid-2"));
        assert!(a.starts_with("imp-") && a.chars().all(|c| c.is_ascii_alphanumeric() || c == '-'));
        assert_eq!(a.len(), 4 + 16);
    }

    #[test]
    fn titles_are_cleaned_and_derived() {
        assert_eq!(clean_title("  hello \n  world  "), "hello world");
        assert!(clean_title(&"x".repeat(500)).ends_with('…'));
        let msgs = vec![
            Message {
                role: "assistant".into(),
                text: "hi".into(),
                at: None,
            },
            Message {
                role: "user".into(),
                text: "  How do\nI fix this?  ".into(),
                at: None,
            },
        ];
        assert_eq!(title_from_messages(&msgs), "How do I fix this?");
        assert_eq!(title_from_messages(&[]), "Untitled conversation");
    }

    #[test]
    fn huge_text_is_clamped_with_a_marker() {
        let t = clamp_text(&"a".repeat(MAX_MESSAGE_CHARS + 10));
        assert!(t.contains("truncated"));
        assert_eq!(clamp_text("short"), "short");
    }

    #[test]
    fn filenames_cannot_escape_a_folder() {
        for bad in ["../../etc/passwd", "a/b\\c:d*e?f", "CON", "   ", "..."] {
            let f = safe_filename(bad, 40);
            assert!(
                !f.contains('/') && !f.contains('\\') && !f.contains(':') && !f.contains(".."),
                "{bad} -> {f}"
            );
            assert!(!f.is_empty());
        }
        assert_eq!(safe_filename("Fix the login bug", 40), "Fix the login bug");
        assert!(safe_filename(&"x".repeat(300), 40).chars().count() <= 40);
    }
}
