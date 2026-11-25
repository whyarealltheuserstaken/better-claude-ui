import { describe, expect, test } from "vitest";
import { MAX_PREVIEW_CHARS, isPreviewable, previewDocument } from "./preview";

describe("isPreviewable", () => {
  test("html and svg only, any case", () => {
    expect(isPreviewable("html")).toBe(true);
    expect(isPreviewable("SVG")).toBe(true);
    expect(isPreviewable("js")).toBe(false);
    expect(isPreviewable("")).toBe(false);
  });
});

describe("previewDocument", () => {
  const csp = "Content-Security-Policy";
  test("fragments are wrapped with the CSP first", () => {
    const d = previewDocument("<p>hi</p>", "html");
    expect(d.indexOf(csp)).toBeGreaterThan(-1);
    expect(d.indexOf(csp)).toBeLessThan(d.indexOf("<p>hi</p>"));
    expect(d).toContain("default-src 'none'");
  });
  test("the policy forbids scripts and network", () => {
    const d = previewDocument("<p>x</p>", "html");
    expect(d).not.toMatch(/script-src/);
    expect(d).not.toMatch(/connect-src/);
    expect(d).toContain("img-src data:");
  });
  test("a full document gets the CSP injected inside its head", () => {
    const d = previewDocument("<!doctype html><html><head><title>t</title></head><body>b</body></html>", "html");
    expect(d.indexOf(csp)).toBeLessThan(d.indexOf("<title>"));
    expect(d.match(/Content-Security-Policy/g)).toHaveLength(1);
  });
  test("html without a head gets one", () => {
    const d = previewDocument("<html><body>b</body></html>", "html");
    expect(d).toMatch(/<html[^>]*><head><meta/);
  });
  test("svg is centred in a page of its own", () => {
    const d = previewDocument('<svg viewBox="0 0 10 10"></svg>', "svg");
    expect(d).toContain("<svg");
    expect(d).toContain(csp);
  });
  test("oversized input is truncated", () => {
    const d = previewDocument("x".repeat(MAX_PREVIEW_CHARS * 2), "html");
    expect(d.length).toBeLessThan(MAX_PREVIEW_CHARS + 2000);
  });
});
