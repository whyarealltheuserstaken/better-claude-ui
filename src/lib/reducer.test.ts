import { describe, expect, test } from "vitest";
import { addUserMessage, initialState, reduce, removePending, replyTokens } from "./reducer";
import type { CliEvent, SessionEvent, SessionState } from "./types";

const cli = (event: CliEvent): SessionEvent => ({ type: "cli", event });
const run = (events: SessionEvent[], s: SessionState = initialState()) => events.reduce(reduce, s);
const delta = (text: string, parent: string | null = null) => cli({ kind: "text_delta", text, parent_tool_use_id: parent });

describe("reduce", () => {
  test("text deltas accumulate into one streaming assistant message", () => {
    const s = run([delta("po"), delta("ng")]);
    expect(s.items).toHaveLength(1);
    expect(s.items[0]).toMatchObject({ kind: "assistant", text: "pong", streaming: true });
  });

  test("final assistant message replaces streamed text instead of duplicating it", () => {
    const s = run([
      delta("pong"),
      cli({ kind: "assistant_message", blocks: [{ kind: "text", text: "pong" }], parent_tool_use_id: null }),
    ]);
    expect(s.items).toHaveLength(1);
    expect(s.items[0]).toMatchObject({ kind: "assistant", text: "pong", streaming: false });
  });

  test("text after a finished message starts a new message", () => {
    const s = run([
      delta("a"),
      cli({ kind: "assistant_message", blocks: [{ kind: "text", text: "a" }], parent_tool_use_id: null }),
      delta("b"),
    ]);
    expect(s.items.map((i) => (i.kind === "assistant" ? i.text : "?"))).toEqual(["a", "b"]);
  });

  test("tool_use then tool_result links by id and sets status", () => {
    const s = run([
      cli({ kind: "assistant_message", blocks: [{ kind: "tool_use", id: "t1", name: "Write", input: { file_path: "a" } }], parent_tool_use_id: null }),
      cli({ kind: "tool_result", tool_use_id: "t1", output: "ok", is_error: false, parent_tool_use_id: null }),
    ]);
    expect(s.items).toHaveLength(1);
    expect(s.items[0]).toMatchObject({ kind: "tool", id: "t1", status: "done", output: "ok" });
  });

  test("error tool_result marks tool as error", () => {
    const s = run([
      cli({ kind: "assistant_message", blocks: [{ kind: "tool_use", id: "t1", name: "Bash", input: {} }], parent_tool_use_id: null }),
      cli({ kind: "tool_result", tool_use_id: "t1", output: "boom", is_error: true, parent_tool_use_id: null }),
    ]);
    expect(s.items[0]).toMatchObject({ status: "error", output: "boom" });
  });

  test("subagent output is flagged nested", () => {
    const s = run([delta("hi", "parent-1")]);
    expect(s.items[0]).toMatchObject({ kind: "assistant", nested: true });
  });

  test("permission request becomes pending and clears when its tool_result arrives", () => {
    let s = run([
      { type: "cli", event: { kind: "permission_request", request_id: "r1", tool: "Write", input: {}, description: "a", tool_use_id: "t1" } },
    ]);
    expect(s.pending).toHaveLength(1);
    s = run([cli({ kind: "tool_result", tool_use_id: "t1", output: "ok", is_error: false, parent_tool_use_id: null })], s);
    expect(s.pending).toHaveLength(0);
  });

  test("removePending drops a request by id", () => {
    const s0 = run([cli({ kind: "permission_request", request_id: "r1", tool: "Write", input: {}, description: "", tool_use_id: "t1" })]);
    expect(removePending(s0, "r1").pending).toHaveLength(0);
  });

  test("turn_result returns to idle; error results add an error notice", () => {
    const ok = run([cli({ kind: "turn_result", is_error: false, result: "x", cost_usd: 0.1, session_id: "s" })], { ...initialState(), status: "running" });
    expect(ok.status).toBe("idle");
    expect(ok.items).toHaveLength(0);
    const bad = run([cli({ kind: "turn_result", is_error: true, result: "bad model", cost_usd: 0, session_id: "s" })]);
    expect(bad.items[0]).toMatchObject({ kind: "notice", level: "error", text: "bad model" });
  });

  test("exited sets status exited and adds a notice when the code is nonzero", () => {
    const s = run([{ type: "exited", code: 1 }]);
    expect(s.status).toBe("exited");
    expect(s.items[0]).toMatchObject({ kind: "notice", level: "error" });
    expect(run([{ type: "exited", code: 0 }]).items).toHaveLength(0);
  });

  test("unknown and info events are kept in raw log, never thrown", () => {
    const s = run([cli({ kind: "unknown", raw: { x: 1 } }), cli({ kind: "info", subtype: "hook_started" })]);
    expect(s.raw).toHaveLength(2);
    expect(s.items).toHaveLength(0);
  });

  test("raw log is capped", () => {
    const events = Array.from({ length: 1200 }, () => cli({ kind: "info", subtype: "x" }));
    expect(run(events).raw.length).toBeLessThanOrEqual(1000);
  });

  test("session_init records ids", () => {
    const s = run([cli({ kind: "session_init", session_id: "abc", model: "m", cwd: "/w" })]);
    expect(s).toMatchObject({ cliSessionId: "abc", model: "m", cwd: "/w" });
  });

  test("addUserMessage appends and sets running", () => {
    const s = addUserMessage(initialState(), "hello");
    expect(s.items[0]).toMatchObject({ kind: "user", text: "hello" });
    expect(s.status).toBe("running");
  });
});

describe("restoreItems", () => {
  test("keeps ids unique for new items and settles in-flight work", async () => {
    const { restoreItems, initialState, addUserMessage } = await import("./reducer");
    let s = restoreItems(initialState(), [
      { kind: "user", id: "i1", text: "hi" },
      { kind: "assistant", id: "i2", text: "yo", streaming: true, nested: false },
      { kind: "tool", id: "t9", name: "Bash", input: {}, output: null, status: "running", nested: false },
    ]);
    expect((s.items[1] as { streaming: boolean }).streaming).toBe(false);
    expect((s.items[2] as { status: string }).status).toBe("done");
    s = addUserMessage(s, "next");
    expect(new Set(s.items.map((i) => i.id)).size).toBe(4);
  });
});

describe("initialized", () => {
  test("stores commands, agents and models from the initialize reply", () => {
    const info = { commands: [{ name: "review", description: "Review" }], agents: [], models: [{ value: "opus", display_name: "Opus", description: "" }], output_styles: ["default"], version: "2.1.0" };
    const s = reduce(initialState(), { type: "cli", event: { kind: "initialized", info } });
    expect(s.info?.commands[0].name).toBe("review");
    expect(s.info?.models[0].value).toBe("opus");
    expect(s.items).toHaveLength(0);
  });
});

describe("token counting", () => {
  type Counts = [input: number, output: number, cacheRead: number, cacheWrite: number];
  const step = (start: boolean, [input, output, cache_read, cache_write]: Counts, parent: string | null = null) =>
    cli({ kind: "step_usage", start, input, output, cache_read, cache_write, parent_tool_use_id: parent });
  const split = ([input, output, cache_read, cache_write]: Counts) => ({ input, output, cache_read, cache_write });
  const result = (...models: Counts[]) =>
    cli({ kind: "turn_result", is_error: false, result: "", cost_usd: null, session_id: "x", models: models.map((m, i) => ({ model: `m${i}`, ...split(m), web_searches: 0, cost_usd: 0 })) });
  // The recorded run (src-tauri/tests/fixtures/usage_subagent.jsonl).
  const recorded = [step(true, [2, 4, 15027, 7567]), step(false, [2, 291, 15027, 7567]), step(true, [2, 8, 22594, 559]), step(false, [2, 44, 22594, 559])];

  test("nothing is shown before the first report", () => {
    expect(replyTokens(initialState())).toBeNull();
  });

  test("a step's later report replaces its counts instead of adding to them", () => {
    expect(replyTokens(run(recorded.slice(0, 2)))).toEqual(split([2, 291, 15027, 7567]));
  });

  test("two steps add up", () => {
    expect(replyTokens(run(recorded))).toEqual(split([4, 335, 37621, 8126]));
  });

  test("a later report with a missing field does not erase what is known", () => {
    expect(replyTokens(run([step(true, [2, 4, 100, 50]), step(false, [0, 9, 0, 0])]))).toEqual(split([2, 9, 100, 50]));
  });

  test("interleaved helper and main steps are both counted", () => {
    const s = run([step(true, [1, 1, 0, 0]), step(true, [10, 1, 0, 0], "t1"), step(false, [1, 5, 0, 0]), step(false, [10, 7, 0, 0], "t1"), step(true, [20, 2, 0, 0], "t1")]);
    expect(replyTokens(s)).toEqual(split([31, 14, 0, 0]));
  });

  test("a finished reply uses the result totals, which include helpers that streamed nothing", () => {
    const s = run([...recorded, result([6, 339, 37621, 25228])]);
    expect(replyTokens(s)).toEqual(split([6, 339, 37621, 25228]));
  });

  test("result totals are cumulative: the next reply counts only what is new, across models", () => {
    let s = run([...recorded, result([6, 339, 37621, 25228])]);
    s = addUserMessage(s, "again");
    expect(replyTokens(s)).toBeNull();
    s = run([result([8, 400, 40000, 25300], [1, 2, 3, 4])], s);
    expect(replyTokens(s)).toEqual(split([3, 63, 2382, 76]));
  });

  test("a result without model totals keeps the live count", () => {
    expect(replyTokens(run([...recorded, result()]))).toEqual(split([4, 335, 37621, 8126]));
  });

  test("totals that go backwards never produce a negative or broken count", () => {
    let s = run([result([100, 100, 100, 100])]);
    s = run([result([5, 5, 5, 5])], addUserMessage(s, "after a restart"));
    expect(replyTokens(s)).toEqual(split([5, 5, 5, 5]));
  });
});
