import { describe, expect, test } from "vitest";
import { renderMarkdown } from "./markdown";

describe("renderMarkdown", () => {
  test("highlights fenced code in known languages", () => {
    const html = renderMarkdown("```ts\nconst a: number = 1;\n```");
    expect(html).toContain('class="hljs"');
    expect(html).toContain("hljs-keyword");
  });
  test("escapes code in unknown languages", () => {
    expect(renderMarkdown("```zzz\n<b>x</b>\n```")).toContain("&lt;b&gt;");
  });
  test("never renders raw HTML from the model", () => {
    const html = renderMarkdown("<script>alert(1)</script> hi");
    expect(html).not.toContain("<script>");
  });
  test("links open in a new tab safely", () => {
    expect(renderMarkdown("[x](https://example.com)")).toContain('rel="noopener noreferrer"');
  });
});
