import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, test, vi } from "vitest";
import Toolbar from "./Toolbar.svelte";

const base = { title: "project", subtitle: "C:\demo\project", onsidebar: () => {}, onsearch: () => {} };

describe("Toolbar", () => {
  test("the sidebar button says when a hidden session is waiting, by name and by a mark", () => {
    const { unmount } = render(Toolbar, { ...base, sidebarWaiting: true });
    const button = screen.getByRole("button", { name: "Show or hide the sidebar. A session is waiting for you" });
    expect(button.querySelector(".badge")?.textContent).toBe("!");
    unmount();
    render(Toolbar, base);
    expect(screen.getByRole("button", { name: "Show or hide the sidebar" }).querySelector(".badge")).toBeNull();
  });

  test("shows the title and folder, and every button is named", () => {
    render(Toolbar, { ...base, onexport: () => {}, onterminal: () => {}, onpanel: () => {} });
    expect(screen.getByRole("heading", { name: "project" })).toBeTruthy();
    expect(screen.getByText("C:\demo\project")).toBeTruthy();
    for (const name of ["Show or hide the sidebar", "Search or run a command", "Export this conversation", "Continue in terminal", "Show or hide the right panel"])
      expect(screen.getByRole("button", { name }), name).toBeTruthy();
  });

  test("conversation actions are absent when there is nothing to act on", () => {
    render(Toolbar, base);
    expect(screen.queryByRole("button", { name: "Export this conversation" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Continue in terminal" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Show or hide the right panel" })).toBeNull();
  });

  test("the search bar opens search", async () => {
    const onsearch = vi.fn();
    render(Toolbar, { ...base, onsearch });
    await fireEvent.click(screen.getByRole("button", { name: "Search or run a command" }));
    expect(onsearch).toHaveBeenCalledTimes(1);
  });
});
