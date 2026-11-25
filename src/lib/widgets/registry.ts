/** Home page widgets. Add a widget by adding an entry here and a branch in HomePage.svelte. */
export interface WidgetDef {
  id: string;
  title: string;
  description: string;
  /** Spans both grid columns. */
  wide: boolean;
}

export const WIDGETS: WidgetDef[] = [
  { id: "quick-start", title: "Start something", description: "New chat, new coding session, agent teams.", wide: true },
  { id: "limits", title: "Plan usage limits", description: "How much of your 5-hour and weekly allowance is used.", wide: false },
  { id: "spend-today", title: "Today", description: "Today's tokens and estimated cost, with an optional daily budget.", wide: false },
  { id: "spend-month", title: "This month", description: "This month's tokens and estimated cost, with an optional monthly budget.", wide: false },
  { id: "daily-chart", title: "Daily spend", description: "Estimated cost per day over the last 30 days.", wide: true },
  { id: "by-model", title: "By model", description: "Where your usage goes, model by model.", wide: false },
  { id: "by-project", title: "By project", description: "Your most expensive folders.", wide: false },
  { id: "recent", title: "Recent conversations", description: "Pick up where you left off.", wide: false },
  { id: "status", title: "Setup status", description: "Claude Code version, plan and where your data lives.", wide: false },
];

export const DEFAULT_WIDGETS = WIDGETS.map((w) => w.id);

/** Keep only known ids, without duplicates, preserving order. */
export function cleanWidgetList(ids: unknown): string[] {
  if (!Array.isArray(ids)) return DEFAULT_WIDGETS;
  const known = new Set(DEFAULT_WIDGETS);
  const out: string[] = [];
  for (const id of ids) if (typeof id === "string" && known.has(id) && !out.includes(id)) out.push(id);
  return out;
}

export function moveWidget(ids: string[], id: string, delta: -1 | 1): string[] {
  const i = ids.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= ids.length) return ids;
  const out = ids.slice();
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

export function toggleWidget(ids: string[], id: string): string[] {
  if (ids.includes(id)) return ids.filter((x) => x !== id);
  // Re-insert at its default position relative to the others.
  const order = DEFAULT_WIDGETS;
  const next = [...ids, id];
  return next.sort((a, b) => order.indexOf(a) - order.indexOf(b));
}
