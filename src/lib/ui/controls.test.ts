import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, test, vi } from "vitest";
import Menu from "./Menu.svelte";
import Meter from "./Meter.svelte";
import Segmented from "./Segmented.svelte";

const options = [
  { id: "", label: "Default" },
  { id: "a", label: "Alpha" },
  { id: "b", label: "Beta", help: "The second letter" },
];

describe("Menu", () => {
  test("is closed until opened, and names itself and its value", () => {
    render(Menu, { label: "Model", value: "a", options, onpick: () => {} });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByRole("button", { name: "Model: Alpha" }).getAttribute("aria-haspopup")).toBe("listbox");
  });

  test("keyboard alone can pick the third option, once", async () => {
    const onpick = vi.fn();
    render(Menu, { label: "Model", value: "", options, onpick });
    await fireEvent.keyDown(screen.getByRole("button", { name: "Model: Default" }), { key: "ArrowDown" });
    const list = screen.getByRole("listbox");
    await fireEvent.keyDown(list, { key: "ArrowDown" });
    await fireEvent.keyDown(list, { key: "ArrowDown" });
    await fireEvent.keyDown(list, { key: "Enter" });
    expect(onpick).toHaveBeenCalledTimes(1);
    expect(onpick).toHaveBeenCalledWith("b");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  test("Escape closes without picking, returns focus, and does not reach the window", async () => {
    const onpick = vi.fn();
    const outer = vi.fn();
    window.addEventListener("keydown", outer);
    render(Menu, { label: "Model", value: "", options, onpick });
    const button = screen.getByRole("button", { name: "Model: Default" });
    await fireEvent.click(button);
    await fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
    window.removeEventListener("keydown", outer);
    expect(onpick).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(button);
    expect(outer).not.toHaveBeenCalled();
  });
});

describe("Segmented", () => {
  const tabs = [{ id: "chat", label: "Chat", badge: "1 waiting" }, { id: "code", label: "Code" }];

  test("arrow keys move to the neighbour", async () => {
    const onpick = vi.fn();
    render(Segmented, { label: "Mode", value: "chat", options: tabs, onpick });
    await fireEvent.keyDown(screen.getByRole("tab", { name: /Chat/ }), { key: "ArrowRight" });
    expect(onpick).toHaveBeenCalledWith("code");
  });

  test("a badge is part of the accessible name", () => {
    render(Segmented, { label: "Mode", value: "code", options: tabs, onpick: () => {} });
    expect(screen.getByRole("tab", { name: "Chat, 1 waiting" })).toBeTruthy();
  });
});

describe("Meter", () => {
  test("clamps to 100", () => {
    render(Meter, { percent: 140, label: "Today" });
    expect(screen.getByRole("meter", { name: "Today" }).getAttribute("aria-valuenow")).toBe("100");
  });

  test("an unknown value claims no number", () => {
    render(Meter, { percent: null, label: "Weekly", kind: "ring" });
    expect(screen.getByRole("meter", { name: "Weekly" }).hasAttribute("aria-valuenow")).toBe(false);
  });
});
