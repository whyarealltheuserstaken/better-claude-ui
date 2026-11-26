import { fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, test, vi } from "vitest";
import TrayPanel from "./components/TrayPanel.svelte";
import { ipc } from "./ipc";
import { app } from "./store.svelte";
import { initialState } from "./reducer";
import { parseTrayAction, parseTrayView, type TrayView } from "./trayBridge";
import { sanitizeTray } from "./widget/config";
import type { Totals, UsageSummary } from "./types";

const totals = (cost_usd: number): Totals => ({ cost_usd, input: 1, output: 2, cache_read: 3, cache_write: 4, turns: 1 });
const usage: UsageSummary = { today: totals(2.5), week: totals(5), month: totals(54), all: totals(80), by_model: [], by_project: [], daily: [], days: 30 };
const data = { reply: null, session: null, sessionCost: null, hasSession: false, usage, limits: null, dailyBudget: 3, monthlyBudget: null };
const view = (patch: Partial<TrayView> = {}): TrayView => ({ data, settings: sanitizeTray({ enabled: true }), vars: { "--bg": "#000000", "color-scheme": "dark" }, status: "idle", ...patch });

describe("messages from the panel", () => {
  test("only the four actions are accepted", () => {
    for (const type of ["ready", "open", "quit"] as const) expect(parseTrayAction({ type }), type).toEqual({ type });
    expect(parseTrayAction({ type: "settings", value: { enabled: true, size: "large" } })).toMatchObject({ type: "settings", value: { size: "large" } });
  });

  test("junk is refused", () => {
    for (const bad of [null, undefined, 3, "quit", [], {}, { type: "allow" }, { type: "resolve_permission" }, { type: "settings" }, { type: "settings", value: "x" }]) {
      expect(parseTrayAction(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe("what the panel accepts", () => {
  test("a complete view, with only style variables kept", () => {
    const parsed = parseTrayView({ ...view(), vars: { "--bg": "#111111", "color-scheme": "light", position: "fixed", "--n": 4 } });
    expect(parsed?.vars).toEqual({ "--bg": "#111111", "color-scheme": "light" });
    expect(parsed?.settings.items.length).toBe(9);
  });

  test("anything incomplete is ignored", () => {
    for (const bad of [null, 1, {}, { data }, { settings: {}, vars: {} }]) expect(parseTrayView(bad)).toBeNull();
    expect(parseTrayView({ ...view(), status: "nonsense" })?.status).toBe("idle");
  });
});

describe("the panel", () => {
  const show = (v: TrayView | null = view()) => {
    const onaction = vi.fn();
    const onhide = vi.fn();
    render(TrayPanel, { view: v, onaction, onhide });
    return { onaction, onhide };
  };
  const names = () => screen.getAllByRole("button").map((b) => b.getAttribute("aria-label") ?? b.textContent?.trim());

  test("shows its readings", () => {
    show();
    const box = screen.getByRole("region", { name: "Usage widget" });
    expect([...box.querySelectorAll("dt")].map((d) => d.textContent)).toEqual(["5-hour limit", "Weekly limit", "Today", "This month"]);
  });

  test("while Claude waits it says so and offers no way to approve", () => {
    show(view({ status: "waiting" }));
    expect(screen.getByText(/Open BetterClaudeUI to answer/)).toBeTruthy();
    expect(names().some((n) => /allow|approve|deny/i.test(n ?? ""))).toBe(false);
  });

  test("Open and Quit are passed on", async () => {
    const { onaction } = show();
    await fireEvent.click(screen.getByRole("button", { name: "Open BetterClaudeUI" }));
    await fireEvent.click(screen.getByRole("button", { name: "Quit" }));
    expect(onaction.mock.calls.map((c) => c[0].type)).toEqual(["open", "quit"]);
  });

  test("the gear changes the tray's own readings, with no position", async () => {
    const { onaction } = show();
    await fireEvent.click(screen.getByRole("button", { name: "Customize the usage widget" }));
    expect(screen.queryByRole("combobox", { name: "Position" })).toBeNull();
    await fireEvent.click(screen.getByRole("checkbox", { name: "Tray: This reply" }));
    expect(onaction.mock.lastCall![0]).toMatchObject({ type: "settings" });
  });

  test("Escape leaves the readings editor first, then hides the panel", async () => {
    const { onhide } = show();
    await fireEvent.click(screen.getByRole("button", { name: "Customize the usage widget" }));
    await fireEvent.keyDown(window, { key: "Escape" });
    expect(onhide).not.toHaveBeenCalled();
    expect(screen.getByRole("region", { name: "Usage widget" })).toBeTruthy();
    await fireEvent.keyDown(window, { key: "Escape" });
    expect(onhide).toHaveBeenCalledTimes(1);
  });

  test("before the first message it says it is loading and can still be quit", () => {
    show(null);
    expect(screen.getByText("Loading…")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Quit" })).toBeTruthy();
  });
});

describe("the main window answers the panel", () => {
  afterEach(async () => {
    vi.spyOn(ipc, "trayApply").mockResolvedValue(undefined);
    await app.applyTray(false, false);
    vi.restoreAllMocks();
    app.states = {};
  });

  const ready = async () => {
    vi.spyOn(ipc, "setConfig").mockResolvedValue(undefined);
    vi.spyOn(ipc, "trayApply").mockResolvedValue(undefined);
    await app.applyTray(true, false);
    return vi.spyOn(ipc, "emitTray").mockResolvedValue(undefined);
  };

  test("a panel that has just opened gets the current view, and only changes after that", async () => {
    const sent = await ready();
    await app.syncPanel({ "--bg": "#000000" });
    await app.syncPanel({ "--bg": "#000000" });
    expect(sent).toHaveBeenCalledTimes(1);
    await app.handleTrayAction({ type: "ready" });
    expect(sent).toHaveBeenCalledTimes(2);
    app.states = { a: { ...initialState(), status: "running" } };
    await app.syncPanel({ "--bg": "#000000" });
    expect(sent.mock.lastCall![0]).toMatchObject({ status: "working" });
  });

  test("the panel can change readings and size, never the tray switches", async () => {
    await ready();
    app.config = { ...app.config, tray: { enabled: true, keep_running: false } };
    await app.handleTrayAction({ type: "settings", value: sanitizeTray({ enabled: true, keep_running: true, size: "large" }) });
    expect(app.tray).toMatchObject({ size: "large", enabled: true, keep_running: false });
  });

  test("open and quit go to the app itself", async () => {
    const open = vi.spyOn(ipc, "trayOpen").mockResolvedValue(undefined);
    const quit = vi.spyOn(ipc, "trayQuit").mockResolvedValue(undefined);
    await app.handleTrayAction({ type: "open" });
    await app.handleTrayAction({ type: "quit" });
    expect(open).toHaveBeenCalledTimes(1);
    expect(quit).toHaveBeenCalledTimes(1);
  });
});
