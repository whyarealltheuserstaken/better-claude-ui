import { describe, expect, test } from "vitest";
import { READING_IDS } from "./config";
import { type WidgetData, readingFor } from "./readings";
import type { Totals, UsageSummary } from "../types";

const NOW = 1_795_700_000_000;
const totals = (cost_usd: number): Totals => ({ cost_usd, input: 100, output: 200, cache_read: 3000, cache_write: 400, turns: 1 });
const usage: UsageSummary = { today: totals(2.5), week: totals(5), month: totals(54), all: totals(80), by_model: [], by_project: [], daily: [{ date: "2026-11-25", cost_usd: 1, tokens: 10 }, { date: "2026-11-26", cost_usd: 2.4, tokens: 20 }], days: 30 };
const limits = { captured_at: NOW - 60_000, status: "allowed", using_overage: false, windows: [{ name: "five_hour", utilization: 0.85, resets_at: NOW / 1000 + 5400, status: "allowed" }, { name: "seven_day", utilization: 0.31, resets_at: NOW / 1000 - 10, status: "allowed" }] };
const split = { input: 4, output: 335, cache_read: 37621, cache_write: 8126 };
const full: WidgetData = { reply: split, session: split, sessionCost: 0.42, hasSession: true, usage, limits, dailyBudget: 3, monthlyBudget: 60 };
const empty: WidgetData = { reply: null, session: null, sessionCost: null, hasSession: false, usage: null, limits: null, dailyBudget: null, monthlyBudget: null };
const read = (id: (typeof READING_IDS)[number], data: WidgetData = full) => readingFor(id, data, NOW);

describe("widget readings", () => {
  test("tokens include cache, and the second line shows the split", () => {
    const r = read("reply");
    expect(r.value).toBe("46k");
    expect(r.sub).toBe("4 in, 335 out, 46k cached");
    expect(r.percent).toBeNull();
  });

  test("session readings say when there is no session or nothing yet", () => {
    for (const id of ["reply", "session_tokens", "session_cost"] as const) expect(read(id, empty).value, id).toBe("No session");
    const fresh = { ...empty, hasSession: true };
    expect(read("reply", fresh).value).toBe("None yet");
    expect(read("session_cost", fresh).value).toBe("None yet");
  });

  test("session cost is labelled as an estimate from the last finished reply", () => {
    expect(read("session_cost")).toMatchObject({ value: "$0.42", sub: "Estimate, as of the last finished reply" });
  });

  test("a limit shows its percentage, reset time and age, and warns near the top", () => {
    const r = read("five_hour");
    expect(r).toMatchObject({ value: "85%", percent: 85, warn: true });
    expect(r.sub).toBe("Resets in 1h 30m, as of 1 min ago");
  });

  test("a window that has reset says so instead of showing the old number", () => {
    const r = read("weekly");
    expect(r.percent).toBeNull();
    expect(r.value).toBe("Reset");
    expect(r.sub).toContain("reset since the last reading");
    expect(r.warn).toBe(false);
  });

  test("no limit data says there is no reading", () => {
    expect(read("five_hour", empty)).toMatchObject({ value: "No reading yet", percent: null, warn: false });
    expect(read("weekly", { ...full, limits: { ...limits, windows: [] } }).value).toBe("No reading yet");
  });

  test("spend is measured against its budget", () => {
    expect(read("today")).toMatchObject({ value: "$2.50", percent: 83, sub: "of $3.00", warn: true });
    expect(read("month")).toMatchObject({ value: "$54.00", percent: 90, sub: "of $60.00", warn: true });
    expect(read("today", { ...full, dailyBudget: 30 }).warn).toBe(false);
  });

  test("with no budget the amount stands alone", () => {
    expect(read("today", { ...full, dailyBudget: null })).toMatchObject({ value: "$2.50", percent: null, sub: "No budget set", warn: false });
  });

  test("tokens today and daily spend come from the ledger", () => {
    expect(read("tokens_today")).toMatchObject({ value: "3.7k", sub: "100 in, 200 out, 3.4k cached" });
    expect(read("daily")).toMatchObject({ value: "$3.40", sub: "Last 30 days" });
    expect(read("today", empty).value).toBe("No data yet");
  });

  test("nothing ever reads NaN, even from broken numbers", () => {
    const broken: WidgetData = {
      ...full,
      reply: { input: NaN, output: undefined as unknown as number, cache_read: -1, cache_write: Infinity },
      sessionCost: NaN,
      usage: { ...usage, today: {} as Totals, daily: [{ date: "x", cost_usd: NaN, tokens: NaN }] },
      limits: { ...limits, captured_at: NaN, windows: [{ name: "five_hour", utilization: NaN, resets_at: null, status: "" }] },
      dailyBudget: NaN,
    };
    for (const data of [full, empty, broken, { ...empty, hasSession: true }]) {
      for (const id of READING_IDS) {
        const r = read(id, data);
        expect(`${r.label}|${r.value}|${r.sub}|${r.percent}`, id).not.toMatch(/NaN|Infinity|undefined/);
      }
    }
  });
});
