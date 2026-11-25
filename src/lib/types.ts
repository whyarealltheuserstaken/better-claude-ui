// Mirrors the serde output of the Rust core (src-tauri/src/cli/events.rs, session/mod.rs).

export type Json = unknown;

export type Block =
  | { kind: "text"; text: string }
  | { kind: "thinking"; text: string }
  | { kind: "tool_use"; id: string; name: string; input: Record<string, unknown> };

export type CliEvent =
  | { kind: "session_init"; session_id: string; model: string; cwd: string }
  | { kind: "text_delta"; text: string; parent_tool_use_id: string | null }
  | { kind: "thinking_delta"; text: string; parent_tool_use_id: string | null }
  | { kind: "assistant_message"; blocks: Block[]; parent_tool_use_id: string | null }
  | { kind: "tool_result"; tool_use_id: string; output: string; is_error: boolean; parent_tool_use_id: string | null }
  | {
      kind: "permission_request";
      request_id: string;
      tool: string;
      input: Record<string, unknown>;
      description: string;
      tool_use_id: string;
    }
  | { kind: "permission_denied"; tool: string; message: string }
  | { kind: "turn_result"; is_error: boolean; result: string; cost_usd: number | null; session_id: string }
  | { kind: "info"; subtype: string }
  | { kind: "unknown"; raw: Json };

export type SessionEvent =
  | { type: "cli"; event: CliEvent }
  | { type: "stderr"; text: string }
  | { type: "error"; message: string }
  | { type: "exited"; code: number | null };

export interface SessionEventPayload {
  session_id: string;
  event: SessionEvent;
}

export type CliStatus =
  | { state: "found"; path: string; version: string }
  | { state: "not_found" }
  | { state: "unusable"; reason: string };

export interface PendingPermission {
  session_id: string;
  request_id: string;
  tool: string;
  input: Record<string, unknown>;
  description: string;
  tool_use_id: string;
}

export interface FeatureInfo {
  id: string;
  title: string;
  ui_slots: { slot: string; component: string }[];
}

export interface StartOptions {
  cwd?: string | null;
  model?: string | null;
  permission_mode?: string | null;
  resume?: string | null;
  no_tools?: boolean;
}

export type ChatItem =
  | { kind: "user"; id: string; text: string }
  | { kind: "assistant"; id: string; text: string; streaming: boolean; nested: boolean }
  | {
      kind: "tool";
      id: string;
      name: string;
      input: Record<string, unknown>;
      output: string | null;
      status: "running" | "done" | "error";
      nested: boolean;
    }
  | { kind: "notice"; id: string; level: "error" | "info"; text: string };

export type SessionStatus = "idle" | "running" | "exited";

export interface SessionState {
  items: ChatItem[];
  status: SessionStatus;
  cliSessionId: string | null;
  model: string | null;
  cwd: string | null;
  pending: PendingPermission[];
  /** Capped log of raw events for Advanced view. */
  raw: SessionEvent[];
  nextId: number;
}
