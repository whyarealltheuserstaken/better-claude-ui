<script lang="ts">
  import type { Snippet } from "svelte";
  let { title, wide = false, children }: { title: string; wide?: boolean; children: Snippet } = $props();
</script>

<section class="widget" class:wide>
  <h3>{title}</h3>
  {@render children()}
</section>

<style>
  .widget { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-lg); padding: 14px 16px; min-width: 0; }
  .widget.wide { grid-column: 1 / -1; }
  h3 { margin: 0 0 10px; font-size: 13px; font-weight: 600; color: var(--muted); }
  :global(.widget .big) { font-size: 26px; font-weight: 650; letter-spacing: -0.02em; line-height: 1.15; }
  :global(.widget .sub) { color: var(--muted); font-size: 12.5px; }
  :global(.widget .rowline) { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; padding: 3px 0; }
  :global(.widget .empty) { color: var(--muted); margin: 0; }
</style>
