// End-to-end test of the REAL app against the REAL `claude` CLI, driven over WebView2's debug port.
// Windows: starts `npm run tauri dev` itself. Usage: node tools/e2e.mjs
// Scenarios: `node tools/e2e.mjs` (permission flow, default), `attach` (image + text attachments in Chat), `caps` (slash menu, capabilities panel, CLAUDE.md editor), `chat` (palette, web search in Chat, tool lockdown, export), `projects` (project instructions applied to a chat, conversation search), `autorefresh` (timer-driven refresh, nothing clicked; THROWAWAY profile), `limits` (stale allowance snapshot, reset window, live Refresh; THROWAWAY profile), `data` (export, import of Claude.ai/ChatGPT/Markdown files, archive, continue in a new chat; runs in a THROWAWAY profile), `widget` (live token counts in the usage widget, two short Haiku replies; THROWAWAY profile), `tray` (close to tray, a permission request while hidden, the panel's limits, quit confirmation; one Haiku request, THROWAWAY profile), `updater` (in-app updater against a local signed test server; never installs anything).
// Uses your claude login (a few cents of tokens). Exits non-zero on failure.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { solidPng } from "./png.mjs";
import { startUpdateServer } from "./update-server.mjs";

const scenario = process.argv[2] ?? "basic";

const PORT = Number(process.env.E2E_PORT ?? 9477);
const work = join(tmpdir(), "bcu-e2e-work");
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

let limitsProfile = null;
if (scenario === "limits" || scenario === "autorefresh") {
  const { writeFileSync } = await import("node:fs");
  limitsProfile = join(tmpdir(), `bcu-e2e-limits-${process.pid}`);
  rmSync(limitsProfile, { recursive: true, force: true });
  mkdirSync(limitsProfile, { recursive: true });
  writeFileSync(join(limitsProfile, "config.json"), JSON.stringify({ onboarded: true, tier: "intermediate", auto_update_check: false, ...(scenario === "autorefresh" ? { auto_refresh_limits: true, refresh_limits_minutes: 5 } : {}) }));
  const nowSec = Math.floor(Date.now() / 1000);
  // A deliberately stale snapshot (3 hours old): the 5-hour window has ALREADY RESET, the weekly one has not.
  if (scenario === "autorefresh") {
    // Due for a refresh: last updated 10 minutes ago with a 5-minute interval; no window has reset.
    writeFileSync(join(limitsProfile, "limits.json"), JSON.stringify({ captured_at: Date.now() - 10 * 60_000, status: "allowed", using_overage: false, windows: [
      { name: "five_hour", utilization: 0.05, resets_at: nowSec + 3 * 3600, status: "allowed" },
      { name: "seven_day", utilization: 0.05, resets_at: nowSec + 3 * 86400, status: "allowed" } ] }));
  } else
  writeFileSync(join(limitsProfile, "limits.json"), JSON.stringify({ captured_at: Date.now() - 3 * 3600_000, status: "allowed", using_overage: false, windows: [
    { name: "five_hour", utilization: 0.1, resets_at: nowSec - 600, status: "allowed" },
    { name: "seven_day", utilization: 0.05, resets_at: nowSec + 3 * 86400, status: "allowed" } ] }));
  process.env.BCU_CONFIG_DIR = limitsProfile; // debug-only override: the real profile is never touched
}

let dataProfile = null;
let dataInbox = null;
if (scenario === "data") {
  const { writeFileSync } = await import("node:fs");
  const { execFileSync } = await import("node:child_process");
  dataProfile = join(tmpdir(), `bcu-e2e-data-${process.pid}`);
  dataInbox = join(tmpdir(), `bcu-e2e-data-inbox-${process.pid}`);
  rmSync(dataProfile, { recursive: true, force: true });
  rmSync(dataInbox, { recursive: true, force: true });
  mkdirSync(dataProfile, { recursive: true });
  mkdirSync(join(dataInbox, "stage"), { recursive: true });
  writeFileSync(join(dataProfile, "config.json"), JSON.stringify({ onboarded: true, tier: "intermediate", auto_update_check: false }));
  process.env.BCU_CONFIG_DIR = dataProfile; // debug-only override: the real profile is never touched
  const claude = [
    { uuid: "c1", name: "Launch plan", created_at: "2026-03-01T10:00:00Z", updated_at: "2026-03-01T10:10:00Z", chat_messages: [
      { sender: "human", text: "Remember the launch code KUMQUAT-7731 for later, and that the launch is on a Tuesday.", created_at: "2026-03-01T10:00:00Z" },
      { sender: "assistant", text: "Noted: launch code KUMQUAT-7731, launching on a Tuesday.", created_at: "2026-03-01T10:00:20Z" } ] },
    { uuid: "c2", name: "Recipe ideas", created_at: "2026-03-02T09:00:00Z", chat_messages: [
      { sender: "human", text: "Give me a quick pasta idea." }, { sender: "assistant", text: "Garlic, olive oil and chilli." } ] },
  ];
  writeFileSync(join(dataInbox, "stage", "conversations.json"), JSON.stringify(claude));
  writeFileSync(join(dataInbox, "stage", "projects.json"), JSON.stringify([{ uuid: "p1", name: "Launch Project", description: "d", prompt_template: "Always answer in plain English." }]));
  writeFileSync(join(dataInbox, "stage", "users.json"), JSON.stringify([{ email: "private@example.com" }]));
  execFileSync("powershell", ["-NoProfile", "-Command", `Compress-Archive -Path '${join(dataInbox, "stage")}\\*' -DestinationPath '${join(dataInbox, "claude-export.zip")}'`]);
  const gpt = [{ title: "Plan a trip", create_time: 1700000000, conversation_id: "g1", current_node: "a2", mapping: {
    root: { id: "root", message: null, parent: null, children: ["u1"] },
    u1: { id: "u1", parent: "root", children: ["a1", "a2"], message: { author: { role: "user" }, content: { content_type: "text", parts: ["Where should I go?"] } } },
    a1: { id: "a1", parent: "u1", children: [], message: { author: { role: "assistant" }, content: { content_type: "text", parts: ["OLD answer"] } } },
    a2: { id: "a2", parent: "u1", children: [], message: { author: { role: "assistant" }, content: { content_type: "text", parts: ["Try Lisbon."] } } } } }];
  writeFileSync(join(dataInbox, "chatgpt-conversations.json"), JSON.stringify(gpt));
  writeFileSync(join(dataInbox, "notes.md"), "# Meeting notes\n\n## You\n\nSummarise the meeting.\n\n## Assistant\n\nThree action items.\n");
  writeFileSync(join(dataInbox, "bad.json"), "{\"hello\": \"world\"}");
  mkdirSync(join(dataInbox, "out"), { recursive: true });
}

let widgetProfile = null;
if (scenario === "widget") {
  const { writeFileSync } = await import("node:fs");
  widgetProfile = join(tmpdir(), `bcu-e2e-widget-${process.pid}`);
  rmSync(widgetProfile, { recursive: true, force: true });
  mkdirSync(widgetProfile, { recursive: true });
  writeFileSync(join(widgetProfile, "config.json"), JSON.stringify({ onboarded: true, tier: "intermediate", auto_update_check: false, default_model: "haiku" }));
  process.env.BCU_CONFIG_DIR = widgetProfile; // debug-only override: the real profile is never touched
}

let trayProfile = null;
if (scenario === "tray") {
  const { writeFileSync } = await import("node:fs");
  trayProfile = join(tmpdir(), `bcu-e2e-tray-${process.pid}`);
  rmSync(trayProfile, { recursive: true, force: true });
  mkdirSync(trayProfile, { recursive: true });
  writeFileSync(join(trayProfile, "config.json"), JSON.stringify({ onboarded: true, tier: "intermediate", auto_update_check: false, default_model: "haiku", tray: { enabled: true, keep_running: true } }));
  process.env.BCU_CONFIG_DIR = trayProfile; // debug-only override: the real profile is never touched
  process.env.BCU_OPEN_TRAY_PANEL = "1"; // debug-only: opens the panel, since nothing here can click the icon
}

let updateServer = null;
if (scenario === "updater") {
  updateServer = await startUpdateServer({ port: 9488, realArtifact: process.env.BCU_REAL_ARTIFACT ?? null, replayArtifact: process.env.BCU_REPLAY_ARTIFACT ?? null });
  process.env.BCU_UPDATE_ENDPOINT = updateServer.endpoint;
  console.log("• local update server at", updateServer.endpoint);
}

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
// Conversations created by a run are removed again so tests never pollute the real app data.
let tidy = async () => {};

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
  // Only conversations of sessions that are LIVE in this freshly launched app (opened by the test)
  // are removed. Anything that merely exists in the saved history is never touched.
  tidy = async () => {
    await page
      .evaluate(async () => {
        const { app } = await import("/src/lib/store.svelte.ts");
        const mine = new Set(app.metas.map((m) => app.states[m.id]?.cliSessionId).filter(Boolean));
        for (const r of [...app.config.recents]) if (mine.has(r.cli_session_id)) await app.forget(r);
      })
      .catch(() => {});
  };
  step("attached to app window");

  await page.getByRole("heading", { name: "Home" }).waitFor();
  step("Home visible, CLI detected");
  // Ask the app itself: where the version is shown depends on the Home layout the user has chosen.
  await page.waitForFunction(async () => { const { app } = await import("/src/lib/store.svelte.ts"); return app.cli?.state === "found"; });

  if (scenario === "tray") {
    const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
    const { execFileSync } = await import("node:child_process");
    const ps = (script) => execFileSync("powershell", ["-NoProfile", "-Command", script], { encoding: "utf8" }).trim();
    // Native window calls. A title alone is NOT enough: Explorer owns helper windows with the app's
    // title, so only a window belonging to the app's own process is ever looked at or messaged.
    const native = (title, call) => ps(`Add-Type -Namespace E2E -Name Win -MemberDefinition '[DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern System.IntPtr FindWindowEx(System.IntPtr p, System.IntPtr a, string c, string t); [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(System.IntPtr h, out uint pid); [DllImport("user32.dll")] public static extern bool IsWindowVisible(System.IntPtr h); [DllImport("user32.dll")] public static extern bool PostMessage(System.IntPtr h, uint m, System.IntPtr w, System.IntPtr l);'; $own = @(Get-Process better-claude-ui -ErrorAction SilentlyContinue | ForEach-Object Id); $h = [System.IntPtr]::Zero; $found = [System.IntPtr]::Zero; while (($h = [E2E.Win]::FindWindowEx([System.IntPtr]::Zero, $h, [NullString]::Value, '${title}')) -ne [System.IntPtr]::Zero) { $owner = [uint32]0; [void][E2E.Win]::GetWindowThreadProcessId($h, [ref]$owner); if ($own -contains [int]$owner) { $found = $h; break } }; if ($found -eq [System.IntPtr]::Zero) { 'missing' } else { $h = $found; ${call} }`);
    const visible = (title) => native(title, "[E2E.Win]::IsWindowVisible($h)");
    const closeWindow = (title) => native(title, "[E2E.Win]::PostMessage($h, 16, [System.IntPtr]::Zero, [System.IntPtr]::Zero)");
    const running = () => Number(ps("@(Get-Process better-claude-ui -ErrorAction SilentlyContinue).Count"));
    const store = (fn, arg) => page.evaluate(`(async (arg) => { const { app } = await import("/src/lib/store.svelte.ts"); return (${fn})(app, arg); })(${JSON.stringify(arg ?? null)})`);
    const until = async (what, check) => {
      for (let i = 0; i < 200; i++) {
        if (await check()) return;
        await new Promise((r) => setTimeout(r, 300));
      }
      throw new Error("timed out waiting: " + what);
    };

    await until("the tray icon", () => store("(app) => app.trayReady"));
    expect((await store("(app) => app.trayError")) === null, "the tray reported an error");
    step("tray icon created");

    let panel;
    await until("the tray panel page", () => (panel = browser.contexts().flatMap((c) => c.pages()).find((p) => new URL(p.url()).pathname === "/tray")));
    const panelText = () => panel.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
    await until("readings in the panel", async () => (await panelText()).includes("5-hour limit"));
    step("panel shows: " + (await panelText()));
    for (const cmd of ["get_config", "resolve_permission"]) {
      const answer = await panel.evaluate(async (c) => {
        try { await window.__TAURI_INTERNALS__.invoke(c, { requestId: "x", decision: "allow" }); return "allowed"; } catch (e) { return String(e); }
      }, cmd);
      expect(answer === "This window can't do that.", `the panel could call ${cmd}: ${answer}`);
    }
    step("the panel cannot call the app's commands");
    const press = (name) => panel.evaluate((n) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === n).click(), name);

    expect(visible("BetterClaudeUI") === "True", "the main window should start visible");
    closeWindow("BetterClaudeUI");
    await new Promise((r) => setTimeout(r, 2500));
    expect(running() === 1, "the app quit although Keep running is on");
    expect(visible("BetterClaudeUI") === "False", "the window did not hide");
    step("closing with Keep running on hid the window; the app is still running");

    // Starting the app again (Start menu) must bring this one back, not run a second copy over the same settings.
    // Same WebView2 arguments as the first copy: with different ones WebView2 refuses to start it at all.
    const second = spawn(join(process.cwd(), "src-tauri", "target", "debug", "better-claude-ui.exe"), [], { stdio: "ignore", env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` } });
    for (let i = 0; i < 50 && second.exitCode === null; i++) await new Promise((r) => setTimeout(r, 300));
    expect(second.exitCode !== null, "starting the app again left a second copy running");
    expect(running() === 1, "expected exactly one copy, found " + running());
    await until("the hidden window to come back", () => visible("BetterClaudeUI") === "True");
    step("starting the app again closed the new copy and showed the window");
    closeWindow("BetterClaudeUI");
    await until("the window to hide again", () => visible("BetterClaudeUI") === "False");

    await store("async (app, cwd) => { app.mode = 'code'; await app.newSession({ cwd }); await app.send('Use the Write tool to create hello.txt containing the word hi. Do nothing else.'); }", work);
    await until("a permission request while hidden", () => store("(app) => (app.active?.pending.length ?? 0) > 0"));
    await until("the tray being told while hidden", () => store("(app) => String(app.traySent).includes('\"waiting\":true')"));
    await until("the panel saying Claude is waiting", async () => (await panelText()).includes("Claude is waiting for you"));
    expect(!existsSync(join(work, "hello.txt")), "the file was written without approval");
    const buttons = await panel.evaluate(() => [...document.querySelectorAll("button")].map((b) => b.textContent.trim() || b.getAttribute("aria-label")));
    expect(!buttons.some((b) => /allow|approve|deny/i.test(b)), "the panel offers a permission button: " + buttons.join(", "));
    step("while hidden: permission waiting reached the tray and the panel, which cannot approve it");

    await press("Quit");
    await until("the quit question", () => native("Quit BetterClaudeUI?", "'found'") === "found");
    expect(running() === 1, "the app quit without asking while Claude was waiting");
    closeWindow("Quit BetterClaudeUI?");
    await new Promise((r) => setTimeout(r, 1500));
    expect(running() === 1, "dismissing the question still quit the app");
    step("Quit while waiting asked first; dismissing it kept the app running");

    await press("Open BetterClaudeUI");
    await until("the window to come back", () => visible("BetterClaudeUI") === "True");
    step("Open in the panel showed the window again");
    await store("async (app) => app.resolve(app.active.pending[0].request_id, 'deny')");
    await until("the reply to finish", () => store("(app) => app.active.status !== 'running' && app.active.pending.length === 0"));
    expect(!existsSync(join(work, "hello.txt")), "the denied file exists");
    if (shots) await page.screenshot({ path: join(shots, "tray-main.png") });
    await tidy();

    await store("async (app) => app.updateConfig({ tray: { ...app.tray, keep_running: false } })");
    await new Promise((r) => setTimeout(r, 1500));
    closeWindow("BetterClaudeUI");
    await until("the app to quit", () => running() === 0);
    step("closing with Keep running off quit the app, hidden panel and all");
    console.log("E2E TRAY PASSED");
    cleanup(0);
    await new Promise(() => {});
  }

  if (scenario === "widget") {
    const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
    const sum = (t) => (t ? t.input + t.output + t.cache_read + t.cache_write : 0);
    const read = () =>
      page.evaluate(async () => {
        const { app } = await import("/src/lib/store.svelte.ts");
        const { ipc } = await import("/src/lib/ipc.ts");
        const cid = app.active?.cliSessionId ?? null;
        return {
          status: app.active?.status ?? null,
          replies: app.active?.items.filter((i) => i.kind === "assistant").length ?? 0,
          data: JSON.parse(JSON.stringify(app.widgetData)),
          ledger: cid ? await ipc.usageSession(cid) : null,
          shown: document.querySelector('section[aria-label="Usage widget"]')?.innerText.replace(/\s+/g, " ") ?? "",
          error: app.error,
        };
      });
    await page.evaluate(async () => {
      const { app } = await import("/src/lib/store.svelte.ts");
      app.setMode("chat");
      await app.newSession();
    });
    let turns = 0;
    for (const prompt of ["In about 200 words, explain why the sea has tides.", "Now say the same in about 60 words."]) {
      const before = turns ? await read() : null;
      const box = page.getByLabel("Message", { exact: true });
      await box.fill(prompt);
      await box.press("Enter");
      const live = [];
      let now = await read();
      for (let i = 0; i < 400; i++) {
        now = await read();
        if (now.error) throw new Error("app error: " + now.error);
        if (now.status === "running" && now.data.reply) live.push({ reply: sum(now.data.reply), session: sum(now.data.session), shown: now.shown });
        if (i > 3 && now.status !== "running") break;
        await page.waitForTimeout(150);
      }
      turns += 1;
      await page.waitForTimeout(2000); // the usage log is read again shortly after the reply
      const done = await read();
      step(`reply ${turns}: ${live.length} samples while running, first ${live[0]?.reply ?? "none"}, last ${live.at(-1)?.reply ?? "none"}`);
      step(`reply ${turns} finished: widget reply ${sum(done.data.reply)}, session ${sum(done.data.session)}, usage log ${sum(done.ledger)}, cost ${done.data.sessionCost}`);
      step("widget shows: " + done.shown);
      expect(live.length > 0 && live.at(-1).reply > 0, "no token count appeared while the reply was running");
      expect(sum(done.data.reply) > 0, "no token count after the reply");
      expect(sum(done.data.session) === sum(done.ledger), "the session total differs from the usage log");
      const earlier = sum(before?.ledger);
      expect(sum(done.ledger) - earlier === sum(done.data.reply), `finished reply (${sum(done.data.reply)}) differs from what the usage log added (${sum(done.ledger) - earlier})`);
      expect(done.shown.includes("This reply") && !done.shown.includes("NaN"), "the widget is not showing its readings");
      expect(done.data.sessionCost > 0, "no session cost after the reply");
    }
    const limits = await page.evaluate(async () => (await import("/src/lib/store.svelte.ts")).app.limits?.windows.map((w) => `${w.name} ${Math.round(w.utilization * 100)}%`) ?? []);
    step("plan limits seen: " + (limits.join(", ") || "none reported"));
    if (shots) await page.screenshot({ path: join(shots, "widget.png") });
    await tidy();
    const { homedir } = await import("node:os");
    const cliDir = join(homedir(), ".claude", "projects", widgetProfile.replace(/[^A-Za-z0-9]/g, "-") + "-chat");
    if (cliDir.includes("bcu-e2e-widget") && existsSync(cliDir)) rmSync(cliDir, { recursive: true, force: true });
    console.log("E2E WIDGET PASSED");
    cleanup(0);
    await new Promise(() => {});
  }

  if (scenario === "autorefresh") {
    const fsx = await import("node:fs");
    const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
    const widget = page.locator("section.widget").filter({ hasText: "Plan usage limits" });
    await widget.waitFor();
    let txt = (await widget.innerText()).replace(/\s+/g, " ");
    step("start: " + txt.slice(0, 120));
    expect(/1\d min ago/.test(txt) && /may be behind/.test(txt), "expected a 10-15 minute-old snapshot at start");
    expect(/Refresh automatically every/.test(txt), "the automatic refresh control should be visible");
    // Nothing is clicked: the app must refresh on its own (first check runs about 20 s after launch).
    await page.waitForFunction(() => { const w = [...document.querySelectorAll("section.widget")].find((x) => x.textContent.includes("Plan usage limits")); return w && /Updated just now/.test(w.textContent); }, null, { timeout: 120000 });
    txt = (await widget.innerText()).replace(/\s+/g, " ");
    step("refreshed on its own: " + txt.slice(0, 120));
    const readLedger = () => { try { return fsx.readFileSync(join(limitsProfile, "usage.jsonl"), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
    expect(readLedger().filter((r) => r.session === "limits-refresh").length === 1, "expected exactly one automatic refresh");
    // The snapshot is fresh now, so the next minute-tick must NOT refresh again (interval is 5 minutes).
    await new Promise((r) => setTimeout(r, 75_000));
    expect(readLedger().filter((r) => r.session === "limits-refresh").length === 1, "it must not refresh again before the interval has passed");
    step("no second refresh after a further 75 s (interval is 5 min)");
    // Turning it off in the UI persists.
    await widget.getByRole("checkbox").uncheck();
    await new Promise((r) => setTimeout(r, 1500));
    const cfg = JSON.parse(fsx.readFileSync(join(limitsProfile, "config.json"), "utf8"));
    expect(cfg.auto_refresh_limits === false && cfg.refresh_limits_minutes === 5, "turning it off should be saved: " + JSON.stringify(cfg));
    step("switched off in the UI and saved");
    spawn("taskkill", ["/F", "/T", "/PID", String(app.pid)], { stdio: "ignore" });
    spawn("taskkill", ["/F", "/IM", "better-claude-ui.exe"], { stdio: "ignore" });
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      try { rmSync(limitsProfile, { recursive: true, force: true }); break; } catch { /* still closing */ }
    }
    const { homedir } = await import("node:os");
    const cliDir = join(homedir(), ".claude", "projects", limitsProfile.replace(/[^A-Za-z0-9]/g, "-") + "-chat");
    if (cliDir.includes("bcu-e2e-limits") && fsx.existsSync(cliDir)) rmSync(cliDir, { recursive: true, force: true });
    console.log("E2E AUTOREFRESH PASSED");
    cleanup(0);
    await new Promise(() => {});
  }

  if (scenario === "limits") {
    const fsx = await import("node:fs");
    const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
    const widget = page.locator("section.widget").filter({ hasText: "Plan usage limits" });
    await widget.waitFor();
    let txt = (await widget.innerText()).replace(/\s+/g, " ");
    step("stale snapshot shows: " + txt.slice(0, 200));
    expect(/3 h ago/.test(txt) && /may be behind/.test(txt), "expected an 'updated 3 h ago, may be behind' note");
    expect(/reset since the last update/.test(txt), "the already-reset 5-hour window must say it has reset, not show its old 10%");
    expect(!/\b10%/.test(txt), "the old 10% must not be shown for a window that has reset");
    expect(/5%/.test(txt), "the weekly window (not reset) still shows its saved value");
    await widget.getByRole("button", { name: "Refresh now" }).click();
    await page.waitForFunction(() => { const w = [...document.querySelectorAll("section.widget")].find((x) => x.textContent.includes("Plan usage limits")); return w && /Updated just now/.test(w.textContent); }, null, { timeout: 90000 });
    txt = (await widget.innerText()).replace(/\s+/g, " ");
    step("after Refresh: " + txt.slice(0, 220));
    expect(!/reset since the last update/.test(txt) && !/may be behind/.test(txt), "fresh numbers must not carry the stale warnings");
    const pcts = [...txt.matchAll(/(\d+)%/g)].map((m) => Number(m[1]));
    expect(pcts.length >= 2, "expected live percentages for both windows, got " + pcts);
    const snap = JSON.parse(fsx.readFileSync(join(limitsProfile, "limits.json"), "utf8"));
    expect(Date.now() - snap.captured_at < 120_000, "limits.json should have been refreshed");
    const ledger = fsx.readFileSync(join(limitsProfile, "usage.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(ledger.some((r) => r.session === "limits-refresh" && r.cost_usd > 0 && r.cost_usd < 0.05), "the tiny cost should be recorded in the usage ledger");
    step(`live five_hour/weekly from the real CLI: ${pcts.join("% / ")}%; refresh cost recorded: $${ledger.at(-1).cost_usd.toFixed(4)}`);
    spawn("taskkill", ["/F", "/T", "/PID", String(app.pid)], { stdio: "ignore" });
    spawn("taskkill", ["/F", "/IM", "better-claude-ui.exe"], { stdio: "ignore" });
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      try { rmSync(limitsProfile, { recursive: true, force: true }); break; } catch { /* still closing */ }
    }
    // The CLI also keeps a (empty) project folder for the scratch directory it ran in: remove ours.
    const { homedir } = await import("node:os");
    const cliDir = join(homedir(), ".claude", "projects", limitsProfile.replace(/[^A-Za-z0-9]/g, "-") + "-chat");
    if (cliDir.includes("bcu-e2e-limits") && fsx.existsSync(cliDir)) rmSync(cliDir, { recursive: true, force: true });
    console.log("E2E LIMITS PASSED");
    cleanup(0);
    await new Promise(() => {});
  }

  if (scenario === "data") {
    const fsx = await import("node:fs");
    const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
    page.on("dialog", (d) => d.accept()); // confirm() prompts (Remove from archive)
    // Route the native file/folder dialogs to paths chosen by this test. (The Tauri bridge itself is
    // immutable, so the dialog plugin module is replaced at the network layer instead.)
    await page.evaluate(() => { window.__pick = { file: null, dir: null }; });
    await page.route(/plugin-dialog.js/, (route) =>
      route.fulfill({ contentType: "text/javascript", body: "export async function open(o) { return o && o.directory ? window.__pick.dir : window.__pick.file; } export async function save() { return null; } export async function message() {} export async function ask() { return true; } export async function confirm() { return true; }" }),
    );
    const pick = (kind, path) => page.evaluate(([k, p]) => { window.__pick[k] = p; }, [kind, path]);
    const panel = page.getByRole("dialog", { name: "Import data" });
    const importFile = async (path, choose = "Choose a file…") => {
      await pick(choose.includes("folder") ? "dir" : "file", path);
      await panel.getByRole("button", { name: choose }).click();
    };

    // 1. The archive starts empty and offers an import.
    await page.getByRole("button", { name: /^Archive/ }).first().click();
    await page.getByText("Nothing here yet").waitFor();
    await page.getByRole("button", { name: "Import data" }).click();
    await panel.waitFor();
    step("archive starts empty; import panel opened");

    // 2. A Claude.ai-style ZIP: preview first, nothing saved yet.
    await importFile(join(dataInbox, "claude-export.zip"));
    await page.waitForFunction(() => { const d = document.querySelector('[aria-label="Import data"]'); return d && ([...d.querySelectorAll("button")].some((b) => b.textContent.trim() === "Import") || d.querySelector('[role="alert"]')); });
    if (await panel.getByRole("alert").count()) throw new Error("import preview failed: " + (await panel.getByRole("alert").innerText()) + " | zip entries: " + (await import("node:child_process")).execFileSync("powershell", ["-NoProfile", "-Command", "Add-Type -A System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::OpenRead('" + join(dataInbox, "claude-export.zip") + "').Entries.FullName -join ', '"]).toString().trim());
    let txt = await panel.innerText();
    step("preview: " + txt.replace(/\s+/g, " ").slice(0, 150));
    expect(/Claude\.ai export/.test(txt) && /2 conversations/.test(txt), "expected a Claude.ai export with 2 conversations");
    expect(/Projects \(1\)/.test(txt), "expected 1 project");
    expect(!/private@example\.com/.test(txt), "account details must never be read");
    expect(!fsx.existsSync(join(dataProfile, "archive")), "the preview must not save anything");
    await panel.getByRole("button", { name: "Import", exact: true }).click();
    await panel.getByText("Done.").waitFor();
    txt = await panel.innerText();
    step("imported: " + txt.replace(/\s+/g, " ").slice(0, 120));
    expect(/2 conversations added to your Archive/.test(txt) && /1 project added/.test(txt), "unexpected import summary");
    await panel.getByRole("button", { name: "Open Archive" }).click();
    await page.getByText("Launch plan").first().waitFor();

    // 3. ChatGPT tree (branch flattened) and a Markdown transcript, from the Archive page.
    await page.getByRole("button", { name: "Import…" }).click();
    await importFile(join(dataInbox, "chatgpt-conversations.json"));
    await panel.getByRole("button", { name: "Import", exact: true }).waitFor();
    expect(/latest branch/.test(await panel.innerText()), "expected the branch warning for ChatGPT");
    await panel.getByRole("button", { name: "Import", exact: true }).click();
    await panel.getByText("Done.").waitFor();
    await panel.getByRole("button", { name: "Close", exact: true }).first().click();
    await page.getByRole("button", { name: "Import…" }).click();
    await importFile(join(dataInbox, "notes.md"));
    await panel.getByRole("button", { name: "Import", exact: true }).click();
    await panel.getByText("Done.").waitFor();
    await panel.getByRole("button", { name: "Close", exact: true }).first().click();
    await page.getByText("Plan a trip").first().waitFor();
    await page.getByText("Meeting notes").first().waitFor();
    step("ChatGPT export (branch flattened) and Markdown note imported; archive has 4");

    // 4. Importing the same ZIP again adds nothing; junk is refused with a clear message.
    await page.getByRole("button", { name: "Import…" }).click();
    await importFile(join(dataInbox, "claude-export.zip"));
    await panel.getByRole("button", { name: "Import", exact: true }).click();
    await panel.getByText("Done.").waitFor();
    expect(/2 already here, skipped/.test(await panel.innerText()), "re-import should skip duplicates");
    step("re-import: 2 already here, skipped");
    await panel.getByRole("button", { name: "Close", exact: true }).first().click();
    await page.getByRole("button", { name: "Import…" }).click();
    await importFile(join(dataInbox, "bad.json"));
    await panel.getByRole("alert").waitFor();
    expect(/doesn't look like a chat export/.test(await panel.getByRole("alert").innerText()), "expected a clear error for a junk file");
    step("junk file refused with a clear message");
    await panel.getByRole("button", { name: "Close", exact: true }).click();

    // 5. Filter, open (read-only), and search by content.
    const filter = page.getByLabel("Filter conversations");
    await filter.fill("launch");
    expect((await page.locator("aside li button.item").count()) === 1, "filter should leave one conversation");
    await page.locator("aside li button.item").first().click();
    await page.getByText("KUMQUAT-7731").first().waitFor();
    expect(/Read-only/.test(await page.locator(".viewer").innerText()), "viewer should say read-only");
    await filter.fill("");
    await page.keyboard.press("Control+k");
    await page.getByLabel("Search commands").fill("kumquat");
    await page.getByRole("option").filter({ hasText: "kumquat" }).first().waitFor({ timeout: 15000 });
    step("filter, read-only viewer and palette search (by content) all work");
    await page.keyboard.press("Escape");

    // 6. Export everything, then check the files on disk.
    await pick("dir", join(dataInbox, "out"));
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("navigation", { name: "Settings categories" }).getByRole("button", { name: "Your data" }).click();
    const settings = page.locator("section.main");
    await settings.getByRole("button", { name: "Export all my data…" }).click();
    await settings.getByText(/Exported 4 conversations/).waitFor();
    const folders = fsx.readdirSync(join(dataInbox, "out"));
    expect(folders.length === 1 && folders[0].startsWith("better-claude-ui-export-"), "expected one export folder, got " + folders);
    const ex = join(dataInbox, "out", folders[0]);
    for (const f of ["backup.json", "universal.json", "README.txt"]) expect(fsx.existsSync(join(ex, f)), f + " missing");
    const universal = JSON.parse(fsx.readFileSync(join(ex, "universal.json"), "utf8"));
    expect(universal.format === "universal-chat-export" && universal.conversations.length === 4, "universal.json should hold 4 conversations");
    const mds = fsx.readdirSync(join(ex, "conversations"));
    expect(mds.length === 4 && mds.some((m) => /Launch plan/.test(m)), "expected 4 readable markdown files");
    expect(fsx.readFileSync(join(ex, "conversations", mds.find((m) => /Launch plan/.test(m))), "utf8").includes("KUMQUAT-7731"), "markdown should contain the conversation text");
    const backupText = fsx.readFileSync(join(ex, "backup.json"), "utf8");
    expect(!/private@example\.com/.test(backupText), "account details must not be in the export");
    step(`export: ${folders[0]} with backup.json, universal.json, ${mds.length} markdown files, README.txt`);
    await settings.getByRole("button", { name: "Back" }).click();

    // 7. Importing that export folder back must not duplicate anything.
    await page.getByRole("button", { name: "Import…" }).click();
    await importFile(ex, "Choose a folder…");
    await panel.getByRole("button", { name: "Import", exact: true }).waitFor();
    expect(/BetterClaudeUI backup/.test(await panel.innerText()), "expected a BetterClaudeUI backup");
    await panel.getByRole("button", { name: "Import", exact: true }).click();
    await panel.getByText("Done.").waitFor();
    txt = await panel.innerText();
    expect(/4 already here, skipped/.test(txt) && !/conversations? added to your Archive/.test(txt), "restoring into the same profile must not duplicate: " + txt);
    step("restoring the export into the same profile: 4 already here, nothing duplicated");
    await panel.getByRole("button", { name: "Close", exact: true }).first().click();

    // 8. Continue an archived conversation in a new chat: the real CLI must see the transcript.
    await page.getByLabel("Filter conversations").fill("launch");
    await page.locator("aside li button.item").first().click();
    await page.getByRole("button", { name: "Continue in a new chat" }).click();
    await page.getByRole("button", { name: "Send" }).waitFor();
    const reply = (await page.locator(".assistant").last().innerText()).toLowerCase();
    step("continued chat replied: " + reply.replace(/\s+/g, " ").trim().slice(0, 140));
    expect(reply.includes("kumquat-7731") || (reply.includes("kumquat") && reply.includes("tuesday")), "the model did not see the archived transcript");

    // 9. Remove from the archive.
    await page.getByRole("button", { name: /^Archive/ }).first().click();
    await page.getByLabel("Filter conversations").fill("meeting");
    await page.locator("aside li button.item").first().click();
    await page.getByRole("button", { name: "Remove" }).click();
    await page.getByLabel("Filter conversations").fill("");
    await page.waitForFunction(() => document.querySelectorAll("aside li button.item").length === 3);
    step("removed one conversation; 3 remain");

    // cleanup: the throwaway profile and the CLI's own record of the chat started in it
    const { homedir } = await import("node:os");
    const slug = dataProfile.replace(/[^A-Za-z0-9]/g, "-") + "-chat";
    const cliDir = join(homedir(), ".claude", "projects", slug);
    if (slug.includes("bcu-e2e-data") && fsx.existsSync(cliDir)) rmSync(cliDir, { recursive: true, force: true });
    // Stop the app first (it holds the profile folder open), then remove the throwaway data.
    spawn("taskkill", ["/F", "/T", "/PID", String(app.pid)], { stdio: "ignore" });
    spawn("taskkill", ["/F", "/IM", "better-claude-ui.exe"], { stdio: "ignore" });
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      try {
        rmSync(dataProfile, { recursive: true, force: true });
        rmSync(dataInbox, { recursive: true, force: true });
        break;
      } catch { /* still closing */ }
    }
    console.log("E2E DATA PASSED");
    cleanup(0);
    await new Promise(() => {});
  }

  if (scenario === "updater") {
    const before = await page.evaluate(async () => {
      const { app } = await import("/src/lib/store.svelte.ts");
      const c = { auto_update_check: app.config.auto_update_check, last_update_check: app.config.last_update_check, skipped_version: app.config.skipped_version, settings_category: app.config.settings_category };
      await app.updateConfig({ auto_update_check: false, skipped_version: null }); // keep the run deterministic
      return c;
    });
    try {
      const settings = page.locator("section.main");
      const categories = page.getByRole("navigation", { name: "Settings categories" });
      const openSettings = async () => {
        if (!(await categories.isVisible().catch(() => false))) await page.getByRole("button", { name: "Settings", exact: true }).click();
        await categories.getByRole("button", { name: "Updates" }).click();
      };
      const check = async () => {
        await openSettings();
        await settings.getByRole("button", { name: "Check for updates" }).click();
        await page.waitForFunction(() => { const t = document.querySelector("p.status")?.textContent ?? ""; return t && !t.startsWith("Checking"); });
        return (await settings.locator("p.status").innerText()).trim();
      };
      const panel = page.getByRole("dialog", { name: "App update" });
      const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

      // 1. Up to date: nothing is downloaded.
      updateServer.setMode("none");
      let t = await check();
      step("none -> " + t);
      expect(/up to date/i.test(t), "expected 'up to date'");
      expect(!updateServer.hits.some((h) => h.includes(".bin")), "the app downloaded something when it was up to date");

      // 2. A genuine, correctly signed update: found, downloaded, verified, ready. We stop there.
      updateServer.setMode("ok");
      t = await check();
      step("ok -> " + t);
      expect(/0\.1\.1 is available/.test(t), "expected version 0.1.1 to be offered");
      await settings.getByRole("button", { name: "View update" }).click();
      await panel.waitFor();
      expect((await panel.innerText()).includes("Test release notes"), "release notes not shown");
      await panel.getByRole("button", { name: "Download update" }).click();
      const install = panel.getByRole("button", { name: "Install and restart" });
      await install.waitFor();
      expect(await install.isEnabled(), "install should be enabled when nothing is running");
      step("ok -> downloaded and signature VERIFIED; Install is offered (NOT clicked)");
      await panel.getByRole("button", { name: "Later" }).click();

      // 2b. Optional: the REAL signed installer produced by `tauri build` verifies against the app's public key.
      if (process.env.BCU_REAL_ARTIFACT) {
        updateServer.setMode("none");
        await check();
        updateServer.setMode("real");
        t = await check();
        expect(/0\.1\.1 is available/.test(t), "real: expected the update to be offered");
        await settings.getByRole("button", { name: "View update" }).click();
        await panel.waitFor();
        await panel.getByRole("button", { name: "Download update" }).click();
        await page.waitForFunction(() => { const d = document.querySelector('[aria-label="App update"]'); return d && (d.querySelector(".err") || [...d.querySelectorAll("button")].some((b) => b.textContent.includes("Install and restart"))); });
        const realErr = panel.locator(".err");
        if (await realErr.count()) throw new Error("real installer was rejected: " + (await realErr.innerText()) + " | detail: " + (await panel.locator(".detail").textContent().catch(() => "")));
        await panel.getByRole("button", { name: "Install and restart" }).waitFor();
        step("REAL signed installer downloaded and verified against the app's public key (Install NOT clicked)");
        await panel.getByRole("button", { name: "Later" }).click();
      }

      // 2c. Optional: REPLAY. A genuine installer signed for an older version, announced as newer, must be rejected.
      if (process.env.BCU_REPLAY_ARTIFACT) {
        updateServer.setMode("none");
        await check();
        updateServer.setMode("replay");
        t = await check();
        expect(/0\.1\.1 is available/.test(t), "replay: expected the (fake) update to be offered");
        await settings.getByRole("button", { name: "View update" }).click();
        await panel.waitFor();
        await panel.getByRole("button", { name: "Download update" }).click();
        await panel.locator(".err").waitFor();
        const detail = (await panel.locator(".detail").textContent()) ?? "";
        expect(/signed for version 0\.1\.0 but the update endpoint announced version 0\.1\.1/.test(detail), "replay: expected the signed-version mismatch, got: " + detail);
        expect((await panel.getByRole("button", { name: "Install and restart" }).count()) === 0, "replay: Install must not be offered");
        step("REPLAY of an older genuine, validly signed installer announced as newer -> rejected (signed-version mismatch)");
        await panel.getByRole("button", { name: "Close", exact: true }).click();
      }

      // 3. Tampered bytes and a wrong signing key must be rejected at download, never installed.
      for (const bad of ["tampered", "wrongkey"]) {
        updateServer.setMode("none");
        await check(); // resets the pending update
        updateServer.setMode(bad);
        t = await check();
        expect(/0\.1\.1 is available/.test(t), bad + ": expected the update to be offered");
        await settings.getByRole("button", { name: "View update" }).click();
        await panel.waitFor();
        await panel.getByRole("button", { name: "Download update" }).click();
        const err = panel.locator(".err");
        await err.waitFor();
        const msg = (await err.innerText()).trim();
        step(bad + " -> " + msg);
        expect(/couldn't be verified/.test(msg) && /not installed/.test(msg), bad + ": expected a verification failure message");
        expect((await panel.getByRole("button", { name: "Install and restart" }).count()) === 0, bad + ": Install must not be offered");
        await panel.getByRole("button", { name: "Close", exact: true }).click();
      }

      // 4. Broken servers produce friendly messages and never break the app.
      for (const [mode, re] of [["badjson", /usable update information/], ["missing", /usable update information/]]) {
        updateServer.setMode(mode);
        t = await check();
        step(mode + " -> " + t);
        expect(re.test(t), mode + ": unexpected message: " + t);
      }
      await updateServer.close();
      t = await check();
      step("offline -> " + t);
      expect(/internet connection/.test(t), "offline: unexpected message: " + t);

      // The app is still fully usable afterwards.
      await settings.getByRole("button", { name: "Back" }).click();
      await page.getByRole("heading", { name: "Home" }).waitFor();
      step("app still usable after every failure");
    } finally {
      await page.evaluate(async (b) => { const { app } = await import("/src/lib/store.svelte.ts"); await app.updateConfig(b); }, before).catch(() => {});
    }
    await tidy();
    console.log("E2E UPDATER PASSED");
    cleanup(0);
    await new Promise(() => {});
  }

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
    await tidy();
    cleanup(0);
    await new Promise(() => {});
  }

  if (scenario === "preview") {
    await page.evaluate(async () => { const { app } = await import("/src/lib/store.svelte.ts"); app.setMode("chat"); await app.newSession(); });
    const box = page.getByLabel("Message");
    await box.fill("BCU-PREVIEW reply with exactly this markdown and nothing else:\n```html\n<h1 id=\"ok\">Hello preview</h1>\n<script>document.body.setAttribute('data-ran','1')</script>\n```");
    await box.press("Enter");
    await page.getByRole("button", { name: "Send" }).waitFor();
    step("reply with an html block received");
    await page.getByRole("button", { name: "Preview", exact: true }).first().click(); // real click, no force: nothing may overlap it
    const frame = page.frameLocator('iframe[title="Preview of the code block"]');
    const heading = await frame.locator("#ok").innerText();
    step("preview rendered: " + heading);
    if (heading !== "Hello preview") throw new Error("preview did not render");
    const ran = await frame.locator("body").getAttribute("data-ran");
    if (ran !== null) throw new Error("a script ran inside the sandboxed preview!");
    step("embedded script did not run; sandbox=" + JSON.stringify(await page.locator('iframe[title="Preview of the code block"]').getAttribute("sandbox")));
    await tidy();
    console.log("E2E PREVIEW PASSED");
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
      const dlg = page.locator("section.main");
      await dlg.getByRole("button", { name: "+ New project" }).click(); // never edit a project the test did not create
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
    await tidy();
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
      await page.getByLabel("Web search", { exact: true }).check();
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

      await page.getByRole("button", { name: "Export this conversation" }).click();
      await page.getByText("Conversation copied as Markdown").waitFor();
      step("export copied the conversation");
    } finally {
      await restore();
    }
    console.log("E2E CHAT PASSED");
    await tidy();
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
      const dlg = page.locator("section.main");
      await dlg.getByRole("tab", { name: /Skills/ }).waitFor();
      const tabsText = (await dlg.getByRole("tab").allInnerTexts()).join(" | ");
      step("capabilities tabs: " + tabsText);
      await dlg.getByRole("tab", { name: /Skills/ }).click();
      const skillCount = await dlg.locator(".rows li").count();
      step("skills listed: " + skillCount);
      await dlg.getByRole("tab", { name: /Plugins/ }).click();
      await dlg.getByRole("button", { name: "Show plugin details" }).click();
      await dlg.locator("pre.out").waitFor({ timeout: 60000 });
      step("claude plugin list output: " + (await dlg.locator("pre.out").innerText()).split("\n")[0].slice(0, 60));
      await dlg.getByRole("button", { name: "Back" }).click();

      await page.getByRole("button", { name: "Instructions", exact: true }).click();
      const ed = page.locator("section.main");
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
    await tidy();
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
    await tidy();
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
  await tidy();
  cleanup(0);
} catch (e) {
  await tidy();
  fail(e?.message ?? String(e));
}
