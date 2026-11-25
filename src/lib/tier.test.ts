import { describe, expect, test } from "vitest";
import { capsFor, normalizeTier, splitArgs } from "./tier";

describe("tiers", () => {
  test("beginner never offers bypass or pickers", () => {
    const c = capsFor("beginner");
    expect(c.permissionModes).not.toContain("bypassPermissions");
    expect(c.modelPicker || c.modePicker || c.rawLog || c.extraArgs).toBe(false);
  });
  test("intermediate adds diffs and pickers but still no bypass", () => {
    const c = capsFor("intermediate");
    expect(c.diffs && c.modelPicker && c.modePicker).toBe(true);
    expect(c.permissionModes).not.toContain("bypassPermissions");
  });
  test("only advanced can reach bypass, raw log and extra args", () => {
    const c = capsFor("advanced");
    expect(c.permissionModes).toContain("bypassPermissions");
    expect(c.rawLog && c.extraArgs).toBe(true);
  });
  test("normalizeTier falls back to beginner", () => {
    expect(normalizeTier("nope")).toBe("beginner");
    expect(normalizeTier("advanced")).toBe("advanced");
  });
  test("splitArgs handles quotes", () => {
    expect(splitArgs(`--add-dir "C:\my dir" --verbose`)).toEqual(["--add-dir", "C:\my dir", "--verbose"]);
    expect(splitArgs("")).toEqual([]);
  });
});
