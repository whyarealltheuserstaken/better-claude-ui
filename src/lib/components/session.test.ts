import { fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, test, vi } from "vitest";
import { activityFrom } from "../activity";
import { capsFor } from "../tier";
import type { ChatItem, PendingPermission } from "../types";
import MessageList from "./MessageList.svelte";
import SessionControls from "./SessionControls.svelte";

const tool = (id: string, status: "running" | "done" | "error" = "done"): ChatItem => ({ kind: "tool", id, name: "Bash", input: { command: id }, output: null, status, nested: false });
const ask = (toolUseId: string): PendingPermission => ({ session_id: "s", request_id: "r", tool: "Bash", input: {}, description: "", tool_use_id: toolUseId });

describe("activityFrom", () => {
  test("keeps transcript order and marks the tool that is waiting", () => {
    const items: ChatItem[] = [tool("a"), { kind: "user", id: "u", text: "hi" }, tool("b", "running"), tool("c", "error")];
    expect(activityFrom(items, [ask("b")]).map((a) => [a.id, a.status])).toEqual([["a", "done"], ["b", "waiting"], ["c", "error"]]);
    expect(activityFrom(items, [])[0].summary).toMatch(/Run a/);
  });

  test("a conversation without tools has no activity", () => {
    expect(activityFrom([{ kind: "user", id: "u", text: "hi" }], [])).toEqual([]);
  });
});

const controls = (extra: Record<string, unknown> = {}) => ({
  variant: "panel" as const, caps: capsFor("advanced"), model: null, permissionMode: null, chat: false, effort: null, webSearch: false,
  onmodel: vi.fn(), onmode: vi.fn(), oneffort: vi.fn(), onweb: vi.fn(), ...extra,
});

describe("SessionControls", () => {
  afterEach(() => vi.unstubAllGlobals());

  test.each(["panel", "composer"] as const)("Beginner gets no pickers in the %s", (variant) => {
    render(SessionControls, controls({ variant, caps: capsFor("beginner") }));
    expect(screen.queryByRole("button", { name: /^(Model|Thinking|Permissions):/ })).toBeNull();
  });

  test("bypass asks first and does nothing when refused", async () => {
    const confirmed = vi.fn(() => false);
    vi.stubGlobal("confirm", confirmed);
    const p = controls();
    render(SessionControls, p);
    await fireEvent.click(screen.getByRole("button", { name: /^Permissions:/ }));
    await fireEvent.click(screen.getByRole("option", { name: /Bypass all/ }));
    expect(confirmed).toHaveBeenCalled();
    expect(p.onmode).not.toHaveBeenCalled();
  });

  test("Chat offers web search instead of permissions", () => {
    render(SessionControls, controls({ chat: true }));
    expect(screen.getByRole("checkbox", { name: "Web search" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Permissions:/ })).toBeNull();
  });
});

describe("MessageList.jumpTo", () => {
  test("loads an older message that was not rendered", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    const items: ChatItem[] = Array.from({ length: 12 }, (_, i) => ({ kind: "user", id: `u${i}`, text: `message ${i}` }));
    const { component, container } = render(MessageList, { items, pageSize: 5 });
    expect(container.querySelector('[data-item="u1"]')).toBeNull();
    await component.jumpTo("u1");
    expect(container.querySelector('[data-item="u1"]')).not.toBeNull();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });
});
