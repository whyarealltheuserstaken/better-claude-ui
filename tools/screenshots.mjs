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
      // Home has a message box too, so wait for the session before typing.
      await page.getByRole("heading", { name: "Where should Claude start?" }).waitFor();
      const box = page.getByLabel("Message", { exact: true });
      // These shots go in the README: a prompt with "artifact" would add the demo's sandbox-test code.
      await box.fill("Add a notes file");
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
    await step("settings-widget", () => category("Usage widget"));
    const gear = () => page.getByRole("button", { name: "Customize the usage widget" }).click();
    // A floating widget beside a waiting permission prompt, in its default spot and after moving it.
    await step("widget-floating-default", () => page.getByLabel("Position").selectOption("floating"));
    await step("widget-floating", async () => {
      await nav.getByRole("button", { name: "New session" }).click();
      const box = page.getByLabel("Message", { exact: true });
      await box.fill("make an artifact");
      await box.press("Enter");
      await page.waitForTimeout(2500);
    });
    await step("widget-floating-moved", async () => {
      const handle = page.getByRole("button", { name: /Move the usage widget/ });
      const from = await handle.boundingBox();
      await page.mouse.move(from.x + 10, from.y + 10);
      await page.mouse.down();
      await page.mouse.move(width - 150, 90, { steps: 8 });
      await page.mouse.up();
    });
    // Dragged onto the bottom right, the widget must not stop the permission buttons or Send being clicked.
    await step("widget-floating-over-prompt", async () => {
      const handle = page.getByRole("button", { name: /Move the usage widget/ });
      const from = await handle.boundingBox();
      await page.mouse.move(from.x + 10, from.y + 10);
      await page.mouse.down();
      await page.mouse.move(width - 190, height - 150, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(300);
      // While a reply is waiting, Send is the Stop button.
      for (const name of ["Deny", /^Always allow /, "Allow", /^(Send|Stop \(Esc\))$/]) {
        const button = page.getByRole("button", { name, exact: true }).last();
        const clear = await button.evaluate((el) => {
          const r = el.getBoundingClientRect();
          const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return el.contains(top);
        });
        if (!clear) problems.push(`${theme} ${width}: ${name} is covered or off screen`);
      }
    });
    await step("widget-dialog", gear);
    await step("widget-toolbar", async () => {
      await page.getByLabel("Position").selectOption("toolbar");
      await page.keyboard.press("Escape");
    });
    // Parallel tool calls can ask several times at once. Stop must stay clickable, and every answer reachable.
    await step("many-prompts", async () => {
      await page.evaluate(async () => {
        const { app } = await import("/src/lib/store.svelte.ts");
        for (const n of [2, 3]) {
          app.receive({ session_id: app.activeId, event: { type: "cli", event: { kind: "permission_request", request_id: "extra" + n, tool: "Write", input: { file_path: `C:\\demo\\project\\file-${n}.txt` }, description: "", tool_use_id: "extra-tool" + n } } });
        }
      });
      await page.waitForTimeout(500);
      const onTop = (el) => {
        const r = el.getBoundingClientRect();
        return r.bottom <= window.innerHeight && el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
      };
      const stop = page.getByRole("button", { name: "Stop (Esc)" });
      if (!(await stop.evaluate(onTop))) problems.push(`${theme} ${width}: Stop is off screen with three requests waiting`);
      const allows = await page.getByRole("button", { name: "Allow", exact: true }).all();
      if (allows.length < 3) problems.push(`${theme} ${width}: expected three requests, found ${allows.length}`);
      for (const [i, allow] of allows.entries()) {
        // Only a list the person can scroll counts: a clipped (overflow: hidden) box can be scrolled by script but not by hand.
        const reachable = await allow.evaluate((el) => {
          for (let box = el.parentElement; box; box = box.parentElement) {
            if (/(auto|scroll)/.test(getComputedStyle(box).overflowY) && box.scrollHeight > box.clientHeight) {
              box.scrollTop += el.getBoundingClientRect().bottom - box.getBoundingClientRect().bottom + 12;
              break;
            }
          }
          const r = el.getBoundingClientRect();
          return r.top >= 0 && r.bottom <= window.innerHeight && el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
        });
        if (!reachable) problems.push(`${theme} ${width}: Allow number ${i + 1} cannot be reached`);
      }
      if (!(await stop.evaluate(onTop))) problems.push(`${theme} ${width}: Stop moved off screen after scrolling the requests`);
    });
    await page.close();
  }
}
// The tray panel at its window size, with sample numbers and the default colours.
{
  const page = await browser.newPage({ viewport: { width: 300, height: 440 } });
  page.on("pageerror", (e) => problems.push(`tray: ${e.message}`));
  await page.goto(new URL("tray", url).href);
  await page.getByRole("button", { name: "Quit" }).waitFor();
  await page.screenshot({ path: join(out, "tray-panel.png") });
  await page.getByRole("button", { name: "Customize the usage widget" }).click();
  await page.screenshot({ path: join(out, "tray-panel-customize.png") });
  await page.close();
}
await browser.close();
console.log(problems.length ? problems.join("\n") : "no problems");
