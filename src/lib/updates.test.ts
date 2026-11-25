import { describe, expect, test } from "vitest";
import {
  CHECK_INTERVAL_MS, type UpdateInfo, type UpdateProblem, type UpdateState,
  describeUpdateStatus, installBlockedReason, progressFraction, reduceUpdate, shouldAutoCheck, shouldShowChip,
} from "./updates";

const info = (v = "0.2.0"): UpdateInfo => ({ available: true, current_version: "0.1.0", version: v, notes: "Fixes", date: 1 });
const none: UpdateInfo = { available: false, current_version: "0.1.0", version: null, notes: null, date: null };
const problem = (kind: UpdateProblem["kind"] = "offline"): UpdateProblem => ({ kind, message: "msg", detail: "d" });
const run = (actions: Parameters<typeof reduceUpdate>[1][], s: UpdateState = { phase: "idle" }) => actions.reduce(reduceUpdate, s);

describe("shouldAutoCheck", () => {
  const now = 10 * CHECK_INTERVAL_MS;
  test("off means never", () => expect(shouldAutoCheck(false, null, now)).toBe(false));
  test("first run checks", () => expect(shouldAutoCheck(true, null, now)).toBe(true));
  test("at most once a day", () => {
    expect(shouldAutoCheck(true, now - 1000, now)).toBe(false);
    expect(shouldAutoCheck(true, now - CHECK_INTERVAL_MS + 1, now)).toBe(false);
    expect(shouldAutoCheck(true, now - CHECK_INTERVAL_MS, now)).toBe(true);
  });
  test("a last-check time in the future does not block checks", () => expect(shouldAutoCheck(true, now + 5 * CHECK_INTERVAL_MS, now)).toBe(true));
});

describe("update flow", () => {
  test("happy path: check, download, install", () => {
    let s = run([{ type: "check_start", manual: true }, { type: "check_ok", info: info(), now: 5 }]);
    expect(s.phase).toBe("available");
    s = run([{ type: "download_start" }, { type: "progress", downloaded: 50, total: 100 }], s);
    expect(s).toMatchObject({ phase: "downloading", downloaded: 50, total: 100 });
    s = run([{ type: "download_ok" }, { type: "install_start" }], s);
    expect(s.phase).toBe("installing");
  });

  test("no update means up to date", () => {
    expect(run([{ type: "check_start", manual: false }, { type: "check_ok", info: none, now: 7 }])).toEqual({ phase: "uptodate", checkedAt: 7 });
  });

  test("a failed check shows the problem and keeps nothing half-done", () => {
    const s = run([{ type: "check_start", manual: true }, { type: "check_fail", problem: problem() }]);
    expect(s).toMatchObject({ phase: "error", during: "check", info: null });
    expect(run([{ type: "dismiss" }], s)).toEqual({ phase: "idle" });
  });

  test("a failed download can be retried from the same update", () => {
    let s = run([{ type: "check_ok", info: info(), now: 1 }, { type: "download_start" }, { type: "download_fail", problem: problem("unverified") }]);
    expect(s).toMatchObject({ phase: "error", during: "download" });
    s = run([{ type: "download_start" }], s);
    expect(s).toMatchObject({ phase: "downloading", downloaded: 0 });
  });

  test("dismissing a download/install error returns to 'available' so the user can try again", () => {
    const s = run([{ type: "check_ok", info: info(), now: 1 }, { type: "download_start" }, { type: "download_fail", problem: problem() }, { type: "dismiss" }]);
    expect(s.phase).toBe("available");
  });

  test("an install failure keeps the downloaded update's details", () => {
    const s = run([{ type: "check_ok", info: info(), now: 1 }, { type: "download_start" }, { type: "download_ok" }, { type: "install_start" }, { type: "install_fail", problem: problem("install") }]);
    expect(s).toMatchObject({ phase: "error", during: "install", info: { version: "0.2.0" } });
  });

  test("a new check never interrupts a download or install", () => {
    const dl = run([{ type: "check_ok", info: info(), now: 1 }, { type: "download_start" }]);
    expect(run([{ type: "check_start", manual: true }, { type: "check_fail", problem: problem() }, { type: "check_ok", info: none, now: 2 }], dl).phase).toBe("downloading");
  });

  test("re-checking the same already-downloaded version stays ready", () => {
    const ready = run([{ type: "check_ok", info: info(), now: 1 }, { type: "download_start" }, { type: "download_ok" }]);
    expect(run([{ type: "check_ok", info: info(), now: 2 }], ready).phase).toBe("ready");
    expect(run([{ type: "check_ok", info: info("0.3.0"), now: 2 }], ready)).toMatchObject({ phase: "available", info: { version: "0.3.0" } });
  });

  test("actions in the wrong phase are ignored", () => {
    expect(run([{ type: "install_start" }, { type: "download_ok" }, { type: "progress", downloaded: 1, total: 2 }]).phase).toBe("idle");
  });
});

describe("helpers", () => {
  test("progressFraction", () => {
    expect(progressFraction(50, 100)).toBe(0.5);
    expect(progressFraction(500, 100)).toBe(1);
    expect(progressFraction(5, null)).toBeNull();
    expect(progressFraction(5, 0)).toBeNull();
  });

  test("chip shows for available (unless skipped), downloading, ready and installing", () => {
    const a: UpdateState = { phase: "available", info: info() };
    expect(shouldShowChip(a, null)).toBe(true);
    expect(shouldShowChip(a, "0.2.0")).toBe(false);
    expect(shouldShowChip(a, "0.1.5")).toBe(true);
    expect(shouldShowChip({ phase: "ready", info: info() }, "0.2.0")).toBe(true);
    expect(shouldShowChip({ phase: "idle" }, null)).toBe(false);
    expect(shouldShowChip({ phase: "uptodate", checkedAt: 1 }, null)).toBe(false);
  });

  test("installing is blocked while Claude is replying or a permission is pending", () => {
    expect(installBlockedReason(0, 0)).toBeNull();
    expect(installBlockedReason(1, 0)).toMatch(/still replying/);
    expect(installBlockedReason(0, 2)).toMatch(/permission prompt/);
  });

  test("status text is plain language", () => {
    expect(describeUpdateStatus({ phase: "uptodate", checkedAt: 0 }, 5 * 60000)).toBe("You're up to date. Checked 5 min ago.");
    expect(describeUpdateStatus({ phase: "available", info: info() }, 0)).toBe("Version 0.2.0 is available.");
    expect(describeUpdateStatus({ phase: "installing", info: info() }, 0)).toMatch(/close and reopen/);
  });
});
