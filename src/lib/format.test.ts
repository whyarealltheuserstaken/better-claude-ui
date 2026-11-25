import { describe, expect, test } from "vitest";
import { budgetState, fmtReset, fmtTokens, fmtUsd, modelLabel, pct, toCsv, windowLabel } from "./format";

describe("format", () => {
  test("fmtUsd", () => {
    expect(fmtUsd(0)).toBe("$0.00");
    expect(fmtUsd(0.004)).toBe("<$0.01");
    expect(fmtUsd(2.4137)).toBe("$2.41");
    expect(fmtUsd(NaN)).toBe("$0.00");
  });
  test("fmtTokens", () => {
    expect(fmtTokens(0)).toBe("0");
    expect(fmtTokens(999)).toBe("999");
    expect(fmtTokens(1500)).toBe("1.5k");
    expect(fmtTokens(45_000)).toBe("45k");
    expect(fmtTokens(2_300_000)).toBe("2.3M");
    expect(fmtTokens(3_400_000_000)).toBe("3.4B");
  });
  test("fmtReset", () => {
    const now = 1_000_000_000_000;
    expect(fmtReset(null, now)).toBe("unknown");
    expect(fmtReset(now / 1000 - 5, now)).toBe("now");
    expect(fmtReset(now / 1000 + 5400, now)).toBe("in 1h 30m");
    expect(fmtReset(now / 1000 + 3 * 86400 + 7200, now)).toBe("in 3d 2h");
    expect(fmtReset(now / 1000 + 20, now)).toBe("in 1m");
  });
  test("labels", () => {
    expect(windowLabel("five_hour")).toBe("5-hour window");
    expect(windowLabel("weird_one")).toBe("weird one");
    expect(modelLabel("claude-opus-5-5")).toBe("Opus 5.5");
    expect(modelLabel("claude-haiku-5")).toBe("Haiku 5");
    expect(modelLabel("gpt-x")).toBe("gpt-x");
  });
  test("pct clamps", () => {
    expect(pct(0.304)).toBe("30%");
    expect(pct(-1)).toBe("0%");
    expect(pct(50)).toBe("999%");
  });
  test("budgetState", () => {
    expect(budgetState(5, null).level).toBe("none");
    expect(budgetState(5, 0).level).toBe("none");
    expect(budgetState(5, 10).level).toBe("ok");
    expect(budgetState(8, 10).level).toBe("warn");
    expect(budgetState(10, 10).level).toBe("over");
  });
  test("toCsv escapes", () => {
    expect(toCsv([["a", "b,c"], ['x"y', 1]])).toBe('a,"b,c"\n"x""y",1');
  });
});
