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
