//! Usage ledger: one JSONL record per (turn, model) with token and cost deltas, plus summaries
//! for the dashboard. Costs are the CLI's own `costUSD` estimates (API list-price equivalent).
//! For subscription plans they are NOT what you are billed; the UI says so.

use crate::cli::events::{ModelUsage, RateWindow};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Write;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Record {
    /// Unix milliseconds.
    pub ts: u64,
    pub session: String,
    pub project: Option<String>,
    /// "code" | "chat"
    pub mode: String,
    pub preset: Option<String>,
    pub model: String,
    pub input: u64,
    pub output: u64,
    pub cache_read: u64,
    pub cache_write: u64,
    pub cost_usd: f64,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct Totals {
    pub cost_usd: f64,
    pub input: u64,
    pub output: u64,
    pub cache_read: u64,
    pub cache_write: u64,
    pub turns: u64,
}

impl Totals {
    fn add(&mut self, r: &Record) {
        self.cost_usd += r.cost_usd;
        self.input += r.input;
        self.output += r.output;
        self.cache_read += r.cache_read;
        self.cache_write += r.cache_write;
        self.turns += 1;
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Named {
    pub name: String,
    pub totals: Totals,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Day {
    /// `YYYY-MM-DD` in the user's local time.
    pub date: String,
    pub cost_usd: f64,
    pub tokens: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Summary {
    pub today: Totals,
    /// The last 7 local days including today.
    pub week: Totals,
    /// The current local calendar month.
    pub month: Totals,
    pub all: Totals,
    pub by_model: Vec<Named>,
    pub by_project: Vec<Named>,
    pub daily: Vec<Day>,
    pub days: u32,
}

/// Turns the CLI's cumulative per-process model usage into per-turn deltas.
#[derive(Default)]
pub struct DeltaTracker {
    prev: HashMap<(String, String), ModelUsage>,
}

impl DeltaTracker {
    pub fn deltas(&mut self, session: &str, models: &[ModelUsage]) -> Vec<ModelUsage> {
        let mut out = vec![];
        for m in models {
            let key = (session.to_string(), m.model.clone());
            let p = self.prev.get(&key).cloned().unwrap_or_default();
            let d = ModelUsage {
                model: m.model.clone(),
                input: m.input.saturating_sub(p.input),
                output: m.output.saturating_sub(p.output),
                cache_read: m.cache_read.saturating_sub(p.cache_read),
                cache_write: m.cache_write.saturating_sub(p.cache_write),
                web_searches: m.web_searches.saturating_sub(p.web_searches),
                cost_usd: (m.cost_usd - p.cost_usd).max(0.0),
            };
            self.prev.insert(key, m.clone());
            if d.input + d.output + d.cache_read + d.cache_write > 0 || d.cost_usd > 0.0 {
                out.push(d);
            }
        }
        out
    }

    pub fn forget(&mut self, session: &str) {
        self.prev.retain(|(s, _), _| s != session);
    }
}

/// Last seen subscription usage windows, saved so the dashboard has something to show at launch.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LimitsSnapshot {
    /// Unix milliseconds when the CLI reported this.
    pub captured_at: u64,
    pub status: String,
    pub using_overage: bool,
    pub windows: Vec<RateWindow>,
}

/// Arguments for the smallest possible request that makes Claude Code report the plan allowance:
/// no tools, no MCP servers, no slash commands, nothing saved to disk, one turn, the cheapest model.
/// (Deliberately NOT `--bare`: that skips subscription sign-in.)
pub fn refresh_args() -> Vec<String> {
    [
        "-p",
        "--output-format",
        "stream-json",
        "--verbose",
        "--model",
        "haiku",
        "--tools",
        "",
        "--strict-mcp-config",
        "--disable-slash-commands",
        "--no-session-persistence",
        "--max-turns",
        "1",
        "Reply with the single word ok.",
    ]
    .map(String::from)
    .to_vec()
}

/// The allowance windows from the CLI's output lines (the last report wins), if it reported any.
pub fn snapshot_from_lines(lines: &[String], now_ms: u64) -> Option<LimitsSnapshot> {
    lines
        .iter()
        .filter_map(|l| crate::cli::events::parse_line(l).ok())
        .flatten()
        .filter_map(|e| match e {
            crate::cli::events::Event::RateLimit {
                status,
                windows,
                using_overage,
            } if !windows.is_empty() => Some(LimitsSnapshot {
                captured_at: now_ms,
                status,
                using_overage,
                windows,
            }),
            _ => None,
        })
        .next_back()
}

pub fn save_limits(dir: &Path, snap: &LimitsSnapshot) -> std::io::Result<()> {
    std::fs::create_dir_all(dir)?;
    std::fs::write(
        dir.join("limits.json"),
        serde_json::to_vec(snap).map_err(std::io::Error::other)?,
    )
}

pub fn load_limits(dir: &Path) -> Option<LimitsSnapshot> {
    serde_json::from_slice(&std::fs::read(dir.join("limits.json")).ok()?).ok()
}

fn ledger_path(dir: &Path) -> PathBuf {
    dir.join("usage.jsonl")
}

pub fn append(dir: &Path, records: &[Record]) -> std::io::Result<()> {
    if records.is_empty() {
        return Ok(());
    }
    std::fs::create_dir_all(dir)?;
    let mut f = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(ledger_path(dir))?;
    for r in records {
        writeln!(
            f,
            "{}",
            serde_json::to_string(r).map_err(std::io::Error::other)?
        )?;
    }
    Ok(())
}

/// Load every record; unreadable lines are skipped.
pub fn load(dir: &Path) -> Vec<Record> {
    std::fs::read_to_string(ledger_path(dir))
        .map(|s| {
            s.lines()
                .filter_map(|l| serde_json::from_str::<Record>(l).ok())
                .collect()
        })
        .unwrap_or_default()
}

pub fn clear(dir: &Path) -> std::io::Result<()> {
    match std::fs::remove_file(ledger_path(dir)) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e),
        _ => Ok(()),
    }
}

/// Days since 1970-01-01 for a timestamp, in the user's local time.
fn local_day(ts_ms: u64, offset_min: i32) -> i64 {
    let secs = (ts_ms / 1000) as i64 + offset_min as i64 * 60;
    secs.div_euclid(86_400)
}

/// Civil date from days since epoch (Howard Hinnant's algorithm).
fn ymd(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

fn fmt_day(days: i64) -> String {
    let (y, m, d) = ymd(days);
    format!("{y:04}-{m:02}-{d:02}")
}

fn rank(map: HashMap<String, Totals>, limit: usize) -> Vec<Named> {
    let mut v: Vec<Named> = map
        .into_iter()
        .map(|(name, totals)| Named { name, totals })
        .collect();
    v.sort_by(|a, b| {
        b.totals
            .cost_usd
            .partial_cmp(&a.totals.cost_usd)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| a.name.cmp(&b.name))
    });
    v.truncate(limit);
    v
}

pub fn summarize(records: &[Record], now_ms: u64, offset_min: i32, days: u32) -> Summary {
    let days = days.clamp(1, 365);
    let today = local_day(now_ms, offset_min);
    let (ty, tm, _) = ymd(today);
    let window_start = today - days as i64 + 1;
    let mut s = Summary {
        today: Totals::default(),
        week: Totals::default(),
        month: Totals::default(),
        all: Totals::default(),
        by_model: vec![],
        by_project: vec![],
        daily: vec![],
        days,
    };
    let mut daily: HashMap<i64, (f64, u64)> = HashMap::new();
    let mut models: HashMap<String, Totals> = HashMap::new();
    let mut projects: HashMap<String, Totals> = HashMap::new();
    for r in records {
        let d = local_day(r.ts, offset_min);
        s.all.add(r);
        if d == today {
            s.today.add(r);
        }
        if d > today - 7 && d <= today {
            s.week.add(r);
        }
        let (y, m, _) = ymd(d);
        if y == ty && m == tm && d <= today {
            s.month.add(r);
        }
        if d >= window_start && d <= today {
            let e = daily.entry(d).or_default();
            e.0 += r.cost_usd;
            e.1 += r.input + r.output + r.cache_read + r.cache_write;
            models.entry(r.model.clone()).or_default().add(r);
            let proj = r.project.clone().unwrap_or_else(|| {
                if r.mode == "chat" {
                    "Chat".into()
                } else {
                    "(no folder)".into()
                }
            });
            projects.entry(proj).or_default().add(r);
        }
    }
    s.by_model = rank(models, 12);
    s.by_project = rank(projects, 10);
    s.daily = (window_start..=today)
        .map(|d| {
            let (cost_usd, tokens) = daily.get(&d).copied().unwrap_or((0.0, 0));
            Day {
                date: fmt_day(d),
                cost_usd,
                tokens,
            }
        })
        .collect();
    s
}

#[cfg(test)]
mod tests {
    use super::*;

    const DAY: u64 = 86_400_000;
    // 2026-11-25 12:00:00 UTC
    const NOW: u64 = 1_795_608_000_000;

    fn mu(model: &str, input: u64, output: u64, cost: f64) -> ModelUsage {
        ModelUsage {
            model: model.into(),
            input,
            output,
            cost_usd: cost,
            ..Default::default()
        }
    }

    fn rec(ts: u64, model: &str, project: Option<&str>, cost: f64, out: u64) -> Record {
        Record {
            ts,
            session: "s".into(),
            project: project.map(String::from),
            mode: if project.is_some() { "code" } else { "chat" }.into(),
            preset: None,
            model: model.into(),
            input: 10,
            output: out,
            cache_read: 0,
            cache_write: 0,
            cost_usd: cost,
        }
    }

    #[test]
    fn deltas_turn_cumulative_into_per_turn() {
        let mut t = DeltaTracker::default();
        let d1 = t.deltas("a", &[mu("m", 2, 67, 0.0053)]);
        assert_eq!((d1[0].input, d1[0].output), (2, 67));
        let d2 = t.deltas("a", &[mu("m", 4, 71, 0.0063)]);
        assert_eq!((d2[0].input, d2[0].output), (2, 4));
        assert!((d2[0].cost_usd - 0.0010).abs() < 1e-9);
    }

    #[test]
    fn deltas_are_per_session_and_skip_empty_turns() {
        let mut t = DeltaTracker::default();
        t.deltas("a", &[mu("m", 5, 5, 0.1)]);
        let other = t.deltas("b", &[mu("m", 5, 5, 0.1)]);
        assert_eq!(other[0].input, 5);
        assert!(t.deltas("a", &[mu("m", 5, 5, 0.1)]).is_empty());
        t.forget("a");
        assert_eq!(t.deltas("a", &[mu("m", 5, 5, 0.1)])[0].input, 5);
    }

    #[test]
    fn deltas_never_go_negative() {
        let mut t = DeltaTracker::default();
        t.deltas("a", &[mu("m", 10, 10, 1.0)]);
        let d = t.deltas("a", &[mu("m", 3, 20, 0.5)]);
        assert_eq!(d[0].input, 0);
        assert_eq!(d[0].output, 10);
        assert_eq!(d[0].cost_usd, 0.0);
    }

    #[test]
    fn civil_dates_are_correct() {
        assert_eq!(fmt_day(0), "1970-01-01");
        assert_eq!(fmt_day(local_day(NOW, 0)), "2026-11-25");
        assert_eq!(fmt_day(local_day(1_709_164_800_000, 0)), "2024-02-29");
    }

    #[test]
    fn local_offset_moves_the_day_boundary() {
        // 2026-11-25 23:30 UTC is already the 26th at UTC+2 and still the 25th at UTC-5.
        let ts = NOW + 11 * 3_600_000 + 30 * 60_000;
        assert_eq!(fmt_day(local_day(ts, 120)), "2026-11-26");
        assert_eq!(fmt_day(local_day(ts, -300)), "2026-11-25");
    }

    #[test]
    fn summary_buckets_periods_models_projects_and_days() {
        let recs = vec![
            rec(NOW, "opus", Some("proj-a"), 1.0, 100),
            rec(NOW - DAY, "sonnet", Some("proj-a"), 0.5, 50),
            rec(NOW - 3 * DAY, "sonnet", None, 0.25, 25),
            rec(NOW - 10 * DAY, "opus", Some("proj-b"), 2.0, 10),
            rec(NOW - 40 * DAY, "opus", Some("proj-b"), 4.0, 10),
        ];
        let s = summarize(&recs, NOW, 0, 30);
        assert!((s.today.cost_usd - 1.0).abs() < 1e-9);
        assert!((s.week.cost_usd - 1.75).abs() < 1e-9);
        assert!((s.month.cost_usd - 3.75).abs() < 1e-9); // Nov 15,22,24,25 (not Oct 16)
        assert!((s.all.cost_usd - 7.75).abs() < 1e-9);
        assert_eq!(s.daily.len(), 30);
        assert_eq!(s.daily.last().unwrap().date, "2026-11-25");
        assert!((s.daily.last().unwrap().cost_usd - 1.0).abs() < 1e-9);
        // 40-day-old record is outside the 30-day window for model/project rollups
        assert_eq!(s.by_model[0].name, "opus");
        assert!((s.by_model[0].totals.cost_usd - 3.0).abs() < 1e-9);
        assert!(s.by_project.iter().any(|p| p.name == "Chat"));
        assert!(!s.by_project.iter().any(|p| p.totals.cost_usd > 3.0));
    }

    #[test]
    fn limits_snapshot_roundtrips() {
        let d = std::env::temp_dir().join(format!("bcu-limits-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        assert!(load_limits(&d).is_none());
        let snap = LimitsSnapshot {
            captured_at: 5,
            status: "allowed".into(),
            using_overage: false,
            windows: vec![RateWindow {
                name: "five_hour".into(),
                utilization: 0.3,
                resets_at: Some(9),
                status: "allowed".into(),
            }],
        };
        save_limits(&d, &snap).unwrap();
        assert_eq!(load_limits(&d), Some(snap));
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn refresh_request_is_minimal_and_never_uses_bare() {
        let a = refresh_args();
        let at = |f: &str| {
            a.iter()
                .position(|x| x == f)
                .unwrap_or_else(|| panic!("missing {f}"))
        };
        assert_eq!(a[at("--tools") + 1], "", "no tools");
        assert_eq!(a[at("--max-turns") + 1], "1");
        assert_eq!(a[at("--model") + 1], "haiku");
        for f in [
            "--strict-mcp-config",
            "--disable-slash-commands",
            "--no-session-persistence",
            "--verbose",
        ] {
            assert!(a.contains(&f.to_string()), "{f}");
        }
        assert!(
            !a.contains(&"--bare".to_string()),
            "--bare skips subscription sign-in"
        );
    }

    #[test]
    fn snapshot_comes_from_the_last_rate_limit_report_and_ignores_noise() {
        let report = |five: f64| {
            format!(
                r#"{{"type":"rate_limit_event","rate_limit_info":{{"status":"allowed","isUsingOverage":false,"unifiedWindows":{{"five_hour":{{"utilization":{five},"resetsAt":1795635600,"status":"allowed"}}}}}}}}"#
            )
        };
        let lines = vec![
            "not json".to_string(),
            report(0.27),
            r#"{"type":"assistant"}"#.to_string(),
            report(0.31),
        ];
        let snap = snapshot_from_lines(&lines, 123).unwrap();
        assert_eq!(snap.captured_at, 123);
        assert!(
            (snap.windows[0].utilization - 0.31).abs() < 1e-9,
            "the latest report wins"
        );
        assert!(
            snapshot_from_lines(
                &["garbage".to_string(), r#"{"type":"result"}"#.to_string()],
                1
            )
            .is_none()
        );
        assert!(snapshot_from_lines(&[], 1).is_none());
        // a report with no windows is not a usable snapshot
        assert!(snapshot_from_lines(&[r#"{"type":"rate_limit_event"}"#.to_string()], 1).is_none());
    }

    #[test]
    fn empty_ledger_gives_zeros_and_padded_days() {
        let s = summarize(&[], NOW, 0, 7);
        assert_eq!(s.all.turns, 0);
        assert_eq!(s.daily.len(), 7);
        assert!(s.daily.iter().all(|d| d.cost_usd == 0.0));
    }

    #[test]
    fn ledger_roundtrips_and_skips_corrupt_lines() {
        let d = std::env::temp_dir().join(format!("bcu-usage-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        append(&d, &[rec(NOW, "opus", Some("p"), 1.5, 9)]).unwrap();
        std::fs::OpenOptions::new()
            .append(true)
            .open(ledger_path(&d))
            .unwrap()
            .write_all(b"{garbage\n")
            .unwrap();
        append(&d, &[rec(NOW, "sonnet", None, 0.5, 1)]).unwrap();
        let got = load(&d);
        assert_eq!(got.len(), 2);
        assert_eq!(got[0].model, "opus");
        clear(&d).unwrap();
        assert!(load(&d).is_empty());
        clear(&d).unwrap();
        let _ = std::fs::remove_dir_all(&d);
    }
}
