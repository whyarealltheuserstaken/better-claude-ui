// End-to-end test of the REAL app against the REAL `claude` CLI, driven over WebView2's debug port.
// Windows: starts `npm run tauri dev` itself. Usage: node tools/e2e.mjs
// Scenarios: `node tools/e2e.mjs` (permission flow, default) or `node tools/e2e.mjs attach` (image + text attachments in Chat).
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
