/** Ctrl/Cmd+K command palette: a flat list of actions with fuzzy-ish filtering. */

export interface PaletteItem {
  id: string;
  label: string;
  /** Group shown on the right, e.g. "Go to", "Theme". */
  group: string;
  /** Extra words that should match but are not shown. */
  keywords?: string;
  run: () => void;
}

const norm = (s: string) => s.toLowerCase();

/** Score: lower is better; null means no match. All query words must match somewhere. */
function score(item: PaletteItem, words: string[]): number | null {
  const label = norm(item.label);
  const hay = `${label} ${norm(item.group)} ${norm(item.keywords ?? "")}`;
  let total = 0;
  for (const w of words) {
    const inLabel = label.indexOf(w);
    if (inLabel >= 0) {
      total += inLabel === 0 ? 0 : label[inLabel - 1] === " " ? 1 : 3;
    } else if (hay.includes(w)) {
      total += 6;
    } else {
      return null;
    }
  }
  return total;
}

export function filterPalette(items: PaletteItem[], query: string, max = 12): PaletteItem[] {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return items.slice(0, max);
  return items
    .map((it, i) => ({ it, s: score(it, words), i }))
    .filter((x): x is { it: PaletteItem; s: number; i: number } => x.s !== null)
    .sort((a, b) => a.s - b.s || a.i - b.i)
    .slice(0, max)
    .map((x) => x.it);
}
