import { fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, test, vi } from "vitest";
import UsageWidget from "./UsageWidget.svelte";
import WidgetCustomize from "./WidgetCustomize.svelte";
import SettingsPage from "./SettingsPage.svelte";
import { ipc } from "../ipc";
import { app } from "../store.svelte";
import { sanitizeWidget } from "../widget/config";
import type { WidgetData } from "../widget/readings";
import type { Totals, UsageSummary } from "../types";

const totals = (cost_usd: number): Totals => ({ cost_usd, input: 100, output: 200, cache_read: 3000, cache_write: 400, turns: 1 });
const usage: UsageSummary = { today: totals(2.5), week: totals(5), month: totals(54), all: totals(80), by_model: [], by_project: [], daily: [{ date: "2026-11-26", cost_usd: 2.4, tokens: 20 }], days: 30 };
const limits = { captured_at: Date.now() - 60_000, status: "allowed", using_overage: false, windows: [{ name: "five_hour", utilization: 0.42, resets_at: null, status: "allowed" }] };
const data: WidgetData = { reply: { input: 4, output: 335, cache_read: 37621, cache_write: 8126 }, session: null, sessionCost: 0.42, hasSession: true, usage, limits, dailyBudget: 3, monthlyBudget: null };

const widget = (raw: unknown = null, extra: Record<string, unknown> = {}) => {
  const props = { settings: sanitizeWidget(raw), data, status: "idle" as const, variant: "panel" as const, oncustomize: vi.fn(), onmove: vi.fn(), ...extra };
  return { props, ...render(UsageWidget, props) };
};

const only = (...ids: string[]) => ids.map((id) => ({ id, on: true, as: id === "daily" ? "chart" : "number" }));

afterEach(() => vi.restoreAllMocks());

describe("UsageWidget", () => {
  test("shows the chosen readings in their order, with their second lines", () => {
    widget();
    const box = screen.getByRole("region", { name: "Usage widget" });
    const labels = [...box.querySelectorAll("dt")].map((d) => d.textContent?.trim());
    expect(labels).toEqual(["This reply", "Session cost", "5-hour limit", "Weekly limit", "Today"]);
    expect(box.textContent).toContain("46k");
    expect(box.textContent).toContain("4 in, 335 out, 46k cached");
    expect(box.textContent).toContain("No reading yet");
  });

  test("compact leaves out the second lines", () => {
    widget({ size: "compact" });
    expect(screen.getByRole("region", { name: "Usage widget" }).textContent).not.toContain("46k cached");
  });

  test("bar and ring readings draw a meter only when there is something to measure", () => {
    widget({ items: [{ id: "five_hour", on: true, as: "ring" }, { id: "weekly", on: true, as: "bar" }, { id: "today", on: true, as: "bar" }] });
    expect(screen.getByRole("meter", { name: "5-hour limit" }).className).toContain("ring");
    expect(screen.getByRole("meter", { name: "Today" }).getAttribute("aria-valuenow")).toBe("83");
    expect(screen.queryByRole("meter", { name: "Weekly limit" })).toBeNull();
  });

  test("daily spend is drawn as a chart", () => {
    widget({ items: only("daily") });
    expect(screen.getByRole("img", { name: /Daily estimated cost/ })).toBeTruthy();
  });

  test("with every reading off it says what to do", () => {
    widget({ items: [{ id: "reply", on: false, as: "number" }] });
    expect(screen.getByText(/No readings chosen/)).toBeTruthy();
  });

  test.each([["working", "Working"], ["waiting", "Waiting for you"], ["idle", "Idle"]] as const)("status %s is written out", (status, text) => {
    widget(null, { status });
    expect(screen.getByText(text)).toBeTruthy();
  });

  test.each(["panel", "floating", "toolbar"] as const)("the gear opens customization (%s)", async (variant) => {
    const { props } = widget(null, { variant });
    await fireEvent.click(screen.getByRole("button", { name: "Customize the usage widget" }));
    expect(props.oncustomize).toHaveBeenCalledTimes(1);
  });

  test("the toolbar form shows the first three chosen readings, not the chart", () => {
    widget({ items: only("daily", "today", "month", "tokens_today", "session_cost") }, { variant: "toolbar" });
    const box = screen.getByRole("region", { name: "Usage widget" });
    const shown = [...box.querySelectorAll("[data-reading]")].map((e) => e.getAttribute("data-reading"));
    expect(shown).toEqual(["today", "month", "tokens_today"]);
    expect(box.textContent).toContain("This month");
  });

  test("the toolbar form still says when Claude is waiting", () => {
    widget(null, { variant: "toolbar", status: "waiting" });
    expect(screen.getByText("Waiting for you")).toBeTruthy();
  });

  // The narrow-window rules count siblings, so anything else beside the chips would hide a reading.
  test("toolbar readings are grouped on their own, even while waiting", () => {
    const { container } = widget(null, { variant: "toolbar", status: "waiting" });
    const chips = [...container.querySelectorAll("[data-reading]")];
    expect(chips).toHaveLength(3);
    expect([...chips[0].parentElement!.children]).toEqual(chips);
  });

  test("an arrow key moves a floating widget and saves it on release", async () => {
    const { props, container } = widget({ position: "floating", x: 100, y: 100 }, { variant: "floating" });
    const handle = screen.getByRole("button", { name: /Move the usage widget/ });
    const box = container.querySelector<HTMLElement>("section")!;
    await fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(box.style.left).toBe("108px");
    expect(props.onmove).not.toHaveBeenCalled();
    await fireEvent.keyUp(handle, { key: "ArrowRight" });
    expect(props.onmove).toHaveBeenLastCalledWith(108, 100);
  });

  test("Shift moves by one pixel, and the widget stays inside the window", async () => {
    const { props } = widget({ position: "floating", x: 0, y: 100 }, { variant: "floating" });
    const handle = screen.getByRole("button", { name: /Move the usage widget/ });
    await fireEvent.keyDown(handle, { key: "ArrowDown", shiftKey: true });
    await fireEvent.keyDown(handle, { key: "ArrowLeft" });
    await fireEvent.keyUp(handle, { key: "ArrowLeft" });
    expect(props.onmove).toHaveBeenLastCalledWith(0, 101);
  });

  test("other keys move nothing", async () => {
    const { props } = widget({ position: "floating" }, { variant: "floating" });
    const handle = screen.getByRole("button", { name: /Move the usage widget/ });
    await fireEvent.keyDown(handle, { key: "a" });
    await fireEvent.keyUp(handle, { key: "a" });
    expect(props.onmove).not.toHaveBeenCalled();
  });

  test("dragging moves it and saves once, on release", async () => {
    const { props, container } = widget({ position: "floating", x: 100, y: 100 }, { variant: "floating" });
    const handle = screen.getByRole("button", { name: /Move the usage widget/ });
    const at = (type: string, clientX: number, clientY: number) => fireEvent(handle, new MouseEvent(type, { bubbles: true, clientX, clientY, button: 0 }));
    await at("pointerdown", 110, 110);
    await at("pointermove", 160, 130);
    expect(container.querySelector<HTMLElement>("section")!.style.left).toBe("150px");
    expect(props.onmove).not.toHaveBeenCalled();
    await at("pointerup", 160, 130);
    expect(props.onmove).toHaveBeenCalledTimes(1);
    expect(props.onmove).toHaveBeenLastCalledWith(150, 120);
    // This stand-in does not save, so the saved spot shows again; moving without a press changes nothing.
    await at("pointermove", 300, 300);
    expect(container.querySelector<HTMLElement>("section")!.style.left).toBe("100px");
    expect(props.onmove).toHaveBeenCalledTimes(1);
  });

  test("a saved position outside the window is shown inside it, without saving", () => {
    const { props, container } = widget({ position: "floating", x: 9000, y: -50 }, { variant: "floating" });
    const box = container.querySelector<HTMLElement>("section")!;
    expect(parseInt(box.style.left)).toBeLessThanOrEqual(window.innerWidth);
    expect(box.style.top).toBe("0px");
    expect(props.onmove).not.toHaveBeenCalled();
  });

  test("only the floating form can be moved", () => {
    widget(null, { variant: "panel" });
    expect(screen.queryByRole("button", { name: /Move the usage widget/ })).toBeNull();
  });

  test("it never asks for fresh plan limits, which would cost a request", async () => {
    const paid = vi.spyOn(ipc, "refreshLimits");
    const viaStore = vi.spyOn(app, "refreshLimits");
    widget(null, { data: { ...data, limits: null } });
    await fireEvent.click(screen.getByRole("button", { name: "Customize the usage widget" }));
    expect(paid).not.toHaveBeenCalled();
    expect(viaStore).not.toHaveBeenCalled();
  });
});

describe("WidgetCustomize", () => {
  const show = (raw: unknown = null) => {
    const onchange = vi.fn();
    render(WidgetCustomize, { settings: sanitizeWidget(raw), onchange });
    return onchange;
  };
  const sent = (fn: ReturnType<typeof vi.fn>) => fn.mock.lastCall![0];

  test("toggling a reading sends the new settings", async () => {
    const onchange = show();
    await fireEvent.click(screen.getByRole("checkbox", { name: "Tokens today" }));
    expect(sent(onchange).items.find((i: { id: string }) => i.id === "tokens_today").on).toBe(true);
    expect(sent(onchange).items).toHaveLength(9);
  });

  test("readings can be reordered, and the ends cannot move further", async () => {
    const onchange = show();
    await fireEvent.click(screen.getByRole("button", { name: "Move Session cost up" }));
    expect(sent(onchange).items.slice(0, 2).map((i: { id: string }) => i.id)).toEqual(["session_cost", "reply"]);
    expect((screen.getByRole("button", { name: "Move This reply up" }) as HTMLButtonElement).disabled).toBe(true);
  });

  test("only readings with a choice offer one", async () => {
    const onchange = show();
    expect(screen.queryByRole("combobox", { name: "Show This reply as" })).toBeNull();
    const select = screen.getByRole("combobox", { name: "Show 5-hour limit as" }) as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(["bar", "ring", "number"]);
    await fireEvent.change(select, { target: { value: "ring" } });
    expect(sent(onchange).items.find((i: { id: string }) => i.id === "five_hour").as).toBe("ring");
  });

  test("size and position can be chosen", async () => {
    const onchange = show();
    await fireEvent.click(screen.getByRole("tab", { name: "Large" }));
    expect(sent(onchange).size).toBe("large");
    await fireEvent.change(screen.getByRole("combobox", { name: "Position" }), { target: { value: "floating" } });
    expect(sent(onchange).position).toBe("floating");
  });
});

describe("Settings > Usage widget", () => {
  test("holds the same controls and saves usage_widget", async () => {
    const onsave = vi.fn();
    render(SettingsPage, { config: { ...JSON.parse(JSON.stringify(app.config)), settings_category: "widget" }, onsave, onback: vi.fn() });
    expect(screen.getByRole("heading", { name: "Usage widget" })).toBeTruthy();
    await fireEvent.click(screen.getByRole("checkbox", { name: "This reply" }));
    const patch = onsave.mock.lastCall![0];
    expect(patch.usage_widget.items.find((i: { id: string }) => i.id === "reply").on).toBe(false);
  });
});
