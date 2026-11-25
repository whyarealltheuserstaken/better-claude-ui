// Runs an agent-team preset against the REAL `claude` CLI and reports what happened.
// USES TOKENS. Usage: node tools/preset-smoke.mjs <preset-id> "<prompt>" [budgetUsd=2] [model]
// Runs in a throwaway temp directory with permissions bypassed (test only: never do this in the app by default).
import { spawn } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [id, prompt, budget = "2", model = "sonnet"] = process.argv.slice(2);
if (!id || !prompt) {
  console.error('usage: node tools/preset-smoke.mjs <preset-id> "<prompt>" [budgetUsd] [model]');
  process.exit(2);
}
const preset = JSON.parse(readFileSync(new URL(`../src-tauri/presets/${id}.json`, import.meta.url), "utf8"));
const cwd = join(tmpdir(), `bcu-preset-${id}`);
rmSync(cwd, { recursive: true, force: true });
mkdirSync(cwd, { recursive: true });

const args = [
  "-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose", "--include-partial-messages",
  "--model", model, "--max-budget-usd", budget, "--permission-mode", "bypassPermissions",
  "--agents", JSON.stringify(preset.agents), "--append-system-prompt", preset.system_prompt,
];
const t0 = Date.now();
const at = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(6) + "s";
const child = spawn("claude", args, { cwd, stdio: ["pipe", "pipe", "pipe"], shell: process.platform === "win32" && false });

const agentStart = new Map(); // tool_use_id -> start ms
const agentEnd = new Map();
let result = null;
let buf = "";
child.stdout.on("data", (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i);
    buf = buf.slice(i + 1);
    let ev;
    try { ev = JSON.parse(line); } catch { continue; }
    if (ev.type === "assistant" && !ev.parent_tool_use_id) {
      for (const b of ev.message?.content ?? []) {
        if (b.type === "tool_use" && (b.name === "Agent" || b.name === "Task")) {
          agentStart.set(b.id, Date.now());
          console.log(at(), "DELEGATE →", b.input?.subagent_type ?? "?", "|", String(b.input?.description ?? b.input?.prompt ?? "").slice(0, 70));
        }
      }
    } else if (ev.type === "user" && !ev.parent_tool_use_id) {
      for (const b of ev.message?.content ?? []) {
        if (b.type === "tool_result" && agentStart.has(b.tool_use_id)) {
          agentEnd.set(b.tool_use_id, Date.now());
          console.log(at(), "agent finished");
        }
      }
    } else if (ev.type === "result") {
      result = ev;
    }
  }
});
let err = "";
child.stderr.on("data", (d) => (err += d));
child.stdin.write(JSON.stringify({ type: "user", message: { role: "user", content: prompt } }) + "\n");
child.stdin.end();

const killer = setTimeout(() => { console.error("TIMEOUT: killing"); child.kill(); }, 15 * 60 * 1000);
child.on("close", (code) => {
  clearTimeout(killer);
  const spans = [...agentStart].map(([k, s]) => [s, agentEnd.get(k) ?? Date.now()]);
  let overlap = false;
  for (let a = 0; a < spans.length; a++) for (let b = a + 1; b < spans.length; b++) if (spans[a][0] < spans[b][1] && spans[b][0] < spans[a][1]) overlap = true;
  const files = readdirSync(cwd).map((f) => `${f} (${statSync(join(cwd, f)).size} bytes)`);
  console.log("\n==== SUMMARY ====");
  console.log("exit code:", code, "| wall time:", at().trim());
  console.log("subagents launched:", agentStart.size, "| ran concurrently:", overlap);
  console.log("files in work dir:", files.join(", ") || "(none)");
  if (result) console.log("turns:", result.num_turns, "| cost USD:", result.total_cost_usd, "| is_error:", result.is_error, "| usage:", JSON.stringify(result.usage ?? {}).slice(0, 200));
  if (err.trim()) console.log("stderr:", err.trim().slice(0, 300));
  console.log("work dir:", cwd);
});
