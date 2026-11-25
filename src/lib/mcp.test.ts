import { describe, expect, test } from "vitest";
import { buildMcpAdd, buildMcpRemove, isPluginServer } from "./mcp";

const base = { name: "github", transport: "http" as const, target: "https://api.example.com/mcp", args: "", scope: "user" as const };

describe("buildMcpAdd", () => {
  test("http servers pass the URL as one argument", () => {
    const r = buildMcpAdd(base);
    expect(r).toMatchObject({ ok: true });
    if (r.ok) expect(r.args).toEqual(["mcp", "add", "--transport", "http", "--scope", "user", "github", "https://api.example.com/mcp"]);
  });
  test("stdio servers put the command after -- with split arguments", () => {
    const r = buildMcpAdd({ ...base, transport: "stdio", target: "npx", args: '-y @scope/pkg "a b"' });
    if (!r.ok) throw new Error("expected ok");
    expect(r.args.slice(-5)).toEqual(["--", "npx", "-y", "@scope/pkg", "a b"]);
  });
  test("rejects bad names, empty targets and non-http URLs", () => {
    expect(buildMcpAdd({ ...base, name: "bad name; rm -rf" }).ok).toBe(false);
    expect(buildMcpAdd({ ...base, name: "-flag" }).ok).toBe(false);
    expect(buildMcpAdd({ ...base, target: " " }).ok).toBe(false);
    expect(buildMcpAdd({ ...base, target: "file:///etc/passwd" }).ok).toBe(false);
    expect(buildMcpAdd({ ...base, transport: "sse", target: "javascript:alert(1)" }).ok).toBe(false);
  });
  test("display shows the exact command", () => {
    const r = buildMcpAdd(base);
    if (r.ok) expect(r.display.startsWith("claude mcp add")).toBe(true);
  });
});

describe("buildMcpRemove / isPluginServer", () => {
  test("remove validates the name", () => {
    expect(buildMcpRemove("github")).toMatchObject({ ok: true, args: ["mcp", "remove", "github"] });
    expect(buildMcpRemove("a b")).toMatchObject({ ok: false });
    expect(buildMcpRemove("--help")).toMatchObject({ ok: false });
  });
  test("plugin servers are recognised", () => {
    expect(isPluginServer("plugin:github:github")).toBe(true);
    expect(isPluginServer("github")).toBe(false);
  });
});
