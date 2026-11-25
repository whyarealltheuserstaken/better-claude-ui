import { describe, expect, test } from "vitest";
import { MAX_BINARY_BYTES, MAX_FILES, MAX_TEXT_BYTES, canAdd, classify, composeText, fmtSize, toWire, type PendingAttachment } from "./attachments";

const text = (name: string, t: string): PendingAttachment => ({ id: name, name, kind: "text", media_type: "text/plain", size: t.length, text: t });
const img = (name: string): PendingAttachment => ({ id: name, name, kind: "image", media_type: "image/png", size: 4, data: "AAAA" });

describe("classify", () => {
  test("accepts images, pdfs and code/text", () => {
    expect(classify("a.png", "image/png", 10)).toEqual({ ok: true, kind: "image", media_type: "image/png" });
    expect(classify("a.pdf", "", 10)).toEqual({ ok: true, kind: "pdf", media_type: "application/pdf" });
    expect(classify("main.rs", "", 10)).toMatchObject({ ok: true, kind: "text" });
    expect(classify("notes", "text/plain", 10)).toMatchObject({ ok: true, kind: "text" });
  });
  test("rejects unknown types and oversize files with a helpful message", () => {
    expect(classify("setup.exe", "application/octet-stream", 10)).toMatchObject({ ok: false });
    const big = classify("big.png", "image/png", MAX_BINARY_BYTES + 1);
    expect(big.ok).toBe(false);
    const bigText = classify("big.txt", "text/plain", MAX_TEXT_BYTES + 1);
    expect(bigText.ok === false && bigText.error).toMatch(/read it from your project/);
  });
});

describe("composeText", () => {
  test("typed text comes first; text files are fenced and labelled", () => {
    const out = composeText("explain", [text("a.py", "print(1)")]);
    expect(out.startsWith("explain\n\n")).toBe(true);
    expect(out).toContain("Attached file: a.py");
    expect(out).toContain("print(1)");
  });
  test("a file containing code fences cannot break out of its fence", () => {
    const out = composeText("", [text("r.md", "```js\nx\n```")]);
    expect(out).toContain("````\n```js");
  });
  test("images are not inlined", () => {
    expect(composeText("hi", [img("a.png")])).toBe("hi");
  });
});

describe("toWire / canAdd / fmtSize", () => {
  test("only binary attachments go on the wire", () => {
    expect(toWire([img("a.png"), text("a.txt", "x")])).toEqual([{ name: "a.png", media_type: "image/png", data: "AAAA" }]);
  });
  test("limit on file count", () => {
    const many = Array.from({ length: MAX_FILES }, (_, i) => img(`${i}.png`));
    expect(canAdd(many)).toMatch(/up to 10/);
    expect(canAdd(many.slice(1))).toBeNull();
  });
  test("fmtSize", () => {
    expect(fmtSize(500)).toBe("500 B");
    expect(fmtSize(2048)).toBe("2 KB");
    expect(fmtSize(3 * 1024 * 1024)).toBe("3.0 MB");
  });
});
