/** Update flow: scheduling rules and a small state machine the UI renders from. Pure, so it is
 *  easy to test. The network, signature checks and installation all happen in Rust. */

export interface UpdateInfo {
  available: boolean;
  current_version: string;
  version: string | null;
  notes: string | null;
  /** Unix seconds. */
  date: number | null;
}

export type ProblemKind = "offline" | "no_release_info" | "unverified" | "build_config" | "install" | "other";

export interface UpdateProblem {
  kind: ProblemKind;
  message: string;
  detail: string;
}

export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Automatic checks: only when enabled, and at most once a day. */
export function shouldAutoCheck(enabled: boolean, lastCheckMs: number | null, nowMs: number): boolean {
  if (!enabled) return false;
  if (lastCheckMs === null) return true;
  // A last-check time in the future (clock change) must not suppress checks forever.
  if (lastCheckMs > nowMs) return true;
  return nowMs - lastCheckMs >= CHECK_INTERVAL_MS;
}

export type UpdateState =
  | { phase: "idle" }
  | { phase: "checking"; manual: boolean }
  | { phase: "uptodate"; checkedAt: number }
  | { phase: "available"; info: UpdateInfo }
  | { phase: "downloading"; info: UpdateInfo; downloaded: number; total: number | null }
  | { phase: "ready"; info: UpdateInfo }
  | { phase: "installing"; info: UpdateInfo }
  | { phase: "error"; problem: UpdateProblem; info: UpdateInfo | null; during: "check" | "download" | "install" };

export type UpdateAction =
  | { type: "check_start"; manual: boolean }
  | { type: "check_ok"; info: UpdateInfo; now: number }
  | { type: "check_fail"; problem: UpdateProblem }
  | { type: "download_start" }
  | { type: "progress"; downloaded: number; total: number | null }
  | { type: "download_ok" }
  | { type: "download_fail"; problem: UpdateProblem }
  | { type: "install_start" }
  | { type: "install_fail"; problem: UpdateProblem }
  | { type: "dismiss" };

const infoOf = (s: UpdateState): UpdateInfo | null => ("info" in s ? s.info : null);

export function reduceUpdate(s: UpdateState, a: UpdateAction): UpdateState {
  switch (a.type) {
    case "check_start":
      // Never interrupt a download or install with a new check.
      if (s.phase === "downloading" || s.phase === "installing") return s;
      return { phase: "checking", manual: a.manual };
    case "check_ok":
      if (s.phase === "downloading" || s.phase === "installing") return s;
      if (!a.info.available) return { phase: "uptodate", checkedAt: a.now };
      // Same version already downloaded: stay ready.
      if (s.phase === "ready" && s.info.version === a.info.version) return s;
      return { phase: "available", info: a.info };
    case "check_fail":
      if (s.phase === "downloading" || s.phase === "installing") return s;
      return { phase: "error", problem: a.problem, info: infoOf(s), during: "check" };
    case "download_start":
      return s.phase === "available" || (s.phase === "error" && s.info && s.during === "download")
        ? { phase: "downloading", info: s.info as UpdateInfo, downloaded: 0, total: null }
        : s;
    case "progress":
      return s.phase === "downloading" ? { ...s, downloaded: a.downloaded, total: a.total } : s;
    case "download_ok":
      return s.phase === "downloading" ? { phase: "ready", info: s.info } : s;
    case "download_fail":
      return s.phase === "downloading" ? { phase: "error", problem: a.problem, info: s.info, during: "download" } : s;
    case "install_start":
      return s.phase === "ready" ? { phase: "installing", info: s.info } : s;
    case "install_fail":
      return s.phase === "installing" ? { phase: "error", problem: a.problem, info: s.info, during: "install" } : s;
    case "dismiss":
      return s.phase === "error" ? (s.info && s.during !== "check" ? { phase: "available", info: s.info } : { phase: "idle" }) : s;
  }
}

/** 0..1, or null when the total size is unknown. */
export function progressFraction(downloaded: number, total: number | null): number | null {
  if (!total || total <= 0) return null;
  return Math.min(1, Math.max(0, downloaded / total));
}

/** Should the top-bar chip show for this state? Skipped versions stay quiet. */
export function shouldShowChip(s: UpdateState, skippedVersion: string | null): boolean {
  if (s.phase === "downloading" || s.phase === "ready" || s.phase === "installing") return true;
  if (s.phase === "available") return s.info.version !== skippedVersion;
  return false;
}

/** Installing closes the app, so it must wait until no conversation is mid-reply. */
export function installBlockedReason(runningSessions: number, pendingPermissions: number): string | null {
  if (runningSessions > 0) return "Claude is still replying in an open conversation. Wait for it to finish (or press Stop), then install.";
  if (pendingPermissions > 0) return "A permission prompt is waiting for your answer. Answer it, then install.";
  return null;
}

export function describeUpdateStatus(s: UpdateState, nowMs: number): string {
  switch (s.phase) {
    case "idle":
      return "";
    case "checking":
      return "Checking for updates…";
    case "uptodate": {
      const mins = Math.round((nowMs - s.checkedAt) / 60000);
      return mins < 1 ? "You're up to date." : `You're up to date. Checked ${mins} min ago.`;
    }
    case "available":
      return `Version ${s.info.version} is available.`;
    case "downloading":
      return `Downloading version ${s.info.version}…`;
    case "ready":
      return `Version ${s.info.version} is ready to install.`;
    case "installing":
      return "Installing. The app will close and reopen.";
    case "error":
      return s.problem.message;
  }
}
