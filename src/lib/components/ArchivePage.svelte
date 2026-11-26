<script lang="ts">
  import { type ArchiveDoc, type ArchiveEntry, archiveItems, dateLabel, filterArchive, sourceLabel, sourcesIn } from "../archive";
  import MessageList from "./MessageList.svelte";

  let {
    entries,
    viewing,
    onopen,
    onback,
    ondelete,
    oncontinue,
    onimport,
    oncopy,
    onpreview,
  }: {
    entries: ArchiveEntry[];
    viewing: { entry: ArchiveEntry; doc: ArchiveDoc } | null;
    onopen: (id: string) => void;
    onback: () => void;
    ondelete: (id: string) => void;
    oncontinue: (id: string) => void;
    onimport: () => void;
    oncopy: (text: string) => void;
    onpreview: (code: string, lang: string) => void;
  } = $props();

  let query = $state("");
  let source = $state<string | null>(null);
  const shown = $derived(filterArchive(entries, query, source));
  const sources = $derived(sourcesIn(entries));

  function remove(e: ArchiveEntry) {
    if (confirm(`Remove "${e.title}" from your Archive? This can't be undone.`)) ondelete(e.id);
  }
</script>

<div class="archive">
  <aside aria-label="Archive">
    {#if entries.length > 0}<header><button onclick={onimport}>Import…</button></header>{/if}
    {#if entries.length === 0}
      <p class="empty">Nothing here yet. Import conversations from Claude.ai, ChatGPT or another BetterClaudeUI backup, and they'll appear here to read, search and continue.</p>
      <button class="primary" onclick={onimport}>Import data</button>
    {:else}
      <input type="search" placeholder="Filter conversations" bind:value={query} aria-label="Filter conversations" />
      {#if sources.length > 1}
        <div class="chips" role="group" aria-label="Source">
          <button class:on={source === null} aria-pressed={source === null} onclick={() => (source = null)}>All</button>
          {#each sources as s (s)}<button class:on={source === s} aria-pressed={source === s} onclick={() => (source = s)}>{sourceLabel(s)}</button>{/each}
        </div>
      {/if}
      <ul>
        {#each shown as e (e.id)}
          <li>
            <button class="item" class:on={viewing?.entry.id === e.id} onclick={() => onopen(e.id)}>
              <span class="t">{e.title}</span>
              <span class="m">{sourceLabel(e.source)}{e.updated ? ` · ${dateLabel(e.updated)}` : ""} · {e.messages} msg</span>
            </button>
          </li>
        {/each}
        {#if shown.length === 0}<li class="empty">Nothing matches.</li>{/if}
      </ul>
    {/if}
  </aside>

  <section class="viewer" aria-label="Conversation">
    {#if viewing}
      <div class="bar">
        <div>
          <strong>{viewing.entry.title}</strong>
          <div class="m">From {sourceLabel(viewing.entry.source)}. Read-only: this isn't a live Claude session.</div>
        </div>
        <div class="acts">
          <button class="primary" onclick={() => oncontinue(viewing.entry.id)} title="Starts a new chat with this conversation attached as context">Continue in a new chat</button>
          <button class="danger" onclick={() => remove(viewing.entry)}>Remove</button>
          <button class="back" onclick={onback} aria-label="Close conversation">×</button>
        </div>
      </div>
      <MessageList items={archiveItems(viewing.doc)} {oncopy} {onpreview} />
    {:else}
      <div class="placeholder"><p>Pick a conversation to read it.</p></div>
    {/if}
  </section>
</div>

<style>
  .archive { display: grid; grid-template-columns: 320px 1fr; flex: 1; min-height: 0; }
  @media (max-width: 800px) { .archive { grid-template-columns: 1fr; } .viewer { display: none; } }
  aside { border-right: 1px solid var(--line); padding: 14px; display: flex; flex-direction: column; gap: 10px; overflow: hidden; }
  header { display: flex; justify-content: flex-end; }
  input { background: var(--surface); color: var(--text); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 7px 10px; font: inherit; }
  ul { list-style: none; margin: 0; padding: 0; overflow-y: auto; flex: 1; }
  .item { width: 100%; text-align: left; background: none; border: 0; border-radius: var(--radius-sm); padding: 8px 10px; display: flex; flex-direction: column; gap: 2px; color: var(--text); }
  .item:hover, .item.on { background: var(--raised); }
  .t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .m { color: var(--muted); font-size: 12px; }
  .empty { color: var(--muted); padding: 6px 4px; }
  .chips { display: flex; gap: 6px; flex-wrap: wrap; }
  .chips button { min-height: 28px; background: none; border-color: var(--line); padding: 1px 12px; font-size: 12px; color: var(--muted); }
  .chips button.on { border-color: var(--accent); color: var(--accent-text); }
  .viewer { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
  .bar { display: flex; justify-content: space-between; gap: 12px; align-items: center; padding: 10px 20px; border-bottom: 1px solid var(--line); }
  .acts { display: flex; gap: 8px; align-items: center; }
  .placeholder { margin: auto; color: var(--muted); }
  button { min-height: 30px; background: var(--fill); color: var(--text); border: 1px solid transparent; border-radius: var(--capsule); padding: 4px 14px; }
  button.primary { background: var(--accent); color: var(--accent-ink); border-color: transparent; font-weight: 600; }
  button.danger { color: var(--bad-text); }
  .back { background: none; border: 0; color: var(--muted); font-size: 20px; padding: 0 8px; }
</style>
