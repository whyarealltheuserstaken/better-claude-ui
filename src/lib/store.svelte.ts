import { type PendingAttachment, composeText, toWire } from "./attachments";
import { exportMarkdown } from "./export";
import { allProjects, findProject } from "./projects";
import { type ArchiveDoc, type ArchiveEntry, continueContext } from "./archive";
import { MAX_FAILURES, shouldAutoRefresh } from "./limits";
import { type ExportResult, type ImportResult, mergeProjects, settingsPatch } from "./exchange";
import { ipc, onSessionEvent, onUpdateProgress, pickFolder } from "./ipc";
import { type UpdateProblem, type UpdateState, installBlockedReason, reduceUpdate, shouldAutoCheck } from "./updates";
import { addUserMessage, initialState, reduce, removePending, restoreItems } from "./reducer";
import { type Caps, capsFor, normalizeTier } from "./tier";
import { type PageView, type View, isPage } from "./settingsNav";
import type { AppConfig, AuthStatus, LimitsSnapshot, UsageSummary, ChatItem, Preset, CliStatus, Mode, SavedSession, SessionState, StartOptions } from "./types";

export interface SessionMeta {
  id: string;
  title: string;
  cwd: string | null;
  mode: Mode;
  model: string | null;
  /** Keep this title instead of deriving one from the first message. */
  lockTitle?: boolean;
  permissionMode: string | null;
  preset: string | null;
  effort: string | null;
  webSearch: boolean;
  project: string | null;
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
  projects: [],
  auto_update_check: true,
  last_update_check: null,
  skipped_version: null,
  auto_refresh_limits: false,
  refresh_limits_minutes: 15,
  sidebar_hidden: false,
  panel_hidden: false,
  settings_category: "general",
  usage_widget: null,
  tray: null,
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
  showPresets = $state(false);
  showPalette = $state(false);
  update = $state<UpdateState>({ phase: "idle" });
  appVersion = $state("");
  showUpdate = $state(false);
  preview = $state<{ code: string; lang: string } | null>(null);
  toast = $state<string | null>(null);
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  view = $state<View>("home");
  /** Where Back goes: the screen that was open before the first page. */
  private beforePage: View = "home";
  archive = $state<ArchiveEntry[]>([]);
  viewing = $state<{ entry: ArchiveEntry; doc: ArchiveDoc } | null>(null);
  showImport = $state(false);
  exportState = $state<{ phase: "idle" | "working" | "done" | "error"; result?: ExportResult; error?: string }>({ phase: "idle" });
  limits = $state<LimitsSnapshot | null>(null);
  usage = $state<UsageSummary | null>(null);
  usageDays = $state(30);
  homeEditing = $state(false);
  limitsRefreshing = $state(false);
  limitsError = $state<string | null>(null);
  limitsFailures = $state(0);
  limitsPaused = $derived(this.limitsFailures >= MAX_FAILURES);
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
    this.appVersion = await ipc.appVersion().catch(() => "");
    await onUpdateProgress((downloaded, total) => (this.update = reduceUpdate(this.update, { type: "progress", downloaded, total })));
    // Quiet, at most once a day, and never while the first screens are still loading.
    setTimeout(() => void this.autoCheckUpdates(), 6000);
    this.presets = await ipc.listPresets().catch(() => []);
    this.limits = await ipc.usageLimits().catch(() => null);
    await this.refreshUsage();
    await this.loadArchive();
    // Opt-in automatic refresh of the plan allowance: checked every minute, runs only when due.
    setTimeout(() => void this.autoRefreshTick(), 20_000);
    setInterval(() => void this.autoRefreshTick(), 60_000);
    await this.checkCli();
  }

  private asProblem(e: unknown): UpdateProblem {
    if (e && typeof e === "object" && "message" in e && "kind" in e) return e as UpdateProblem;
    const text = String(e);
    return { kind: "other", message: "Couldn't check for updates right now. Please try again later.", detail: text };
  }

  /** Manual checks show their result; automatic ones stay silent unless an update is found. */
  async checkUpdates(manual = true) {
    this.update = reduceUpdate(this.update, { type: "check_start", manual });
    try {
      const info = await ipc.checkForUpdate();
      this.update = reduceUpdate(this.update, { type: "check_ok", info, now: Date.now() });
      await this.updateConfig({ last_update_check: Date.now() });
    } catch (e) {
      if (manual) this.update = reduceUpdate(this.update, { type: "check_fail", problem: this.asProblem(e) });
      else if (this.update.phase === "checking") this.update = { phase: "idle" };
    }
  }

  async autoCheckUpdates() {
    if (shouldAutoCheck(this.config.auto_update_check, this.config.last_update_check, Date.now())) await this.checkUpdates(false);
  }

  async downloadUpdate() {
    this.update = reduceUpdate(this.update, { type: "download_start" });
    try {
      await ipc.downloadUpdate();
      this.update = reduceUpdate(this.update, { type: "download_ok" });
    } catch (e) {
      this.update = reduceUpdate(this.update, { type: "download_fail", problem: this.asProblem(e) });
    }
  }

  async installUpdate() {
    const running = Object.values(this.states).filter((s) => s.status === "running").length;
    const pending = Object.values(this.states).reduce((n, s) => n + s.pending.length, 0);
    const blocked = installBlockedReason(running, pending);
    if (blocked) {
      this.error = blocked;
      return;
    }
    this.update = reduceUpdate(this.update, { type: "install_start" });
    try {
      await ipc.installUpdate();
    } catch (e) {
      this.update = reduceUpdate(this.update, { type: "install_fail", problem: this.asProblem(e) });
    }
  }

  skipUpdateVersion() {
    if (this.update.phase === "available") void this.updateConfig({ skipped_version: this.update.info.version });
    this.showUpdate = false;
  }

  // ---- Archive, export and import ----
  async loadArchive() {
    this.archive = await ipc.archiveList().catch(() => this.archive);
  }

  async openArchive(id: string) {
    const entry = this.archive.find((e) => e.id === id);
    const doc = entry ? await ipc.archiveGet(id).catch(() => null) : null;
    if (!entry || !doc) {
      this.error = "That conversation couldn't be opened.";
      return;
    }
    this.viewing = { entry, doc };
    this.view = "archive";
  }

  async deleteArchive(id: string) {
    await ipc.archiveDelete(id).catch((e) => (this.error = String(e)));
    if (this.viewing?.entry.id === id) this.viewing = null;
    await this.loadArchive();
  }

  /** Start a new chat whose first message carries the archived transcript as an attachment. */
  async continueFromArchive(id: string) {
    const entry = this.archive.find((e) => e.id === id);
    const doc = entry ? await ipc.archiveGet(id).catch(() => null) : null;
    if (!entry || !doc || doc.messages.length === 0) {
      this.error = "That conversation couldn't be opened.";
      return;
    }
    const ctx = continueContext(entry.title, entry.source, doc.messages);
    this.setMode("chat");
    await this.newSession();
    const meta = this.activeMeta;
    if (!meta) return;
    this.metas = this.metas.map((m) => (m.id === meta.id ? { ...m, title: `Continued: ${entry.title}`.slice(0, 60), lockTitle: true } : m));
    await this.send(ctx.message, [{ id: "ctx", name: "earlier-conversation.md", kind: "text", media_type: "text/plain", size: ctx.transcript.length, text: ctx.transcript }]);
  }

  async exportAll() {
    const folder = await pickFolder();
    if (!folder) return;
    this.exportState = { phase: "working" };
    try {
      this.exportState = { phase: "done", result: await ipc.exportData(folder) };
    } catch (e) {
      this.exportState = { phase: "error", error: String(e) };
    }
  }

  /** Apply the parts of an import result that live in the config (the UI owns the config file). */
  async finishImport(r: ImportResult): Promise<{ projectsAdded: number; settingsApplied: boolean }> {
    const patch: Partial<AppConfig> = settingsPatch(r.settings);
    const merged = r.projects.length > 0 ? mergeProjects(this.config.projects, r.projects) : { projects: this.config.projects, added: 0 };
    if (merged.added > 0) patch.projects = merged.projects;
    if (Object.keys(patch).length > 0) await this.updateConfig(patch);
    await this.loadArchive();
    return { projectsAdded: merged.added, settingsApplied: r.settings !== null && Object.keys(settingsPatch(r.settings)).length > 0 };
  }

  /** One tiny request so Claude Code reports the current plan allowance (see limits.ts). */
  async refreshLimits(auto = false) {
    if (this.limitsRefreshing) return;
    this.limitsRefreshing = true;
    if (!auto) this.limitsError = null;
    try {
      this.limits = await ipc.refreshLimits();
      this.limitsFailures = 0; // any success (manual or automatic) resumes automatic refreshes
      this.limitsError = null;
      await this.refreshUsage();
    } catch (e) {
      const msg = typeof e === "string" ? e : "Couldn't refresh right now. Please try again.";
      if (auto) {
        this.limitsFailures += 1; // only automatic failures count towards pausing
        if (this.limitsFailures >= MAX_FAILURES) this.limitsError = `Automatic refresh paused after ${MAX_FAILURES} failed attempts. ${msg}`;
      } else {
        this.limitsError = msg;
      }
    } finally {
      this.limitsRefreshing = false;
    }
  }

  async autoRefreshTick() {
    const due = shouldAutoRefresh({
      enabled: this.config.auto_refresh_limits,
      minutes: this.config.refresh_limits_minutes,
      capturedAtMs: this.limits?.captured_at ?? null,
      nowMs: Date.now(),
      visible: typeof document === "undefined" || document.visibilityState === "visible",
      busy: this.limitsRefreshing,
      failures: this.limitsFailures,
    });
    if (due) await this.refreshLimits(true);
  }

  /** Change the automatic-refresh settings; turning it on gives it a fresh start. */
  async setAutoRefresh(patch: { auto_refresh_limits?: boolean; refresh_limits_minutes?: number }) {
    if (patch.auto_refresh_limits) this.limitsFailures = 0;
    await this.updateConfig(patch);
    if (patch.auto_refresh_limits) void this.autoRefreshTick();
  }

  async refreshUsage(days?: number) {
    if (days) this.usageDays = days;
    this.usage = await ipc.usageSummary(this.usageDays).catch(() => this.usage);
  }

  go(view: View) {
    this.view = view;
  }

  openPage(page: PageView) {
    if (!isPage(this.view)) this.beforePage = this.view;
    this.view = page;
  }

  back() {
    if (isPage(this.view)) this.view = this.beforePage;
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

  projects = $derived(allProjects(this.config.projects));

  private startOptions(mode: Mode, extra: StartOptions, projectId: string | null = null): StartOptions {
    const project = findProject(this.config.projects, projectId);
    return {
      model: this.config.default_model,
      permission_mode: this.config.default_permission_mode,
      instructions: project?.instructions || null,
      ...extra,
      no_tools: mode === "chat",
      web_search: mode === "chat" ? (extra.web_search ?? false) : false,
      extra_args: [...(this.caps.extraArgs ? this.config.extra_args : []), ...(extra.extra_args ?? [])],
    };
  }

  /** The new session id, or null if nothing was started (cancelled or failed). */
  async newSession(opts: StartOptions & { projectId?: string | null } = {}): Promise<string | null> {
    this.error = null;
    const mode = this.mode;
    const projectId = opts.projectId ?? null;
    const project = findProject(this.config.projects, projectId);
    try {
      const cwd = mode === "chat" ? null : (opts.cwd ?? project?.cwd ?? (await pickFolder()));
      if (mode === "code" && !cwd) return null;
      const so = this.startOptions(mode, { ...opts, cwd }, projectId);
      const id = await ipc.startSession(so);
      this.states[id] ??= initialState();
      this.metas = [
        ...this.metas,
        {
          id,
          title: mode === "chat" ? (project ? project.name : "New chat") : folderName(cwd),
          cwd,
          mode,
          model: so.model ?? null,
          permissionMode: so.permission_mode ?? null,
          preset: opts.preset ?? null,
          effort: so.effort ?? null,
          webSearch: so.web_search ?? false,
          project: project?.id ?? null,
        },
      ];
      this.activeId = id;
      this.view = "session";
      return id;
    } catch (e) {
      this.error = String(e);
      return null;
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
      const so = this.startOptions(r.mode, { cwd: r.cwd, model: r.model, resume: r.cli_session_id, preset: r.preset, effort: r.effort, web_search: r.web_search }, r.project ?? null);
      const items = await ipc.loadTranscript(r.cli_session_id);
      const id = await ipc.startSession(so);
      this.states[id] = restoreItems(this.states[id] ?? initialState(), items);
      this.states[id].cliSessionId = r.cli_session_id;
      this.metas = [
        ...this.metas,
        { id, title: r.title, cwd: r.cwd, mode: r.mode, model: r.model, permissionMode: so.permission_mode ?? null, preset: r.preset, effort: r.effort ?? null, webSearch: r.web_search ?? false, project: r.project ?? null },
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
        }, meta.project),
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
    const title = meta.lockTitle ? meta.title : meta.mode === "chat" || meta.title === folderName(meta.cwd) ? titleFrom(st.items, meta.title) : meta.title;
    if (meta.mode === "chat" && title !== meta.title) this.metas = this.metas.map((m) => (m.id === id ? { ...m, title } : m));
    const entry: SavedSession = {
      cli_session_id: st.cliSessionId,
      title: meta.lockTitle || meta.mode === "chat" ? title : `${folderName(meta.cwd)} — ${titleFrom(st.items, "")}`.replace(/ — $/, ""),
      cwd: meta.cwd,
      mode: meta.mode,
      model: meta.model,
      preset: meta.preset,
      effort: meta.effort,
      web_search: meta.webSearch,
      project: meta.project,
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

  async send(typed: string, attachments: PendingAttachment[] = []): Promise<boolean> {
    const id = this.activeId;
    const text = composeText(typed, attachments);
    const wire = toWire(attachments);
    if (!id || (!text.trim() && wire.length === 0)) return false;
    // Show what the user typed (not the inlined file bodies) plus attachment chips.
    this.states[id] = addUserMessage(
      this.states[id],
      typed || (attachments.length > 0 ? "(attachments)" : ""),
      attachments.map((a) => ({ name: a.name, kind: a.kind })),
    );
    try {
      await ipc.sendMessage(id, text, wire);
      return true;
    } catch (e) {
      this.error = String(e);
      return false;
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
