<script lang="ts">
  import type { Snippet } from "svelte";
  import Icon from "../ui/Icon.svelte";

  // The frame shared by the full pages: a way back, then content. The title is in the toolbar.
  let { onback, children }: { onback: () => void; children: Snippet } = $props();
</script>

<div class="wrap">
  <div class="page">
    <button class="back" onclick={onback}><Icon name="arrowLeft" />Back</button>
    {@render children()}
  </div>
</div>

<style>
  .wrap { flex: 1; min-height: 0; overflow-y: auto; container-type: inline-size; }
  .page { max-width: 820px; margin: 0 auto; padding: 14px 24px 40px; }
  .back { display: flex; align-items: center; gap: 9px; min-height: 31px; margin-left: -9px; padding: 4px 9px; background: none; border: 0; border-radius: var(--radius-sm); color: var(--muted); }
  .back:hover { background: var(--fill); }
  @container (max-width: 560px) { .page { padding: 10px 16px 32px; } }
</style>
