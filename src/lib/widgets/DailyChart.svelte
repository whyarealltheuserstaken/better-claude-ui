<script lang="ts">
  import { fmtUsd } from "../format";

  let { daily, metric = "cost" }: { daily: { date: string; cost_usd: number; tokens: number }[]; metric?: "cost" | "tokens" } = $props();

  const value = (d: { cost_usd: number; tokens: number }) => (metric === "cost" ? d.cost_usd : d.tokens);
  const max = $derived(Math.max(...daily.map(value), metric === "cost" ? 0.01 : 1));
  const W = 600;
  const H = 120;
  const gap = 2;
  const bw = $derived(Math.max(2, (W - gap * (daily.length - 1)) / Math.max(daily.length, 1)));
  const total = $derived(daily.reduce((a, d) => a + value(d), 0));
  const summary = $derived(`Daily ${metric === "cost" ? "estimated cost" : "tokens"}, ${daily.length} days, total ${metric === "cost" ? fmtUsd(total) : Math.round(total).toLocaleString()}`);
</script>

{#if daily.length === 0 || total === 0}
  <p class="none">No usage recorded in this period yet. It appears here after your first reply.</p>
{:else}
  <div class="meta"><span>{daily[0].date.slice(5)}</span><span>max {metric === "cost" ? fmtUsd(max) : Math.round(max).toLocaleString()}</span><span>{daily[daily.length - 1].date.slice(5)}</span></div>
  <svg viewBox="0 0 {W} {H}" role="img" aria-label={summary} preserveAspectRatio="none">
    <line x1="0" x2={W} y1={H} y2={H} stroke="var(--line)" />
    {#each daily as d, i (d.date)}
      {@const h = (value(d) / max) * (H - 4)}
      <rect x={i * (bw + gap)} y={H - h} width={bw} height={Math.max(h, value(d) > 0 ? 1.5 : 0)} rx="1.5" fill="var(--accent)" opacity={d.date === daily[daily.length - 1].date ? 1 : 0.7}>
        <title>{d.date}: {metric === "cost" ? fmtUsd(d.cost_usd) : d.tokens.toLocaleString() + " tokens"}</title>
      </rect>
    {/each}
  </svg>
{/if}

<style>
  svg { width: 100%; height: 130px; display: block; }
  .meta { display: flex; justify-content: space-between; color: var(--muted); font-size: 11.5px; margin-bottom: 4px; }
  .none { color: var(--muted); margin: 0; }
</style>
