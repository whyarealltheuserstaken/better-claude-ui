import { describe, expect, test } from "vitest";
import { READING_IDS, allowedDisplays, clampPoint, effectivePosition, moveItem, sanitizeTray, sanitizeWidget, toolbarItems } from "./config";

const on = (s: { items: { id: string; on: boolean }[] }) => s.items.filter((i) => i.on).map((i) => i.id);

describe("widget settings", () => {
  test("defaults", () => {
    const w = sanitizeWidget(null);
    expect(on(w)).toEqual(["reply", "session_cost", "five_hour", "weekly", "today"]);
    expect([w.size, w.position]).toEqual(["regular", "panel"]);
  });

  test("tray defaults: off, and it does not keep the app running", () => {
    const t = sanitizeTray(undefined);
    expect(on(t)).toEqual(["five_hour", "weekly", "today", "month"]);
    expect([t.enabled, t.keep_running, t.size]).toEqual([false, false, "regular"]);
  });

  test.each([null, undefined, "garbage", 7, [], {}, { items: "no" }, { items: [{ id: "bogus", on: true }] }, { items: [null, 3] }])("unusable input %j gives the defaults", (raw) => {
    expect(sanitizeWidget(raw)).toEqual(sanitizeWidget(null));
    expect(sanitizeTray(raw)).toEqual(sanitizeTray(null));
  });

  test("every known reading is listed exactly once; unknown ids and repeats are dropped", () => {
    const w = sanitizeWidget({ items: [{ id: "weekly", on: true, as: "ring" }, { id: "bogus", on: true }, { id: "weekly", on: false }] });
    expect(w.items.map((i) => i.id).sort()).toEqual([...READING_IDS].sort());
    expect(w.items[0]).toEqual({ id: "weekly", on: true, as: "ring" });
    expect(on(w)).toEqual(["weekly"]);
  });

  test("turning every reading off is kept: it was a choice", () => {
    expect(on(sanitizeWidget({ items: [{ id: "reply", on: false }] }))).toEqual([]);
  });

  test("a display a reading cannot use falls back", () => {
    const w = sanitizeWidget({ items: [{ id: "reply", on: true, as: "ring" }, { id: "five_hour", on: true, as: "chart" }, { id: "daily", on: true, as: "number" }] });
    expect(w.items.slice(0, 3).map((i) => i.as)).toEqual(["number", "bar", "chart"]);
    expect(allowedDisplays("today")).toEqual(["bar", "ring", "number"]);
    expect(allowedDisplays("session_cost")).toEqual(["number"]);
  });

  test("bad size, position and coordinates fall back", () => {
    const d = sanitizeWidget(null);
    const w = sanitizeWidget({ size: "huge", position: "ceiling", x: "left", y: NaN });
    expect([w.size, w.position, w.x, w.y]).toEqual([d.size, d.position, d.x, d.y]);
    expect(sanitizeWidget({ size: "compact", position: "floating", x: 40, y: 90 })).toMatchObject({ size: "compact", position: "floating", x: 40, y: 90 });
  });

  test("a new floating widget starts at the top right, clear of the sidebar and toolbar", () => {
    const d = sanitizeWidget(null);
    expect(clampPoint(d.x, d.y, 250, 300, 1100, 760)).toEqual({ x: 850, y: 72 });
    expect(clampPoint(d.x, d.y, 250, 300, 3840, 2100)).toEqual({ x: 3590, y: 72 });
  });

  test("keep running needs the tray to be on, and only a real true counts", () => {
    expect(sanitizeTray({ enabled: false, keep_running: true }).keep_running).toBe(false);
    expect(sanitizeTray({ enabled: "yes", keep_running: true })).toMatchObject({ enabled: false, keep_running: false });
    expect(sanitizeTray({ enabled: true, keep_running: 1 }).keep_running).toBe(false);
    expect(sanitizeTray({ enabled: true, keep_running: true }).keep_running).toBe(true);
  });

  test("moving a reading up or down, without falling off either end", () => {
    const items = sanitizeWidget(null).items;
    expect(moveItem(items, 1, -1).slice(0, 2).map((i) => i.id)).toEqual(["session_cost", "reply"]);
    expect(moveItem(items, 0, -1)).toEqual(items);
    expect(moveItem(items, items.length - 1, 1)).toEqual(items);
    expect(items[0].id).toBe("reply");
  });

  test("the toolbar shows the first three chosen readings, never the chart", () => {
    const w = sanitizeWidget({ items: [{ id: "daily", on: true }, { id: "weekly", on: false }, { id: "today", on: true }, { id: "reply", on: true }, { id: "month", on: true }, { id: "five_hour", on: true }] });
    expect(toolbarItems(w).map((i) => i.id)).toEqual(["today", "reply", "month"]);
  });

  test("a widget in the right panel moves to the toolbar when the panel is not there", () => {
    expect(effectivePosition("panel", false)).toBe("toolbar");
    expect(effectivePosition("panel", true)).toBe("panel");
    for (const p of ["floating", "toolbar", "hidden"] as const) expect(effectivePosition(p, false)).toBe(p);
  });

  test("a floating widget is kept inside the window", () => {
    expect(clampPoint(-5, 900, 200, 100, 800, 600)).toEqual({ x: 0, y: 500 });
    expect(clampPoint(50, 60, 200, 100, 800, 600)).toEqual({ x: 50, y: 60 });
    expect(clampPoint(50, 60, 900, 700, 800, 600)).toEqual({ x: 0, y: 0 });
    expect(clampPoint(NaN, 60, 200, 100, 800, 600)).toEqual({ x: 0, y: 60 });
  });
});
