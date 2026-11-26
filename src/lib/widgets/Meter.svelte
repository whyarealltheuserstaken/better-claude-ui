<script lang="ts">
  let {
    fraction,
    level = "ok",
    label,
  }: { fraction: number; level?: "none" | "ok" | "warn" | "over"; label: string } = $props();
  const width = $derived(Math.min(Math.max(fraction, 0), 1) * 100);
</script>

<div class="meter" role="progressbar" aria-label={label} aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(width)}>
  <div class="fill" data-level={level} style="width:{width}%"></div>
</div>

<style>
  .meter { height: 6px; background: var(--track); border-radius: 999px; overflow: hidden; }
  .fill { height: 100%; background: var(--accent); border-radius: 999px; transition: width 0.3s; }
  .fill[data-level="warn"] { background: var(--gate); }
  .fill[data-level="over"] { background: var(--bad); }
</style>
