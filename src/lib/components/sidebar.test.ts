import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, test, vi } from "vitest";
import Sidebar from "./Sidebar.svelte";

const meta = { id: "s1", title: "project", cwd: "C:\w", mode: "code" as const, model: null, permissionMode: null, preset: null, effort: null, webSearch: false, project: null };
const recent = { cli_session_id: "r1", title: "Old talk", cwd: null, mode: "code" as const, model: null, preset: null, effort: null, web_search: false, project: null, updated_at: 1 };
const props = (extra: Record<string, unknown> = {}) => ({
  metas: [meta], states: {}, activeId: "s1", mode: "code" as const, view: "session", recents: [recent], projects: [{ id: "p1", name: "Marketing site", instructions: "", cwd: null }], waiting: new Set<"code" | "chat">(),
  onmode: vi.fn(), onhome: vi.fn(), onusage: vi.fn(), onproject: vi.fn(), onprojects: vi.fn(), onresume: vi.fn(), onforget: vi.fn(), onsettings: vi.fn(), onpresets: vi.fn(), onarchive: vi.fn(), oncaps: vi.fn(), oneditor: vi.fn(), onselect: vi.fn(), onnew: vi.fn(), onclose: vi.fn(),
  ...extra,
});

describe("Sidebar", () => {
  test("holds all navigation", async () => {
    const p = props();
    render(Sidebar, p);
    for (const [name, fn] of [["Home", p.onhome], ["Usage", p.onusage], ["Settings", p.onsettings], ["Marketing site", p.onproject], ["Manage projects", p.onprojects]] as const) {
      await fireEvent.click(screen.getByRole("button", { name }));
      expect(fn, name).toHaveBeenCalled();
    }
    await fireEvent.click(screen.getByRole("tab", { name: "Chat" }));
    expect(p.onmode).toHaveBeenCalledWith("chat");
  });

  test("Capabilities and Instructions need the advanced tools", () => {
    const { unmount } = render(Sidebar, props());
    expect(screen.queryByRole("button", { name: "Capabilities" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Instructions" })).toBeNull();
    unmount();
    render(Sidebar, props({ advancedTools: true }));
    expect(screen.getByRole("button", { name: "Capabilities" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Instructions" })).toBeTruthy();
  });

  test("Agent teams is only offered in Code", () => {
    const { unmount } = render(Sidebar, props({ mode: "chat" }));
    expect(screen.queryByRole("button", { name: "Agent teams" })).toBeNull();
    expect(screen.getByRole("button", { name: "New chat" })).toBeTruthy();
    unmount();
    render(Sidebar, props());
    expect(screen.getByRole("button", { name: "Agent teams" })).toBeTruthy();
  });

  test("a waiting session in the other mode marks that mode", () => {
    render(Sidebar, props({ mode: "code", waiting: new Set(["chat"]) }));
    expect(screen.getByRole("tab", { name: "Chat, waiting for you" })).toBeTruthy();
  });

  test("close and forget keep their names", async () => {
    const p = props();
    render(Sidebar, p);
    await fireEvent.click(screen.getByRole("button", { name: "Close project" }));
    expect(p.onclose).toHaveBeenCalledWith("s1");
    await fireEvent.click(screen.getByRole("button", { name: "Forget Old talk" }));
    expect(p.onforget).toHaveBeenCalledWith(recent);
  });
});
