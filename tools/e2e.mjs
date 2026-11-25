// End-to-end test of the REAL app against the REAL `claude` CLI, driven over WebView2's debug port.
// Windows: starts `npm run tauri dev` itself. Usage: node tools/e2e.mjs
// Scenarios: `node tools/e2e.mjs` (permission flow, default), `attach` (image + text attachments in Chat), `caps` (slash menu, capabilities panel, CLAUDE.md editor), `chat` (palette, web search in Chat, tool lockdown, export), `projects` (project instructions applied to a chat, conversation search).
// Uses your claude login (a few cents of tokens). Exits non-zero on failure.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { solidPng } from "./png.mjs";

const scenario = process.argv[2] ?? "basic";

const PORT = Number(process.env.E2E_PORT ?? 9477);
const work = join(tmpdir(), "bcu-e2e-work");
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

const app = spawn("npm run tauri dev", {
  shell: true,
  stdio: "ignore",
  env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` },
});

let browser;
const shots = process.env.E2E_SHOTS;
async function cleanup(code) {
  try { await browser?.close(); } catch {}
  spawn("taskkill", ["/F", "/T", "/PID", String(app.pid)], { stdio: "ignore" });
  spawn("taskkill", ["/F", "/IM", "better-claude-ui.exe"], { stdio: "ignore" });
  setTimeout(() => process.exit(code), 800);
}
const fail = (m) => { console.error("FAIL:", m); cleanup(1); };
const step = (m) => console.log("•", m);

try {
  for (let i = 0; i < 120 && !browser; i++) {
    try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`); } catch { await new Promise((r) => setTimeout(r, 1500)); }
  }
  if (!browser) throw new Error("could not attach to the app's WebView");
  let page;
  for (let i = 0; i < 60 && !page; i++) {
    page = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().startsWith("http://127.0.0.1:1420") || p.url().startsWith("http://localhost:1420") || p.url().startsWith("http://tauri.localhost"));
    if (!page) await new Promise((r) => setTimeout(r, 1000));
  }
  if (!page) throw new Error("app page not found; pages: " + browser.contexts().flatMap((c) => c.pages()).map((p) => p.url()).join(", "));
  page.setDefaultTimeout(90_000);
  step("attached to app window");

  await page.getByRole("heading", { name: "Home" }).waitFor();
  step("Home visible, CLI detected");
  await page.getByText(/Claude Code \d/).first().waitFor();

  if (scenario === "probe") {
    const r = await page.evaluate(() => ({
      speech: typeof window.SpeechRecognition !== "undefined" || typeof window.webkitSpeechRecognition !== "undefined",
      mic: !!navigator.mediaDevices?.getUserMedia,
      notification: typeof Notification !== "undefined",
      ua: navigator.userAgent.slice(0, 120),
    }));
    await page.evaluate(async (cwd) => { const { app } = await import("/src/lib/store.svelte.ts"); app.setMode("code"); await app.newSession({ cwd }); }, work);
    r.micButton = await page.getByRole("button", { name: "Dictate with your voice" }).isVisible().catch(() => false);
    r.attachButton = await page.getByRole("button", { name: "Attach files" }).isVisible().catch(() => false);
    console.log("PROBE", JSON.stringify(r));
    cleanup(0);
    await new Promise(() => {});
  }

  if (scenario === "projects") {
    const before = await page.evaluate(async () => { const { app } = await import("/src/lib/store.svelte.ts"); return JSON.parse(JSON.stringify(app.config.projects)); });
    let sessionId = null;
    try {
      await page.keyboard.press("Control+k");
      await page.getByLabel("Search commands").fill("projects");
      await page.keyboard.press("Enter");
      const dlg = page.getByRole("dialog", { name: "Projects" });
      await dlg.waitFor();
      await dlg.getByLabel("Name").fill("E2E Project");
      await dlg.getByLabel("Instructions").fill("Always end every reply with the exact word BANANAPHONE on its own line.");
      await dlg.getByRole("button", { name: "Create project" }).click();
      await dlg.getByRole("button", { name: "New chat" }).waitFor();
      step("project created");
      await dlg.getByRole("button", { name: "New chat" }).click();
      const box = page.getByLabel("Message");
      await box.waitFor();
      await box.fill("Say hello in one short sentence.");
      await box.press("Enter");
      await page.getByRole("button", { name: "Send" }).waitFor();
      const reply = (await page.locator(".assistant").last().innerText()).trim();
      step("reply: " + reply.replace(/\n/g, " | ").slice(0, 120));
      if (!reply.includes("BANANAPHONE")) throw new Error("project instructions were not applied");
      step("project instructions applied to the conversation");

      // Search finds the saved conversation by its content.
      sessionId = await page.evaluate(async () => { const { app } = await import("/src/lib/store.svelte.ts"); return app.active?.cliSessionId ?? null; });
      await new Promise((r) => setTimeout(r, 1500)); // transcript is saved on turn end
      await page.keyboard.press("Control+k");
      await page.getByLabel("Search commands").fill("bananaphone");
      const hit = page.getByRole("option").filter({ hasText: "BANANAPHONE".toLowerCase() }).first();
      await hit.waitFor({ timeout: 15000 });
      step("palette search found the conversation by content");
      await page.keyboard.press("Escape");
    } finally {
      await page.evaluate(async ([projects, sid]) => {
        const { app } = await import("/src/lib/store.svelte.ts");
        await app.updateConfig({ projects });
        const r = app.config.recents.find((x) => x.cli_session_id === sid);
        if (r) await app.forget(r);
      }, [before, sessionId]).catch(() => {});
    }
    console.log("E2E PROJECTS PASSED");
    cleanup(0);
    await new Promise(() => {});
  }

  if (scenario === "chat") {
    const prevTier = await page.evaluate(async () => {
      const { app } = await import("/src/lib/store.svelte.ts");
      const prev = app.config.tier;
      await app.updateConfig({ tier: "intermediate" });
      return prev;
    });
    const restore = () => page.evaluate(async (t) => { const { app } = await import("/src/lib/store.svelte.ts"); await app.updateConfig({ tier: t }); }, prevTier).catch(() => {});
    try {
      // Command palette: Ctrl+K, filter, Enter.
      await page.keyboard.press("Control+k");
      const pal = page.getByRole("dialog", { name: "Command palette" });
      await pal.waitFor();
      await pal.getByLabel("Search commands").fill("usage");
      await page.keyboard.press("Enter");
      await page.getByRole("heading", { name: "Usage" }).waitFor();
      step("palette: Ctrl+K -> 'usage' -> Usage page");
      await page.keyboard.press("Control+k");
      await page.getByLabel("Search commands").fill("new chat");
      await page.keyboard.press("Enter");
      await page.getByLabel("Message").waitFor();
      step("palette: 'new chat' started a chat");

      // Turn on web search before the first message (restarts the empty session with new flags).
      await page.getByLabel("Web search").check();
      await page.waitForFunction(async () => { const { app } = await import("/src/lib/store.svelte.ts"); return app.activeMeta?.webSearch === true; });
      step("web search enabled before first message (fresh restart path)");

      const box = page.getByLabel("Message");
      await box.fill("Use web search to find the current latest stable Node.js release version number. Reply in one short sentence including the version.");
      await box.press("Enter");
      // Answer any permission prompts (web tools go through the permission gate) until the turn ends.
      for (let i = 0; i < 120; i++) {
        if (await page.getByRole("button", { name: "Send" }).isVisible().catch(() => false)) break;
        const allow = page.getByRole("button", { name: "Allow", exact: true });
        if (await allow.isVisible().catch(() => false)) await allow.click().catch(() => {});
        await new Promise((r) => setTimeout(r, 1000));
      }
      await page.getByRole("button", { name: "Send" }).waitFor();
      const reply = (await page.locator(".assistant").last().innerText()).trim();
      step("reply: " + reply.slice(0, 140));
      if (!/\d+\.\d+/.test(reply)) throw new Error("no version number in reply");

      const tools = await page.evaluate(async () => { const { app } = await import("/src/lib/store.svelte.ts"); return app.active?.caps?.tools ?? null; });
      step("tools exposed to Chat: " + JSON.stringify(tools));
      if (!tools || tools.length !== 2 || !tools.includes("WebSearch") || !tools.includes("WebFetch")) throw new Error("Chat is not locked down to web tools: " + JSON.stringify(tools));

      await page.getByRole("button", { name: "Export" }).click();
      await page.getByText("Conversation copied as Markdown").waitFor();
      step("export copied the conversation");
    } finally {
      await restore();
    }
    console.log("E2E CHAT PASSED");
    cleanup(0);
    await new Promise(() => {});
  }

  if (scenario === "caps") {
    const prevTier = await page.evaluate(async (cwd) => {
      const { app } = await import("/src/lib/store.svelte.ts");
      const prev = app.config.tier;
      await app.updateConfig({ tier: "intermediate" });
      app.setMode("code");
      await app.newSession({ cwd });
      return prev;
    }, work);
    const restore = () => page.evaluate(async (t) => { const { app } = await import("/src/lib/store.svelte.ts"); await app.updateConfig({ tier: t }); }, prevTier).catch(() => {});
    try {
      step("code session started (tier temporarily intermediate)");
      // Wait for the CLI's init event (it carries slash commands) via the slash menu itself.
      const box = page.getByLabel("Message");
      let menu = false;
      for (let i = 0; i < 40 && !menu; i++) {
        await box.fill("");
        await box.fill("/rev");
        menu = await page.getByRole("listbox", { name: "Commands" }).isVisible().catch(() => false);
        if (!menu) await new Promise((r) => setTimeout(r, 1000));
      }
      if (!menu) throw new Error("slash menu never appeared");
      const options = await page.getByRole("listbox", { name: "Commands" }).getByRole("option").allInnerTexts();
      step(`slash menu: ${options.length} options, e.g. ` + options.slice(0, 3).join(" ; "));
      if (!options.some((o) => o.toLowerCase().includes("review"))) throw new Error("no review command offered");
      await box.press("Tab");
      const filled = await box.inputValue();
      if (!filled.startsWith("/") || !filled.endsWith(" ")) throw new Error("Tab did not complete the command: " + filled);
      step("Tab completed to: " + filled.trim());
      await box.fill("");

      await box.fill("Reply with the single word ok.");
      await box.press("Enter");
      await page.getByRole("button", { name: "Send" }).waitFor();
      step("first turn done (capabilities now reported)");
      await page.getByRole("button", { name: "Capabilities" }).click();
      const dlg = page.getByRole("dialog", { name: "Capabilities" });
      await dlg.waitFor();
      const tabsText = (await dlg.getByRole("tab").allInnerTexts()).join(" | ");
      step("capabilities tabs: " + tabsText);
      await dlg.getByRole("tab", { name: /Skills/ }).click();
      const skillCount = await dlg.locator(".rows li").count();
      step("skills listed: " + skillCount);
      await dlg.getByRole("tab", { name: /Plugins/ }).click();
      await dlg.getByRole("button", { name: "Show plugin details" }).click();
      await dlg.locator("pre.out").waitFor({ timeout: 60000 });
      step("claude plugin list output: " + (await dlg.locator("pre.out").innerText()).split("\n")[0].slice(0, 60));
      await dlg.getByRole("button", { name: "Close" }).click();

      await page.getByRole("button", { name: "Instructions and settings" }).click();
      const ed = page.getByRole("dialog", { name: "Instructions and settings" });
      await ed.waitFor();
      await ed.getByRole("tab", { name: "Project instructions" }).click();
      const ta = ed.getByLabel("Project instructions");
      await ta.fill("# E2E marker\nAlways answer in haiku.");
      await ed.getByRole("button", { name: "Save" }).click();
      await ed.getByText(/Saved\./).waitFor();
      const f = join(work, "CLAUDE.md");
      if (!existsSync(f) || !readFileSync(f, "utf8").includes("E2E marker")) throw new Error("CLAUDE.md not written to the project");
      step("CLAUDE.md saved in the project folder");
    } finally {
      await restore();
    }
    console.log("E2E CAPS PASSED");
    cleanup(0);
    await new Promise(() => {});
  }

  if (scenario === "attach") {
    await page.evaluate(async () => {
      const { app } = await import("/src/lib/store.svelte.ts");
      app.setMode("chat");
      await app.newSession();
    });
    step("chat session started");
    await page.locator('input[type=file]').setInputFiles([
      { name: "red.png", mimeType: "image/png", buffer: solidPng([255, 0, 0]) },
      { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("The secret word is PINEAPPLE.") },
    ]);
    await page.getByRole("list", { name: "Attachments" }).waitFor();
    step("2 attachment chips shown");
    const m = page.getByLabel("Message");
    await m.fill("What color is the attached image, and what is the secret word in the attached file? Reply exactly as: COLOR / WORD");
    await m.press("Enter");
    await page.getByRole("button", { name: "Send" }).waitFor();
    const reply = (await page.locator(".assistant").last().innerText()).toLowerCase();
    step(`reply: ${reply.trim()}`);
    if (!reply.includes("red") || !reply.includes("pineapple")) throw new Error("model did not see both attachments");
    console.log("E2E ATTACH PASSED");
    cleanup(0);
    await new Promise(() => {});
  }

  // Start a session in a scratch folder (bypasses the native folder dialog).
  await page.evaluate(async (cwd) => {
    const { app } = await import("/src/lib/store.svelte.ts");
    await app.newSession({ cwd });
  }, work);
  step("session started");

  const box = page.getByLabel("Message");
  await box.fill("Create a file named hello.txt containing exactly the word hi. Use the Write tool, then reply done.");
  await box.press("Enter");
  step("message sent");

  await page.getByRole("alertdialog").waitFor();
  step("permission prompt appeared");
  if (shots) await page.screenshot({ path: join(shots, "e2e-permission.png") });
  await page.getByRole("button", { name: "Allow", exact: true }).click();

  await page.getByRole("button", { name: "Send" }).waitFor(); // composer returns to idle when the turn ends
  step("turn finished");
  if (shots) await page.screenshot({ path: join(shots, "e2e-done.png") });

  const file = join(work, "hello.txt");
  if (!existsSync(file)) throw new Error("hello.txt was not created");
  if (!readFileSync(file, "utf8").toLowerCase().includes("hi")) throw new Error("hello.txt has wrong content");
  step("file created with expected content");

  const toolCards = await page.locator(".tool").count();
  if (toolCards < 1) throw new Error("no tool card rendered");
  step(`transcript shows ${toolCards} tool card(s)`);

  console.log("E2E PASSED");
  cleanup(0);
} catch (e) {
  fail(e?.message ?? String(e));
}
