/** What the window tells the system tray. Pure. */
import type { SessionState } from "../types";
import type { TraySettings } from "./config";
import { type WidgetData, readingFor } from "./readings";

export interface TrayPayload {
  waiting: boolean;
  running: number;
  pending: number;
  /** Shown beside the icon in the macOS menu bar. */
  title: string | null;
  /** One per chosen reading; Linux lists them in the tray's menu. */
  lines: string[];
}

export function trayPayload(settings: TraySettings, data: WidgetData, states: Record<string, SessionState>, now: number): TrayPayload {
  const readings = settings.items.filter((i) => i.on && i.as !== "chart").map((i) => readingFor(i.id, data, now));
  const all = Object.values(states);
  const pending = all.reduce((n, s) => n + s.pending.length, 0);
  return {
    waiting: pending > 0,
    running: all.filter((s) => s.status === "running").length,
    pending,
    // Only a short number fits beside an icon.
    title: readings.map((r) => r.value).find((v) => v.length <= 8 && /\d/.test(v)) ?? null,
    lines: readings.map((r) => `${r.label}: ${r.value}`),
  };
}
