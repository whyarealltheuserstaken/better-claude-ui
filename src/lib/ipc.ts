import type { ArchiveDoc, ArchiveEntry } from "./archive";
import type { ExportResult, ImportOptions, ImportResult, Inspection } from "./exchange";
import type { UpdateInfo } from "./updates";
import type { TrayPayload } from "./widget/tray";
import type { TrayAction, TrayView } from "./trayBridge";
import type { AppConfig, AuthStatus, CliOutput, LimitsSnapshot, Totals, UsageSummary, Preset, ChatItem, CliStatus, FeatureInfo, SessionEventPayload, StartOptions } from "./types";

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
  usageSession: (sessionId: string) => invoke<Totals>("usage_session", { sessionId }),
  trayApply: (enabled: boolean, keepRunning: boolean) => invoke<void>("tray_apply", { enabled, keepRunning }),
  trayUpdate: (status: TrayPayload) => invoke<void>("tray_update", { ...status }),
  trayOpen: () => invoke<void>("tray_open"),
  trayQuit: () => invoke<void>("tray_quit"),
  /** Main window to the tray panel, if one is open. */
  emitTray: async (view: TrayView): Promise<void> => {
    if (!inTauri()) return;
    const { emitTo } = await import("@tauri-apps/api/event");
    await emitTo("tray", "tray-state", view);
  },
  usageLimits: () => invoke<LimitsSnapshot | null>("usage_limits"),
  refreshLimits: () => invoke<LimitsSnapshot>("refresh_limits"),
  usageClear: () => invoke<void>("usage_clear"),
  readConfigFile: (target: string, project: string | null) => invoke<string>("read_config_file", { target, project }),
  writeConfigFile: (target: string, project: string | null, content: string) =>
    invoke<void>("write_config_file", { target, project, content }),
  runCli: (args: string[], cwd: string | null) => invoke<CliOutput>("run_cli", { args, cwd }),
  openInTerminal: (cliSessionId: string, cwd: string | null) => invoke<void>("open_in_terminal", { cliSessionId, cwd }),
  searchConversations: (query: string) => invoke<{ cli_session_id: string; snippet: string; archive?: boolean }[]>("search_conversations", { query }),
  appVersion: () => invoke<string>("app_version"),
  checkForUpdate: () => invoke<UpdateInfo>("check_for_update"),
  downloadUpdate: () => invoke<void>("download_update"),
  installUpdate: () => invoke<void>("install_update"),
  exportData: (folder: string) => invoke<ExportResult>("export_data", { folder }),
  inspectImport: (path: string) => invoke<Inspection>("inspect_import", { path }),
  runImport: (path: string, options: ImportOptions) => invoke<ImportResult>("run_import", { path, options }),
  archiveList: () => invoke<ArchiveEntry[]>("archive_list"),
  archiveGet: (id: string) => invoke<ArchiveDoc | null>("archive_get", { id }),
  archiveDelete: (id: string) => invoke<void>("archive_delete", { id }),
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

/** In the main window: what the tray panel asks for. Check it with parseTrayAction. */
export async function onTrayAction(handler: (raw: unknown) => void): Promise<() => void> {
  if (!inTauri()) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  return listen("tray-action", (e) => handler(e.payload));
}

/** In the tray panel. In a plain browser it shows sample numbers, for screenshots. */
export async function onTrayView(handler: (raw: unknown) => void): Promise<() => void> {
  if (!inTauri()) {
    handler((await import("./mock")).mockTrayView());
    return () => {};
  }
  const { listen } = await import("@tauri-apps/api/event");
  return listen("tray-state", (e) => handler(e.payload));
}

export async function sendTrayAction(action: TrayAction): Promise<void> {
  if (!inTauri()) return;
  const { emit } = await import("@tauri-apps/api/event");
  await emit("tray-action", action);
}

export async function hideThisWindow(): Promise<void> {
  if (!inTauri()) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().hide();
}

/** Make the standard title bar match the theme. Does nothing in a plain browser. */
export async function setWindowTheme(scheme: "dark" | "light"): Promise<void> {
  if (!inTauri()) return;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().setTheme(scheme);
  } catch {
    // Cosmetic only: an older system may not support it.
  }
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

/** Pick a file to import (a ZIP, JSON or Markdown/text file). */
export async function pickImportFile(): Promise<string | null> {
  if (!inTauri()) return "C:\\demo\\claude-export.zip";
  const { open } = await import("@tauri-apps/plugin-dialog");
  const r = await open({ multiple: false, directory: false, filters: [{ name: "Chat exports", extensions: ["zip", "json", "md", "markdown", "txt"] }] });
  return typeof r === "string" ? r : null;
}
