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
