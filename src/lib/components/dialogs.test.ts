import { fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, test, vi } from "vitest";
import PresetPicker from "./PresetPicker.svelte";
import ImportPanel from "./ImportPanel.svelte";
import UpdatePanel from "./UpdatePanel.svelte";
import ArtifactPreview from "./ArtifactPreview.svelte";
import Palette from "./Palette.svelte";
import Appearance from "./Appearance.svelte";
import { BUILTIN_THEMES } from "../theme";
import { app } from "../store.svelte";
import type { UpdateState } from "../updates";

const preset = { id: "p", title: "Research team", description: "d", cost_note: "c", agents: { scout: { description: "d", prompt: "p" } }, system_prompt: "s", custom: false };
const importProps = (onclose: () => void) => ({
  pickFile: async () => null, pickFolder: async () => null, inspect: vi.fn(), run: vi.fn(), finish: vi.fn(), onopenarchive: () => {}, onclose,
});
const updateProps = (state: UpdateState, onclose: () => void) => ({
  state, currentVersion: "0.1.0", running: 0, pending: 0, ondownload: () => {}, oninstall: () => {}, onskip: () => {}, onretry: () => {}, ondismiss: () => {}, onclose,
});

const dialogs: [string, string, (onclose: () => void) => void][] = [
  ["Agent teams", "Agent teams", (onclose) => void render(PresetPicker, { presets: [preset], advanced: false, onstart: () => {}, onclose })],
  ["Import", "Import data", (onclose) => void render(ImportPanel, importProps(onclose))],
  ["Update", "App update", (onclose) => void render(UpdatePanel, updateProps({ phase: "uptodate", checkedAt: 0 }, onclose))],
  ["Code preview", "Preview", (onclose) => void render(ArtifactPreview, { code: "<p>hi</p>", lang: "html", oncopy: () => {}, onclose })],
];

const press = (key: string, shiftKey = false) => fireEvent.keyDown(document.activeElement ?? document.body, { key, shiftKey });

afterEach(() => {
  document.body.innerHTML = "";
});

describe.each(dialogs)("%s dialog", (_, name, show) => {
  test("takes focus when it opens, so Escape works straight away", async () => {
    const onclose = vi.fn();
    show(onclose);
    const dialog = screen.getByRole("dialog", { name });
    expect(dialog.contains(document.activeElement)).toBe(true);
    await press("Escape");
    expect(onclose).toHaveBeenCalledTimes(1);
  });

  test("closes with its Close button, and Escape still works if focus fell outside", async () => {
    const onclose = vi.fn();
    show(onclose);
    await fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0]);
    expect(onclose).toHaveBeenCalledTimes(1);
    (document.activeElement as HTMLElement).blur();
    await press("Escape");
    expect(onclose).toHaveBeenCalledTimes(2);
  });
});

describe("dialog focus", () => {
  test("returns to the control that opened it", () => {
    const opener = document.body.appendChild(document.createElement("button"));
    opener.focus();
    const view = render(PresetPicker, { presets: [preset], advanced: false, onstart: () => {}, onclose: () => {} });
    expect(document.activeElement).not.toBe(opener);
    view.unmount();
    expect(document.activeElement).toBe(opener);
  });

  test("Tab stays inside the dialog", async () => {
    render(PresetPicker, { presets: [preset], advanced: false, onstart: () => {}, onclose: () => {} });
    const close = screen.getByRole("button", { name: "Close" });
    const start = screen.getByRole("button", { name: "Start with this team" });
    start.focus();
    await press("Tab");
    expect(document.activeElement).toBe(close);
    await press("Tab", true);
    expect(document.activeElement).toBe(start);
  });

  test("an update that is installing cannot be closed", async () => {
    const onclose = vi.fn();
    render(UpdatePanel, updateProps({ phase: "installing", info: { available: true, current_version: "0.1.0", version: "9.9.9", notes: null, date: null } }, onclose));
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
    await press("Escape");
    expect(onclose).not.toHaveBeenCalled();
  });

  test("Escape in the command palette does not also close a dialog under it", async () => {
    const under = vi.fn();
    const over = vi.fn();
    render(PresetPicker, { presets: [preset], advanced: false, onstart: () => {}, onclose: under });
    render(Palette, { items: [], onclose: over });
    await press("Escape");
    expect(over).toHaveBeenCalledTimes(1);
    expect(under).not.toHaveBeenCalled();
  });
});

describe("Appearance contrast note", () => {
  const config = (patch: Record<string, unknown>) => ({ ...JSON.parse(JSON.stringify(app.config)), ...patch });
  const note = () => screen.queryByText(/adjusted so text stays readable/);

  test("a custom theme with unreadable text says which colours are shown differently", () => {
    const base = BUILTIN_THEMES[0];
    const bad = { ...base, id: "mine", name: "Mine", custom: true, colors: { ...base.colors, text: base.colors.bg } };
    render(Appearance, { config: config({ theme: "mine", custom_themes: [bad] }), onsave: () => {} });
    expect(note()?.textContent).toContain("Text");
    expect(note()?.textContent).toContain("Your saved colours are unchanged");
  });

  test("readable themes show no note", () => {
    const base = BUILTIN_THEMES[0];
    const good = { ...base, id: "mine", name: "Mine", custom: true };
    const view = render(Appearance, { config: config({ theme: "mine", custom_themes: [good] }), onsave: () => {} });
    expect(note()).toBeNull();
    view.unmount();
    render(Appearance, { config: config({ theme: base.id, custom_themes: [] }), onsave: () => {} });
    expect(note()).toBeNull();
  });
});
