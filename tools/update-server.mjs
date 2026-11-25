// A local stand-in for the update server, for testing the in-app updater WITHOUT publishing anything.
// It signs a small dummy payload with the real updater key (read from ~/.bcu-updater, never printed)
// and serves update manifests in several states:
//   ok        newer version, genuine payload + valid signature
//   none      same version as the app (nothing to update)
//   tampered  valid signature, but the served bytes were modified
//   wrongkey  payload signed with a different (throwaway) key
//   badjson   garbage instead of a manifest
//   missing   404
//   real      (needs `realArtifact`) a real installer from `tauri build`, signed for the announced version
//   replay    (needs `replayArtifact`) a real installer signed for an OLDER version, announced as newer
// The dummy payload is NOT an installer: tests must stop at "ready to install" and never call install.
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const run = (args) => execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["tauri", ...args], { stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32" });

function sign(keyPath, password, file) {
  run(["signer", "sign", "-f", keyPath, "-p", password, file]);
  return readFileSync(file + ".sig", "utf8").trim();
}

export async function startUpdateServer({ port = 9488, appVersion = "0.1.0", newVersion = "0.1.1", realArtifact = null, replayArtifact = null } = {}) {
  const home = process.env.USERPROFILE ?? process.env.HOME;
  const keyPath = join(home, ".bcu-updater", "updater.key");
  const password = readFileSync(join(home, ".bcu-updater", "key.password"), "utf8");
  const dir = join(tmpdir(), "bcu-update-server");
  mkdirSync(dir, { recursive: true });

  const payload = Buffer.from("BCU-DUMMY-UPDATE-PAYLOAD-NOT-AN-INSTALLER-" + "x".repeat(300000));
  const good = join(dir, "good.bin");
  writeFileSync(good, payload);
  const goodSig = sign(keyPath, password, good);

  // A throwaway second key: its signatures must be rejected by the app.
  const otherKey = join(dir, "other.key");
  run(["signer", "generate", "--ci", "-f", "-p", "otherpw", "-w", otherKey]);
  const other = join(dir, "other.bin");
  writeFileSync(other, payload);
  const otherSig = sign(otherKey, "otherpw", other);

  const tampered = Buffer.from(payload);
  tampered[100] ^= 0xff;

  // Optional: a real installer built by `tauri build` plus its .sig, served in mode "real".
  const realBytes = realArtifact ? readFileSync(realArtifact) : null;
  const realSig = realArtifact ? readFileSync(realArtifact + ".sig", "utf8").trim() : null;

  const replayBytes = replayArtifact ? readFileSync(replayArtifact) : null;
  const replaySig = replayArtifact ? readFileSync(replayArtifact + ".sig", "utf8").trim() : null;

  let mode = "ok";
  const hits = [];
  const base = `http://127.0.0.1:${port}`;
  const manifest = (version, url, signature) => JSON.stringify({
    version,
    notes: "- Test release notes\n- Served by the local test server",
    pub_date: new Date().toISOString(),
    platforms: { "windows-x86_64": { signature, url }, "linux-x86_64": { signature, url }, "darwin-x86_64": { signature, url }, "darwin-aarch64": { signature, url } },
  });

  const server = createServer((req, res) => {
    hits.push(req.method + " " + req.url);
    const send = (status, body, type = "application/json") => { res.writeHead(status, { "content-type": type, "content-length": Buffer.byteLength(body) }); res.end(body); };
    if (req.url.startsWith("/__mode/")) { mode = req.url.slice(8); return send(200, mode, "text/plain"); }
    if (req.url === "/latest.json") {
      if (mode === "missing") return send(404, "not found", "text/plain");
      if (mode === "badjson") return send(200, "{this is not json");
      if (mode === "replay" && replayBytes) return send(200, manifest(newVersion, `${base}/replay.bin`, replaySig));
      if (mode === "real" && realBytes) return send(200, manifest(newVersion, `${base}/real.bin`, realSig));
      if (mode === "none") return send(200, manifest(appVersion, `${base}/good.bin`, goodSig));
      if (mode === "wrongkey") return send(200, manifest(newVersion, `${base}/other.bin`, otherSig));
      if (mode === "tampered") return send(200, manifest(newVersion, `${base}/tampered.bin`, goodSig));
      return send(200, manifest(newVersion, `${base}/good.bin`, goodSig));
    }
    if (req.url === "/replay.bin" && replayBytes) return send(200, replayBytes, "application/octet-stream");
    if (req.url === "/real.bin" && realBytes) return send(200, realBytes, "application/octet-stream");
    if (req.url === "/good.bin") return send(200, payload, "application/octet-stream");
    if (req.url === "/other.bin") return send(200, payload, "application/octet-stream");
    if (req.url === "/tampered.bin") return send(200, tampered, "application/octet-stream");
    send(404, "not found", "text/plain");
  });
  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  return {
    endpoint: `${base}/latest.json`,
    setMode: (m) => { mode = m; },
    hits,
    close: () => new Promise((r) => server.close(r)),
  };
}

// Run standalone: node tools/update-server.mjs [port]
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`) {
  const s = await startUpdateServer({ port: Number(process.argv[2] ?? 9488) });
  console.log("update test server on", s.endpoint, "(switch mode: GET /__mode/<ok|none|tampered|wrongkey|badjson|missing>)");
}
