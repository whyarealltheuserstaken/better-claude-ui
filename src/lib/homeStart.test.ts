import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, test, vi } from "vitest";
import Composer from "./components/Composer.svelte";
import { startFromHome, type HomeDraft } from "./homeStart";

const deps = (over: Record<string, unknown> = {}) => ({
  pickFolder: vi.fn(async (): Promise<string | null> => "C:\picked"),
  start: vi.fn(async (): Promise<string | null> => "s1"),
  send: vi.fn(async () => true),
  ...over,
});
const draft = (over: Partial<HomeDraft> = {}): HomeDraft => ({ text: "hello", attachments: [], mode: "code", projectId: null, projectCwd: null, ...over });

describe("startFromHome", () => {
  test("a chat starts without asking for a folder", async () => {
    const d = deps();
    expect(await startFromHome(d, draft({ mode: "chat" }))).toBe("sent");
    expect(d.pickFolder).not.toHaveBeenCalled();
    expect(d.start).toHaveBeenCalledWith("chat", { cwd: null, projectId: null });
    expect(d.send).toHaveBeenCalledWith("hello", []);
  });

  test("code uses the folder of the project without asking", async () => {
    const d = deps();
    await startFromHome(d, draft({ projectId: "p1", projectCwd: "C:\site" }));
    expect(d.pickFolder).not.toHaveBeenCalled();
    expect(d.start).toHaveBeenCalledWith("code", { cwd: "C:\site", projectId: "p1" });
  });

  test("code without a folder asks, and cancelling starts nothing", async () => {
    const d = deps({ pickFolder: vi.fn(async () => null) });
    expect(await startFromHome(d, draft())).toBe("cancelled");
    expect(d.start).not.toHaveBeenCalled();
    expect(d.send).not.toHaveBeenCalled();
  });

  test("a failed start sends nothing", async () => {
    const d = deps({ start: vi.fn(async () => null) });
    expect(await startFromHome(d, draft())).toBe("failed");
    expect(d.send).not.toHaveBeenCalled();
  });
});

describe("Composer keeps what was typed when sending does not happen", () => {
  test("text comes back when onsend resolves false", async () => {
    render(Composer, { status: "idle", onsend: async () => false, oninterrupt: () => {} });
    const box = screen.getByLabelText("Message") as HTMLTextAreaElement;
    await fireEvent.input(box, { target: { value: "do not lose me" } });
    await fireEvent.keyDown(box, { key: "Enter" });
    await vi.waitFor(() => expect(box.value).toBe("do not lose me"));
  });
});
