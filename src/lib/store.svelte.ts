import { type PendingAttachment, composeText, toWire } from "./attachments";
import { exportMarkdown } from "./export";
import { ipc, onSessionEvent, pickFolder } from "./ipc";
import { addUserMessage, initialState, reduce, removePending, restoreItems } from "./reducer";
import { type Caps, capsFor, normalizeTier } from "./tier";
import type { AppConfig, AuthStatus, LimitsSnapshot, UsageSummary, ChatItem, Preset, CliStatus, Mode, SavedSession, SessionState, StartOptions } from "./types";

export interface SessionMeta {
  id: string;
  title: string;
  cwd: string | null;
  mode: Mode;
  model: string | null;
  permissionMode: string | null;
  preset: string | null;
  effort: string | null;
  webSearch: boolean;
}

const folderName = (p: string | null) => (p ? (p.split(/[\\/]/).filter(Boolean).pop() ?? p) : "Session");

const defaultConfig = (): AppConfig => ({
  tier: "beginner",
  onboarded: false,
  default_model: null,
  default_permission_mode: null,
  always_allow: [],
  extra_args: [],
  recents: [],
  theme: "auto",
  style: "modern",
  custom_themes: [],
  custom_styles: [],
  budget_daily_usd: null,
  budget_monthly_usd: null,
  home_widgets: ["quick-start", "limits", "spend-today", "spend-month", "daily-chart", "by-model", "by-project", "recent", "status"],
});

/** First user message, trimmed, as a human title for a chat. */
export function titleFrom(items: ChatItem[], fallback: string): string {
  const u = items.find((i) => i.kind === "user");
  if (!u || u.kind !== "user") return fallback;
  const t = u.text.replace(/\s+/g, " ").trim();
  return t.length > 48 ? t.slice(0, 47) + "…" : t || fallback;
}

class AppStore {
  cli = $state<CliStatus | null>(null);
  cliChecked = $state(false);
  config = $state<AppConfig>(defaultConfig());
  configLoaded = $state(false);
  mode = $state<Mode>("code");
  metas = $state<SessionMeta[]>([]);
  states = $state<Record<string, SessionState>>({});
  activeId = $state<string | null>(null);
  error = $state<string | null>(null);
  showSettings = $state(false);
  showPresets = $state(false);
  showCaps = $state(false);
  showPalette = $state(false);
  toast = $state<string | null>(null);
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  showEditor = $state(false);
  view = $state<"home" | "session" | "usage">("home");
  limits = $state<LimitsSnapshot | null>(null);
  usage = $state<UsageSummary | null>(null);
  usageDays = $state(30);
  homeEditing = $state(false);
  auth = $state<AuthStatus | null>(null);
  authSkipped = $state(false);
  presets = $state<Preset[]>([]);
  private unlisten: (() => void) | null = null;

  active = $derived(this.activeId ? (this.states[this.activeId] ?? null) : null);
  activeMeta = $derived(this.metas.find((m) => m.id === this.activeId) ?? null);
  tier = $derived(normalizeTier(this.config.tier));
  caps: Caps = $derived(capsFor(this.tier));
  visibleMetas = $derived(this.metas.filter((m) => m.mode === this.mode));
  recents = $derived(
    this.config.recents.filter(
      (r) => r.mode === this.mode && !this.metas.some((m) => this.states[m.id]?.cliSessionId === r.cli_session_id),
    ),
  );

  async init() {
    this.unlisten ??= await onSessionEvent((p) => {
      // Events can arrive before start_session resolves, so create state on first sight.
      this.states[p.session_id] = reduce(this.states[p.session_id] ?? initialState(), p.event);
      if (p.event.type === "cli") {
        const e = p.event.event;
        if (e.kind === "turn_result") {
          void this.persist(p.session_id);
          setTimeout(() => void this.refreshUsage(), 700);
        } else if (e.kind === "rate_limit" && e.windows.length > 0) {
          this.limits = { captured_at: Date.now(), status: e.status, using_overage: e.using_overage, windows: e.windows };
        }
      }
    });
    try {
      this.config = { ...defaultConfig(), ...(await ipc.getConfig()) };
    } catch (e) {
      this.error = String(e);
    }
    this.configLoaded = true;
    this.presets = await ipc.listPresets().catch(() => []);
    this.limits = await ipc.usageLimits().catch(() => null);
    await this.refreshUsage();
    await this.checkCli();
  }

  async refreshUsage(days?: number) {
    if (days) this.usageDays = days;
    this.usage = await ipc.usageSummary(this.usageDays).catch(() => this.usage);
  }

  go(view: "home" | "session" | "usage") {
    this.view = view;
  }

  async checkCli(overridePath?: string | null) {
    try {
      this.cli = await ipc.cliStatus(overridePath);
    } catch (e) {
      this.cli = { state: "unusable", reason: String(e) };
    }
    this.cliChecked = true;
    if (this.cli.state === "found") await this.checkAuth();
  }

  async checkAuth() {
    this.auth = await ipc.authStatus().catch((e) => ({ state: "unknown" as const, reason: String(e) }));
  }

  async updateConfig(patch: Partial<AppConfig>) {
    this.config = { ...this.config, ...patch };
    try {
      await ipc.setConfig($state.snapshot(this.config) as AppConfig);
    } catch (e) {
      this.error = String(e);
    }
  }

  setMode(m: Mode) {
    this.mode = m;
    this.view = "session";
    const cur = this.metas.find((x) => x.id === this.activeId);
    if (!cur || cur.mode !== m) this.activeId = this.metas.filter((x) => x.mode === m).at(-1)?.id ?? null;
  }

  flash(message: string) {
    this.toast = message;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = null), 2200);
  }

  async copyText(text: string, what = "Copied") {
    try {
      await navigator.clipboard.writeText(text);
      this.flash(what);
    } catch {
      this.error = "Couldn't copy to the clipboard.";
    }
  }

  exportActive() {
    const m = this.activeMeta;
    const s = this.active;
    if (m && s) void this.copyText(exportMarkdown(m.title, $state.snapshot(s.items) as ChatItem[]), "Conversation copied as Markdown");
  }

  async openTerminal() {
    const s = this.active;
    if (!s?.cliSessionId) {
      this.error = "Send a first message, then you can continue this conversation in a terminal.";
      return;
    }
    await ipc.openInTerminal(s.cliSessionId, this.activeMeta?.cwd ?? null).catch((e) => (this.error = String(e)));
  }

  private startOptions(mode: Mode, extra: StartOptions): StartOptions {
    return {
      model: this.config.default_model,
      permission_mode: this.config.default_permission_mode,
      ...extra,
      no_tools: mode === "chat",
      web_search: mode === "chat" ? (extra.web_search ?? false) : false,
      extra_args: [...(this.caps.extraArgs ? this.config.extra_args : []), ...(extra.extra_args ?? [])],
    };
  }

  async newSession(opts: StartOptions = {}) {
    this.error = null;
    const mode = this.mode;
    try {
      const cwd = mode === "chat" ? null : (opts.cwd ?? (await pickFolder()));
      if (mode === "code" && !cwd) return;
      const so = this.startOptions(mode, { ...opts, cwd });
      const id = await ipc.startSession(so);
      this.states[id] ??= initialState();
      this.metas = [
        ...this.metas,
        {
          id,
          title: mode === "chat" ? "New chat" : folderName(cwd),
          cwd,
          mode,
          model: so.model ?? null,
          permissionMode: so.permission_mode ?? null,
          preset: opts.preset ?? null,
          effort: so.effort ?? null,
          webSearch: so.web_search ?? false,
        },
      ];
      this.activeId = id;
      this.view = "session";
    } catch (e) {
      this.error = String(e);
    }
  }

  async startPreset(p: Preset) {
    this.showPresets = false;
    this.mode = "code";
    await this.newSession({ preset: p.id });
  }

  /** Reopen a saved conversation: restore the transcript and resume it in the CLI. */
  async resume(r: SavedSession) {
    this.error = null;
    try {
      const so = this.startOptions(r.mode, { cwd: r.cwd, model: r.model, resume: r.cli_session_id, preset: r.preset, effort: r.effort, web_search: r.web_search });
      const items = await ipc.loadTranscript(r.cli_session_id);
      const id = await ipc.startSession(so);
      this.states[id] = restoreItems(this.states[id] ?? initialState(), items);
      this.states[id].cliSessionId = r.cli_session_id;
      this.metas = [
        ...this.metas,
        { id, title: r.title, cwd: r.cwd, mode: r.mode, model: r.model, permissionMode: so.permission_mode ?? null, preset: r.preset, effort: r.effort ?? null, webSearch: r.web_search ?? false },
      ];
      this.mode = r.mode;
      this.view = "session";
      this.activeId = id;
    } catch (e) {
      this.error = String(e);
    }
  }

  async forget(r: SavedSession) {
    await ipc.deleteTranscript(r.cli_session_id).catch(() => {});
    await this.updateConfig({ recents: this.config.recents.filter((x) => x.cli_session_id !== r.cli_session_id) });
  }

  /** Change model / permission mode of a live session by resuming it in a fresh process. */
  async reconfigure(id: string, change: { model?: string | null; permissionMode?: string | null; effort?: string | null; webSearch?: boolean }) {
    const meta = this.metas.find((m) => m.id === id);
    const st = this.states[id];
    if (!meta || !st) return;
    // Before the first message there is nothing to resume: just start over with the new settings.
    const fresh = !st.cliSessionId && st.items.length === 0;
    if (!st.cliSessionId && !fresh) {
      this.error = "Wait for the first reply before changing this.";
      return;
    }
    if (st.status === "running") {
      this.error = "Wait for the current reply to finish (or press Stop) before changing this.";
      return;
    }
    const model = change.model !== undefined ? change.model : meta.model;
    const permissionMode = change.permissionMode !== undefined ? change.permissionMode : meta.permissionMode;
    const effort = change.effort !== undefined ? change.effort : meta.effort;
    const webSearch = change.webSearch !== undefined ? change.webSearch : meta.webSearch;
    try {
      const newId = await ipc.startSession(
        this.startOptions(meta.mode, {
          cwd: meta.cwd,
          model: model || null,
          permission_mode: permissionMode || null,
          resume: fresh ? null : st.cliSessionId,
          preset: meta.preset,
          effort: effort || null,
          web_search: webSearch,
        }),
      );
      await ipc.stopSession(id).catch(() => {});
      this.states[newId] = { ...initialState(), ...restoreItems(initialState(), st.items), cliSessionId: st.cliSessionId, cwd: st.cwd, info: st.info };
      delete this.states[id];
      this.metas = this.metas.map((m) => (m.id === id ? { ...m, id: newId, model: model || null, permissionMode: permissionMode || null, effort: effort || null, webSearch } : m));
      if (this.activeId === id) this.activeId = newId;
    } catch (e) {
      this.error = String(e);
    }
  }

  private async persist(id: string) {
    const meta = this.metas.find((m) => m.id === id);
    const st = this.states[id];
    if (!meta || !st?.cliSessionId) return;
    const title = meta.mode === "chat" || meta.title === folderName(meta.cwd) ? titleFrom(st.items, meta.title) : meta.title;
    if (meta.mode === "chat" && title !== meta.title) this.metas = this.metas.map((m) => (m.id === id ? { ...m, title } : m));
    const entry: SavedSession = {
      cli_session_id: st.cliSessionId,
      title: meta.mode === "chat" ? title : `${folderName(meta.cwd)} — ${titleFrom(st.items, "")}`.replace(/ — $/, ""),
      cwd: meta.cwd,
      mode: meta.mode,
      model: meta.model,
      preset: meta.preset,
      effort: meta.effort,
      web_search: meta.webSearch,
      updated_at: Date.now(),
    };
    try {
      await ipc.saveTranscript(st.cliSessionId, $state.snapshot(st.items) as ChatItem[]);
      await this.updateConfig({
        recents: [entry, ...this.config.recents.filter((r) => r.cli_session_id !== entry.cli_session_id)],
      });
    } catch (e) {
      this.error = String(e);
    }
  }

  select(id: string) {
    this.activeId = id;
    this.view = "session";
    const m = this.metas.find((x) => x.id === id);
    if (m) this.mode = m.mode;
  }

  async send(typed: string, attachments: PendingAttachment[] = []) {
    const id = this.activeId;
    const text = composeText(typed, attachments);
    const wire = toWire(attachments);
    if (!id || (!text.trim() && wire.length === 0)) return;
    // Show what the user typed (not the inlined file bodies) plus attachment chips.
    this.states[id] = addUserMessage(
      this.states[id],
      typed || (attachments.length > 0 ? "(attachments)" : ""),
      attachments.map((a) => ({ name: a.name, kind: a.kind })),
    );
    try {
      await ipc.sendMessage(id, text, wire);
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
    if (this.activeId === id) this.activeId = this.visibleMetas.at(-1)?.id ?? null;
  }
}

export const app = new AppStore();
