import { describe, expect, test } from "vitest";
import { MAX_TEXT_BYTES } from "./attachments";
import { type ArchiveEntry, archiveItems, continueContext, filterArchive, sourceLabel, sourcesIn, transcriptMarkdown } from "./archive";

const e = (id: string, title: string, source: string): ArchiveEntry => ({ id, title, source, created: null, updated: null, messages: 1, imported_at: 0 });
const msgs = (n: number, size = 20) =>
  Array.from({ length: n }, (_, i) => ({ role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant", text: `m${i} ` + "x".repeat(size) }));

describe("archiveItems", () => {
  test("builds user and assistant items from messages", () => {
    const items = archiveItems({ messages: msgs(2) });
    expect(items.map((i) => i.kind)).toEqual(["user", "assistant"]);
    expect(new Set(items.map((i) => i.id)).size).toBe(2);
  });
  test("prefers the original items when a restored backup has them (tool cards survive)", () => {
    const original = [{ kind: "tool", id: "t", name: "Bash", input: {}, output: "ok", status: "done", nested: false }] as never;
    expect(archiveItems({ messages: msgs(2), items: original })).toBe(original);
    expect(archiveItems({ messages: msgs(1), items: [] })).toHaveLength(1);
  });
});

describe("filterArchive / sourcesIn", () => {
  const list = [e("1", "Fix the login bug", "claude.ai"), e("2", "Trip to Lisbon", "chatgpt"), e("3", "Notes", "markdown")];
  test("filters by title, source label and source id", () => {
    expect(filterArchive(list, "lisbon", null).map((x) => x.id)).toEqual(["2"]);
    expect(filterArchive(list, "claude", null).map((x) => x.id)).toEqual(["1"]);
    expect(filterArchive(list, "", "markdown").map((x) => x.id)).toEqual(["3"]);
    expect(filterArchive(list, "  ", null)).toHaveLength(3);
    expect(filterArchive(list, "zzz", null)).toEqual([]);
  });
  test("sourcesIn is unique and sorted; labels fall back to the raw id", () => {
    expect(sourcesIn([...list, e("4", "x", "chatgpt")])).toEqual(["chatgpt", "claude.ai", "markdown"]);
    expect(sourceLabel("chatgpt")).toBe("ChatGPT");
    expect(sourceLabel("mystery")).toBe("mystery");
  });
});

describe("continueContext", () => {
  test("a short conversation is included whole", () => {
    const c = continueContext("Trip", "chatgpt", msgs(4));
    expect(c.omitted).toBe(0);
    expect(c.transcript).toContain("## You");
    expect(c.transcript).toContain("m3 ");
    expect(c.message).toMatch(/ChatGPT/);
    expect(c.message).not.toMatch(/most recent part/);
  });
  test("a long conversation keeps the most recent messages within the attachment limit and says what was left out", () => {
    const m = msgs(400, 1000);
    const c = continueContext("Big", "claude.ai", m);
    expect(new TextEncoder().encode(c.transcript).length).toBeLessThan(MAX_TEXT_BYTES);
    expect(c.omitted).toBeGreaterThan(0);
    expect(c.transcript).toContain("m399 ");
    expect(c.transcript).not.toContain("m0 ");
    expect(c.transcript).toMatch(/oldest messages were left out/);
    expect(c.message).toMatch(/most recent part/);
  });
  test("a single enormous message is cut rather than overflowing", () => {
    const c = continueContext("Huge", "markdown", [{ role: "user", text: "y".repeat(500_000) }]);
    expect(new TextEncoder().encode(c.transcript).length).toBeLessThan(MAX_TEXT_BYTES);
    expect(c.transcript).toMatch(/left out/);
  });
  test("transcriptMarkdown labels speakers and credits the source", () => {
    const t = transcriptMarkdown("T", "claude.ai", msgs(2));
    expect(t.startsWith("# T\n")).toBe(true);
    expect(t).toContain("Earlier conversation from Claude.ai");
    expect(t).toContain("## Assistant");
  });
});
