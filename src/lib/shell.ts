/** Pure layout decisions for the app shell. */
import type { Mode, SessionState } from "./types";

/** Below this window width the right panel does not dock beside the conversation. */
export const PANEL_DOCK_MIN_WIDTH = 1060;

export type PanelState = "docked" | "overlay" | "closed";

export function panelState(width: number, hidden: boolean, view: string, overlayOpen: boolean): PanelState {
  if (view !== "session") return "closed";
  if (width >= PANEL_DOCK_MIN_WIDTH) return hidden ? "closed" : "docked";
  return overlayOpen ? "overlay" : "closed";
}

/** A request is waiting where neither its prompt nor the sidebar's badge is on screen. */
export function waitingOutOfSight(sidebarHidden: boolean, view: string, activeId: string | null, states: Record<string, SessionState>): boolean {
  return sidebarHidden && Object.entries(states).some(([id, s]) => s.pending.length > 0 && !(view === "session" && id === activeId));
}

/** Modes with at least one session waiting for permission. */
export function waitingModes(metas: { id: string; mode: Mode }[], states: Record<string, SessionState>): Set<Mode> {
  return new Set(metas.filter((m) => (states[m.id]?.pending.length ?? 0) > 0).map((m) => m.mode));
}
