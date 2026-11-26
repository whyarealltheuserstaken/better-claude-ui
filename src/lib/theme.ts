/** Themes (colours) and styles (typography, shape, layout). Both are plain data so users can edit,
 *  export and import them. `appearanceVars` turns a pair into CSS custom properties. */

import { contrast, ensureContrast, hueDistance, mix, rotateHue } from "./color";

export interface ThemeColors {
  bg: string;
  surface: string;
  raised: string;
  line: string;
  text: string;
  muted: string;
  accent: string;
  accentInk: string;
  gate: string;
  gateInk: string;
  ok: string;
  bad: string;
}

export interface Theme {
  id: string;
  name: string;
  scheme: "dark" | "light";
  colors: ThemeColors;
  custom?: boolean;
}

export type UserStyle = "bubble" | "bar" | "prompt";
export type ToolStyle = "rail" | "card" | "line";
export type FontKind = "system" | "mono" | "serif";

export interface StyleDef {
  id: string;
  name: string;
  font: FontKind;
  /** Optional CSS font-family overriding `font` (e.g. "Fira Code, monospace"). */
  fontFamily?: string;
  fontSize: number;
  radius: number;
  /** 0.8 (tight) .. 1.4 (airy) */
  density: number;
  /** Reading column width in px. */
  width: number;
  userStyle: UserStyle;
  toolStyle: ToolStyle;
  /** Shown before the composer input, e.g. "❯". Empty for none. */
  glyph: string;
  custom?: boolean;
}

export const COLOR_KEYS: { key: keyof ThemeColors; label: string }[] = [
  { key: "bg", label: "Background" },
  { key: "surface", label: "Panels" },
  { key: "raised", label: "Raised" },
  { key: "line", label: "Borders" },
  { key: "text", label: "Text" },
  { key: "muted", label: "Muted text" },
  { key: "accent", label: "Accent" },
  { key: "accentInk", label: "Text on accent" },
  { key: "gate", label: "Permission prompt" },
  { key: "gateInk", label: "Text on prompt" },
  { key: "ok", label: "Success" },
  { key: "bad", label: "Error" },
];

const c = (
  bg: string, surface: string, raised: string, line: string, text: string, muted: string,
  accent: string, accentInk: string, gate: string, gateInk: string, ok: string, bad: string,
): ThemeColors => ({ bg, surface, raised, line, text, muted, accent, accentInk, gate, gateInk, ok, bad });

export const BUILTIN_THEMES: Theme[] = [
  { id: "graphite", name: "Graphite", scheme: "dark", colors: c("#0f121a", "#161a24", "#202636", "#272e40", "#e8eaf0", "#8e97a8", "#8f9dff", "#0d1020", "#f2b84b", "#1d1503", "#6fcf97", "#ef7b7b") },
  { id: "paper", name: "Paper", scheme: "light", colors: c("#f1f3f8", "#fbfcfe", "#e6e9f1", "#d5d9e4", "#181d2c", "#5d6679", "#4555c8", "#ffffff", "#b97a08", "#ffffff", "#1f8a4c", "#c23d3d") },
  { id: "midnight", name: "Midnight", scheme: "dark", colors: c("#070a12", "#0c1220", "#142038", "#1c2b4a", "#dbe6ff", "#7f93bd", "#5cc8ff", "#001018", "#ffb454", "#1a1000", "#5be0a0", "#ff7a8a") },
  { id: "solar-dark", name: "Solarized Dark", scheme: "dark", colors: c("#002b36", "#073642", "#0b4352", "#17596a", "#b3bfbf", "#93a1a1", "#268bd2", "#fdf6e3", "#b58900", "#002b36", "#859900", "#dc322f") },
  { id: "solar-light", name: "Solarized Light", scheme: "light", colors: c("#fdf6e3", "#fffaf0", "#eee8d5", "#d9d2bd", "#4a5e65", "#56696f", "#268bd2", "#fdf6e3", "#b58900", "#fdf6e3", "#859900", "#dc322f") },
  { id: "terminal-green", name: "Terminal Green", scheme: "dark", colors: c("#050805", "#0a100a", "#101a10", "#1c3a1c", "#b8f5b8", "#5f8f5f", "#3dff6e", "#031003", "#ffb000", "#1a1000", "#3dff6e", "#ff5555") },
  { id: "terminal-amber", name: "Terminal Amber", scheme: "dark", colors: c("#0b0700", "#120c02", "#1b1204", "#3a2a08", "#ffcf6e", "#9a7a35", "#ffb000", "#1a1000", "#ff6b3d", "#1a0600", "#c8d94a", "#ff6b6b") },
  { id: "high-contrast", name: "High contrast", scheme: "dark", colors: c("#000000", "#0a0a0a", "#1a1a1a", "#ffffff", "#ffffff", "#c8c8c8", "#ffe066", "#000000", "#ff9f1a", "#000000", "#4dff88", "#ff6666") },
];

export const BUILTIN_STYLES: StyleDef[] = [
  { id: "modern", name: "Modern", font: "system", fontSize: 14.5, radius: 10, density: 1, width: 780, userStyle: "bubble", toolStyle: "rail", glyph: "" },
  { id: "terminal", name: "Terminal", font: "mono", fontSize: 13.5, radius: 0, density: 0.85, width: 1100, userStyle: "prompt", toolStyle: "line", glyph: "❯" },
  { id: "compact", name: "Compact", font: "system", fontSize: 13.5, radius: 6, density: 0.8, width: 900, userStyle: "bar", toolStyle: "line", glyph: "" },
  { id: "reading", name: "Reading", font: "serif", fontSize: 16, radius: 12, density: 1.25, width: 680, userStyle: "bar", toolStyle: "rail", glyph: "" },
];

const HEX = /^#[0-9a-fA-F]{6}$/;
const clamp = (n: unknown, lo: number, hi: number, d: number) =>
  typeof n === "number" && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
const oneOf = <T extends string>(v: unknown, opts: readonly T[], d: T): T => (opts.includes(v as T) ? (v as T) : d);
const safeId = (s: unknown, fallback: string) =>
  typeof s === "string" && /^[a-z0-9-_]{1,48}$/.test(s) ? s : fallback;

/** Coerce arbitrary JSON (saved or imported) into a valid theme, or null if unusable. */
export function sanitizeTheme(raw: unknown, fallbackId = "custom"): Theme | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const base = BUILTIN_THEMES[0].colors;
  const rc = (r.colors && typeof r.colors === "object" ? r.colors : {}) as Record<string, unknown>;
  const colors = { ...base };
  for (const { key } of COLOR_KEYS) {
    const v = rc[key];
    if (typeof v === "string" && HEX.test(v)) colors[key] = v.toLowerCase();
  }
  if (typeof r.name !== "string" || !r.name.trim()) return null;
  return {
    id: safeId(r.id, fallbackId),
    name: r.name.trim().slice(0, 40),
    scheme: r.scheme === "light" ? "light" : "dark",
    colors,
    custom: true,
  };
}

export function sanitizeStyle(raw: unknown, fallbackId = "custom"): StyleDef | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.name !== "string" || !r.name.trim()) return null;
  const d = BUILTIN_STYLES[0];
  const ff = typeof r.fontFamily === "string" ? r.fontFamily.replace(/[;{}<>]/g, "").trim().slice(0, 120) : "";
  return {
    id: safeId(r.id, fallbackId),
    name: r.name.trim().slice(0, 40),
    font: oneOf(r.font, ["system", "mono", "serif"], d.font),
    fontFamily: ff || undefined,
    fontSize: clamp(r.fontSize, 11, 22, d.fontSize),
    radius: clamp(r.radius, 0, 24, d.radius),
    density: clamp(r.density, 0.7, 1.5, d.density),
    width: clamp(r.width, 480, 1400, d.width),
    userStyle: oneOf(r.userStyle, ["bubble", "bar", "prompt"], d.userStyle),
    toolStyle: oneOf(r.toolStyle, ["rail", "card", "line"], d.toolStyle),
    glyph: typeof r.glyph === "string" ? r.glyph.slice(0, 3) : "",
    custom: true,
  };
}

export function allThemes(custom: unknown[]): Theme[] {
  const mine = custom.map((t, i) => sanitizeTheme(t, `custom-${i}`)).filter((t): t is Theme => !!t);
  return [...BUILTIN_THEMES, ...mine.filter((t) => !BUILTIN_THEMES.some((b) => b.id === t.id))];
}

export function allStyles(custom: unknown[]): StyleDef[] {
  const mine = custom.map((s, i) => sanitizeStyle(s, `custom-${i}`)).filter((s): s is StyleDef => !!s);
  return [...BUILTIN_STYLES, ...mine.filter((s) => !BUILTIN_STYLES.some((b) => b.id === s.id))];
}

/** Resolve a theme id. "auto" (or an unknown id) follows the system light/dark preference. */
export function resolveTheme(id: string, custom: unknown[], systemDark: boolean): Theme {
  const list = allThemes(custom);
  const hit = id !== "auto" ? list.find((t) => t.id === id) : undefined;
  return hit ?? list.find((t) => t.id === (systemDark ? "graphite" : "paper"))!;
}

export function resolveStyle(id: string, custom: unknown[]): StyleDef {
  const list = allStyles(custom);
  return list.find((s) => s.id === id) ?? BUILTIN_STYLES[0];
}

/** Everything the UI needs beyond the 12 saved colours. The saved colours are never changed. */
export interface Derived {
  /** No glass and no glow (high contrast). */
  solid: boolean;
  /** The everyday glow is grey so the waiting glow stands out. */
  neutralGlow: boolean;
  text: string;
  muted: string;
  accentInk: string;
  gateInk: string;
  accentText: string;
  gateText: string;
  okText: string;
  badText: string;
  sheet: string;
  sheetAlpha: number;
  card: string;
  glassBase: string;
  glassAlpha: number;
  /** Every surface text can sit on, including glass over each glow colour. */
  backgrounds: string[];
  glow: [string, string, string];
  wait: [string, string];
}

/** Hues closer than this to the waiting colour are too easy to confuse with it. */
const NEAR_WAITING = 40;

export function deriveColors(theme: Theme): Derived {
  const k = theme.colors;
  // A theme whose borders are as strong as text is a high-contrast theme.
  const solid = contrast(k.line, k.bg) >= 7;
  const neutralGlow = solid || hueDistance(k.accent, k.gate) < NEAR_WAITING;
  const side = (deg: number) => {
    const c = rotateHue(k.accent, deg);
    return hueDistance(c, k.gate) < NEAR_WAITING ? k.accent : c;
  };
  const glow: [string, string, string] = solid
    ? [k.bg, k.bg, k.bg]
    : neutralGlow
      ? [mix(k.bg, k.muted, 0.2), mix(k.bg, k.muted, 0.14), mix(k.bg, k.muted, 0.17)]
      : [mix(k.bg, k.accent, 0.55), mix(k.bg, side(-45), 0.42), mix(k.bg, side(45), 0.4)];
  const wait: [string, string] = solid ? [k.bg, k.bg] : [mix(k.bg, k.gate, 0.5), mix(k.bg, k.gate, 0.34)];
  const glassAlpha = solid ? 1 : 0.66;
  // The page itself stays near-solid: a hint of the glow comes through, the text stays clear.
  const sheetAlpha = solid ? 1 : 0.86;
  const glass = [...glow, ...wait].map((under) => mix(under, k.surface, glassAlpha));
  const sheets = [...glow, ...wait].map((under) => mix(under, k.bg, sheetAlpha));
  const backgrounds = [...new Set([k.bg, k.surface, k.raised, ...glass, ...sheets])];
  const readable = (c: string) => ensureContrast(c, backgrounds);
  return {
    solid,
    neutralGlow,
    text: readable(k.text),
    muted: readable(k.muted),
    accentInk: ensureContrast(k.accentInk, [k.accent]),
    gateInk: ensureContrast(k.gateInk, [k.gate]),
    accentText: readable(k.accent),
    gateText: readable(k.gate),
    okText: readable(k.ok),
    badText: readable(k.bad),
    sheet: k.bg,
    sheetAlpha,
    card: k.surface,
    glassBase: k.surface,
    glassAlpha,
    backgrounds,
    glow,
    wait,
  };
}

/** Which saved colours are shown differently so they stay readable. */
export function adjustedKeys(theme: Theme): (keyof ThemeColors)[] {
  const d = deriveColors(theme);
  return (["text", "muted", "accentInk", "gateInk"] as const).filter((key) => d[key] !== theme.colors[key]);
}

/**
 * The adjusted colours that were unreadable on the theme's own flat colours, so worth telling the author.
 * Small shifts made only for text over glass are left out.
 */
export function failingKeys(theme: Theme): (keyof ThemeColors)[] {
  const k = theme.colors;
  const flat = [k.bg, k.surface, k.raised];
  const on: Partial<Record<keyof ThemeColors, string[]>> = { text: flat, muted: flat, accentInk: [k.accent], gateInk: [k.gate] };
  return adjustedKeys(theme).filter((key) => on[key]!.some((under) => contrast(k[key], under) < 4.5));
}

const FONTS: Record<FontKind, string> = {
  system: '"Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, "Helvetica Neue", sans-serif',
  mono: '"Cascadia Code", "JetBrains Mono", ui-monospace, Menlo, Consolas, monospace',
  serif: 'Charter, "Iowan Old Style", "Palatino Linotype", Georgia, serif',
};

/** CSS custom properties for a theme + style. */
export function appearanceVars(theme: Theme, style: StyleDef): Record<string, string> {
  const k = theme.colors;
  const d = deriveColors(theme);
  const ui = style.fontFamily ? `${style.fontFamily}, ${FONTS[style.font]}` : FONTS[style.font];
  return {
    "--bg": k.bg, "--surface": k.surface, "--raised": k.raised, "--line": k.line,
    "--text": d.text, "--muted": d.muted, "--accent": k.accent, "--accent-ink": d.accentInk,
    "--gate": k.gate, "--gate-ink": d.gateInk, "--ok": k.ok, "--bad": k.bad,
    "--accent-text": d.accentText, "--gate-text": d.gateText, "--ok-text": d.okText, "--bad-text": d.badText,
    "--sheet": `color-mix(in srgb, ${d.sheet} ${Math.round(d.sheetAlpha * 100)}%, transparent)`, "--card": d.card,
    "--glass": `color-mix(in srgb, ${d.glassBase} ${Math.round(d.glassAlpha * 100)}%, transparent)`,
    "--glow-a": d.glow[0], "--glow-b": d.glow[1], "--glow-c": d.glow[2],
    "--wait-a": d.wait[0], "--wait-b": d.wait[1],
    "--ui": ui,
    "--font-size": `${style.fontSize}px`,
    "--radius": `${style.radius}px`,
    "--radius-sm": `${Math.round(style.radius * 0.7)}px`,
    "--radius-lg": `${Math.round(style.radius * 1.4)}px`,
    "--density": String(style.density),
    "--col": `${style.width}px`,
    "--scheme": theme.scheme,
  };
}

/** Apply to the document root. */
export function applyAppearance(root: HTMLElement, theme: Theme, style: StyleDef): void {
  for (const [k, v] of Object.entries(appearanceVars(theme, style))) root.style.setProperty(k, v);
  root.style.colorScheme = theme.scheme;
  root.dataset.solid = String(deriveColors(theme).solid);
  root.dataset.scheme = theme.scheme;
  root.dataset.user = style.userStyle;
  root.dataset.tool = style.toolStyle;
}

/** A fresh editable copy of a built-in or custom item, with a unique id. */
export function duplicateId(base: string, existing: string[]): string {
  const stem = base.replace(/-copy(-\d+)?$/, "");
  let id = `${stem}-copy`;
  for (let n = 2; existing.includes(id); n++) id = `${stem}-copy-${n}`;
  return id;
}
