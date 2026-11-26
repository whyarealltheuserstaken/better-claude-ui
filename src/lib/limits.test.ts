import { describe, expect, test } from "vitest";
import { BEHIND_AFTER_MS, asOfLabel, mayBeBehind, windowHasReset } from "./limits";

const MIN = 60_000;

describe("asOfLabel", () => {
  const now = 10_000_000_000;
  test("reads naturally from seconds to days", () => {
    expect(asOfLabel(now - 20_000, now)).toBe("just now");
    expect(asOfLabel(now - 47 * MIN, now)).toBe("47 min ago");
    expect(asOfLabel(now - 3 * 60 * MIN, now)).toBe("3 h ago");
    expect(asOfLabel(now - 30 * 60 * MIN, now)).toBe("yesterday");
    expect(asOfLabel(now - 72 * 60 * MIN, now)).toBe("3 days ago");
  });
  test("a time in the future (clock change) never goes negative", () => {
    expect(asOfLabel(now + 5 * MIN, now)).toBe("just now");
  });
});

describe("windowHasReset", () => {
  const now = 1_800_000_000_000;
  test("true once the reset time has passed; unknown reset means not reset", () => {
    expect(windowHasReset(now / 1000 - 1, now)).toBe(true);
    expect(windowHasReset(now / 1000, now)).toBe(true);
    expect(windowHasReset(now / 1000 + 60, now)).toBe(false);
    expect(windowHasReset(null, now)).toBe(false);
  });
});

describe("mayBeBehind", () => {
  test("flags snapshots older than ten minutes", () => {
    expect(mayBeBehind(1_000, 1_000 + BEHIND_AFTER_MS)).toBe(false);
    expect(mayBeBehind(1_000, 1_000 + BEHIND_AFTER_MS + 1)).toBe(true);
  });
});

import { MAX_FAILURES, REFRESH_CHOICES, clampMinutes, shouldAutoRefresh, type AutoRefreshState } from "./limits";

describe("clampMinutes", () => {
  test("keeps the interval between 5 and 180 minutes and falls back to 15 on junk", () => {
    expect(clampMinutes(1)).toBe(5);
    expect(clampMinutes(999)).toBe(180);
    expect(clampMinutes(30)).toBe(30);
    expect(clampMinutes(12.6)).toBe(13);
    for (const junk of ["x", null, undefined, NaN, Infinity]) expect(clampMinutes(junk)).toBe(15);
    expect(REFRESH_CHOICES.every((m) => clampMinutes(m) === m)).toBe(true);
  });
});

describe("shouldAutoRefresh", () => {
  const now = 100 * MIN;
  const base: AutoRefreshState = { enabled: true, minutes: 15, capturedAtMs: now - 20 * MIN, nowMs: now, visible: true, busy: false, failures: 0 };
  test("runs when enabled, visible, idle and the snapshot is older than the interval", () => {
    expect(shouldAutoRefresh(base)).toBe(true);
  });
  test("waits until the interval has passed, counted from the LAST update (a reply postpones it)", () => {
    expect(shouldAutoRefresh({ ...base, capturedAtMs: now - 14 * MIN })).toBe(false);
    expect(shouldAutoRefresh({ ...base, capturedAtMs: now - 15 * MIN })).toBe(true);
    expect(shouldAutoRefresh({ ...base, capturedAtMs: now - 1 * MIN })).toBe(false);
  });
  test("never when off, hidden, or already refreshing", () => {
    expect(shouldAutoRefresh({ ...base, enabled: false })).toBe(false);
    expect(shouldAutoRefresh({ ...base, visible: false })).toBe(false);
    expect(shouldAutoRefresh({ ...base, busy: true })).toBe(false);
  });
  test("pauses after repeated failures", () => {
    expect(shouldAutoRefresh({ ...base, failures: MAX_FAILURES - 1 })).toBe(true);
    expect(shouldAutoRefresh({ ...base, failures: MAX_FAILURES })).toBe(false);
  });
  test("no snapshot yet, or one dated in the future, still allows a first refresh", () => {
    expect(shouldAutoRefresh({ ...base, capturedAtMs: null })).toBe(true);
    expect(shouldAutoRefresh({ ...base, capturedAtMs: now + 5 * MIN })).toBe(true);
  });
  test("an out-of-range interval is clamped (a 1-minute setting behaves as 5)", () => {
    expect(shouldAutoRefresh({ ...base, minutes: 1, capturedAtMs: now - 3 * MIN })).toBe(false);
    expect(shouldAutoRefresh({ ...base, minutes: 1, capturedAtMs: now - 5 * MIN })).toBe(true);
  });
});
