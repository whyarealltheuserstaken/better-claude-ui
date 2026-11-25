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
  cli(id, { kind: "assistant_message", blocks: [{ kind: "text", text: reply }], parent_tool_use_id: null });
  cli(id, { kind: "assistant_message", blocks: [{ kind: "tool_use", id: "t" + counter, name: "Write", input: { file_path: "C:\\demo\\project\\notes.txt", content: "hello" } }], parent_tool_use_id: null });
  cli(id, { kind: "permission_request", request_id: "r" + counter, tool: "Write", input: { file_path: "C:\\demo\\project\\notes.txt", content: "hello" }, description: "notes.txt", tool_use_id: "t" + counter });
}

export async function mockInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  switch (cmd) {
    case "cli_status":
      return { state: "found", path: "claude (mock)", version: "mock" } as T;
    case "start_session": {
      const id = "m" + ++counter;
      setTimeout(() => cli(id, { kind: "session_init", session_id: "cli-" + id, model: "claude-sonnet-5-5", cwd: "C:\\demo\\project" }), 50);
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
    case "list_presets":
      return [{ id: "deep-research", title: "Deep Research", description: "Mock preset", cost_note: "Costs more", agents: { researcher: { description: "r", prompt: "p" } }, system_prompt: "s", custom: false }] as T;
    case "get_config":
      return JSON.parse(localStorage.getItem("mock_config") ?? "null") ?? { tier: "beginner", onboarded: false, default_model: null, default_permission_mode: null, always_allow: [], extra_args: [], recents: [] } as T;
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
