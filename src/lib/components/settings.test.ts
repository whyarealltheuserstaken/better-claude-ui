import { fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, test, vi } from "vitest";
import SettingsPage from "./SettingsPage.svelte";
import { app } from "../store.svelte";
import { CATEGORIES, type SettingsCategory } from "../settingsNav";
import type { Tier } from "../tier";

const defaults = () => JSON.parse(JSON.stringify(app.config)) as typeof app.config;

const props = (config: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
  config: { ...defaults(), ...config },
  cliVersion: "2.1.0",
  appVersion: "0.1.0",
  onsave: vi.fn(),
  onback: vi.fn(),
  oncheck: vi.fn(),
  onviewupdate: vi.fn(),
  onexport: vi.fn(),
  onimport: vi.fn(),
  onautorefresh: vi.fn(),
  ...extra,
});

const show = (category: SettingsCategory, config: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) =>
  render(SettingsPage, props({ settings_category: category, ...config }, extra));

afterEach(() => vi.unstubAllGlobals());

describe("SettingsPage", () => {
  test("every category is listed and picking one saves it", async () => {
    const p = props();
    render(SettingsPage, p);
    const nav = screen.getByRole("navigation", { name: "Settings categories" });
    for (const c of CATEGORIES) {
      await fireEvent.click(screen.getByRole("button", { name: c.label }));
      expect(p.onsave).toHaveBeenLastCalledWith({ settings_category: c.id });
    }
    expect(nav).toBeTruthy();
  });

  test("a bad saved category shows General", () => {
    show("nope" as SettingsCategory);
    expect(screen.getByRole("heading", { name: "General" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "General" }).getAttribute("aria-current")).toBe("page");
  });

  test("has a visible way back", async () => {
    const p = props();
    render(SettingsPage, p);
    await fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(p.onback).toHaveBeenCalledTimes(1);
  });

  test.each<[Tier, boolean, boolean]>([
    ["beginner", false, false],
    ["intermediate", true, false],
    ["advanced", true, true],
  ])("General for %s", (tier, defaults, flags) => {
    show("general", { tier, always_allow: ["Bash"] });
    for (const name of [/^Beginner/, /^Intermediate/, /^Advanced/]) expect(screen.getByRole("radio", { name })).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "Model" }) !== null).toBe(defaults);
    expect(screen.queryByRole("combobox", { name: "Permissions" }) !== null).toBe(defaults);
    expect(screen.queryByRole("textbox", { name: "Extra CLI flags" }) !== null).toBe(flags);
    expect(screen.getByRole("button", { name: "Stop always allowing Bash" })).toBeTruthy();
    expect(screen.getByText("2.1.0")).toBeTruthy();
  });

  test("General says when Claude Code is missing", () => {
    show("general", {}, { cliVersion: null });
    expect(screen.getByText("Not found")).toBeTruthy();
  });

  test("changing the General controls saves them", async () => {
    const p = props({ settings_category: "general", tier: "advanced", always_allow: ["Bash", "Edit"] });
    render(SettingsPage, p);
    await fireEvent.change(screen.getByRole("combobox", { name: "Model" }), { target: { value: "opus" } });
    expect(p.onsave).toHaveBeenLastCalledWith({ default_model: "opus" });
    await fireEvent.change(screen.getByRole("textbox", { name: "Extra CLI flags" }), { target: { value: "--add-dir other" } });
    expect(p.onsave).toHaveBeenLastCalledWith({ extra_args: ["--add-dir", "other"] });
    await fireEvent.click(screen.getByRole("button", { name: "Stop always allowing Bash" }));
    expect(p.onsave).toHaveBeenLastCalledWith({ always_allow: ["Edit"] });
  });

  test("a bypass default asks to confirm, and saying no leaves the old choice", async () => {
    const confirm = vi.fn(() => false);
    vi.stubGlobal("confirm", confirm);
    const p = props({ settings_category: "general", tier: "advanced" });
    render(SettingsPage, p);
    const select = screen.getByRole("combobox", { name: "Permissions" }) as HTMLSelectElement;
    await fireEvent.change(select, { target: { value: "bypassPermissions" } });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(p.onsave).not.toHaveBeenCalled();
    expect(select.value).toBe("");
    confirm.mockReturnValue(true);
    await fireEvent.change(select, { target: { value: "bypassPermissions" } });
    expect(p.onsave).toHaveBeenLastCalledWith({ default_permission_mode: "bypassPermissions" });
  });

  test("bypass is not offered below Advanced", () => {
    show("general", { tier: "intermediate" });
    expect(screen.queryByRole("option", { name: /Bypass/ })).toBeNull();
  });

  test("Appearance holds the theme and style pickers", () => {
    show("appearance");
    expect(screen.getByRole("radiogroup", { name: "Theme" })).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: "Style" })).toBeTruthy();
  });

  test("Usage and budgets holds budgets and automatic refresh", async () => {
    const p = props({ settings_category: "usage", auto_refresh_limits: false });
    render(SettingsPage, p);
    await fireEvent.change(screen.getByRole("spinbutton", { name: "Daily budget ($)" }), { target: { value: "5" } });
    expect(p.onsave).toHaveBeenLastCalledWith({ budget_daily_usd: 5 });
    await fireEvent.change(screen.getByRole("spinbutton", { name: "Monthly budget ($)" }), { target: { value: "" } });
    expect(p.onsave).toHaveBeenLastCalledWith({ budget_monthly_usd: null });
    await fireEvent.click(screen.getByRole("checkbox", { name: "Refresh automatically every" }));
    expect(p.onautorefresh).toHaveBeenLastCalledWith({ auto_refresh_limits: true });
  });

  test("Your data exports and imports, and reports the result", async () => {
    const p = props({ settings_category: "data" }, { exportState: { phase: "done", result: { conversations: 2, bytes: 10, folder: "out" } } });
    render(SettingsPage, p);
    await fireEvent.click(screen.getByRole("button", { name: "Export all my data…" }));
    await fireEvent.click(screen.getByRole("button", { name: "Import data…" }));
    expect(p.onexport).toHaveBeenCalled();
    expect(p.onimport).toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toContain("Exported 2 conversations");
  });

  test("Updates checks, views and toggles the automatic check", async () => {
    const p = props({ settings_category: "updates", auto_update_check: true }, { update: { phase: "available", info: { version: "9.9.9", notes: null } } });
    render(SettingsPage, p);
    expect(screen.getByText(/BetterClaudeUI version 0\.1\.0/)).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));
    await fireEvent.click(screen.getByRole("button", { name: "View update" }));
    await fireEvent.click(screen.getByRole("checkbox", { name: /Check for updates automatically/ }));
    expect(p.oncheck).toHaveBeenCalled();
    expect(p.onviewupdate).toHaveBeenCalled();
    expect(p.onsave).toHaveBeenLastCalledWith({ auto_update_check: false });
  });
});
