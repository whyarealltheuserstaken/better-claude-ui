<script lang="ts">
  import Icon from "../ui/Icon.svelte";
  import type { TrayAction, TrayView } from "../trayBridge";
  import UsageWidget from "./UsageWidget.svelte";
  import WidgetCustomize from "./WidgetCustomize.svelte";

  let { view, onaction, onhide }: { view: TrayView | null; onaction: (a: TrayAction) => void; onhide: () => void } = $props();

  let editing = $state(false);

  function onkey(e: KeyboardEvent) {
    if (e.key !== "Escape") return;
    if (editing) editing = false;
    else onhide();
  }
</script>

<svelte:window onkeydown={onkey} />

<main class="panel">
  <div class="body">
    {#if !view}
      <p class="muted">Loading…</p>
    {:else if editing}
      <button type="button" class="btn done" onclick={() => (editing = false)}><Icon name="arrowLeft" />Done</button>
      <WidgetCustomize settings={view.settings} prefix="Tray: " listLabel="Tray readings" onchange={(value) => onaction({ type: "settings", value })} />
    {:else}
      {#if view.status === "waiting"}
        <p class="waiting" role="status"><Icon name="alert" />Claude is waiting for you. Open BetterClaudeUI to answer.</p>
      {/if}
      <UsageWidget settings={{ ...view.settings, position: "panel", x: 0, y: 0 }} data={view.data} status={view.status} variant="panel" oncustomize={() => (editing = true)} />
    {/if}
  </div>
  <footer>
    <button type="button" class="btn btn-primary" onclick={() => onaction({ type: "open" })}>Open BetterClaudeUI</button>
    <button type="button" class="btn" onclick={() => onaction({ type: "quit" })}>Quit</button>
  </footer>
</main>

<style>
  .panel { display: flex; flex-direction: column; height: 100vh; background: var(--surface); border: 1px solid var(--line); }
  .body { flex: 1; min-height: 0; overflow-y: auto; padding: 10px 14px; }
  .body :global(.widget.panel) { border-bottom: 0; }
  footer { display: flex; justify-content: space-between; gap: 8px; padding: 10px 14px; border-top: 1px solid var(--line); }
  .muted { color: var(--muted); }
  .done { margin-bottom: 10px; }
  .waiting { display: flex; gap: 8px; margin: 0 0 10px; padding: 8px 10px; border: 1px solid var(--gate); border-radius: var(--radius); color: var(--gate-text); font-weight: 600; font-size: 12.5px; }
</style>
