<script lang="ts">
  import { onMount } from "svelte";
  import { filterPalette, type PaletteItem } from "../palette";

  let { items, onclose }: { items: PaletteItem[]; onclose: () => void } = $props();

  let query = $state("");
  let sel = $state(0);
  let input: HTMLInputElement | undefined = $state();

  const shown = $derived(filterPalette(items, query));
  $effect(() => {
    void shown;
    sel = 0;
  });
  onMount(() => input?.focus());

  function run(item: PaletteItem | undefined) {
    if (!item) return;
    onclose();
    item.run();
  }

  function onkey(e: KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (shown.length > 0) sel = (sel + (e.key === "ArrowDown" ? 1 : shown.length - 1)) % shown.length;
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(shown[sel]);
    } else if (e.key === "Escape") {
      onclose();
    }
  }
</script>

<div class="scrim" role="presentation" onclick={onclose}>
  <div class="box" role="dialog" aria-modal="true" aria-label="Command palette" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={onkey}>
    <input bind:this={input} bind:value={query} placeholder="Type a command, theme or conversation…" aria-label="Search commands" aria-controls="palette-list" aria-activedescendant={shown[sel] ? `pal-${sel}` : undefined} />
    <ul id="palette-list" role="listbox" aria-label="Results">
      {#each shown as item, i (item.id)}
        <li role="option" id="pal-{i}" aria-selected={i === sel}>
          <button class:on={i === sel} tabindex="-1" onmouseenter={() => (sel = i)} onclick={() => run(item)}>
            <span class="l">{item.label}</span>
            <span class="g">{item.group}</span>
          </button>
        </li>
      {/each}
      {#if shown.length === 0}<li class="none">Nothing matches “{query}”.</li>{/if}
    </ul>
    <p class="hint">Enter to run · ↑↓ to choose · Esc to close</p>
  </div>
</div>

<style>
  .scrim { position: fixed; inset: 0; background: rgb(0 0 0 / 0.45); display: flex; justify-content: center; align-items: flex-start; padding-top: 14vh; z-index: 20; }
  .box { width: min(560px, 92vw); background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-lg); box-shadow: 0 20px 60px rgb(0 0 0 / 0.4); overflow: hidden; }
  input { width: 100%; background: none; border: 0; border-bottom: 1px solid var(--line); outline: none; color: var(--text); font: inherit; font-size: 15px; padding: 14px 16px; }
  ul { list-style: none; margin: 0; padding: 6px; max-height: 340px; overflow: auto; }
  li button { width: 100%; display: flex; justify-content: space-between; gap: 12px; text-align: left; background: none; border: 0; border-radius: var(--radius-sm); padding: 8px 10px; color: var(--text); }
  li button.on { background: var(--accent); color: var(--accent-ink); }
  .g { color: var(--muted); font-size: 12px; flex: none; }
  li button.on .g { color: inherit; opacity: 0.8; }
  .l { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .none { color: var(--muted); padding: 10px; }
  .hint { margin: 0; padding: 6px 14px 10px; color: var(--muted); font-size: 12px; }
</style>
