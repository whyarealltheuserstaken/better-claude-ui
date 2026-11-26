/** Pure navigation decisions for Settings and the other full pages. */
import type { Tier } from "./tier";
import type { IconName } from "./ui/icons";

export type SettingsCategory = "general" | "appearance" | "usage" | "widget" | "data" | "updates";

/** In display order. "widget" is listed once the usage widget exists. */
export const CATEGORIES: { id: SettingsCategory; label: string; icon: IconName }[] = [
  { id: "general", label: "General", icon: "sliders" },
  { id: "appearance", label: "Appearance", icon: "palette" },
  { id: "usage", label: "Usage and budgets", icon: "wallet" },
  { id: "data", label: "Your data", icon: "database" },
  { id: "updates", label: "Updates", icon: "refresh" },
];

export function cleanCategory(v: unknown): SettingsCategory {
  return CATEGORIES.find((c) => c.id === v)?.id ?? "general";
}

export const PAGES = ["settings", "projects", "capabilities", "instructions"] as const;
export type PageView = (typeof PAGES)[number];
export type View = "home" | "session" | "usage" | "archive" | PageView;

export function isPage(view: string): view is PageView {
  return (PAGES as readonly string[]).includes(view);
}

/** Some pages are for people who edit Claude Code's own setup. */
export function pageAllowed(page: PageView, tier: Tier): boolean {
  return tier !== "beginner" || (page !== "capabilities" && page !== "instructions");
}

/** Escape leaves a page only when nothing floating on top of it is waiting to be closed. */
export function escapeGoesBack(e: { key: string; defaultPrevented: boolean }, view: string, overlayOpen: boolean): boolean {
  return e.key === "Escape" && !e.defaultPrevented && !overlayOpen && isPage(view);
}
