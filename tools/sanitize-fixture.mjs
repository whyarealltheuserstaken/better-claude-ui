// Strips machine-specific noise from a captured stream so it is safe to commit as a fixture.
// Usage: node tools/sanitize-fixture.mjs <in.jsonl> <out.jsonl>
import { readFileSync, writeFileSync } from "node:fs";

const [inp, out] = process.argv.slice(2);
const dropSubtypes = new Set(["commands_changed", "hook_response"]);
const keep = [];
let hookStartedKept = false;
for (const raw of readFileSync(inp, "utf8").split(/\r?\n/)) {
  if (!raw.trim() || raw.startsWith("// STDERR")) continue;
  if (raw.startsWith("//")) { keep.push(raw); continue; }
  let msg;
  try { msg = JSON.parse(raw); } catch { continue; }
  if (msg.type === "system") {
    if (dropSubtypes.has(msg.subtype)) continue;
    if (msg.subtype === "hook_started") { if (hookStartedKept) continue; hookStartedKept = true; }
    if (msg.subtype === "init") {
      msg.tools = ["Write", "Read", "Bash"];
      for (const k of ["mcp_servers", "slash_commands", "plugins", "agents", "skills"]) if (k in msg) msg[k] = [];
    }
  }
  if (msg.type === "rate_limit_event") continue;
  if (msg.type === "system" && msg.subtype === "thinking_tokens") continue;
  if (msg.type === "stream_event" && msg.event?.delta?.type === "input_json_delta") continue;
  if (raw.includes("Fact-Forcing")) continue;
  if (msg.type === "system" && msg.subtype === "init") delete msg.memory_paths;
  keep.push(JSON.stringify(msg));
}
const text = keep.filter((l) => !l.includes("henry") || l.includes("bcu-capture") || l.includes("spike1")).join("\n").replaceAll(/C:\\\\Users\\\\henry\\\\[^"]*?\\\\bcu-capture/g, "C:\\\\work")
  .replaceAll(/C:\\\\Users\\\\henry\\\\AppData[^"]*?spike1/g, "C:\\\\work");
writeFileSync(out, text + "\n");
console.log(`${keep.length} lines -> ${out}`);
