import type { CliStatus, FeatureInfo, SessionEventPayload, StartOptions } from "./types";

export const inTauri = (): boolean => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!inTauri()) return (await import("./mock")).mockInvoke<T>(cmd, args);
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

export const ipc = {
  cliStatus: (overridePath?: string | null) => invoke<CliStatus>("cli_status", { overridePath: overridePath ?? null }),
  startSession: (opts: StartOptions) => invoke<string>("start_session", { opts }),
  sendMessage: (sessionId: string, text: string) => invoke<void>("send_message", { sessionId, text }),
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

export async function pickFolder(): Promise<string | null> {
  if (!inTauri()) return "C:\\demo\\project";
  const { open } = await import("@tauri-apps/plugin-dialog");
  const r = await open({ directory: true, multiple: false });
  return typeof r === "string" ? r : null;
}
