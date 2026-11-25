import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, test, vi } from "vitest";
import Composer from "./Composer.svelte";
import MessageList from "./MessageList.svelte";
import PermissionPrompt from "./PermissionPrompt.svelte";
import ToolCard from "./ToolCard.svelte";
import type { ChatItem } from "../types";

const tool = (output: string | null): Extract<ChatItem, { kind: "tool" }> => ({
  kind: "tool", id: "t1", name: "Bash", input: { command: "ls" }, output, status: "done", nested: false,
});

describe("ToolCard", () => {
  test("is collapsed by default and expands on click", async () => {
    render(ToolCard, { item: tool("hello") });
    expect(screen.queryByText("hello")).toBeNull();
    await fireEvent.click(screen.getByRole("button", { name: /Run ls/ }));
    expect(screen.getByText("hello")).toBeTruthy();
  });

  test("long output is truncated at 200 lines with a show-all control", async () => {
    const out = Array.from({ length: 500 }, (_, i) => `line${i}`).join("\n");
    render(ToolCard, { item: tool(out) });
    await fireEvent.click(screen.getByRole("button", { name: /Run ls/ }));
    expect(screen.queryByText(/line499/)).toBeNull();
    await fireEvent.click(screen.getByText("Show all 500 lines"));
    expect(screen.getByText(/line499/)).toBeTruthy();
  });
});

describe("PermissionPrompt", () => {
  const request = { session_id: "s", request_id: "r1", tool: "Write", input: { file_path: "C:\\w\\a.txt" }, description: "a.txt", tool_use_id: "t" };

  test("explains what will happen and offers three choices", () => {
    render(PermissionPrompt, { request, onresolve: () => {} });
    expect(screen.getByText("Create a.txt?")).toBeTruthy();
    expect(screen.getByText(/changes a file/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Allow" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Always allow Write/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Deny" })).toBeTruthy();
  });

  test.each([["Allow", "allow"], ["Deny", "deny"]])("clicking %s resolves with %s", async (label, decision) => {
    const onresolve = vi.fn();
    render(PermissionPrompt, { request, onresolve });
    await fireEvent.click(screen.getByRole("button", { name: label }));
    expect(onresolve).toHaveBeenCalledWith("r1", decision);
  });
});

describe("Composer", () => {
  test("Enter sends, Shift+Enter does not", async () => {
    const onsend = vi.fn();
    render(Composer, { status: "idle", onsend, oninterrupt: () => {} });
    const box = screen.getByLabelText("Message");
    await fireEvent.input(box, { target: { value: "hi" } });
    await fireEvent.keyDown(box, { key: "Enter", shiftKey: true });
    expect(onsend).not.toHaveBeenCalled();
    await fireEvent.keyDown(box, { key: "Enter" });
    expect(onsend).toHaveBeenCalledWith("hi", []);
  });

  test("is disabled once the session has exited", () => {
    render(Composer, { status: "exited", onsend: () => {}, oninterrupt: () => {} });
    expect((screen.getByLabelText("Message") as HTMLTextAreaElement).disabled).toBe(true);
  });

  test("Escape interrupts a running turn", async () => {
    const oninterrupt = vi.fn();
    render(Composer, { status: "running", onsend: () => {}, oninterrupt });
    await fireEvent.keyDown(screen.getByLabelText("Message"), { key: "Escape" });
    expect(oninterrupt).toHaveBeenCalled();
  });
});

describe("MessageList", () => {
  test("renders only a recent window of a huge transcript", () => {
    const items: ChatItem[] = Array.from({ length: 10000 }, (_, i) => ({ kind: "user", id: `i${i}`, text: `m${i}` }));
    const { container } = render(MessageList, { items });
    expect(container.querySelectorAll(".user").length).toBeLessThanOrEqual(150);
    expect(screen.getByText(/earlier messages/)).toBeTruthy();
    expect(screen.getByText("m9999")).toBeTruthy();
  });
});
