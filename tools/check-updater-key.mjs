// Health check for the updater signing key setup. Run it before cutting a release:
//   node tools/check-updater-key.mjs
// It never prints key material. Exit code 0 means everything needed to publish updates is in place.
//
// Checks:
//  1. the public key committed in tauri.conf.json matches the working key and the protected backup
//  2. the working key and the protected backup are byte-identical
//  3. the backup key + password can actually sign (i.e. it decrypts) -- a backup that cannot sign is useless
//  4. the backup lives outside the user profile and AppData, and its files are read-only
//  5. the GitHub Actions signing secrets exist (names only; GitHub never returns their values)
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const home = process.env.USERPROFILE ?? process.env.HOME;
const work = join(home, ".bcu-updater");
const backup = process.platform === "win32" ? join(process.env.ProgramData ?? "C:\\ProgramData", "BetterClaudeUI", "updater-key-backup") : null;
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
const problems = [];
const ok = (m) => console.log("  ok  ", m);
const bad = (m) => { problems.push(m); console.log("  FAIL", m); };

console.log("Updater key health check");

// 1 + 2
const conf = JSON.parse(readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"));
const confPub = conf.plugins?.updater?.pubkey?.trim();
if (!confPub) bad("tauri.conf.json has no updater public key");
const workPub = existsSync(join(work, "updater.key.pub")) ? readFileSync(join(work, "updater.key.pub"), "utf8").trim() : null;
if (workPub && workPub === confPub) ok("working public key matches tauri.conf.json");
else if (workPub) bad("working public key does NOT match tauri.conf.json");
else console.log("  note  no working key on this machine (fine on a machine that only builds via CI)");

if (!backup) {
  console.log("  note  protected local backup is only managed on Windows; keep an equivalent read-only copy elsewhere");
} else if (!existsSync(backup)) {
  bad(`protected backup missing at ${backup} (create it: see docs/RELEASING.md)`);
} else {
  const files = ["updater.key", "updater.key.pub", "key.password"];
  const missing = files.filter((f) => !existsSync(join(backup, f)));
  if (missing.length) bad("backup is missing: " + missing.join(", "));
  else {
    const bpub = readFileSync(join(backup, "updater.key.pub"), "utf8").trim();
    if (bpub === confPub) ok("backup public key matches tauri.conf.json");
    else bad("backup public key does NOT match tauri.conf.json");
    if (existsSync(join(work, "updater.key"))) {
      if (sha(join(work, "updater.key")) === sha(join(backup, "updater.key"))) ok("backup private key is identical to the working key");
      else bad("backup private key DIFFERS from the working key");
    }
    // 3. the backup must really work
    try {
      const dir = join(tmpdir(), "bcu-key-check");
      mkdirSync(dir, { recursive: true });
      const f = join(dir, "probe.txt");
      writeFileSync(f, "probe");
      execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["tauri", "signer", "sign", "-f", join(backup, "updater.key"), "-p", readFileSync(join(backup, "key.password"), "utf8"), f], { stdio: "ignore", shell: process.platform === "win32" });
      if (statSync(f + ".sig").size > 0) ok("backup key and password can sign (it decrypts correctly)");
      else bad("backup produced an empty signature");
    } catch {
      bad("backup key + password could NOT sign anything");
    }
    // 4. location and read-only
    const lower = backup.toLowerCase();
    if (!lower.includes("appdata") && !lower.startsWith(home.toLowerCase())) ok("backup is outside the user profile and AppData");
    else bad("backup is inside the user profile or AppData");
    const writable = files.filter((f) => (statSync(join(backup, f)).mode & 0o200) !== 0);
    if (writable.length === 0) ok("backup files are read-only");
    else bad("backup files are writable: " + writable.join(", "));
  }
}

// 5
try {
  const names = execFileSync("gh", ["secret", "list"], { encoding: "utf8" }).split("\n").map((l) => l.split(/\s+/)[0]);
  for (const n of ["TAURI_SIGNING_PRIVATE_KEY", "TAURI_SIGNING_PRIVATE_KEY_PASSWORD"]) (names.includes(n) ? ok : bad)(`GitHub secret ${n} ${names.includes(n) ? "exists" : "is MISSING"}`);
} catch {
  console.log("  note  could not list GitHub secrets (gh not available or not logged in)");
}

console.log(problems.length ? `\n${problems.length} problem(s). Fix them before releasing.` : "\nAll good: updates can be published and the key can be recovered.");
process.exit(problems.length ? 1 : 0);
void resolve;
