/** What each widget reading says. Pure; it never invents a value it was not given. */
import { budgetState, fmtReset, fmtTokens, fmtUsd } from "../format";
import { asOfLabel, windowHasReset } from "../limits";
import type { LimitsSnapshot, TokenSplit, Totals, UsageSummary } from "../types";
import type { ReadingId } from "./config";

export interface WidgetData {
  reply: TokenSplit | null;
  session: TokenSplit | null;
  sessionCost: number | null;
  hasSession: boolean;
  usage: UsageSummary | null;
  limits: LimitsSnapshot | null;
  dailyBudget: number | null;
  monthlyBudget: number | null;
}

export interface Reading {
  label: string;
  value: string;
  /** 0 and up, for bars and rings; null when there is nothing to measure against. */
  percent: number | null;
  sub: string;
  warn: boolean;
}

const LABELS: Record<ReadingId, string> = {
  reply: "This reply",
  session_tokens: "Session tokens",
  session_cost: "Session cost",
  five_hour: "5-hour limit",
  weekly: "Weekly limit",
  today: "Today",
  month: "This month",
  tokens_today: "Tokens today",
  daily: "Daily spend",
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);

const plain = (id: ReadingId, value: string, sub = ""): Reading => ({ label: LABELS[id], value, percent: null, sub, warn: false });

/** "Tokens" counts cache too, as Home and Usage do; the second line shows the split. */
function tokens(id: ReadingId, t: TokenSplit | Totals): Reading {
  const cached = num(t.cache_read) + num(t.cache_write);
  const total = num(t.input) + num(t.output) + cached;
  return plain(id, fmtTokens(total), `${fmtTokens(num(t.input))} in, ${fmtTokens(num(t.output))} out, ${fmtTokens(cached)} cached`);
}

function limit(id: ReadingId, name: string, limits: LimitsSnapshot | null, now: number): Reading {
  const w = limits?.windows.find((x) => x.name === name);
  if (!limits || !w || !Number.isFinite(w.utilization)) return plain(id, "No reading yet");
  const asOf = Number.isFinite(limits.captured_at) ? `as of ${asOfLabel(limits.captured_at, now)}` : "age unknown";
  if (windowHasReset(w.resets_at, now)) return plain(id, "Reset", "This window has reset since the last reading");
  const percent = Math.round(num(w.utilization) * 100);
  const resets = w.resets_at === null ? "" : `Resets ${fmtReset(w.resets_at, now)}, `;
  const sub = resets ? resets + asOf : asOf.charAt(0).toUpperCase() + asOf.slice(1);
  return { label: LABELS[id], value: `${percent}%`, percent, sub, warn: w.utilization >= 0.8 };
}

function spend(id: ReadingId, totals: Totals | undefined, budget: number | null): Reading {
  if (!totals) return plain(id, "No data yet");
  const spent = num(totals.cost_usd);
  const state = budgetState(spent, num(budget) || null);
  if (state.level === "none") return plain(id, fmtUsd(spent), "No budget set");
  return {
    label: LABELS[id],
    value: fmtUsd(spent),
    percent: Math.min(999, Math.round(state.fraction * 100)),
    sub: `of ${fmtUsd(num(budget))}`,
    warn: state.level !== "ok",
  };
}

export function readingFor(id: ReadingId, data: WidgetData, now: number): Reading {
  switch (id) {
    case "reply":
    case "session_tokens": {
      if (!data.hasSession) return plain(id, "No session");
      const t = id === "reply" ? data.reply : data.session;
      return t ? tokens(id, t) : plain(id, "None yet");
    }
    case "session_cost":
      if (!data.hasSession) return plain(id, "No session");
      return data.sessionCost === null || !Number.isFinite(data.sessionCost) ? plain(id, "None yet") : plain(id, fmtUsd(data.sessionCost), "Estimate, as of the last finished reply");
    case "five_hour":
      return limit(id, "five_hour", data.limits, now);
    case "weekly":
      return limit(id, "seven_day", data.limits, now);
    case "today":
      return spend(id, data.usage?.today, data.dailyBudget);
    case "month":
      return spend(id, data.usage?.month, data.monthlyBudget);
    case "tokens_today":
      return data.usage ? tokens(id, data.usage.today) : plain(id, "No data yet");
    case "daily":
      return data.usage ? plain(id, fmtUsd(data.usage.daily.reduce((n, d) => n + num(d.cost_usd), 0)), `Last ${num(data.usage.days)} days`) : plain(id, "No data yet");
  }
}
