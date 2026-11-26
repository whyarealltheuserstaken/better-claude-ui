<script lang="ts">
  import { LIMITS_NOTE, asOfLabel, mayBeBehind, windowHasReset } from "../limits";
  import { budgetState, fmtReset, fmtTokens, fmtUsd, modelLabel, pct, toCsv, windowLabel } from "../format";
  import DailyChart from "../widgets/DailyChart.svelte";
  import Meter from "../widgets/Meter.svelte";
  import type { AppConfig, AuthStatus, LimitsSnapshot, Totals, UsageSummary } from "../types";

  let {
    config,
    usage,
    limits,
    auth,
    days,
    onrange,
    onsave,
    onclear,
    onopen,
    refreshing = false,
    refreshError = null,
    onrefreshlimits = () => {},
  }: {
    config: AppConfig;
    usage: UsageSummary | null;
    limits: LimitsSnapshot | null;
    auth: AuthStatus | null;
    days: number;
    onrange: (d: number) => void;
    onsave: (patch: Partial<AppConfig>) => void;
    onclear: () => void;
    onopen: (url: string) => void;
    refreshing?: boolean;
    refreshError?: string | null;
    onrefreshlimits?: () => void;
  } = $props();

  const now = $derived(Date.now());

  let metric = $state<"cost" | "tokens">("cost");
  let copied = $state(false);
  const tokens = (t: Totals) => t.input + t.output + t.cache_read + t.cache_write;
  const base = (p: string) => (p === "Chat" || p === "(no folder)" ? p : (p.split(/[\\/]/).filter(Boolean).pop() ?? p));

  const periods = $derived(
    usage
      ? [
          { label: "Today", t: usage.today, budget: config.budget_daily_usd },
          { label: "Last 7 days", t: usage.week, budget: null },
          { label: "This month", t: usage.month, budget: config.budget_monthly_usd },
          { label: "All time", t: usage.all, budget: null },
        ]
      : [],
  );

  function num(v: string): number | null {
    const n = parseFloat(v);
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
  }

  async function copyCsv() {
    if (!usage) return;
    const rows: (string | number)[][] = [["section", "name", "cost_usd", "input", "output", "cache_read", "cache_write", "replies"]];
    for (const m of usage.by_model) rows.push(["model", m.name, m.totals.cost_usd.toFixed(4), m.totals.input, m.totals.output, m.totals.cache_read, m.totals.cache_write, m.totals.turns]);
    for (const p of usage.by_project) rows.push(["project", p.name, p.totals.cost_usd.toFixed(4), p.totals.input, p.totals.output, p.totals.cache_read, p.totals.cache_write, p.totals.turns]);
    for (const d of usage.daily) rows.push(["day", d.date, d.cost_usd.toFixed(4), "", "", "", "", ""]);
    await navigator.clipboard.writeText(toCsv(rows));
    copied = true;
    setTimeout(() => (copied = false), 1800);
  }

  function clear() {
    if (confirm("Delete your recorded usage history from this app? This does not affect your Claude account.")) onclear();
  }
</script>

<div class="page">
  <header>
    <div>
      <h1>Usage</h1>
      <p class="sub">Tokens and estimated cost, recorded on this computer.</p>
    </div>
    <div class="range" role="group" aria-label="Time range">
      {#each [7, 30, 90] as d (d)}
        <button class:on={days === d} aria-pressed={days === d} onclick={() => onrange(d)}>{d} days</button>
      {/each}
    </div>
  </header>

  <p class="note">
    <strong>About these numbers.</strong> Costs are estimates at standard API prices, calculated by Claude Code. On a subscription plan
    ({auth?.state === "logged_in" && auth.plan ? auth.plan : "Pro, Max, Team"}) you pay your plan price, not these amounts; use them to compare which work is heavy. Your actual plan allowance is shown below.
  </p>

  <section class="card">
    <h2>Plan allowance</h2>
    {#if !limits}
      <p class="sub">Appears after your first message. Claude Code reports it with each reply.</p>
    {:else}
      {#each limits.windows as w (w.name)}
        <div class="win">
          {#if windowHasReset(w.resets_at, now)}
            <div class="rowline"><span>{windowLabel(w.name)}</span><span class="sub">reset since the last update, refresh to see the new number</span></div>
            <Meter fraction={0} label="{windowLabel(w.name)} was reset" />
          {:else}
            <div class="rowline"><span>{windowLabel(w.name)}</span><span><strong>{pct(w.utilization)}</strong> used · resets {fmtReset(w.resets_at)}</span></div>
            <Meter fraction={w.utilization} level={w.utilization >= 1 ? "over" : w.utilization >= 0.8 ? "warn" : "ok"} label="{windowLabel(w.name)} used" />
          {/if}
        </div>
      {/each}
      {#if limits.using_overage}<p class="warn">You are using extra usage beyond your plan.</p>{/if}
      <p class="sub" class:warn={mayBeBehind(limits.captured_at, now)}>Updated {asOfLabel(limits.captured_at, now)}{mayBeBehind(limits.captured_at, now) ? ", may be behind" : ""}. {LIMITS_NOTE}</p>
    {/if}
    <div class="links">
      <button disabled={refreshing} onclick={onrefreshlimits} title="Sends one tiny request (about a tenth of a cent in API terms) so Claude Code reports your current allowance. It counts a hair toward your allowance.">{refreshing ? "Refreshing…" : "Refresh allowance"}</button>
      <button onclick={() => onopen("https://claude.ai/settings/usage")}>Open plan usage on claude.ai</button>
      <button onclick={() => onopen("https://console.anthropic.com/settings/billing")}>Open API billing</button>
    </div>
  </section>

  {#if refreshError}<p class="warn" role="alert">{refreshError}</p>{/if}

  <div class="periods">
    {#each periods as p (p.label)}
      {@const b = budgetState(p.t.cost_usd, p.budget)}
      <div class="card">
        <div class="sub">{p.label}</div>
        <div class="big">{fmtUsd(p.t.cost_usd)}</div>
        <div class="sub">{fmtTokens(tokens(p.t))} tokens · {p.t.turns} replies</div>
        {#if b.level !== "none"}
          <Meter fraction={b.fraction} level={b.level} label="{p.label} budget" />
          <div class="sub" class:warn={b.level !== "ok"}>{pct(b.fraction)} of {fmtUsd(p.budget ?? 0)}</div>
        {/if}
      </div>
    {/each}
  </div>

  <section class="card">
    <div class="rowline">
      <h2>Daily</h2>
      <div class="range" role="group" aria-label="Chart metric">
        <button class:on={metric === "cost"} aria-pressed={metric === "cost"} onclick={() => (metric = "cost")}>Cost</button>
        <button class:on={metric === "tokens"} aria-pressed={metric === "tokens"} onclick={() => (metric = "tokens")}>Tokens</button>
      </div>
    </div>
    {#if usage}<DailyChart daily={usage.daily} {metric} />{/if}
  </section>

  <section class="card">
    <h2>By model</h2>
    {#if !usage || usage.by_model.length === 0}
      <p class="sub">Nothing recorded in this period.</p>
    {:else}
      <table>
        <thead><tr><th>Model</th><th>Cost</th><th>Input</th><th>Output</th><th>Cache read</th><th>Cache write</th></tr></thead>
        <tbody>
          {#each usage.by_model as m (m.name)}
            <tr><td>{modelLabel(m.name)}</td><td>{fmtUsd(m.totals.cost_usd)}</td><td>{fmtTokens(m.totals.input)}</td><td>{fmtTokens(m.totals.output)}</td><td>{fmtTokens(m.totals.cache_read)}</td><td>{fmtTokens(m.totals.cache_write)}</td></tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </section>

  <section class="card">
    <h2>By project</h2>
    {#if !usage || usage.by_project.length === 0}
      <p class="sub">Nothing recorded in this period.</p>
    {:else}
      <table>
        <thead><tr><th>Project</th><th>Cost</th><th>Tokens</th><th>Replies</th></tr></thead>
        <tbody>
          {#each usage.by_project as p (p.name)}
            <tr><td title={p.name}>{base(p.name)}</td><td>{fmtUsd(p.totals.cost_usd)}</td><td>{fmtTokens(tokens(p.totals))}</td><td>{p.totals.turns}</td></tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </section>

  <section class="card">
    <h2>Budgets</h2>
    <p class="sub">Optional spending alerts, in estimated dollars. The Home widgets turn amber at 80% and red when exceeded. Nothing is blocked.</p>
    <div class="budgets">
      <label>Daily budget ($)
        <input type="number" min="0" step="1" value={config.budget_daily_usd ?? ""} placeholder="None" onchange={(e) => onsave({ budget_daily_usd: num(e.currentTarget.value) })} />
      </label>
      <label>Monthly budget ($)
        <input type="number" min="0" step="1" value={config.budget_monthly_usd ?? ""} placeholder="None" onchange={(e) => onsave({ budget_monthly_usd: num(e.currentTarget.value) })} />
      </label>
    </div>
  </section>

  <div class="foot">
    <button onclick={copyCsv}>{copied ? "Copied" : "Copy as CSV"}</button>
    <button class="danger" onclick={clear}>Delete usage history</button>
  </div>
</div>

<style>
  .page { max-width: 980px; margin: 0 auto; padding: 22px 24px 40px; width: 100%; display: flex; flex-direction: column; gap: 12px; }
  header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
  h1 { margin: 0; font-size: 24px; letter-spacing: -0.02em; }
  h2 { margin: 0 0 8px; font-size: 14px; color: var(--muted); font-weight: 600; }
  .sub { color: var(--muted); font-size: 12.5px; margin: 2px 0; }
  .note { margin: 0; padding: 10px 14px; border-left: 3px solid var(--accent); background: var(--surface); border-radius: 0 var(--radius-sm) var(--radius-sm) 0; font-size: 13px; }
  .warn { color: var(--gate); }
  .card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-lg); padding: 14px 16px; }
  .periods { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; }
  .big { font-size: 24px; font-weight: 650; letter-spacing: -0.02em; }
  .rowline { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; }
  .win { margin-bottom: 10px; }
  .links, .foot { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 8px; }
  .range { display: inline-flex; background: var(--bg); border: 1px solid var(--line); border-radius: var(--radius); padding: 2px; }
  .range button { background: none; border: 0; border-radius: var(--radius-sm); padding: 3px 12px; color: var(--muted); }
  .range button.on { background: var(--accent); color: var(--accent-ink); font-weight: 600; }
  button { background: var(--raised); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 6px 14px; color: var(--text); }
  button.danger { color: var(--bad); }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: right; padding: 5px 8px; border-bottom: 1px solid var(--line); }
  th:first-child, td:first-child { text-align: left; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  th { color: var(--muted); font-weight: 600; }
  .budgets { display: flex; gap: 20px; flex-wrap: wrap; }
  .budgets label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
  input { background: var(--bg); color: var(--text); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 6px 8px; font: inherit; width: 150px; }
</style>
