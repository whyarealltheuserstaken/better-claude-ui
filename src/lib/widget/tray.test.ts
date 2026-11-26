import { fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import SettingsPage from "../components/SettingsPage.svelte";
import { ipc } from "../ipc";
import { app } from "../store.svelte";
import { initialState } from "../reducer";
import type { LimitsSnapshot, SessionState, Totals, UsageSummary } from "../types";
import { sanitizeTray } from "./config";
import type { WidgetData } from "./readings";
import { trayPayload } from "./tray";

const NOW = Date.now();
const totals = (cost_usd: number): Totals => ({ cost_usd, input: 1, output: 2, cache_read: 3, cache_write: 4, turns: 1 });
const usage: UsageSummary = { today: totals(2.5), week: totals(5), month: totals(54), all: totals(80), by_model: [], by_project: [], daily: [], days: 30 };
const limits: LimitsSnapshot = { captured_at: NOW, status: "allowed", using_overage: false, windows: [{ name: "five_hour", utilization: 0.42, resets_at: null, status: "allowed" }] };
const data: WidgetData = { reply: null, session: null, sessionCost: null, hasSession: false, usage, limits, dailyBudget: 3, monthlyBudget: null };
const pending = { session_id: "s", request_id: "r", tool: "Write", input: {}, description: "", tool_use_id: "t" };
const state = (patch: Partial<SessionState>): SessionState => ({ ...initialState(), ...patch });

describe("what the tray is told", () => {
  test("the chosen readings as lines, in order, without the chart", () => {
    const settings = sanitizeTray({ items: [{ id: "today", on: true, as: "bar" }, { id: "daily", on: true, as: "chart" }, { id: "five_hour", on: true, as: "ring" }, { id: "month", on: false, as: "bar" }] });
    expect(trayPayload(settings, data, {}, NOW).lines).toEqual(["Today: $2.50", "5-hour limit: 42%"]);
  });

  test("beside the icon: the first chosen reading with a short value, or nothing", () => {
    expect(trayPayload(sanitizeTray(null), data, {}, NOW).title).toBe("42%");
    expect(trayPayload(sanitizeTray(null), { ...data, limits: null }, {}, NOW).title).toBe("$2.50");
    expect(trayPayload(sanitizeTray(null), { ...data, limits: null, usage: null }, {}, NOW).title).toBeNull();
  });

  test("waiting, running and pending cover every session", () => {
    const states = { a: state({ status: "running" }), b: state({ status: "running", pending: [pending, pending] }), c: state({}) };
    expect(trayPayload(sanitizeTray(null), data, states, NOW)).toMatchObject({ waiting: true, running: 2, pending: 2 });
    expect(trayPayload(sanitizeTray(null), data, {}, NOW)).toMatchObject({ waiting: false, running: 0, pending: 0 });
  });
});

describe("the store keeps the tray up to date", () => {
  beforeEach(() => {
    vi.spyOn(ipc, "setConfig").mockResolvedValue(undefined);
    app.states = { shown: state({}), other: state({}) };
    app.activeId = "shown";
  });
  afterEach(async () => {
    vi.spyOn(ipc, "trayApply").mockResolvedValue(undefined);
    await app.applyTray(false, false);
    vi.restoreAllMocks();
    app.states = {};
    app.activeId = null;
    app.error = null;
  });

  test("an update goes out when a permission starts waiting in any session, and only on change", async () => {
    vi.spyOn(ipc, "trayApply").mockResolvedValue(undefined);
    const sent = vi.spyOn(ipc, "trayUpdate").mockResolvedValue(undefined);
    await app.applyTray(true, false);
    await app.syncTray();
    await app.syncTray();
    expect(sent).toHaveBeenCalledTimes(1);
    app.states.other = state({ status: "running", pending: [pending] });
    await app.syncTray();
    expect(sent).toHaveBeenCalledTimes(2);
    expect(sent.mock.lastCall![0]).toMatchObject({ waiting: true, running: 1, pending: 1 });
  });

  test("nothing is sent while there is no tray", async () => {
    vi.spyOn(ipc, "trayApply").mockResolvedValue(undefined);
    const sent = vi.spyOn(ipc, "trayUpdate").mockResolvedValue(undefined);
    await app.applyTray(false, false);
    await app.syncTray();
    expect(app.trayReady).toBe(false);
    expect(sent).not.toHaveBeenCalled();
  });

  test("turning it on again sends the current state again", async () => {
    vi.spyOn(ipc, "trayApply").mockResolvedValue(undefined);
    const sent = vi.spyOn(ipc, "trayUpdate").mockResolvedValue(undefined);
    await app.applyTray(true, false);
    await app.syncTray();
    await app.applyTray(false, false);
    await app.applyTray(true, false);
    await app.syncTray();
    expect(sent).toHaveBeenCalledTimes(2);
  });

  test("a tray that cannot be created is reported", async () => {
    vi.spyOn(ipc, "trayApply").mockRejectedValue("The tray icon couldn't be created: no tray");
    await app.applyTray(true, true);
    expect(app.trayReady).toBe(false);
    expect(app.trayError).toContain("couldn't be created");
    expect(app.trayError).toContain("Closing the window will quit");
    expect(app.error).toBe(app.trayError);
  });
});

describe("Settings > Usage widget: the tray", () => {
  const show = (tray: unknown, extra: Record<string, unknown> = {}) => {
    const onsave = vi.fn();
    render(SettingsPage, { config: { ...JSON.parse(JSON.stringify(app.config)), settings_category: "widget", tray }, onsave, onback: vi.fn(), ...extra });
    return onsave;
  };
  const box = (name: RegExp) => screen.getByRole("checkbox", { name }) as HTMLInputElement;

  test("off by default, and Keep running is only available with the tray on", async () => {
    const onsave = show(null);
    expect(box(/Show in the system tray/).checked).toBe(false);
    expect(box(/Keep running when I close the window/).disabled).toBe(true);
    expect(screen.queryByRole("list", { name: "Tray readings" })).toBeNull();
    await fireEvent.click(box(/Show in the system tray/));
    expect(onsave.mock.lastCall![0].tray).toMatchObject({ enabled: true, keep_running: false });
  });

  test("turning the tray off also turns Keep running off", async () => {
    const onsave = show({ enabled: true, keep_running: true });
    expect(box(/Keep running/).checked).toBe(true);
    await fireEvent.click(box(/Show in the system tray/));
    expect(onsave.mock.lastCall![0].tray).toMatchObject({ enabled: false, keep_running: false });
  });

  test("with the tray on it has its own readings and size, and no position", async () => {
    const onsave = show({ enabled: true });
    expect(screen.getByRole("list", { name: "Tray readings" })).toBeTruthy();
    expect(screen.getAllByRole("combobox", { name: "Position" })).toHaveLength(1);
    await fireEvent.click(screen.getByRole("checkbox", { name: "Tray: This reply" }));
    const tray = onsave.mock.lastCall![0].tray;
    expect(tray.items.find((i: { id: string }) => i.id === "reply").on).toBe(true);
    expect(tray).not.toHaveProperty("position");
  });

  test("says why there is no tray", () => {
    show({ enabled: true }, { trayError: "The tray icon couldn't be created: no tray. Closing the window will quit." });
    expect(screen.getByRole("alert").textContent).toContain("couldn't be created");
  });
});
