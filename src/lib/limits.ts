/** Plan-allowance freshness. Claude Code only reports the allowance alongside a reply, so the numbers
 *  are a snapshot: they can be behind usage that happened elsewhere (the Claude app, claude.ai, a terminal). */

export const LIMITS_NOTE = "Updates each time Claude replies here. Usage in other apps shows up after your next message, or press Refresh.";

/** "just now", "12 min ago", "3 h ago", "2 days ago". */
export function asOfLabel(capturedAtMs: number, nowMs: number): string {
  const mins = Math.max(0, Math.round((nowMs - capturedAtMs) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

/** Has this window rolled over since the snapshot? Then the saved percentage no longer applies. */
export function windowHasReset(resetsAtSec: number | null, nowMs: number): boolean {
  return resetsAtSec !== null && resetsAtSec * 1000 <= nowMs;
}

/** Older than this and the snapshot gets a visible "may be behind" hint. */
export const BEHIND_AFTER_MS = 10 * 60_000;

export function mayBeBehind(capturedAtMs: number, nowMs: number): boolean {
  return nowMs - capturedAtMs > BEHIND_AFTER_MS;
}

// ---- Automatic refresh (opt-in) -------------------------------------------------------------

export const MIN_REFRESH_MINUTES = 5;
export const MAX_REFRESH_MINUTES = 180;
export const DEFAULT_REFRESH_MINUTES = 15;
export const REFRESH_CHOICES = [5, 10, 15, 30, 60, 120];
/** After this many failed automatic attempts in a row, automatic refresh pauses until a manual one works. */
export const MAX_FAILURES = 3;

export function clampMinutes(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : DEFAULT_REFRESH_MINUTES;
  return Math.min(MAX_REFRESH_MINUTES, Math.max(MIN_REFRESH_MINUTES, v));
}

export interface AutoRefreshState {
  enabled: boolean;
  minutes: number;
  /** When the allowance was last reported (by a reply or a refresh); null if never. */
  capturedAtMs: number | null;
  nowMs: number;
  /** Only refresh while the app is visible; never in the background. */
  visible: boolean;
  /** A refresh is already running. */
  busy: boolean;
  /** Automatic attempts that failed in a row. */
  failures: number;
}

/** Should an automatic refresh run now? A reply in any chat updates the snapshot too, which postpones the
 *  next refresh, so a busy user rarely triggers one. */
export function shouldAutoRefresh(s: AutoRefreshState): boolean {
  if (!s.enabled || s.busy || !s.visible || s.failures >= MAX_FAILURES) return false;
  if (s.capturedAtMs === null || s.capturedAtMs > s.nowMs) return true;
  return s.nowMs - s.capturedAtMs >= clampMinutes(s.minutes) * 60_000;
}
