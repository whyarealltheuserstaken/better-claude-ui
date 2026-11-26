import { describe, expect, test } from "vitest";
import {
  BUILTIN_STYLES, BUILTIN_THEMES, allStyles, allThemes, appearanceVars, duplicateId,
  resolveStyle, resolveTheme, sanitizeStyle, sanitizeTheme, adjustedKeys, deriveColors,
} from "./theme";
import { contrast } from "./color";

describe("themes", () => {
  test("every built-in theme has valid 6-digit hex colours and a unique id", () => {
    const ids = new Set(BUILTIN_THEMES.map((t) => t.id));
    expect(ids.size).toBe(BUILTIN_THEMES.length);
    for (const t of BUILTIN_THEMES) for (const v of Object.values(t.colors)) expect(v).toMatch(/^#[0-9a-f]{6}$/);
  });

  test("sanitizeTheme keeps good colours, replaces bad ones, rejects nameless input", () => {
    const t = sanitizeTheme({ id: "mine", name: "Mine", scheme: "light", colors: { bg: "#ffffff", text: "red; evil" } })!;
    expect(t.colors.bg).toBe("#ffffff");
    expect(t.colors.text).toBe(BUILTIN_THEMES[0].colors.text);
    expect(t.scheme).toBe("light");
    expect(sanitizeTheme({ colors: {} })).toBeNull();
    expect(sanitizeTheme("nope")).toBeNull();
  });

  test("unsafe ids fall back; custom themes cannot shadow built-ins", () => {
    expect(sanitizeTheme({ id: "../x", name: "A" }, "fb")!.id).toBe("fb");
    const list = allThemes([{ id: "graphite", name: "Fake" }, { id: "x1", name: "Real" }]);
    expect(list.find((t) => t.id === "graphite")!.name).toBe("Graphite");
    expect(list.some((t) => t.id === "x1")).toBe(true);
  });

  test("auto follows the system; unknown ids fall back to auto", () => {
    expect(resolveTheme("auto", [], true).id).toBe("graphite");
    expect(resolveTheme("auto", [], false).id).toBe("paper");
    expect(resolveTheme("deleted", [], false).id).toBe("paper");
    expect(resolveTheme("midnight", [], false).id).toBe("midnight");
  });
});

describe("styles", () => {
  test("sanitizeStyle clamps numbers and rejects junk enums", () => {
    const s = sanitizeStyle({ name: "S", fontSize: 500, radius: -4, density: "x", width: 10, userStyle: "zzz", toolStyle: "card", glyph: "abcdef" })!;
    expect(s.fontSize).toBe(22);
    expect(s.radius).toBe(0);
    expect(s.density).toBe(BUILTIN_STYLES[0].density);
    expect(s.width).toBe(480);
    expect(s.userStyle).toBe("bubble");
    expect(s.toolStyle).toBe("card");
    expect(s.glyph).toBe("abc");
  });

  test("font family input cannot inject CSS", () => {
    const s = sanitizeStyle({ name: "S", fontFamily: "Fira Code; } body { display:none" })!;
    expect(s.fontFamily).not.toMatch(/[;{}]/);
  });

  test("terminal preset is monospace, square and prompt-style", () => {
    const t = resolveStyle("terminal", []);
    expect(t.font).toBe("mono");
    expect(t.radius).toBe(0);
    expect(t.userStyle).toBe("prompt");
    expect(allStyles([]).length).toBe(BUILTIN_STYLES.length);
  });
});

describe("appearanceVars", () => {
  test("emits colour, font, radius and layout variables", () => {
    const v = appearanceVars(BUILTIN_THEMES[0], resolveStyle("terminal", []));
    expect(v["--bg"]).toBe("#0f121a");
    expect(v["--ui"]).toContain("monospace");
    expect(v["--radius"]).toBe("0px");
    expect(v["--col"]).toBe("1100px");
  });
});

describe("duplicateId", () => {
  test("generates unique copy ids", () => {
    expect(duplicateId("graphite", [])).toBe("graphite-copy");
    expect(duplicateId("graphite", ["graphite-copy"])).toBe("graphite-copy-2");
    expect(duplicateId("graphite-copy", ["graphite-copy", "graphite-copy-2"])).toBe("graphite-copy-3");
  });
});

describe("derived colours", () => {
  test.each(BUILTIN_THEMES.map((t) => [t.id, t] as const))("%s keeps text readable on every surface", (_id, t) => {
    const d = deriveColors(t);
    for (const key of ["text", "muted", "accentText", "gateText", "okText", "badText"] as const)
      for (const bg of d.backgrounds) expect(contrast(d[key], bg), `${key} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    expect(contrast(d.accentInk, t.colors.accent)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(d.gateInk, t.colors.gate)).toBeGreaterThanOrEqual(4.5);
  });

  test("an unreadable custom theme is fixed on screen without changing the saved colours", () => {
    const bad = sanitizeTheme({ id: "bad", name: "Bad", scheme: "dark", colors: { bg: "#202020", text: "#202020" } })!;
    const saved = structuredClone(bad.colors);
    const d = deriveColors(bad);
    expect(contrast(d.text, bad.colors.bg)).toBeGreaterThanOrEqual(4.5);
    expect(bad.colors).toEqual(saved);
    expect(adjustedKeys(bad)).toContain("text");
  });

  test("high contrast is solid; themes whose accent is close to the waiting colour get a neutral glow", () => {
    const by = (id: string) => deriveColors(resolveTheme(id, [], true));
    expect(by("high-contrast").solid).toBe(true);
    expect(by("graphite").solid).toBe(false);
    expect(by("terminal-amber").neutralGlow).toBe(true);
    expect(by("high-contrast").neutralGlow).toBe(true);
    expect(by("graphite").neutralGlow).toBe(false);
  });

  test("the new variables are emitted", () => {
    const v = appearanceVars(BUILTIN_THEMES[0], resolveStyle("modern", []));
    for (const k of ["--sheet", "--card", "--glass", "--accent-text", "--gate-text", "--ok-text", "--bad-text", "--glow-a", "--glow-b", "--glow-c", "--wait-a", "--wait-b"])
      expect(v[k], k).toBeTruthy();
  });
});
