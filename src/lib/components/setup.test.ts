import { render, screen, waitFor } from "@testing-library/svelte";
import { describe, expect, test, vi } from "vitest";
import SetupWizard from "./SetupWizard.svelte";

const props = (over: Record<string, unknown> = {}) => ({
  cli: { state: "not_found" } as const,
  auth: null,
  oncheck: vi.fn(async () => {}),
  onrecheck: vi.fn(async () => {}),
  onskip: vi.fn(),
  ...over,
});

describe("SetupWizard", () => {
  test("not installed: shows the exact installer command and locks sign-in", async () => {
    render(SetupWizard, props());
    await waitFor(() => expect(screen.getByText(/claude.ai\/install/)).toBeTruthy());
    expect(screen.getByRole("button", { name: "Install Claude Code" })).toBeTruthy();
    expect(screen.getByText("Available after step 1.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Sign in with browser/ })).toBeNull();
  });

  test("installed but signed out: offers browser sign-in", () => {
    render(SetupWizard, props({ cli: { state: "found", path: "x", version: "2.1.0" }, auth: { state: "logged_out" } }));
    expect(screen.getByText("Found version 2.1.0.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in with browser" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Continue anyway" })).toBeNull();
  });

  test("unknown sign-in status lets the user continue anyway", () => {
    const p = props({ cli: { state: "found", path: "x", version: "2.1.0" }, auth: { state: "unknown", reason: "?" } });
    render(SetupWizard, p);
    expect(screen.getByRole("button", { name: "Continue anyway" })).toBeTruthy();
  });
});
