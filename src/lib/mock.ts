// Browser-only stand-in for the Tauri backend, so the UI can be developed and screenshotted
// with plain `npm run dev`. Never used inside the real app.
import type { CliEvent, SessionEventPayload, SessionEvent } from "./types";

type Handler = (p: SessionEventPayload) => void;
const handlers = new Set<Handler>();
let counter = 0;

const emit = (session_id: string, event: SessionEvent) => handlers.forEach((h) => h({ session_id, event }));
const cli = (id: string, event: CliEvent) => emit(id, { type: "cli", event });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function playTurn(id: string, text: string) {
  await wait(250);
  const reply = `Sure. Here's a quick plan for **${text.slice(0, 40)}**:\n\n1. Look at the project\n2. Make the change\n3. Run the tests\n\n\`\`\`ts\nexport const answer: number = 42;\n\`\`\`\n`;
  for (const ch of reply.match(/.{1,6}/gs) ?? []) {
    cli(id, { kind: "text_delta", text: ch, parent_tool_use_id: null });
    await wait(15);
  }
  const art = text.includes("artifact") ? "\n\n```html\n<h1 id=\"ok\">Hello preview</h1>\n<script>document.body.setAttribute('data-ran','1');parent.document.title='pwned'</script>\n```\n" : "";
  if (art) cli(id, { kind: "text_delta", text: art, parent_tool_use_id: null });
  cli(id, { kind: "assistant_message", blocks: [{ kind: "text", text: reply + art }], parent_tool_use_id: null });
  cli(id, { kind: "assistant_message", blocks: [{ kind: "tool_use", id: "t" + counter, name: "Write", input: { file_path: "C:\\demo\\project\\notes.txt", content: "hello" } }], parent_tool_use_id: null });
  cli(id, { kind: "permission_request", request_id: "r" + counter, tool: "Write", input: { file_path: "C:\\demo\\project\\notes.txt", content: "hello" }, description: "notes.txt", tool_use_id: "t" + counter });
}

const progressHandlers = new Set<(downloaded: number, total: number | null) => void>();
export function mockUpdateProgress(h: (downloaded: number, total: number | null) => void): () => void {
  progressHandlers.add(h);
  return () => progressHandlers.delete(h);
}

export async function mockInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  switch (cmd) {
    case "cli_status":
      return (localStorage.getItem("mock_setup") === "missing" ? { state: "not_found" } : { state: "found", path: "claude (mock)", version: "2.1.332" }) as T;
    case "start_session": {
      const id = "m" + ++counter;
      setTimeout(() => cli(id, { kind: "initialized", info: { commands: [{ name: "review", description: "Review a pull request" }, { name: "init", description: "Create a CLAUDE.md for this project" }, { name: "compact", description: "Summarize the conversation to free up context" }, { name: "security-review", description: "Review pending changes for security issues" }], agents: [], models: [{ value: "default", display_name: "Default (recommended)", description: "" }, { value: "opus", display_name: "Opus 5.5", description: "" }, { value: "sonnet", display_name: "Sonnet 5.5", description: "" }, { value: "haiku", display_name: "Haiku 5.5", description: "" }], output_styles: ["default"], version: "2.1.332" } }), 10);
      setTimeout(() => cli(id, { kind: "session_init", session_id: "cli-" + id, model: "claude-sonnet-5-5", cwd: "C:\\demo\\project", caps: { slash_commands: ["review", "init", "compact", "security-review", "superpowers:brainstorming"], skills: ["frontend-design:frontend-design", "superpowers:brainstorming"], agents: ["claude", "Explore"], tools: ["Bash", "Read", "Edit"], mcp_servers: [{ name: "github", status: "connected" }, { name: "chrome-devtools", status: "failed" }], plugins: ["superpowers"], version: "2.1.332" } }), 50);
      return id as T;
    }
    case "send_message":
      void playTurn(args!.sessionId as string, args!.text as string);
      return undefined as T;
    case "resolve_permission": {
      const sid = "m" + counter;
      cli(sid, { kind: "tool_result", tool_use_id: "t" + counter, output: "File created successfully", is_error: false, parent_tool_use_id: null });
      cli(sid, { kind: "turn_result", is_error: false, result: "done", cost_usd: 0.01, session_id: "cli-" + sid });
      return undefined as T;
    }
    case "auth_status":
      return (localStorage.getItem("mock_setup") === "loggedout" ? { state: "logged_out" } : { state: "logged_in", method: "claude.ai", plan: "pro" }) as T;
    case "installer_preview":
      return "irm https://claude.ai/install.ps1 | iex" as T;
    case "run_setup_step":
      return 0 as T;
    case "usage_summary": {
      const days = (args!.days as number) || 30;
      const daily = Array.from({ length: days }, (_, i) => {
        const d = new Date(Date.now() - (days - 1 - i) * 86400000);
        const c = i % 6 === 0 ? 0 : Math.abs(Math.sin(i * 1.7)) * 4;
        return { date: d.toISOString().slice(0, 10), cost_usd: c, tokens: Math.round(c * 180000) };
      });
      const t = (c: number, n: number) => ({ cost_usd: c, input: n * 20, output: n * 6, cache_read: n * 300, cache_write: n * 40, turns: n });
      return {
        today: t(2.41, 18), week: t(14.8, 120), month: t(41.3, 410), all: t(96.2, 1200),
        by_model: [{ name: "claude-opus-5-5", totals: t(30, 150) }, { name: "claude-sonnet-5-5", totals: t(10.4, 240) }, { name: "claude-haiku-5-5", totals: t(0.9, 20) }],
        by_project: [{ name: "C:\\demo\\project", totals: t(25, 200) }, { name: "Chat", totals: t(9, 150) }, { name: "C:\\demo\\other", totals: t(7.3, 60) }],
        daily, days,
      } as T;
    }
    case "usage_limits":
      return { captured_at: Date.now() - 60000, status: "allowed", using_overage: false, windows: [{ name: "five_hour", utilization: 0.62, resets_at: Math.floor(Date.now() / 1000) + 5400, status: "allowed" }, { name: "seven_day", utilization: 0.31, resets_at: Math.floor(Date.now() / 1000) + 3 * 86400, status: "allowed" }] } as T;
    case "usage_clear":
      return undefined as T;
    case "read_config_file":
      return (localStorage.getItem("mock_file_" + args!.target) ?? "") as T;
    case "write_config_file":
      localStorage.setItem("mock_file_" + args!.target, args!.content as string);
      return undefined as T;
    case "run_cli":
      return { code: 0, output: "mock: " + (args!.args as string[]).join(" ") } as T;
    case "open_in_terminal":
      return undefined as T;
    case "search_conversations":
      return [] as T;
    case "app_version":
      return "0.1.0" as T;
    case "check_for_update": {
      const mode = localStorage.getItem("mock_update") ?? "none";
      await wait(400);
      if (mode === "offline") throw { kind: "offline", message: "Couldn't reach the update server. Check your internet connection and try again.", detail: "mock" };
      if (mode === "available") return { available: true, current_version: "0.1.0", version: "0.2.0", notes: "- Faster startup\n- New themes\n- Fixes for resuming conversations", date: Math.floor(Date.now() / 1000) - 86400 } as T;
      return { available: false, current_version: "0.1.0", version: null, notes: null, date: null } as T;
    }
    case "download_update": {
      if (localStorage.getItem("mock_update") === "unverified") {
        await wait(300);
        throw { kind: "unverified", message: "The update couldn't be verified, so it was not installed. This protects you from tampered files.", detail: "mock" };
      }
      for (let i = 1; i <= 10; i++) {
        await wait(120);
        progressHandlers.forEach((h) => h(i * 400000, 4000000));
      }
      return undefined as T;
    }
    case "install_update":
      return undefined as T;
    case "list_presets":
      return [{ id: "deep-research", title: "Deep Research", description: "Mock preset", cost_note: "Costs more", agents: { researcher: { description: "r", prompt: "p" } }, system_prompt: "s", custom: false }] as T;
    case "get_config":
      return JSON.parse(localStorage.getItem("mock_config") ?? "null") ?? { tier: "beginner", onboarded: false, default_model: null, default_permission_mode: null, always_allow: [], extra_args: [], recents: [], theme: "auto", style: "modern", custom_themes: [], custom_styles: [], budget_daily_usd: null, budget_monthly_usd: null, projects: [], auto_update_check: true, last_update_check: null, skipped_version: null, home_widgets: ["quick-start", "limits", "spend-today", "spend-month", "daily-chart", "by-model", "by-project", "recent", "status"] } as T;
    case "set_config":
      localStorage.setItem("mock_config", JSON.stringify(args!.config));
      return undefined as T;
    case "save_transcript":
      localStorage.setItem("mock_t_" + args!.cliSessionId, args!.json as string);
      return undefined as T;
    case "load_transcript":
      return localStorage.getItem("mock_t_" + args!.cliSessionId) as T;
    case "delete_transcript":
      localStorage.removeItem("mock_t_" + args!.cliSessionId);
      return undefined as T;
    case "list_features":
      return [{ id: "code", title: "Code", ui_slots: [] }] as T;
    default:
      return undefined as T;
  }
}

export function mockListen(h: Handler): () => void {
  handlers.add(h);
  return () => handlers.delete(h);
}
