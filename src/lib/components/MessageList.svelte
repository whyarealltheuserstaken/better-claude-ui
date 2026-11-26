<script lang="ts">
  import { tick } from "svelte";
  import type { ChatItem } from "../types";
  import Message from "./Message.svelte";

  let {
    items,
    pageSize = 150,
    diffs = false,
    oncopy,
    onpreview,
  }: { items: ChatItem[]; pageSize?: number; diffs?: boolean; oncopy?: (text: string) => void; onpreview?: (code: string, lang: string) => void } = $props();

  // Long sessions render only the most recent window; older items load on demand.
  let extra = $state(0);
  const start = $derived(Math.max(0, items.length - pageSize - extra));
  const visible = $derived(items.slice(start));

  let scroller: HTMLDivElement | undefined = $state();
  let stick = true;

  /** Show the item (loading older messages if needed) and scroll to it. */
  export async function jumpTo(id: string) {
    const index = items.findIndex((i) => i.id === id);
    if (index < 0) return;
    if (index < start) extra = items.length - pageSize - index;
    stick = false;
    await tick();
    [...(scroller?.querySelectorAll<HTMLElement>("[data-item]") ?? [])].find((el) => el.dataset.item === id)?.scrollIntoView({ block: "center" });
  }

  function onScroll() {
    if (!scroller) return;
    stick = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80;
  }

  $effect(() => {
    // Re-run whenever items change (including streamed text); follow the tail only if the user is there.
    void items;
    if (stick && scroller) {
      tick().then(() => scroller && (scroller.scrollTop = scroller.scrollHeight));
    }
  });
</script>

<div class="scroller" bind:this={scroller} onscroll={onScroll}>
  <div class="column">
    {#if start > 0}
      <button class="earlier" onclick={() => (extra += pageSize)}>Show {Math.min(start, pageSize)} earlier messages</button>
    {/if}
    {#each visible as item (item.id)}
      <div data-item={item.id}><Message {item} {diffs} {oncopy} {onpreview} /></div>
    {/each}
  </div>
</div>

<style>
  .scroller {
    flex: 1;
    overflow-y: auto;
    padding: 8px 24px 24px;
  }
  .column {
    max-width: var(--col, 780px);
    margin: 0 auto;
  }
  .earlier {
    display: block;
    margin: 12px auto;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    padding: 4px 14px;
    color: var(--muted);
  }
</style>
