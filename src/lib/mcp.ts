/** Building `claude mcp add/remove` argument lists from form input. No shell is involved:
 *  the app passes these as separate arguments to the CLI. */

export type Transport = "stdio" | "http" | "sse";
export type Scope = "local" | "project" | "user";

export interface McpForm {
  name: string;
  transport: Transport;
  /** Command (stdio) or URL (http/sse). */
  target: string;
  /** Extra arguments for stdio servers, space separated (quotes supported). */
  args: string;
  scope: Scope;
}

const NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;

function splitArgs(s: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

export type Built = { ok: true; args: string[]; display: string } | { ok: false; error: string };

export function buildMcpAdd(f: McpForm): Built {
  const name = f.name.trim();
  const target = f.target.trim();
  if (!NAME.test(name)) return { ok: false, error: "Name: use letters, numbers, - and _ (up to 40 characters)." };
  if (!target) return { ok: false, error: f.transport === "stdio" ? "Enter the command that starts the server." : "Enter the server URL." };
  if (f.transport !== "stdio" && !/^https?:\/\/\S+$/.test(target)) return { ok: false, error: "The URL must start with http:// or https://." };
  const args = ["mcp", "add", "--transport", f.transport, "--scope", f.scope, name];
  if (f.transport === "stdio") args.push("--", target, ...splitArgs(f.args));
  else args.push(target);
  return { ok: true, args, display: `claude ${args.join(" ")}` };
}

export function buildMcpRemove(name: string): Built {
  const n = name.trim();
  if (!/^[A-Za-z0-9][\w:.-]{0,79}$/.test(n)) return { ok: false, error: "That server name can't be removed from here." };
  const args = ["mcp", "remove", n];
  return { ok: true, args, display: `claude ${args.join(" ")}` };
}

/** Servers provided by plugins are managed through the plugin, not `claude mcp`. */
export function isPluginServer(name: string): boolean {
  return name.startsWith("plugin:");
}
