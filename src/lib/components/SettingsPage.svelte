<script lang="ts">
  import { type ExportResult, fmtBytes } from "../exchange";
  import { type UpdateState, describeUpdateStatus } from "../updates";
  import { MODELS, PERMISSION_MODES, TIERS, splitArgs, type Tier } from "../tier";
  import { CATEGORIES, cleanCategory } from "../settingsNav";
  import type { AppConfig } from "../types";
  import Icon from "../ui/Icon.svelte";
  import Appearance from "./Appearance.svelte";
  import AutoRefresh from "./AutoRefresh.svelte";
  import BudgetFields from "./BudgetFields.svelte";
  import WidgetCustomize from "./WidgetCustomize.svelte";
  import { type TraySettings, sanitizeTray, sanitizeWidget } from "../widget/config";

  let {
    config,
    cliVersion = null,
    appVersion = "",
    update = { phase: "idle" },
    oncheck = () => {},
    onviewupdate = () => {},
    exportState = { phase: "idle" },
    onexport = () => {},
    onimport = () => {},
    limitsPaused = false,
    onautorefresh = () => {},
    trayError = null,
    onsave,
    onback,
  }: {
    config: AppConfig;
    cliVersion?: string | null;
    appVersion?: string;
    update?: UpdateState;
    oncheck?: () => void;
    onviewupdate?: () => void;
    exportState?: { phase: "idle" | "working" | "done" | "error"; result?: ExportResult; error?: string };
    onexport?: () => void;
    onimport?: () => void;
    limitsPaused?: boolean;
    onautorefresh?: (patch: { auto_refresh_limits?: boolean; refresh_limits_minutes?: number }) => void;
    trayError?: string | null;
    onsave: (patch: Partial<AppConfig>) => void;
    onback: () => void;
  } = $props();

  const category = $derived(cleanCategory(config.settings_category));
  const title = $derived(CATEGORIES.find((c) => c.id === category)?.label ?? "General");
  const modes = $derived(PERMISSION_MODES.filter((m) => m.id !== "bypassPermissions" || config.tier === "advanced"));

  const tray = $derived(sanitizeTray(config.tray));
  /** Sanitized on the way out too, so turning the tray off also drops Keep running. */
  const saveTray = (patch: Partial<TraySettings>) => onsave({ tray: sanitizeTray({ ...tray, ...patch }) });

  function setMode(select: HTMLSelectElement) {
    const v = select.value;
    if (
      v === "bypassPermissions" &&
      !confirm("Bypass mode lets Claude run any command and edit any file without asking. Only use it in a throwaway folder. Enable it as the default?")
    ) {
      select.value = config.default_permission_mode ?? "";
      return;
    }
    onsave({ default_permission_mode: v || null });
  }
</script>

<div class="wrap">
  <div class="page">
    <nav aria-label="Settings categories">
      <button class="back" onclick={onback}><Icon name="arrowLeft" />Back</button>
      {#each CATEGORIES as c (c.id)}
        <button class="cat" class:on={c.id === category} aria-current={c.id === category ? "page" : undefined} onclick={() => onsave({ settings_category: c.id })}><Icon name={c.icon} />{c.label}</button>
      {/each}
    </nav>

    <div class="content">
      <h2>{title}</h2>

      {#if category === "general"}
        <section>
          <h3>Experience level</h3>
          <div class="list">
            {#each TIERS as t (t.id)}
              <label>
                <input type="radio" name="tier" checked={config.tier === t.id} onchange={() => onsave({ tier: t.id as Tier })} />
                <span class="text"><strong>{t.label}</strong><small>{t.blurb}</small></span>
              </label>
            {/each}
          </div>
        </section>

        {#if config.tier !== "beginner"}
          <section>
            <h3>Defaults for new sessions</h3>
            <div class="list">
              <label class="split">Model
                <select class="field" value={config.default_model ?? ""} onchange={(e) => onsave({ default_model: e.currentTarget.value || null })}>
                  {#each MODELS as m (m.id)}<option value={m.id}>{m.label}</option>{/each}
                </select>
              </label>
              <label class="split">Permissions
                <select class="field" value={config.default_permission_mode ?? ""} onchange={(e) => setMode(e.currentTarget)}>
                  <option value="">Default</option>
                  {#each modes as m (m.id)}<option value={m.id}>{m.label}</option>{/each}
                </select>
              </label>
            </div>
          </section>
        {/if}

        {#if config.tier === "advanced"}
          <section>
            <h3>Extra CLI flags</h3>
            <input class="field mono" aria-label="Extra CLI flags" placeholder="--add-dir C:\other\project" value={config.extra_args.join(" ")} onchange={(e) => onsave({ extra_args: splitArgs(e.currentTarget.value) })} />
            <small>Appended to every Code session. Takes effect for new sessions.</small>
          </section>
        {/if}

        <section>
          <h3>Always-allowed tools</h3>
          {#if config.always_allow.length === 0}
            <small>None. Tools you choose to “always allow” in a prompt only last for that session.</small>
          {:else}
            <div class="chips">
              {#each config.always_allow as t (t)}
                <button class="pill" aria-label="Stop always allowing {t}" title="Stop always allowing {t}" onclick={() => onsave({ always_allow: config.always_allow.filter((x) => x !== t) })}>{t}<Icon name="close" size={13} /></button>
              {/each}
            </div>
          {/if}
        </section>

        <section>
          <div class="list"><div class="split"><span>Claude Code</span><span class="value">{cliVersion ?? "Not found"}</span></div></div>
        </section>
      {:else if category === "appearance"}
        <Appearance {config} {onsave} />
      {:else if category === "usage"}
        <section>
          <h3>Budgets</h3>
          <small>Optional spending alerts, in estimated dollars. They turn amber at 80% and red when exceeded. Nothing is blocked.</small>
          <BudgetFields {config} {onsave} />
        </section>
        <section>
          <h3>Plan limits</h3>
          <AutoRefresh enabled={config.auto_refresh_limits} minutes={config.refresh_limits_minutes} paused={limitsPaused} onchange={onautorefresh} />
        </section>
      {:else if category === "widget"}
        <section>
          <p>A small panel that shows tokens, estimated cost and plan limits while you work. It only reads what this app already has and never sends a request on its own.</p>
          <WidgetCustomize settings={sanitizeWidget(config.usage_widget)} onchange={(next) => onsave({ usage_widget: next })} />
        </section>
        <section>
          <h3>System tray / menu bar</h3>
          <div class="list">
            <label>
              <input type="checkbox" checked={tray.enabled} onchange={(e) => saveTray({ enabled: e.currentTarget.checked })} />
              <span class="text"><strong>Show in the system tray / menu bar</strong><small>An icon that tells you when Claude is waiting. Nothing can be approved from it.</small></span>
            </label>
            <label>
              <input type="checkbox" checked={tray.keep_running} disabled={!tray.enabled} onchange={(e) => saveTray({ keep_running: e.currentTarget.checked })} />
              <span class="text"><strong>Keep running when I close the window</strong><small>Off: closing the window quits. On: it hides, and the tray icon opens it again.</small></span>
            </label>
          </div>
          {#if trayError}<p class="status bad" role="alert">{trayError}</p>{/if}
        </section>
        {#if tray.enabled}
          <section>
            <h3>Tray readings</h3>
            <WidgetCustomize settings={tray} prefix="Tray: " listLabel="Tray readings" onchange={(next) => saveTray(next)} />
          </section>
        {/if}
      {:else if category === "data"}
        <section>
          <p>Move your conversations, projects and settings to another computer or another assistant, or bring them here.</p>
          <div class="actions">
            <button class="btn" disabled={exportState.phase === "working"} onclick={onexport}>{exportState.phase === "working" ? "Exporting…" : "Export all my data…"}</button>
            <button class="btn" onclick={onimport}>Import data…</button>
          </div>
          {#if exportState.phase === "done" && exportState.result}
            <p class="status" role="status">Exported {exportState.result.conversations} conversation{exportState.result.conversations === 1 ? "" : "s"} ({fmtBytes(exportState.result.bytes)}) to <code>{exportState.result.folder}</code>. It contains your conversations, so keep it private.</p>
          {:else if exportState.phase === "error"}
            <p class="status bad" role="alert">{exportState.error}</p>
          {/if}
        </section>
      {:else if category === "updates"}
        <section>
          <p>BetterClaudeUI {appVersion ? `version ${appVersion}` : ""}</p>
          <div class="actions">
            <button class="btn" disabled={update.phase === "checking" || update.phase === "downloading" || update.phase === "installing"} onclick={oncheck}>Check for updates</button>
            {#if update.phase === "available" || update.phase === "ready" || update.phase === "downloading"}
              <button class="btn btn-primary" onclick={onviewupdate}>View update</button>
            {/if}
          </div>
          {#if describeUpdateStatus(update, Date.now())}<p class="status" role="status" class:bad={update.phase === "error"}>{describeUpdateStatus(update, Date.now())}</p>{/if}
          <div class="list">
            <label>
              <input type="checkbox" checked={config.auto_update_check} onchange={(e) => onsave({ auto_update_check: e.currentTarget.checked })} />
              <span class="text"><strong>Check for updates automatically</strong><small>At most once a day. Nothing is downloaded or installed without your OK.</small></span>
            </label>
          </div>
        </section>
      {/if}
    </div>
  </div>
</div>

<style>
  .wrap { flex: 1; min-height: 0; overflow-y: auto; container-type: inline-size; }
  .page { display: grid; grid-template-columns: 190px minmax(0, 1fr); gap: 24px; max-width: 900px; margin: 0 auto; padding: 14px 24px 40px; }
  nav { display: flex; flex-direction: column; gap: 2px; align-self: start; position: sticky; top: 14px; }
  nav button { display: flex; align-items: center; gap: 9px; min-height: 31px; padding: 4px 9px; background: none; border: 0; border-radius: var(--radius-sm); text-align: start; }
  nav button:hover { background: var(--fill); }
  .cat :global(.icon) { color: var(--accent-text); }
  .cat.on { background: var(--sel); font-weight: 600; }
  .back { color: var(--muted); margin-bottom: 8px; }
  .content { display: flex; flex-direction: column; gap: 20px; min-width: 0; }
  h2 { margin: 0; font-size: 20px; letter-spacing: -0.01em; }
  h3 { margin: 0 0 8px; font-size: 13px; font-weight: 650; color: var(--muted); }
  section > small { display: block; margin-bottom: 8px; }
  p { margin: 0 0 10px; }
  small { color: var(--muted); font-size: 12.5px; }
  .list label { align-items: flex-start; }
  .list .split { justify-content: space-between; align-items: center; }
  .text { display: flex; flex-direction: column; }
  .value { color: var(--muted); font-family: var(--mono); font-size: 12.5px; overflow-wrap: anywhere; }
  input[type="radio"], input[type="checkbox"] { width: 16px; height: 16px; margin: 3px 0 0; accent-color: var(--accent); }
  .mono { width: 100%; font-family: var(--mono); margin-bottom: 4px; }
  .chips, .actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .actions { margin-bottom: 10px; }
  .status { color: var(--muted); font-size: 13px; overflow-wrap: anywhere; }
  .status.bad { color: var(--bad-text); }
  @container (max-width: 560px) {
    .page { grid-template-columns: minmax(0, 1fr); gap: 14px; padding: 10px 16px 32px; }
    nav { flex-direction: row; flex-wrap: wrap; position: static; }
    .back { margin: 0; width: 100%; }
  }
</style>
