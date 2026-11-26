import { render } from "@testing-library/svelte";
import { describe, expect, test } from "vitest";
import Icon from "./Icon.svelte";
import { ICONS } from "./icons";

describe("icons", () => {
  test("every icon has plain shape markup and nothing executable or linked", () => {
    for (const [name, body] of Object.entries(ICONS)) {
      expect(body.length, name).toBeGreaterThan(0);
      expect(body, name).not.toMatch(/<script|\son\w+=|href/i);
    }
  });

  test("Icon is a decorative svg", () => {
    const { container } = render(Icon, { name: "send" });
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });
});
