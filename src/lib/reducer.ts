import type { ChatItem, CliEvent, SessionEvent, SessionState, TokenSplit } from "./types";

const RAW_CAP = 1000;

export function initialState(): SessionState {
  return { items: [], status: "idle", cliSessionId: null, model: null, cwd: null, pending: [], caps: null, info: null, costUsd: 0, reply: null, modelTotals: null, raw: [], nextId: 1 };
}

function pushItem(s: SessionState, make: (id: string) => ChatItem): SessionState {
  const id = `i${s.nextId}`;
  return { ...s, items: [...s.items, make(id)], nextId: s.nextId + 1 };
}

function lastStreaming(s: SessionState): number {
  const i = s.items.length - 1;
  const it = s.items[i];
  return it && it.kind === "assistant" && it.streaming ? i : -1;
}

function replaceAt(s: SessionState, i: number, item: ChatItem): SessionState {
  const items = s.items.slice();
  items[i] = item;
  return { ...s, items };
}

const ZERO: TokenSplit = { input: 0, output: 0, cache_read: 0, cache_write: 0 };
const KEYS = Object.keys(ZERO) as (keyof TokenSplit)[];

const count = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);
const combine = (a: TokenSplit, b: TokenSplit, f: (x: number, y: number) => number): TokenSplit =>
  Object.fromEntries(KEYS.map((k) => [k, f(count(a[k]), count(b[k]))])) as TokenSplit;
const add = (a: TokenSplit, b: TokenSplit) => combine(a, b, (x, y) => x + y);

function onStep(s: SessionState, e: Extract<CliEvent, { kind: "step_usage" }>): SessionState {
  const key = e.parent_tool_use_id ?? "";
  const reply = s.reply ?? { done: ZERO, open: {} };
  const before = reply.open[key];
  const now = combine(ZERO, e, (_, y) => y);
  // A start closes this agent's previous step. Later reports repeat running totals, so keep the larger.
  const done = e.start && before ? add(reply.done, before) : reply.done;
  const step = !e.start && before ? combine(before, now, Math.max) : now;
  return { ...s, reply: { done, open: { ...reply.open, [key]: step } } };
}

/** The finished reply from the result's per-model totals, which also cover helpers that stream no counts. */
function onResultTotals(s: SessionState, models: TokenSplit[] | undefined): SessionState {
  if (!models || models.length === 0) return s;
  const total = models.reduce<TokenSplit>(add, ZERO);
  const last = s.modelTotals;
  // Totals only grow within one process; if any shrank, a new process is counting from zero.
  const from = last && KEYS.every((k) => total[k] >= last[k]) ? last : ZERO;
  const used = combine(total, from, (x, y) => x - y);
  const any = KEYS.some((k) => used[k] > 0);
  return { ...s, modelTotals: total, reply: any ? { done: used, open: {} } : s.reply };
}

/** Tokens used by the current (or just finished) reply, or null before anything was reported. */
export function replyTokens(s: SessionState): TokenSplit | null {
  return s.reply ? Object.values(s.reply.open).reduce(add, s.reply.done) : null;
}

function onCli(s: SessionState, e: CliEvent): SessionState {
  switch (e.kind) {
    case "session_init":
      return { ...s, cliSessionId: e.session_id, model: e.model, cwd: e.cwd, caps: e.caps ?? s.caps };
    case "initialized":
      return { ...s, info: e.info };
    case "step_usage":
      return onStep(s, e);
    case "text_delta": {
      const i = lastStreaming(s);
      if (i >= 0) {
        const it = s.items[i] as Extract<ChatItem, { kind: "assistant" }>;
        return replaceAt(s, i, { ...it, text: it.text + e.text });
      }
      return pushItem(s, (id) => ({ kind: "assistant", id, text: e.text, streaming: true, nested: e.parent_tool_use_id !== null }));
    }
    case "assistant_message": {
      let st = s;
      const nested = e.parent_tool_use_id !== null;
      for (const b of e.blocks) {
        if (b.kind === "text") {
          const i = lastStreaming(st);
          if (i >= 0) {
            const it = st.items[i] as Extract<ChatItem, { kind: "assistant" }>;
            st = replaceAt(st, i, { ...it, text: b.text, streaming: false });
          } else {
            st = pushItem(st, (id) => ({ kind: "assistant", id, text: b.text, streaming: false, nested }));
          }
        } else if (b.kind === "tool_use") {
          if (!st.items.some((it) => it.kind === "tool" && it.id === b.id)) {
            st = {
              ...st,
              items: [...st.items, { kind: "tool", id: b.id, name: b.name, input: b.input, output: null, status: "running", nested }],
            };
          }
        }
      }
      return st;
    }
    case "tool_result": {
      const items = s.items.map((it) =>
        it.kind === "tool" && it.id === e.tool_use_id
          ? { ...it, output: e.output, status: (e.is_error ? "error" : "done") as "error" | "done" }
          : it,
      );
      return { ...s, items, pending: s.pending.filter((p) => p.tool_use_id !== e.tool_use_id) };
    }
    case "permission_request":
      return {
        ...s,
        pending: [
          ...s.pending,
          {
            session_id: "",
            request_id: e.request_id,
            tool: e.tool,
            input: e.input,
            description: e.description,
            tool_use_id: e.tool_use_id,
          },
        ],
      };
    case "permission_denied":
      return pushItem(s, (id) => ({ kind: "notice", id, level: "info", text: `Blocked ${e.tool}: ${e.message}` }));
    case "turn_result": {
      let st: SessionState = onResultTotals({ ...s, status: "idle", costUsd: e.cost_usd ?? s.costUsd }, e.models);
      if (e.is_error) st = pushItem(st, (id) => ({ kind: "notice", id, level: "error", text: e.result || "The request failed." }));
      return st;
    }
    default:
      return s;
  }
}

export function reduce(state: SessionState, event: SessionEvent): SessionState {
  let s: SessionState = { ...state, raw: [...state.raw, event].slice(-RAW_CAP) };
  switch (event.type) {
    case "cli":
      return onCli(s, event.event);
    case "error":
      return pushItem(s, (id) => ({ kind: "notice", id, level: "error", text: event.message }));
    case "exited": {
      s = { ...s, status: "exited" };
      if (event.code !== 0) {
        s = pushItem(s, (id) => ({
          kind: "notice",
          id,
          level: "error",
          text: event.code === null ? "The Claude process ended unexpectedly." : `The Claude process exited with code ${event.code}.`,
        }));
      }
      return s;
    }
    default:
      return s;
  }
}

export function addUserMessage(state: SessionState, text: string, attachments?: { name: string; kind: string }[]): SessionState {
  const s = pushItem(state, (id) => ({ kind: "user", id, text, ...(attachments && attachments.length > 0 ? { attachments } : {}) }));
  return { ...s, status: "running", reply: null };
}

export function removePending(state: SessionState, requestId: string): SessionState {
  return { ...state, pending: state.pending.filter((p) => p.request_id !== requestId) };
}

/** Load a saved transcript into a fresh state (tools that were mid-flight are marked done). */
export function restoreItems(state: SessionState, items: ChatItem[]): SessionState {
  const clean = items.map((it) =>
    it.kind === "tool" && it.status === "running" ? { ...it, status: "done" as const } : it.kind === "assistant" ? { ...it, streaming: false } : it,
  );
  const max = clean.reduce((m, it) => Math.max(m, Number(/^i(\d+)$/.exec(it.id)?.[1] ?? 0)), 0);
  return { ...state, items: clean, nextId: max + 1 };
}
