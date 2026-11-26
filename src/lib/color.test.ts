import { describe, expect, test } from "vitest";
import { contrast, ensureContrast, hueDistance, mix } from "./color";

describe("contrast", () => {
  test("black on white is 21, a colour on itself is 1", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#777777", "#777777")).toBe(1);
  });

  test("mix runs from the first colour to the second", () => {
    expect(mix("#000000", "#ffffff", 0)).toBe("#000000");
    expect(mix("#000000", "#ffffff", 1)).toBe("#ffffff");
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
  });

  test("ensureContrast fixes a failing colour and leaves a passing one alone", () => {
    const fixed = ensureContrast("#93a1a1", ["#fdf6e3"]);
    expect(contrast(fixed, "#fdf6e3")).toBeGreaterThanOrEqual(4.5);
    expect(ensureContrast("#000000", ["#ffffff", "#eeeeee"])).toBe("#000000");
  });

  test("ensureContrast returns the best extreme when no colour can pass on every background", () => {
    expect(["#000000", "#ffffff"]).toContain(ensureContrast("#808080", ["#000000", "#ffffff"], 7));
  });

  test("hueDistance wraps around the colour wheel", () => {
    expect(hueDistance("#ff0000", "#ff0000")).toBe(0);
    expect(hueDistance("#ff0020", "#ff2000")).toBeLessThan(20);
  });
});
