// REAL install-and-relaunch test of the in-app updater. WINDOWS ONLY. It installs the app on this
// computer, so only run it with the owner's approval.
//
//   node tools/update-install-test.mjs --old <test-build 0.1.0 setup.exe> --new <signed 0.1.1 setup.exe>
//
// "--old" must be a build whose update endpoint points at https://127.0.0.1:9488/latest.json and that accepts the
// test server's throwaway self-signed certificate (build it with:
//   npm run tauri build -- --config '{"plugins":{"updater":{"endpoints":["https://127.0.0.1:9488/latest.json"],
//   "dangerousAcceptInvalidCerts":true}}}'  and the signing env vars). Release builds refuse plain-HTTP downloads.
// "--new" is a normally built installer signed for a HIGHER version (e.g. --config '{"version":"0.1.1"}').
//
// What it does: silent per-user install of OLD -> launch -> in the real UI: Settings, Check for updates,
// View update, Download, Install and restart (the only install click) -> waits for the relaunch ->
// confirms the installed program is now NEW -> uninstalls and cleans up (also on failure).
// Nothing is published; the update server is local only.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { startUpdateServer } from "./update-server.mjs";

const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const OLD = arg("--old");
const NEW = arg("--new");
if (process.platform !== "win32" || !OLD || !NEW || !existsSync(OLD) || !existsSync(NEW)) {
  console.error("usage (Windows): node tools/update-install-test.mjs --old <old setup.exe> --new <new setup.exe>");
  process.exit(2);
}

const PORT = 9482;
const installDir = join(process.env.LOCALAPPDATA, "BetterClaudeUI");
const ps = (script) => execFileSync("powershell", ["-NoProfile", "-Command", script], { encoding: "utf8" }).trim();
const log = (m) => console.log("•", m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const findExe = () => (existsSync(installDir) ? readdirSync(installDir).filter((f) => /\.exe$/i.test(f) && !/uninstall/i.test(f)).map((f) => join(installDir, f))[0] ?? null : null);
const versionOf = (exe) => ps(`(Get-Item '${exe}').VersionInfo.ProductVersion`);
const appRunning = () => ps(`@(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '${installDir}*' }).Count`);
const killApp = () => ps(`Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '${installDir}*' } | Stop-Process -Force -ErrorAction SilentlyContinue`);

// ---- preflight: refuse to touch an existing install or running copy ----
if (existsSync(installDir)) { console.error("ABORT: an install already exists at", installDir); process.exit(3); }
if (Number(ps("@(Get-Process better-claude-ui -ErrorAction SilentlyContinue).Count")) > 0) { console.error("ABORT: better-claude-ui is already running"); process.exit(3); }

const server = await startUpdateServer({ port: 9488, realArtifact: NEW, https: true });
server.setMode("real");
log("local update server up; serving the NEW installer as the update");
let browser;
let result = { ok: false };
try {
  // ---- 1. install OLD silently ----
  const t0 = Date.now();
  const inst = spawnSync(OLD, ["/S"], { stdio: "ignore" });
  const exe = findExe();
  if (inst.status !== 0 || !exe) throw new Error(`install failed (exit ${inst.status}, exe ${exe})`);
  const before = versionOf(exe);
  log(`installed OLD silently in ${((Date.now() - t0) / 1000).toFixed(1)}s: ${exe} (version ${before})`);

  // ---- 2. launch it with a debug port so the test can drive the real UI ----
  spawn(exe, [], { stdio: "ignore", detached: true, env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` } }).unref();
  for (let i = 0; i < 60 && !browser; i++) { try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`); } catch { await sleep(500); } }
  if (!browser) throw new Error("could not attach to the installed app");
  let page;
  for (let i = 0; i < 60 && !page; i++) { page = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().includes("tauri.localhost")); if (!page) await sleep(300); }
  page.setDefaultTimeout(60000);
  await page.getByRole("heading", { name: "Home" }).waitFor();
  log("installed app is running (release build, strict CSP)");

  // ---- 3. drive the update in the real UI ----
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("navigation", { name: "Settings categories" }).getByRole("button", { name: "Updates" }).click();
  const settings = page.locator("section.main");
  await settings.getByRole("button", { name: "Check for updates" }).click();
  await page.waitForFunction(() => /is available/.test(document.querySelector("p.status")?.textContent ?? ""));
  log("check found: " + (await settings.locator("p.status").innerText()).trim());
  await settings.getByRole("button", { name: "View update" }).click();
  const panel = page.getByRole("dialog", { name: "App update" });
  await panel.getByRole("button", { name: "Download update" }).click();
  const install = panel.getByRole("button", { name: "Install and restart" });
  await page.waitForFunction(() => { const d = document.querySelector('[aria-label="App update"]'); return d && (d.querySelector(".err") || [...d.querySelectorAll("button")].some((b) => b.textContent.includes("Install and restart"))); });
  if (await panel.locator(".err").count()) throw new Error("download step failed in the app: " + (await panel.locator(".err").innerText()) + " | " + ((await panel.locator(".detail").textContent().catch(() => "")) ?? ""));
  await install.waitFor();
  log("downloaded and signature verified; clicking Install and restart (the one approved install click)");
  const tClick = Date.now();
  await install.click().catch(() => {}); // the app exits during install; the click may report a closed page

  // ---- 4. wait for the installer to replace the program and relaunch it ----
  let after = before;
  let running = 0;
  for (let i = 0; i < 90; i++) {
    await sleep(2000);
    try { after = versionOf(findExe() ?? exe); } catch { /* file busy mid-replace */ }
    running = Number(appRunning());
    if (after !== before && running > 0) break;
  }
  log(`after ${((Date.now() - tClick) / 1000).toFixed(0)}s: installed version ${after}, processes running from the install dir: ${running}`);
  result = { ok: after !== before && running > 0, before, after, running };
} catch (e) {
  console.error("FAIL:", e?.message ?? e);
} finally {
  try { await browser?.close(); } catch { /* ignore */ }
  await server.close().catch(() => {});
  // ---- 5. always clean up: stop the app and uninstall it ----
  try { killApp(); await sleep(1500); } catch { /* ignore */ }
  const un = join(installDir, "uninstall.exe");
  if (existsSync(un)) {
    spawnSync(un, ["/S"], { stdio: "ignore" });
    for (let i = 0; i < 30 && existsSync(installDir) && readdirSync(installDir).some((f) => /\.exe$/i.test(f)); i++) await sleep(1000);
  }
  const gone = !existsSync(join(installDir, "uninstall.exe"));
  console.log(gone ? "• cleanup: uninstalled; no program files left behind" : "! cleanup: install dir still present, remove it manually: " + installDir);
}
console.log(result.ok ? `INSTALL TEST PASSED: ${result.before} -> ${result.after}, relaunched (${result.running} process(es))` : "INSTALL TEST FAILED");
process.exit(result.ok ? 0 : 1);
