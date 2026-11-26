/** Saved settings of the usage widget and the tray. Pure; anything unusable falls back to a default. */

export const READING_IDS = ["reply", "session_tokens", "session_cost", "five_hour", "weekly", "today", "month", "tokens_today", "daily"] as const;
export type ReadingId = (typeof READING_IDS)[number];
export type Display = "number" | "bar" | "ring" | "chart";
export type Size = "compact" | "regular" | "large";
export type Position = "panel" | "floating" | "toolbar" | "hidden";

export interface WidgetItem {
  id: ReadingId;
  on: boolean;
  as: Display;
}
export interface WidgetSettings {
  items: WidgetItem[];
  size: Size;
  position: Position;
  /** Where the floating widget sits, in window pixels. */
  x: number;
  y: number;
}
export interface TraySettings {
  enabled: boolean;
  keep_running: boolean;
  items: WidgetItem[];
  size: Size;
}

const SIZES: readonly Size[] = ["compact", "regular", "large"];
const POSITIONS: readonly Position[] = ["panel", "floating", "toolbar", "hidden"];
const METERED: Display[] = ["bar", "ring", "number"];

/** The first entry is the default. */
export function allowedDisplays(id: ReadingId): Display[] {
  if (id === "daily") return ["chart"];
  if (id === "five_hour" || id === "weekly" || id === "today" || id === "month") return METERED;
  return ["number"];
}

const WIDGET_DEFAULT: ReadingId[] = ["reply", "session_cost", "five_hour", "weekly", "today"];
const TRAY_DEFAULT: ReadingId[] = ["five_hour", "weekly", "today", "month"];

const record = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);
const finite = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

function cleanItems(raw: unknown, defaults: ReadingId[]): WidgetItem[] {
  const saved: WidgetItem[] = [];
  for (const entry of Array.isArray(raw) ? raw : []) {
    const r = record(entry);
    const id = READING_IDS.find((known) => known === r.id);
    if (!id || saved.some((i) => i.id === id)) continue;
    const allowed = allowedDisplays(id);
    saved.push({ id, on: r.on === true, as: oneOf(r.as, allowed, allowed[0]) });
  }
  // With nothing usable saved, start from the defaults so the widget is never blank by accident.
  const chosen = saved.length === 0 ? defaults : [];
  const rest = [...chosen, ...READING_IDS.filter((id) => !chosen.includes(id))].filter((id) => !saved.some((i) => i.id === id));
  return [...saved, ...rest.map((id) => ({ id, on: chosen.includes(id), as: allowedDisplays(id)[0] }))];
}

export function sanitizeWidget(raw: unknown): WidgetSettings {
  const r = record(raw);
  return {
    items: cleanItems(r.items, WIDGET_DEFAULT),
    size: oneOf(r.size, SIZES, "regular"),
    position: oneOf(r.position, POSITIONS, "panel"),
    x: finite(r.x, 24),
    y: finite(r.y, 80),
  };
}

export function sanitizeTray(raw: unknown): TraySettings {
  const r = record(raw);
  const enabled = r.enabled === true;
  return { enabled, keep_running: enabled && r.keep_running === true, items: cleanItems(r.items, TRAY_DEFAULT), size: oneOf(r.size, SIZES, "regular") };
}

export function moveItem(items: WidgetItem[], index: number, delta: -1 | 1): WidgetItem[] {
  const to = index + delta;
  if (index < 0 || index >= items.length || to < 0 || to >= items.length) return items;
  const next = items.slice();
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

export function toolbarItems(settings: WidgetSettings): WidgetItem[] {
  return settings.items.filter((i) => i.on && i.as !== "chart").slice(0, 3);
}

export function effectivePosition(position: Position, panelDocked: boolean): Position {
  return position === "panel" && !panelDocked ? "toolbar" : position;
}

export function clampPoint(x: number, y: number, boxW: number, boxH: number, winW: number, winH: number): { x: number; y: number } {
  const within = (v: number, max: number) => Math.min(Math.max(finite(v, 0), 0), Math.max(0, max));
  return { x: within(x, winW - boxW), y: within(y, winH - boxH) };
}
