import { describe, expect, test } from "vitest";
import { exportMarkdown, itemText } from "./export";
import type { ChatItem } from "./types";

const items: ChatItem[] = [
  { kind: "user", id: "1", text: "Make a file", attachments: [{ name: "spec.txt", kind: "text" }] },
  { kind: "assistant", id: "2", text: "Sure.", streaming: false, nested: false },
  { kind: "tool", id: "t", name: "Write", input: { file_path: "C:\\p\\notes.txt" }, output: "ok", status: "done", nested: false },
  { kind: "assistant", id: "3", text: "helper note", streaming: false, nested: true },
  { kind: "notice", id: "4", level: "error", text: "Oops" },
];

describe("exportMarkdown", () => {
  const md = exportMarkdown("My chat", items);
  test("has a title, your message and replies", () => {
    expect(md.startsWith("# My chat\n")).toBe(true);
    expect(md).toContain("## You\n\nMake a file");
    expect(md).toContain("_Attached: spec.txt_");
    expect(md).toContain("Sure.");
  });
  test("tool actions are one readable line each", () => {
    expect(md).toContain("- Create notes.txt (done)");
  });
  test("helper replies are quoted and errors are labelled", () => {
    expect(md).toContain("> (helper) helper note");
    expect(md).toContain("> Error: Oops");
  });
  test("blank title falls back and output ends with one newline", () => {
    expect(exportMarkdown("  ", []).startsWith("# Conversation")).toBe(true);
    expect(md.endsWith("\n") && !md.endsWith("\n\n")).toBe(true);
  });
});

describe("itemText", () => {
  test("returns message text, or a tool summary", () => {
    expect(itemText(items[0])).toBe("Make a file");
    expect(itemText(items[2])).toBe("Create notes.txt");
  });
});
