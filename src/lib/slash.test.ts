import { describe, expect, test } from "vitest";
import { completeCommand, slashMatches, slashQuery } from "./slash";

const cmds = ["review", "ecc:code-review", "superpowers:brainstorming", "init", "security-review", "review", "compact"];

describe("slashQuery", () => {
  test("only while typing the command name", () => {
    expect(slashQuery("/")).toBe("");
    expect(slashQuery("/rev")).toBe("rev");
    expect(slashQuery("/Rev")).toBe("rev");
    expect(slashQuery("/review src")).toBeNull();
    expect(slashQuery("hello /rev")).toBeNull();
    expect(slashQuery("")).toBeNull();
  });
});

describe("slashMatches", () => {
  test("prefix first (including after a plugin namespace), then substring, no duplicates", () => {
    const r = slashMatches("review", cmds);
    expect(r[0]).toBe("review");
    expect(r).toContain("ecc:code-review");
    expect(r).toContain("security-review");
    expect(r.filter((x) => x === "review")).toHaveLength(1);
    expect(r.indexOf("review")).toBeLessThan(r.indexOf("security-review"));
  });
  test("namespace-less prefix finds namespaced commands", () => {
    expect(slashMatches("brain", cmds)).toEqual(["superpowers:brainstorming"]);
  });
  test("empty query lists commands up to the cap; unknown gives nothing", () => {
    expect(slashMatches("", cmds, 3)).toHaveLength(3);
    expect(slashMatches("zzz", cmds)).toEqual([]);
  });
  test("completeCommand adds the slash and a trailing space", () => {
    expect(completeCommand("review")).toBe("/review ");
  });
});
