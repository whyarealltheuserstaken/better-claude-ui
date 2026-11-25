import { describe, expect, test } from "vitest";
import { explainRisk, summarizeTool, truncateLines } from "./tools";

describe("summarizeTool", () => {
  test("file tools use the file name, not the full path", () => {
    expect(summarizeTool("Write", { file_path: "C:\\work\\src\\a.ts" })).toBe("Create a.ts");
    expect(summarizeTool("Edit", { file_path: "/w/b.rs" })).toBe("Edit b.rs");
  });
  test("long commands are clipped", () => {
    const s = summarizeTool("Bash", { command: "x".repeat(200) });
    expect(s.length).toBeLessThan(100);
    expect(s.endsWith("…")).toBe(true);
  });
  test("missing input never throws", () => {
    expect(summarizeTool("Write", {})).toBe("Create a file");
    expect(summarizeTool("Whatever", {})).toBe("Use Whatever");
  });
  test("mcp tools are readable", () => {
    expect(summarizeTool("mcp__github__create_issue", {})).toBe("Use github › create_issue");
  });
});

describe("explainRisk", () => {
  test("distinguishes file, command and network tools", () => {
    expect(explainRisk("Write")).toMatch(/file/);
    expect(explainRisk("Bash")).toMatch(/command/);
    expect(explainRisk("WebFetch")).toMatch(/internet/);
  });
});

describe("truncateLines", () => {
  test("leaves short text alone", () => {
    expect(truncateLines("a\nb", 5)).toEqual({ text: "a\nb", truncated: false, total: 2 });
  });
  test("cuts long text and reports the total", () => {
    const t = truncateLines(Array.from({ length: 500 }, (_, i) => `l${i}`).join("\n"), 200);
    expect(t.truncated).toBe(true);
    expect(t.total).toBe(500);
    expect(t.text.split("\n")).toHaveLength(200);
  });
});
