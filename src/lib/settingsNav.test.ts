import { describe, expect, test } from "vitest";
import { CATEGORIES, cleanCategory, escapeGoesBack, isPage, pageAllowed } from "./settingsNav";
import { ICONS } from "./ui/icons";

describe("settings categories", () => {
  test("lists the categories in order, each with a known icon", () => {
    expect(CATEGORIES.map((c) => c.id)).toEqual(["general", "appearance", "usage", "data", "updates"]);
    expect(CATEGORIES.map((c) => c.label)).toEqual(["General", "Appearance", "Usage and budgets", "Your data", "Updates"]);
    for (const c of CATEGORIES) expect(ICONS[c.icon], c.id).toBeDefined();
  });

  test("a saved category is kept; anything else shows General", () => {
    expect(cleanCategory("updates")).toBe("updates");
    for (const bad of ["", "nope", "widget", null, undefined, 3, {}]) expect(cleanCategory(bad), String(bad)).toBe("general");
  });
});

describe("pages", () => {
  test("only settings and the other full pages count", () => {
    for (const v of ["settings", "projects", "capabilities", "instructions"]) expect(isPage(v), v).toBe(true);
    for (const v of ["home", "session", "usage", "archive"]) expect(isPage(v), v).toBe(false);
  });

  test("Escape goes back only from a page with nothing open on top", () => {
    const esc = { key: "Escape", defaultPrevented: false };
    expect(escapeGoesBack(esc, "settings", false)).toBe(true);
    expect(escapeGoesBack(esc, "settings", true)).toBe(false);
    expect(escapeGoesBack(esc, "home", false)).toBe(false);
    expect(escapeGoesBack({ ...esc, defaultPrevented: true }, "settings", false)).toBe(false);
    expect(escapeGoesBack({ ...esc, key: "Enter" }, "settings", false)).toBe(false);
  });
});

describe("page access by tier", () => {
  test("Capabilities and Instructions are closed to Beginner", () => {
    for (const page of ["capabilities", "instructions"] as const) {
      expect(pageAllowed(page, "beginner"), page).toBe(false);
      expect(pageAllowed(page, "intermediate"), page).toBe(true);
      expect(pageAllowed(page, "advanced"), page).toBe(true);
    }
    expect(pageAllowed("settings", "beginner")).toBe(true);
    expect(pageAllowed("projects", "beginner")).toBe(true);
  });
});
