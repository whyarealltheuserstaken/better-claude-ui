<script lang="ts">
  import { budgetState, fmtReset, fmtTokens, fmtUsd, modelLabel, pct, windowLabel } from "../format";
  import { WIDGETS, cleanWidgetList, moveWidget, toggleWidget } from "../widgets/registry";
  import DailyChart from "../widgets/DailyChart.svelte";
  import Meter from "../widgets/Meter.svelte";
  import Widget from "../widgets/Widget.svelte";
  import type { AppConfig, AuthStatus, CliStatus, LimitsSnapshot, SavedSession, Totals, UsageSummary } from "../types";

  let {
    config,
    usage,
    limits,
    cli,
    auth,
    editing,
    onsave,
    onedit,
    onnewchat,
    onnewcode,
    onteams,
    onresume,
    onusage,
  }: {
    config: AppConfig;
    usage: UsageSummary | null;
    limits: LimitsSnapshot | null;
    cli: CliStatus | null;
    auth: AuthStatus | null;
    editing: boolean;
    onsave: (patch: Partial<AppConfig>) => void;
    onedit: (v: boolean) => void;
    onnewchat: () => void;
    onnewcode: () => void;
    onteams: () => void;
    onresume: (r: SavedSession) => void;
    onusage: () => void;
  } = $props();

  const ids = $derived(cleanWidgetList(config.home_widgets));
  const def = (id: string) => WIDGETS.find((w) => w.id === id)!;
  const tokens = (t: Totals) => t.input + t.output + t.cache_read + t.cache_write;
  const maxModel = $derived(Math.max(...(usage?.by_model.map((m) => m.totals.cost_usd) ?? [0]), 0.0001));
  const maxProj = $derived(Math.max(...(usage?.by_project.map((m) => m.totals.cost_usd) ?? [0]), 0.0001));
  const base = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p;
  const stale = $derived(limits ? Date.now() - limits.captured_at > 10 * 60_000 : false);
</script>

<div class="home">
  <header>
    <div>
      <h1>Home</h1>
      <p class="sub">Your usage and shortcuts at a glance.</p>
    </div>
    <button onclick={() => onedit(!editing)}>{editing ? "Done" : "Customize"}</button>
  </header>

  {#if editing}
    <section class="editor" aria-label="Choose widgets">
      <h2>Widgets</h2>
      <p class="sub">Turn widgets on or off and change their order.</p>
      {#each WIDGETS as w (w.id)}
        <div class="erow">
          <label><input type="checkbox" checked={ids.includes(w.id)} onchange={() => onsave({ home_widgets: toggleWidget(ids, w.id) })} /> <span><strong>{w.title}</strong><small>{w.description}</small></span></label>
          {#if ids.includes(w.id)}
            <span class="mv">
              <button aria-label="Move {w.title} up" onclick={() => onsave({ home_widgets: moveWidget(ids, w.id, -1) })}>↑</button>
              <button aria-label="Move {w.title} down" onclick={() => onsave({ home_widgets: moveWidget(ids, w.id, 1) })}>↓</button>
            </span>
          {/if}
        </div>
      {/each}
    </section>
  {/if}

  <div class="grid">
    {#each ids as id (id)}
      <Widget title={def(id).title} wide={def(id).wide}>
        {#if id === "quick-start"}
          <div class="actions">
            <button class="primary" onclick={onnewcode}>New coding session</button>
            <button onclick={onnewchat}>New chat</button>
            <button onclick={onteams}>Agent teams</button>
          </div>
        {:else if id === "limits"}
          {#if !limits}
            <p class="empty">Appears after your first message. Claude Code reports your plan limits with each reply.</p>
          {:else}
            {#each limits.windows as w (w.name)}
              {@const lvl = w.utilization >= 1 ? "over" : w.utilization >= 0.8 ? "warn" : "ok"}
              <div class="win">
                <div class="rowline"><span>{windowLabel(w.name)}</span><strong>{pct(w.utilization)}</strong></div>
                <Meter fraction={w.utilization} level={lvl} label="{windowLabel(w.name)} used" />
                <div class="sub">Resets {fmtReset(w.resets_at)}</div>
              </div>
            {/each}
            {#if limits.using_overage}<p class="sub warn">Using extra usage beyond your plan.</p>{/if}
            {#if stale}<p class="sub">Last updated {Math.round((Date.now() - limits.captured_at) / 60000)} min ago.</p>{/if}
          {/if}
        {:else if id === "spend-today" || id === "spend-month"}
          {@const t = usage ? (id === "spend-today" ? usage.today : usage.month) : null}
          {@const budget = id === "spend-today" ? config.budget_daily_usd : config.budget_monthly_usd}
          {#if !t}
            <p class="empty">Loading…</p>
          {:else}
            {@const b = budgetState(t.cost_usd, budget)}
            <div class="big">{fmtUsd(t.cost_usd)}</div>
            <div class="sub">{fmtTokens(tokens(t))} tokens · {t.turns} {t.turns === 1 ? "reply" : "replies"}</div>
            {#if b.level !== "none"}
              <div class="bud">
                <Meter fraction={b.fraction} level={b.level} label="Budget used" />
                <div class="sub" class:warn={b.level !== "ok"}>{pct(b.fraction)} of {fmtUsd(budget ?? 0)} budget{b.level === "over" ? ": over budget" : ""}</div>
              </div>
            {:else}
              <button class="link" onclick={onusage}>Set a budget</button>
            {/if}
          {/if}
        {:else if id === "daily-chart"}
          {#if usage}<DailyChart daily={usage.daily} />{:else}<p class="empty">Loading…</p>{/if}
        {:else if id === "by-model"}
          {#if !usage || usage.by_model.length === 0}
            <p class="empty">No usage recorded yet.</p>
          {:else}
            {#each usage.by_model as m (m.name)}
              <div class="bar">
                <div class="rowline"><span>{modelLabel(m.name)}</span><span>{fmtUsd(m.totals.cost_usd)}</span></div>
                <Meter fraction={m.totals.cost_usd / maxModel} label="{modelLabel(m.name)} share" />
              </div>
            {/each}
          {/if}
        {:else if id === "by-project"}
          {#if !usage || usage.by_project.length === 0}
            <p class="empty">No usage recorded yet.</p>
          {:else}
            {#each usage.by_project.slice(0, 6) as p (p.name)}
              <div class="bar">
                <div class="rowline"><span title={p.name}>{p.name === "Chat" || p.name === "(no folder)" ? p.name : base(p.name)}</span><span>{fmtUsd(p.totals.cost_usd)}</span></div>
                <Meter fraction={p.totals.cost_usd / maxProj} label="{p.name} share" />
              </div>
            {/each}
          {/if}
        {:else if id === "recent"}
          {#if config.recents.length === 0}
            <p class="empty">Your conversations will show up here.</p>
          {:else}
            {#each config.recents.slice(0, 6) as r (r.cli_session_id)}
              <button class="rec" onclick={() => onresume(r)}>
                <span class="tag">{r.mode === "chat" ? "Chat" : "Code"}</span>
                <span class="t">{r.title}</span>
              </button>
            {/each}
          {/if}
        {:else if id === "status"}
          {#if cli?.state === "found"}
            <div class="rowline"><span>Claude Code</span><span>{cli.version}</span></div>
          {/if}
          {#if auth?.state === "logged_in"}
            <div class="rowline"><span>Signed in</span><span>{auth.method}</span></div>
            {#if auth.plan}<div class="rowline"><span>Plan</span><span>{auth.plan}</span></div>{/if}
          {/if}
          <div class="rowline"><span>Experience level</span><span>{config.tier}</span></div>
        {/if}
      </Widget>
    {/each}
  </div>
  {#if ids.length === 0}
    <p class="sub">No widgets selected. Press Customize to add some.</p>
  {/if}
</div>

<style>
  .home { max-width: 980px; margin: 0 auto; padding: 22px 24px 40px; width: 100%; }
  header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 16px; }
  h1 { margin: 0; font-size: 24px; letter-spacing: -0.02em; }
  h2 { margin: 0 0 4px; font-size: 15px; }
  .sub { color: var(--muted); font-size: 12.5px; margin: 2px 0; }
  .warn { color: var(--gate); }
  .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  @media (max-width: 760px) { .grid { grid-template-columns: 1fr; } }
  button { background: var(--raised); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 6px 14px; color: var(--text); }
  button.primary { background: var(--accent); color: var(--accent-ink); border-color: transparent; font-weight: 600; }
  button.link { background: none; border: 0; color: var(--accent); padding: 6px 0 0; }
  .actions { display: flex; gap: 10px; flex-wrap: wrap; }
  .win, .bar, .bud { margin-bottom: 10px; }
  .editor { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-lg); padding: 14px 16px; margin-bottom: 14px; }
  .erow { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 5px 0; }
  .erow label { display: flex; gap: 10px; align-items: flex-start; }
  .erow span { display: flex; flex-direction: column; }
  .erow small { color: var(--muted); }
  .mv { flex-direction: row !important; gap: 4px; }
  .mv button { padding: 2px 9px; }
  .rec { display: flex; gap: 10px; width: 100%; text-align: left; background: none; border: 0; border-radius: var(--radius-sm); padding: 6px 4px; align-items: center; }
  .rec:hover { background: var(--raised); }
  .rec .t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tag { font-size: 11px; color: var(--muted); border: 1px solid var(--line); border-radius: 999px; padding: 0 7px; flex: none; }
</style>
