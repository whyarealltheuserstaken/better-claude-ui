/** Export / import: types shared with the Rust side and the pure logic around the import flow. */

import { clampMinutes } from "./limits";
import { allProjects, newProjectId } from "./projects";
import { sanitizeStyle, sanitizeTheme } from "./theme";
import { normalizeTier } from "./tier";
import type { AppConfig } from "./types";

export interface ExportResult {
  folder: string;
  conversations: number;
  files: number;
  bytes: number;
}

export interface Inspection {
  format: string;
  source: string;
  conversations: number;
  messages: number;
  projects: number;
  has_settings: boolean;
  usage_records: number;
  presets: number;
  date_from: number | null;
  date_to: number | null;
  samples: string[];
  warnings: string[];
  files: string[];
}

export interface ImportOptions {
  conversations: boolean;
  projects: boolean;
  settings: boolean;
  usage: boolean;
}

export interface ImportedProject {
  name: string;
  instructions: string;
}

export interface ImportResult {
  conversations_added: number;
  duplicates_skipped: number;
  projects: ImportedProject[];
  settings: Record<string, unknown> | null;
  usage_added: number;
  presets_added: number;
  warnings: string[];
}

/** Sensible defaults for the preview's checkboxes: take what is there. */
export function defaultOptions(i: Inspection): ImportOptions {
  return { conversations: i.conversations > 0, projects: i.projects > 0, settings: i.has_settings, usage: i.usage_records > 0 };
}

export const nothingSelected = (o: ImportOptions, i: Inspection): boolean =>
  !((o.conversations && i.conversations > 0) || (o.projects && i.projects > 0) || (o.settings && i.has_settings) || (o.usage && i.usage_records > 0));

/** Add imported projects to the existing list: same-named ones are skipped, new ids are unique. */
export function mergeProjects(existing: unknown[], imported: ImportedProject[]): { projects: unknown[]; added: number } {
  const have = allProjects(existing);
  const names = new Set(have.map((p) => p.name.trim().toLowerCase()));
  const ids = have.map((p) => p.id);
  const out: unknown[] = [...existing];
  let added = 0;
  for (const p of imported) {
    const name = p.name.trim();
    if (!name || names.has(name.toLowerCase())) continue;
    const id = newProjectId(name, ids);
    ids.push(id);
    names.add(name.toLowerCase());
    out.push({ id, name, instructions: p.instructions, cwd: null });
    added++;
  }
  return { projects: out, added };
}

/** Restored settings, validated again here. Rust already refuses risky keys; this only lets through
 *  the exact keys the UI understands, with valid values, so a bad file cannot put the app in a bad state. */
export function settingsPatch(raw: Record<string, unknown> | null): Partial<AppConfig> {
  const patch: Partial<AppConfig> = {};
  if (!raw) return patch;
  if (typeof raw.tier === "string") patch.tier = normalizeTier(raw.tier);
  if (typeof raw.theme === "string" && /^[a-z0-9-_]{1,48}$/.test(raw.theme)) patch.theme = raw.theme;
  if (typeof raw.style === "string" && /^[a-z0-9-_]{1,48}$/.test(raw.style)) patch.style = raw.style;
  if (typeof raw.default_model === "string" && /^[A-Za-z0-9._[\]-]{1,48}$/.test(raw.default_model)) patch.default_model = raw.default_model;
  if (typeof raw.auto_update_check === "boolean") patch.auto_update_check = raw.auto_update_check;
  if (typeof raw.auto_refresh_limits === "boolean") patch.auto_refresh_limits = raw.auto_refresh_limits;
  if (typeof raw.refresh_limits_minutes === "number") patch.refresh_limits_minutes = clampMinutes(raw.refresh_limits_minutes);
  for (const k of ["budget_daily_usd", "budget_monthly_usd"] as const) {
    const n = raw[k];
    if (typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1_000_000) patch[k] = n;
  }
  if (Array.isArray(raw.custom_themes)) patch.custom_themes = raw.custom_themes.map((t, i) => sanitizeTheme(t, `restored-${i}`)).filter((t) => t !== null);
  if (Array.isArray(raw.custom_styles)) patch.custom_styles = raw.custom_styles.map((s, i) => sanitizeStyle(s, `restored-${i}`)).filter((s) => s !== null);
  if (Array.isArray(raw.home_widgets)) patch.home_widgets = raw.home_widgets.filter((w): w is string => typeof w === "string");
  return patch;
}

/** Plain-language summary of what an import did. */
export function summarizeResult(r: ImportResult, projectsAdded: number, settingsApplied: boolean): string[] {
  const out: string[] = [];
  if (r.conversations_added > 0) out.push(`${r.conversations_added} conversation${r.conversations_added === 1 ? "" : "s"} added to your Archive`);
  if (r.duplicates_skipped > 0) out.push(`${r.duplicates_skipped} already here, skipped`);
  if (projectsAdded > 0) out.push(`${projectsAdded} project${projectsAdded === 1 ? "" : "s"} added`);
  if (settingsApplied) out.push("settings restored");
  if (r.usage_added > 0) out.push(`${r.usage_added} usage record${r.usage_added === 1 ? "" : "s"} added`);
  if (r.presets_added > 0) out.push(`${r.presets_added} agent team${r.presets_added === 1 ? "" : "s"} added`);
  if (out.length === 0) out.push("Nothing new to add");
  return out;
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
