import { render, screen } from "@testing-library/svelte";
import { describe, expect, test } from "vitest";
import HomePage from "../components/HomePage.svelte";
import { DEFAULT_WIDGETS, WIDGETS } from "./registry";

const noop = () => {};
const config = { tier: "intermediate", home_widgets: DEFAULT_WIDGETS, recents: [], budget_daily_usd: null, budget_monthly_usd: null, auto_refresh_limits: false, refresh_limits_minutes: 15 };

describe("HomePage", () => {
  test("every enabled widget renders its title, under the Customize button", () => {
    render(HomePage, {
      config: config as never, usage: null, limits: null, cli: null, auth: null, editing: false, projects: [],
      onsave: noop, onedit: noop, onnewchat: noop, onnewcode: noop, onteams: noop, onresume: noop, onusage: noop,
      onrefreshlimits: noop, onautorefresh: noop, onproject: noop, onprojects: noop,
    });
    for (const w of WIDGETS) expect(screen.getByRole("heading", { name: w.title }), w.id).toBeTruthy();
    expect(screen.getByRole("button", { name: "Customize" })).toBeTruthy();
    // The toolbar names the page, so the page itself does not repeat it.
    expect(screen.queryByRole("heading", { name: "Home" })).toBeNull();
  });
});
