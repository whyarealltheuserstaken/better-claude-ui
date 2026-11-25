// Mirrors the serde output of the Rust core (src-tauri/src/cli/events.rs, session/mod.rs).

export type Json = unknown;

export type Block =
  | { kind: "text"; text: string }
  | { kind: "thinking"; text: string }
  | { kind: "tool_use"; id: string; name: string; input: Record<string, unknown> };

export type CliEvent =
  | { kind: "session_init"; session_id: string; model: string; cwd: string; caps?: Capabilities }
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
  | {
      kind: "turn_result";
      is_error: boolean;
      result: string;
      cost_usd: number | null;
      session_id: string;
      duration_ms?: number | null;
      num_turns?: number | null;
    }
  | { kind: "initialized"; info: InitInfo }
  | { kind: "rate_limit"; status: string; windows: RateWindow[]; using_overage: boolean }
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
  extra_args?: string[];
  preset?: string | null;
  web_search?: boolean;
  effort?: string | null;
  instructions?: string | null;
}

export type ChatItem =
  | { kind: "user"; id: string; text: string; attachments?: { name: string; kind: string }[] }
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
  /** What this session can do (slash commands, skills, MCP...), from the init event. */
  caps: Capabilities | null;
  /** Commands, agents and models from the initialize reply (available before the first message). */
  info: InitInfo | null;
  /** Cumulative API-equivalent cost of this session process, USD. */
  costUsd: number;
  /** Capped log of raw events for Advanced view. */
  raw: SessionEvent[];
  nextId: number;
}

export type Mode = "code" | "chat";

export interface SavedSession {
  cli_session_id: string;
  title: string;
  cwd: string | null;
  mode: Mode;
  model: string | null;
  preset: string | null;
  effort: string | null;
  web_search: boolean;
  project: string | null;
  updated_at: number;
}

export interface AppConfig {
  tier: "beginner" | "intermediate" | "advanced";
  onboarded: boolean;
  default_model: string | null;
  default_permission_mode: string | null;
  always_allow: string[];
  extra_args: string[];
  recents: SavedSession[];
  theme: string;
  style: string;
  custom_themes: unknown[];
  custom_styles: unknown[];
  budget_daily_usd: number | null;
  budget_monthly_usd: number | null;
  home_widgets: string[];
  projects: unknown[];
  auto_update_check: boolean;
  last_update_check: number | null;
  skipped_version: string | null;
}

export interface AgentDef {
  description: string;
  prompt: string;
  tools?: string[];
  model?: string;
}

export interface Preset {
  id: string;
  title: string;
  description: string;
  cost_note: string;
  agents: Record<string, AgentDef>;
  system_prompt: string;
  custom: boolean;
}

export type AuthStatus =
  | { state: "logged_in"; method: string; plan: string | null }
  | { state: "logged_out" }
  | { state: "unknown"; reason: string };

export interface Totals {
  cost_usd: number;
  input: number;
  output: number;
  cache_read: number;
  cache_write: number;
  turns: number;
}

export interface UsageSummary {
  today: Totals;
  week: Totals;
  month: Totals;
  all: Totals;
  by_model: { name: string; totals: Totals }[];
  by_project: { name: string; totals: Totals }[];
  daily: { date: string; cost_usd: number; tokens: number }[];
  days: number;
}

export interface RateWindow {
  name: string;
  utilization: number;
  resets_at: number | null;
  status: string;
}

export interface LimitsSnapshot {
  captured_at: number;
  status: string;
  using_overage: boolean;
  windows: RateWindow[];
}

export interface Capabilities {
  slash_commands: string[];
  skills: string[];
  agents: string[];
  tools: string[];
  mcp_servers: { name: string; status: string }[];
  plugins: string[];
  version: string;
}

export interface CliOutput {
  code: number | null;
  output: string;
}

export interface Described {
  name: string;
  description: string;
}

export interface ModelInfo {
  value: string;
  display_name: string;
  description: string;
}

export interface InitInfo {
  commands: Described[];
  agents: Described[];
  models: ModelInfo[];
  output_styles: string[];
  version: string;
}
