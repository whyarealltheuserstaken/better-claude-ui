import { describe, expect, test } from "vitest";
import { PANEL_DOCK_MIN_WIDTH, panelState, waitingModes } from "./shell";
import { initialState } from "./reducer";
import type { SessionState } from "./types";

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
