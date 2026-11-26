import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { beforeEach, describe, expect, test, vi } from "vitest";

const files: Record<string, string> = {};
vi.mock("../ipc", () => ({
  ipc: {
    readConfigFile: vi.fn(async (id: string) => files[id] ?? ""),
    writeConfigFile: vi.fn(async (id: string, _project: string | null, text: string) => {
      files[id] = text;
    }),
  },
}));

import ProjectsPanel from "./ProjectsPanel.svelte";
import CapabilitiesPanel from "./CapabilitiesPanel.svelte";
import EditorPanel from "./EditorPanel.svelte";

const project = { id: "p1", name: "Marketing site", instructions: "Be brief.", cwd: null };
const caps = { version: "2.1.0", mcp_servers: [{ name: "github", status: "connected" }], skills: ["review"], agents: [], plugins: [], tools: ["Read"], slash_commands: [] };

beforeEach(() => {
  for (const k of Object.keys(files)) delete files[k];
});

describe("Projects page", () => {
  test("is a page, not a dialog, and keeps every action", async () => {
    const p = { projects: [project], onsave: vi.fn(), onstart: vi.fn(), onpick: vi.fn(async () => "picked"), onback: vi.fn() };
    render(ProjectsPanel, p);
    expect(screen.queryByRole("dialog")).toBeNull();
    for (const name of ["Marketing site", "+ New project", "Browse…", "Save changes", "New chat", "New coding session", "Delete"]) expect(screen.getByRole("button", { name }), name).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: "New chat" }));
    expect(p.onstart).toHaveBeenCalledWith(project, "chat");
    await fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(p.onback).toHaveBeenCalled();
  });
});

describe("Capabilities page", () => {
  test("is a page, not a dialog, with its tabs and server actions", async () => {
    const p = { caps, run: vi.fn(async () => ({ code: 0, output: "ok" })), onback: vi.fn() };
    render(CapabilitiesPanel, p);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getAllByRole("tab")).toHaveLength(5);
    expect(screen.getByRole("button", { name: "Remove" })).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: "Check server health" }));
    expect(p.run).toHaveBeenCalledWith(["mcp", "list"]);
    await fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(p.onback).toHaveBeenCalled();
  });
});

describe("Instructions page", () => {
  const box = () => screen.getByRole("textbox", { name: "My instructions" }) as HTMLTextAreaElement;
  const ready = () => waitFor(() => expect(box().disabled).toBe(false));
  const type = (value: string) => fireEvent.input(box(), { target: { value } });

  test("is a page, not a dialog, and saves", async () => {
    render(EditorPanel, { project: null, advanced: true, onback: vi.fn() });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getAllByRole("tab")).toHaveLength(4);
    await ready();
    await type("Use plain words.");
    await fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(files.user_instructions).toBe("Use plain words."));
  });

  test("unsaved text survives leaving the page and coming back", async () => {
    files.user_instructions = "on disk";
    const first = render(EditorPanel, { project: null, advanced: false, onback: vi.fn() });
    await ready();
    await type("half written");
    first.unmount();
    render(EditorPanel, { project: null, advanced: false, onback: vi.fn() });
    await ready();
    expect(box().value).toBe("half written");
    expect(screen.getByText(/Not saved yet/)).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: "Revert" }));
    expect(box().value).toBe("on disk");
  });

  test("a reverted or saved file leaves no draft behind", async () => {
    files.user_instructions = "on disk";
    const first = render(EditorPanel, { project: null, advanced: false, onback: vi.fn() });
    await ready();
    await type("scrap");
    await fireEvent.click(screen.getByRole("button", { name: "Revert" }));
    first.unmount();
    files.user_instructions = "changed elsewhere";
    render(EditorPanel, { project: null, advanced: false, onback: vi.fn() });
    await ready();
    expect(box().value).toBe("changed elsewhere");
  });

  test("switching tabs keeps each unsaved text, per project folder", async () => {
    render(EditorPanel, { project: "folder-a", advanced: false, onback: vi.fn() });
    await ready();
    await type("global draft");
    await fireEvent.click(screen.getByRole("tab", { name: "Project instructions" }));
    const projectBox = () => screen.getByRole("textbox", { name: "Project instructions" }) as HTMLTextAreaElement;
    await waitFor(() => expect(projectBox().disabled).toBe(false));
    expect(projectBox().value).toBe("");
    await fireEvent.click(screen.getByRole("tab", { name: "My instructions" }));
    await ready();
    expect(box().value).toBe("global draft");
    await fireEvent.click(screen.getByRole("button", { name: "Revert" }));
  });
});
