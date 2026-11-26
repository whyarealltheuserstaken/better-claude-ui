import { describe, expect, test } from "vitest";
import { type ImportResult, type Inspection, defaultOptions, fmtBytes, mergeProjects, nothingSelected, settingsPatch, summarizeResult } from "./exchange";

const insp = (over: Partial<Inspection> = {}): Inspection => ({ format: "Claude.ai export", source: "claude.ai", conversations: 3, messages: 10, projects: 0, has_settings: false, usage_records: 0, presets: 0, date_from: null, date_to: null, samples: [], warnings: [], files: [], ...over });

describe("options", () => {
  test("defaults take everything that is present", () => {
    expect(defaultOptions(insp())).toEqual({ conversations: true, projects: false, settings: false, usage: false });
    expect(defaultOptions(insp({ projects: 2, has_settings: true, usage_records: 5 }))).toEqual({ conversations: true, projects: true, settings: true, usage: true });
  });
  test("nothingSelected ignores options for things that are not in the file", () => {
    const i = insp();
    expect(nothingSelected({ conversations: false, projects: true, settings: true, usage: true }, i)).toBe(true);
    expect(nothingSelected({ conversations: true, projects: false, settings: false, usage: false }, i)).toBe(false);
  });
});

describe("mergeProjects", () => {
  test("adds new ones with unique ids and skips same-named (case-insensitive)", () => {
    const existing = [{ id: "site", name: "Site", instructions: "x", cwd: null }];
    const r = mergeProjects(existing, [{ name: "site", instructions: "dup" }, { name: "Docs", instructions: "d" }, { name: "Docs", instructions: "again" }, { name: "  ", instructions: "" }]);
    expect(r.added).toBe(1);
    expect(r.projects).toHaveLength(2);
    expect(r.projects[1]).toMatchObject({ name: "Docs", instructions: "d", cwd: null });
  });
  test("ids never collide with existing ones", () => {
    const r = mergeProjects([{ id: "docs", name: "Other", instructions: "", cwd: null }], [{ name: "Docs", instructions: "" }]);
    expect((r.projects[1] as { id: string }).id).toBe("docs-2");
  });
});

describe("settingsPatch (second layer of validation)", () => {
  test("keeps valid values", () => {
    const p = settingsPatch({ tier: "advanced", theme: "midnight", style: "terminal", default_model: "opus", auto_update_check: false, budget_daily_usd: 3, home_widgets: ["limits", 5] });
    expect(p).toMatchObject({ tier: "advanced", theme: "midnight", style: "terminal", default_model: "opus", auto_update_check: false, budget_daily_usd: 3, home_widgets: ["limits"] });
  });
  test("rejects bad values and never produces risky keys even if smuggled in", () => {
    const p = settingsPatch({ tier: "root", theme: "../x", default_model: "a b", budget_daily_usd: -5, always_allow: ["Bash"], extra_args: ["--x"], default_permission_mode: "bypassPermissions" });
    expect(p.tier).toBe("beginner");
    expect(p).not.toHaveProperty("theme");
    expect(p).not.toHaveProperty("default_model");
    expect(p).not.toHaveProperty("budget_daily_usd");
    for (const k of ["always_allow", "extra_args", "default_permission_mode"]) expect(p).not.toHaveProperty(k);
  });
  test("custom themes and styles go through the same sanitizers as imports from the theme editor", () => {
    const p = settingsPatch({ custom_themes: [{ id: "a", name: "A", colors: { bg: "#ffffff", text: "javascript:evil" } }, "junk"], custom_styles: [{ name: "S", fontFamily: "x; } body {display:none" }] });
    expect(p.custom_themes).toHaveLength(1);
    expect((p.custom_styles as { fontFamily?: string }[])[0].fontFamily).not.toMatch(/[;{}]/);
    expect(settingsPatch(null)).toEqual({});
  });
});

describe("summaries", () => {
  const r = (o: Partial<ImportResult>): ImportResult => ({ conversations_added: 0, duplicates_skipped: 0, projects: [], settings: null, usage_added: 0, presets_added: 0, warnings: [], ...o });
  test("plain-language result lines", () => {
    expect(summarizeResult(r({ conversations_added: 1, duplicates_skipped: 2, usage_added: 3 }), 1, true)).toEqual(["1 conversation added to your Archive", "2 already here, skipped", "1 project added", "settings restored", "3 usage records added"]);
    expect(summarizeResult(r({}), 0, false)).toEqual(["Nothing new to add"]);
  });
  test("fmtBytes", () => {
    expect(fmtBytes(900)).toBe("900 B");
    expect(fmtBytes(2048)).toBe("2 KB");
    expect(fmtBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});
