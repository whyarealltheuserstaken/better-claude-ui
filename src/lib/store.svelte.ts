import { ipc, onSessionEvent, pickFolder } from "./ipc";
import { addUserMessage, initialState, reduce, removePending } from "./reducer";
import type { CliStatus, SessionState, StartOptions } from "./types";

export interface SessionMeta {
  id: string;
  title: string;
  cwd: string | null;
}

const folderName = (p: string | null) => (p ? (p.split(/[\\/]/).filter(Boolean).pop() ?? p) : "Session");

class AppStore {
  cli = $state<CliStatus | null>(null);
  cliChecked = $state(false);
  metas = $state<SessionMeta[]>([]);
  states = $state<Record<string, SessionState>>({});
  activeId = $state<string | null>(null);
  error = $state<string | null>(null);
  private unlisten: (() => void) | null = null;

  active = $derived(this.activeId ? (this.states[this.activeId] ?? null) : null);

  async init() {
    this.unlisten ??= await onSessionEvent((p) => {
      // Events can arrive before start_session resolves, so create state on first sight.
      this.states[p.session_id] = reduce(this.states[p.session_id] ?? initialState(), p.event);
    });
    await this.checkCli();
  }

  async checkCli(overridePath?: string | null) {
    try {
      this.cli = await ipc.cliStatus(overridePath);
    } catch (e) {
      this.cli = { state: "unusable", reason: String(e) };
    }
    this.cliChecked = true;
  }

  async newSession(opts: StartOptions = {}) {
    this.error = null;
    try {
      const cwd = opts.cwd ?? (await pickFolder());
      if (!cwd) return;
      const id = await ipc.startSession({ ...opts, cwd });
      this.states[id] ??= initialState();
      this.metas = [...this.metas, { id, title: folderName(cwd), cwd }];
      this.activeId = id;
    } catch (e) {
      this.error = String(e);
    }
  }

  select(id: string) {
    this.activeId = id;
  }

  async send(text: string) {
    const id = this.activeId;
    if (!id || !text.trim()) return;
    this.states[id] = addUserMessage(this.states[id], text);
    try {
      await ipc.sendMessage(id, text);
    } catch (e) {
      this.error = String(e);
    }
  }

  async interrupt() {
    if (this.activeId) await ipc.interrupt(this.activeId).catch((e) => (this.error = String(e)));
  }

  async resolve(requestId: string, decision: "allow" | "allow_always" | "deny") {
    const id = this.activeId;
    if (!id) return;
    this.states[id] = removePending(this.states[id], requestId);
    await ipc.resolvePermission(requestId, decision).catch((e) => (this.error = String(e)));
  }

  async close(id: string) {
    await ipc.stopSession(id).catch(() => {});
    this.metas = this.metas.filter((m) => m.id !== id);
    delete this.states[id];
    if (this.activeId === id) this.activeId = this.metas.at(-1)?.id ?? null;
  }
}

export const app = new AppStore();
