/** Number and time formatting for the usage dashboard. */

export function fmtUsd(n: number): string {
  if (!Number.isFinite(n)) return "$0.00";
  if (n !== 0 && Math.abs(n) < 0.01) return "<$0.01";
  return `$${n.toFixed(2)}`;
}

export function fmtTokens(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n < 1000) return String(Math.round(n));
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0)}M`;
  return `${(n / 1_000_000_000).toFixed(1)}B`;
}

/** "in 1h 30m", "in 3d 2h", "now". `nowMs` is injectable for tests. */
export function fmtReset(resetsAtSec: number | null, nowMs = Date.now()): string {
  if (resetsAtSec === null) return "unknown";
  const s = Math.round(resetsAtSec - nowMs / 1000);
  if (s <= 0) return "now";
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `in ${d}d ${h}h`;
  if (h > 0) return `in ${h}h ${m}m`;
  return `in ${Math.max(1, m)}m`;
}

export function windowLabel(name: string): string {
  switch (name) {
    case "five_hour":
      return "5-hour window";
    case "seven_day":
      return "Weekly window";
    case "seven_day_opus":
      return "Weekly (Opus)";
    case "seven_day_sonnet":
      return "Weekly (Sonnet)";
    default:
      return name.replace(/_/g, " ");
  }
}

/** "claude-opus-5-5" -> "Opus 5.5"; unknown names pass through. */
export function modelLabel(id: string): string {
  const m = /^claude-([a-z]+)-(\d+)(?:-(\d+))?/.exec(id);
  if (!m) return id;
  const name = m[1][0].toUpperCase() + m[1].slice(1);
  return m[3] ? `${name} ${m[2]}.${m[3]}` : `${name} ${m[2]}`;
}

export function pct(fraction: number): string {
  return `${Math.round(Math.min(Math.max(fraction, 0), 9.99) * 100)}%`;
}

/** Budget state for a spend meter. */
export function budgetState(spent: number, budget: number | null): { fraction: number; level: "none" | "ok" | "warn" | "over" } {
  if (!budget || budget <= 0) return { fraction: 0, level: "none" };
  const fraction = spent / budget;
  return { fraction, level: fraction >= 1 ? "over" : fraction >= 0.8 ? "warn" : "ok" };
}

export function toCsv(rows: (string | number)[][]): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(esc).join(",")).join("\n");
}
