import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ipc } from "../ipc";
import { app } from "../store.svelte";
import { settingsPatch } from "../exchange";
import { addUserMessage, initialState } from "../reducer";
import type { SessionEvent, SessionState, Totals } from "../types";
import { sanitizeWidget } from "./config";
import { widgetPaletteItems } from "./palette";
import { sessionSplit, widgetStatus } from "./readings";

const ledger: Totals = { cost_usd: 1, input: 10, output: 20, cache_read: 30, cache_write: 40, turns: 2 };
const reply = { input: 1, output: 2, cache_read: 3, cache_write: 4 };
const summed = { input: 11, output: 22, cache_read: 33, cache_write: 44 };

describe("session tokens", () => {
  test("are the usage log plus the reply that is not in it yet", () => {
    expect(sessionSplit(ledger, reply, true)).toEqual(summed);
    expect(sessionSplit(ledger, reply, false)).toEqual({ input: 10, output: 20, cache_read: 30, cache_write: 40 });
    expect(sessionSplit(null, reply, true)).toEqual(reply);
  });

  test("with nothing counted there is no number to show", () => {
    expect(sessionSplit(null, null, true)).toBeNull();
    expect(sessionSplit(null, reply, false)).toBeNull();
    expect(sessionSplit({ ...ledger, input: 0, output: 0, cache_read: 0, cache_write: 0 }, null, true)).toBeNull();
  });
});

describe("widget status", () => {
  const state = (patch: Partial<SessionState>): SessionState => ({ ...initialState(), ...patch });
  const waiting = state({ status: "running", pending: [{ session_id: "s", request_id: "r", tool: "Write", input: {}, description: "", tool_use_id: "t" }] });

  test("waiting anywhere wins over working, then idle", () => {
    expect(widgetStatus({})).toBe("idle");
    expect(widgetStatus({ a: state({ status: "running" }) })).toBe("working");
    expect(widgetStatus({ a: state({ status: "running" }), b: waiting })).toBe("waiting");
  });
});

describe("palette", () => {
  const run = (raw: unknown) => {
    const show = vi.fn();
    const customize = vi.fn();
    return { items: widgetPaletteItems(sanitizeWidget(raw), { show, customize }), show, customize };
  };

  test("a hidden widget is offered again", () => {
    const { items, show } = run({ position: "hidden" });
    items.find((i) => i.label === "Show the usage widget")!.run();
    expect(show).toHaveBeenCalledTimes(1);
  });

  test("a visible widget offers only customization", () => {
    const { items, customize } = run(null);
    expect(items.map((i) => i.label)).toEqual(["Customize the usage widget"]);
    items[0].run();
    expect(customize).toHaveBeenCalledTimes(1);
  });
});

describe("the store feeds the widget", () => {
  const cli = (event: object) => app.receive({ session_id: "s1", event: { type: "cli", event } as SessionEvent });
  const result = { kind: "turn_result", is_error: false, result: "ok", cost_usd: 0.25, session_id: "c1" };
  const step = { kind: "step_usage", start: true, ...reply, parent_tool_use_id: null };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(ipc, "setConfig").mockResolvedValue(undefined);
    vi.spyOn(ipc, "saveTranscript").mockResolvedValue(undefined);
    vi.spyOn(ipc, "usageSummary").mockResolvedValue(null as never);
    app.states = { s1: addUserMessage({ ...initialState(), cliSessionId: "c1" }, "hi", []) };
    app.metas = [{ id: "s1", title: "t", cwd: null, mode: "chat", model: null, permissionMode: null, preset: null, effort: null, webSearch: false, project: null }];
    app.activeId = "s1";
    app.sessionLedger = {};
    app.sessionStale = {};
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    app.states = {};
    app.metas = [];
    app.activeId = null;
  });

  test("saving the widget writes usage_widget", async () => {
    const next = sanitizeWidget({ position: "floating", x: 5, y: 6 });
    await app.saveWidget(next);
    expect(vi.mocked(ipc.setConfig).mock.lastCall![0].usage_widget).toEqual(next);
    expect(app.widget.position).toBe("floating");
  });

  test("a finished reply stays in the session total until the usage log has it, and is never counted twice", async () => {
    const log = vi.spyOn(ipc, "usageSession").mockResolvedValue(ledger);
    await app.refreshSessionUsage("c1");
    cli(step);
    expect(app.widgetData.session).toEqual(summed);
    cli(result);
    expect(app.widgetData.session).toEqual(summed);
    log.mockResolvedValue({ ...ledger, ...summed });
    await vi.advanceTimersByTimeAsync(800);
    expect(log).toHaveBeenLastCalledWith("c1");
    expect(app.widgetData.session).toEqual(summed);
    expect(app.widgetData.sessionCost).toBeCloseTo(0.25);
    expect(app.widgetData.reply).toEqual(reply);
  });

  test("without an open session there are no session readings", () => {
    app.activeId = null;
    expect(app.widgetData).toMatchObject({ hasSession: false, reply: null, session: null, sessionCost: null });
  });

  test("nothing here asks for fresh plan limits", async () => {
    const paid = vi.spyOn(ipc, "refreshLimits");
    vi.spyOn(ipc, "usageSession").mockResolvedValue(ledger);
    await app.saveWidget(sanitizeWidget(null));
    cli(step);
    cli(result);
    await vi.advanceTimersByTimeAsync(800);
    expect(paid).not.toHaveBeenCalled();
  });
});

describe("restoring a backup", () => {
  test("never turns the tray or Keep running on", () => {
    const patch = settingsPatch({ tray: { enabled: true, keep_running: true }, theme: "midnight" });
    expect(patch).toEqual({ theme: "midnight" });
  });
});
