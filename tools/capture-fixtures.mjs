// Records real `claude` stream-json output for use as test fixtures and protocol docs.
// Usage: node tools/capture-fixtures.mjs <scenario> <outfile> [cwd]
//   scenarios: tool_permission | error_model
// Drives the CLI interactively over stdin so permission requests can be observed/answered.
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [scenario, outfile, cwdArg] = process.argv.slice(2);
const cwd = cwdArg ?? join(tmpdir(), "bcu-capture");
mkdirSync(cwd, { recursive: true });

const base = [
  "-p", "--input-format", "stream-json", "--output-format", "stream-json",
  "--include-partial-messages", "--verbose", "--permission-prompts", "host",
];
const scenarios = {
  tool_permission: {
    args: [],
    prompt: "Create a file named hello.txt in the current directory containing the word hi. Use the Write tool.",
  },
  error_model: { args: ["--model", "definitely-not-a-model"], prompt: "hello" },
};
const sc = scenarios[scenario];
if (!sc) throw new Error("unknown scenario");

const child = spawn("claude", [...base, ...sc.args, ...(process.env.EXTRA ? process.env.EXTRA.split(" ") : [])], { cwd, shell: process.platform === "win32" });
const lines = [];
let buf = "";
let answered = false;
child.stdout.on("data", (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    lines.push(line);
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    if (msg.type === "control_request" && !answered && process.env.ANSWER) {
      answered = true;
      const resp = JSON.parse(process.env.ANSWER.replace("$ID", msg.request_id));
      lines.push("// SENT " + JSON.stringify(resp));
      child.stdin.write(JSON.stringify(resp) + "\n");
    }
    if (msg.type === "result") finish();
  }
});
child.stderr.on("data", (d) => lines.push("// STDERR " + d.toString().trim()));
child.on("exit", (c) => { lines.push("// EXIT " + c); finish(); });

let done = false;
function finish() {
  if (done) return;
  done = true;
  writeFileSync(outfile, lines.join("\n") + "\n");
  child.kill();
  setTimeout(() => process.exit(0), 200);
}
setTimeout(finish, Number(process.env.WAIT_MS ?? 45000));

if (process.env.INIT) child.stdin.write(JSON.stringify({ type: "control_request", request_id: "init_1", request: { subtype: "initialize" } }) + "\n");
child.stdin.write(
  JSON.stringify({ type: "user", message: { role: "user", content: sc.prompt } }) + "\n",
);
