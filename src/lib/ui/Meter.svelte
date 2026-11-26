<script lang="ts">
  let {
    percent,
    label,
    kind = "bar",
    warn = false,
  }: { percent: number | null; label: string; kind?: "bar" | "ring"; warn?: boolean } = $props();

  const value = $derived(percent === null || !Number.isFinite(percent) ? null : Math.round(Math.min(100, Math.max(0, percent))));
</script>

<span class={kind} class:warn class:unknown={value === null} role="meter" aria-label={label} aria-valuemin="0" aria-valuemax="100" aria-valuenow={value ?? undefined} style="--v: {value ?? 0}">
  {#if kind === "bar"}<i></i>{/if}
</span>

<style>
  .bar { display: block; height: 6px; border-radius: 3px; background: var(--track); overflow: hidden; }
  .bar i { display: block; height: 100%; width: calc(var(--v) * 1%); background: var(--accent); border-radius: 3px; }
  .ring { display: inline-block; flex: none; width: 42px; height: 42px; border-radius: 50%; background: conic-gradient(var(--accent) calc(var(--v) * 1%), var(--track) 0); mask: radial-gradient(closest-side, transparent 68%, #000 70%); }
  .warn i { background: var(--gate); }
  .ring.warn { background: conic-gradient(var(--gate) calc(var(--v) * 1%), var(--track) 0); }
  .unknown { opacity: 0.6; }
  @media (forced-colors: active) {
    .bar { border: 1px solid CanvasText; }
    .bar i { background: Highlight; }
  }
</style>
