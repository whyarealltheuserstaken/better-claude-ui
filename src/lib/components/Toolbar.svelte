<script lang="ts">
  import type { Snippet } from "svelte";
  import Icon from "../ui/Icon.svelte";

  let {
    title,
    subtitle,
    onsidebar,
    onsearch,
    onexport,
    onterminal,
    onpanel,
    children,
  }: {
    title: string;
    subtitle: string;
    onsidebar: () => void;
    onsearch: () => void;
    onexport?: () => void;
    onterminal?: () => void;
    onpanel?: () => void;
    children?: Snippet;
  } = $props();
</script>

<header>
  <button class="btn-icon" aria-label="Show or hide the sidebar" title="Show or hide the sidebar (Ctrl+B)" onclick={onsidebar}><Icon name="sidebar" /></button>
  <div class="titles">
    <h1>{title}</h1>
    {#if subtitle}<p title={subtitle}>{subtitle}</p>{/if}
  </div>
  <button class="search" aria-label="Search or run a command" title="Search or run a command (Ctrl+K)" onclick={onsearch}>
    <Icon name="search" size={14} /><span class="hint">Search or run a command</span><kbd>Ctrl K</kbd>
  </button>
  <div class="end">
    {@render children?.()}
    {#if onexport}<button class="btn-icon" aria-label="Export this conversation" title="Copy this conversation as Markdown" onclick={onexport}><Icon name="share" /></button>{/if}
    {#if onterminal}<button class="btn-icon" aria-label="Continue in terminal" title="Continue this conversation in your own terminal" onclick={onterminal}><Icon name="terminal" /></button>{/if}
    {#if onpanel}<button class="btn-icon" aria-label="Show or hide the right panel" title="Show or hide the right panel" onclick={onpanel}><Icon name="panel" /></button>{/if}
  </div>
</header>

<style>
  header { container-type: inline-size; display: flex; align-items: center; gap: 10px; min-height: 54px; padding: 6px 14px; flex: none; }
  .titles { min-width: 0; flex: 1 1 0; }
  h1 { margin: 0; font-size: 15px; font-weight: 650; line-height: 1.25; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  p { margin: 0; font-size: 11.5px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .search { flex: 0 1 340px; display: flex; align-items: center; gap: 8px; min-width: 30px; min-height: 30px; padding: 3px 12px; background: var(--fill); border: 1px solid var(--line); border-radius: var(--capsule); color: var(--muted); }
  .search:hover { background: var(--sel); }
  .hint { flex: 1; text-align: start; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12.5px; }
  kbd { font: 11.5px var(--ui); white-space: nowrap; }
  .end { flex: 1 1 0; display: flex; align-items: center; justify-content: flex-end; gap: 6px; }
  /* In a narrow window the search bar becomes an icon. */
  @container (max-width: 700px) {
    .search { flex: 0 0 30px; padding: 0; justify-content: center; }
    .hint, kbd { display: none; }
    .titles { flex: 1 1 auto; }
    .end { flex: 0 0 auto; }
  }
</style>
