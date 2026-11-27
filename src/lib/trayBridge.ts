/** What crosses between the main window and the tray panel, both directions checked on arrival. */
import { type TraySettings, sanitizeTray } from "./widget/config";
import type { WidgetData, WidgetStatus } from "./widget/readings";

/** Main window to panel. */
export interface TrayView {
  data: WidgetData;
  settings: TraySettings;
  /** The theme, as CSS variables. */
  vars: Record<string, string>;
  status: WidgetStatus;
}

/** Panel to main window. There is deliberately no way to answer a permission request. */
export type TrayAction = { type: "ready" } | { type: "settings"; value: TraySettings } | { type: "open" } | { type: "quit" };

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export function parseTrayAction(raw: unknown): TrayAction | null {
  if (!isObject(raw)) return null;
  if (raw.type === "ready" || raw.type === "open" || raw.type === "quit") return { type: raw.type };
  if (raw.type === "settings" && isObject(raw.value)) return { type: "settings", value: sanitizeTray(raw.value) };
  return null;
}

export function parseTrayView(raw: unknown): TrayView | null {
  if (!isObject(raw) || !isObject(raw.data) || !isObject(raw.settings) || !isObject(raw.vars)) return null;
  const vars = Object.entries(raw.vars).filter((e): e is [string, string] => (e[0].startsWith("--") || e[0] === "color-scheme") && typeof e[1] === "string");
  return {
    data: raw.data as unknown as WidgetData,
    settings: sanitizeTray(raw.settings),
    vars: Object.fromEntries(vars),
    status: raw.status === "working" || raw.status === "waiting" ? raw.status : "idle",
  };
}
