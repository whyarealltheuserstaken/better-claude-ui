import type { UpdateInfo } from "./updates";
import type { AppConfig, AuthStatus, CliOutput, LimitsSnapshot, UsageSummary, Preset, ChatItem, CliStatus, FeatureInfo, SessionEventPayload, StartOptions } from "./types";

export const inTauri = (): boolean => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!inTauri()) return (await import("./mock")).mockInvoke<T>(cmd, args);
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

export const ipc = {
  authStatus: () => invoke<AuthStatus>("auth_status"),
  installerPreview: () => invoke<string>("installer_preview"),
  runSetupStep: (step: "install" | "login") => invoke<number | null>("run_setup_step", { step }),
  usageSummary: (days: number) => invoke<UsageSummary>("usage_summary", { offsetMinutes: -new Date().getTimezoneOffset(), days }),
  usageLimits: () => invoke<LimitsSnapshot | null>("usage_limits"),
  usageClear: () => invoke<void>("usage_clear"),
  readConfigFile: (target: string, project: string | null) => invoke<string>("read_config_file", { target, project }),
  writeConfigFile: (target: string, project: string | null, content: string) =>
    invoke<void>("write_config_file", { target, project, content }),
  runCli: (args: string[], cwd: string | null) => invoke<CliOutput>("run_cli", { args, cwd }),
  openInTerminal: (cliSessionId: string, cwd: string | null) => invoke<void>("open_in_terminal", { cliSessionId, cwd }),
  searchConversations: (query: string) => invoke<{ cli_session_id: string; snippet: string }[]>("search_conversations", { query }),
  appVersion: () => invoke<string>("app_version"),
  checkForUpdate: () => invoke<UpdateInfo>("check_for_update"),
  downloadUpdate: () => invoke<void>("download_update"),
  installUpdate: () => invoke<void>("install_update"),
  listPresets: () => invoke<Preset[]>("list_presets"),
  getConfig: () => invoke<AppConfig>("get_config"),
  setConfig: (config: AppConfig) => invoke<void>("set_config", { config }),
  saveTranscript: (cliSessionId: string, items: ChatItem[]) =>
    invoke<void>("save_transcript", { cliSessionId, json: JSON.stringify(items) }),
  loadTranscript: async (cliSessionId: string): Promise<ChatItem[]> => {
    const j = await invoke<string | null>("load_transcript", { cliSessionId });
    try {
      return j ? (JSON.parse(j) as ChatItem[]) : [];
    } catch {
      return [];
    }
  },
  deleteTranscript: (cliSessionId: string) => invoke<void>("delete_transcript", { cliSessionId }),
  cliStatus: (overridePath?: string | null) => invoke<CliStatus>("cli_status", { overridePath: overridePath ?? null }),
  startSession: (opts: StartOptions) => invoke<string>("start_session", { opts }),
  sendMessage: (sessionId: string, text: string, attachments: { name: string; media_type: string; data: string }[] = []) =>
    invoke<void>("send_message", { sessionId, text, attachments }),
  interrupt: (sessionId: string) => invoke<void>("interrupt", { sessionId }),
  stopSession: (sessionId: string) => invoke<void>("stop_session", { sessionId }),
  resolvePermission: (requestId: string, decision: "allow" | "allow_always" | "deny", reason?: string) =>
    invoke<void>("resolve_permission", { requestId, decision, reason: reason ?? null }),
  listFeatures: () => invoke<FeatureInfo[]>("list_features"),
};

export async function onSessionEvent(handler: (p: SessionEventPayload) => void): Promise<() => void> {
  if (!inTauri()) return (await import("./mock")).mockListen(handler);
  const { listen } = await import("@tauri-apps/api/event");
  return listen<SessionEventPayload>("session-event", (e) => handler(e.payload));
}

export async function openUrl(url: string): Promise<void> {
  if (!/^https:\/\//.test(url)) return;
  if (!inTauri()) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  await openUrl(url);
}

export async function pickFolder(): Promise<string | null> {
  if (!inTauri()) return "C:\\demo\\project";
  const { open } = await import("@tauri-apps/plugin-dialog");
  const r = await open({ directory: true, multiple: false });
  return typeof r === "string" ? r : null;
}

export async function onSetupLog(handler: (line: string) => void): Promise<() => void> {
  if (!inTauri()) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  return listen<string>("setup-log", (e) => handler(e.payload));
}

export async function onUpdateProgress(handler: (downloaded: number, total: number | null) => void): Promise<() => void> {
  if (!inTauri()) return (await import("./mock")).mockUpdateProgress(handler);
  const { listen } = await import("@tauri-apps/api/event");
  return listen<{ downloaded: number; total: number | null }>("update-progress", (e) => handler(e.payload.downloaded, e.payload.total));
}
