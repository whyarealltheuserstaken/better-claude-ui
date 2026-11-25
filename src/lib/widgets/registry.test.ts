import { describe, expect, test } from "vitest";
import { DEFAULT_WIDGETS, cleanWidgetList, moveWidget, toggleWidget } from "./registry";

describe("widget list", () => {
  test("cleanWidgetList drops unknown and duplicate ids, falls back on junk", () => {
    expect(cleanWidgetList(["limits", "nope", "limits", "recent"])).toEqual(["limits", "recent"]);
    expect(cleanWidgetList("x")).toEqual(DEFAULT_WIDGETS);
    expect(cleanWidgetList([])).toEqual([]);
  });
  test("moveWidget swaps neighbours and ignores edges", () => {
    expect(moveWidget(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(moveWidget(["a", "b", "c"], "a", -1)).toEqual(["a", "b", "c"]);
    expect(moveWidget(["a", "b", "c"], "c", 1)).toEqual(["a", "b", "c"]);
    expect(moveWidget(["a", "b"], "zzz", 1)).toEqual(["a", "b"]);
  });
  test("toggleWidget removes, and re-adds in default order", () => {
    const without = toggleWidget(DEFAULT_WIDGETS, "limits");
    expect(without.includes("limits")).toBe(false);
    expect(toggleWidget(without, "limits")).toEqual(DEFAULT_WIDGETS);
  });
});
