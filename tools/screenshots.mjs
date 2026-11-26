// Screenshots of the main screens against the mock backend, using the installed Edge.
// Run `npm run dev` first, then: node tools/screenshots.mjs <outDir> [themes] [sizes]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const out = process.argv[2];
if (!out) throw new Error("usage: node tools/screenshots.mjs <outDir> [graphite,paper] [1100x760,720x480]");
const themes = (process.argv[3] ?? "graphite,paper,high-contrast").split(",");
const sizes = (process.argv[4] ?? "1100x760,720x480").split(",").map((s) => s.split("x").map(Number));
const url = process.env.BCU_DEV_URL ?? "http://127.0.0.1:1420/";
mkdirSync(out, { recursive: true });

const config = (theme) => ({
  tier: "intermediate", onboarded: true, default_model: null, default_permission_mode: null, always_allow: [], extra_args: [], recents: [], theme, style: "modern",
  custom_themes: [], custom_styles: [], budget_daily_usd: 3, budget_monthly_usd: 60, projects: [{ id: "p1", name: "Marketing site", instructions: "", cwd: null }],
  auto_update_check: false, last_update_check: null, skipped_version: null, auto_refresh_limits: false, refresh_limits_minutes: 15, sidebar_hidden: false,
  panel_hidden: false, settings_category: "general", usage_widget: null, tray: null,
  home_widgets: ["quick-start", "projects", "limits", "spend-today", "spend-month", "daily-chart", "by-model", "recent", "status"],
});

const browser = await chromium.launch({ channel: "msedge" });
const problems = [];
for (const theme of themes) {
  for (const [width, height] of sizes) {
    const page = await browser.newPage({ viewport: { width, height } });
    page.on("pageerror", (e) => problems.push(`${theme} ${width}: ${e.message}`));
    await page.addInitScript((c) => localStorage.setItem("mock_config", JSON.stringify(c)), config(theme));
    await page.goto(url);
    const nav = page.getByRole("complementary", { name: "Navigation" });
    await nav.waitFor();
    const shot = (name) => page.screenshot({ path: join(out, `${theme}-${width}-${name}.png`) });
    const step = async (name, run) => {
      try {
        await run();
        await page.waitForTimeout(500);
        await shot(name);
      } catch (e) {
        problems.push(`${theme} ${width} ${name}: ${e.message.split("\n")[0]}`);
      }
    };
    await step("home", () => nav.getByRole("button", { name: "Home" }).click());
    await step("session", async () => {
      await nav.getByRole("button", { name: "New session" }).click();
      const box = page.getByLabel("Message", { exact: true });
      await box.fill("make an artifact");
      await box.press("Enter");
      await page.waitForTimeout(2500);
    });
    await step("usage", () => nav.getByRole("button", { name: "Usage" }).click());
    await step("projects", () => nav.getByRole("button", { name: "Manage projects" }).click());
    await step("capabilities", () => nav.getByRole("button", { name: "Capabilities" }).click());
    await step("instructions", () => nav.getByRole("button", { name: "Instructions" }).click());
    await step("settings", () => nav.getByRole("button", { name: "Settings" }).click());
    const category = (name) => page.getByRole("navigation", { name: "Settings categories" }).getByRole("button", { name }).click();
    await step("settings-appearance", () => category("Appearance"));
    await step("settings-usage", () => category("Usage and budgets"));
    await page.close();
  }
}
await browser.close();
console.log(problems.length ? problems.join("\n") : "no problems");
