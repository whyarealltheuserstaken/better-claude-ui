import { describe, expect, test } from "vitest";
import { PANEL_DOCK_MIN_WIDTH, panelState, waitingModes, waitingOutOfSight } from "./shell";
import { initialState } from "./reducer";
import type { SessionState } from "./types";

describe("a request that cannot be seen", () => {
  const asking: SessionState = { ...initialState(), pending: [{ session_id: "s", request_id: "r", tool: "Write", input: {}, description: "", tool_use_id: "t" }] };
  const states = { a: asking, b: initialState() };

  test("with the sidebar hidden, a request elsewhere must be marked on the sidebar button", () => {
    expect(waitingOutOfSight(true, "home", "a", states)).toBe(true);
    expect(waitingOutOfSight(true, "session", "b", states)).toBe(true);
  });

  test("no mark when the prompt or the sidebar badge is on screen, or nothing waits", () => {
    expect(waitingOutOfSight(true, "session", "a", states)).toBe(false);
    expect(waitingOutOfSight(false, "home", "a", states)).toBe(false);
    expect(waitingOutOfSight(true, "home", "b", { b: initialState() })).toBe(false);
  });
});

describe("panelState", () => {
  const wide = PANEL_DOCK_MIN_WIDTH;
  const narrow = PANEL_DOCK_MIN_WIDTH - 1;
  test.each([
    [wide, false, "session", false, "docked"],
    [wide, true, "session", false, "closed"],
    [narrow, false, "session", false, "closed"],
    [narrow, false, "session", true, "overlay"],
    [wide, false, "home", false, "closed"],
    [narrow, false, "usage", true, "closed"],
  ])("width %i hidden %s on %s overlay %s is %s", (w, hidden, view, overlay, expected) => {
    expect(panelState(w, hidden, view, overlay)).toBe(expected);
  });
});

describe("waitingModes", () => {
  test("lists each mode that has a session waiting for permission", () => {
    const waiting: SessionState = { ...initialState(), pending: [{ session_id: "a", request_id: "r", tool: "Write", input: {}, description: "", tool_use_id: "t" }] };
    const modes = waitingModes([{ id: "a", mode: "code" }, { id: "b", mode: "chat" }], { a: waiting, b: initialState() });
    expect([...modes]).toEqual(["code"]);
  });
});
