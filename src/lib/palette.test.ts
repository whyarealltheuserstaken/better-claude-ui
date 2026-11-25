import { describe, expect, test } from "vitest";
import { filterPalette, type PaletteItem } from "./palette";

const mk = (label: string, group = "Go to", keywords = ""): PaletteItem => ({ id: label, label, group, keywords, run: () => {} });
const items = [mk("Home"), mk("New chat", "Start", "conversation"), mk("New coding session", "Start"), mk("Usage"), mk("Theme: Terminal Green", "Theme"), mk("Open settings", "App", "preferences")];

describe("filterPalette", () => {
  test("empty query returns the first items in order", () => {
    expect(filterPalette(items, "", 3).map((i) => i.label)).toEqual(["Home", "New chat", "New coding session"]);
  });
  test("prefix matches beat later matches", () => {
    expect(filterPalette(items, "new")[0].label).toBe("New chat");
    expect(filterPalette(items, "term")[0].label).toBe("Theme: Terminal Green");
  });
  test("every word must match; keywords and groups count", () => {
    expect(filterPalette(items, "new coding").map((i) => i.label)).toEqual(["New coding session"]);
    expect(filterPalette(items, "preferences").map((i) => i.label)).toEqual(["Open settings"]);
    expect(filterPalette(items, "theme green").map((i) => i.label)).toEqual(["Theme: Terminal Green"]);
    expect(filterPalette(items, "zzz")).toEqual([]);
  });
  test("is case-insensitive and respects the cap", () => {
    expect(filterPalette(items, "USAGE")[0].label).toBe("Usage");
    expect(filterPalette(items, "e", 2)).toHaveLength(2);
  });
});
