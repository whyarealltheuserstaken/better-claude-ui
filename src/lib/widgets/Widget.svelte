<script lang="ts">
  import type { Snippet } from "svelte";
  let { title, wide = false, children }: { title: string; wide?: boolean; children: Snippet } = $props();
</script>

<section class="widget" class:wide>
  <h3>{title}</h3>
  {@render children()}
</section>

<style>
  /* Solid and borderless: space and type carry the hierarchy, not outlines. */
  .widget { background: var(--card); border-radius: var(--radius-lg); padding: 14px 16px; min-width: 0; }
  :global(:root[data-solid="true"]) .widget { border: 1px solid var(--line); }
  @media (forced-colors: active) { .widget { border: 1px solid CanvasText; } }
  .widget.wide { grid-column: 1 / -1; }
  h3 { margin: 0 0 10px; font-size: 13px; font-weight: 650; color: var(--text); }
  :global(.widget .big) { font-size: 26px; font-weight: 650; letter-spacing: -0.02em; line-height: 1.15; }
  :global(.widget .sub) { color: var(--muted); font-size: 12.5px; }
  :global(.widget .rowline) { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; padding: 3px 0; }
  :global(.widget .empty) { color: var(--muted); margin: 0; }
</style>
