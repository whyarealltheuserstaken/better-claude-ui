<script lang="ts">
  import { diffLines, summarizeTool, truncateLines } from "../tools";
  import type { ChatItem } from "../types";

  type Tool = Extract<ChatItem, { kind: "tool" }>;
  let { item, maxLines = 200, diffs = false }: { item: Tool; maxLines?: number; diffs?: boolean } = $props();

  let open = $state(false);
  let showAll = $state(false);

  const summary = $derived(summarizeTool(item.name, item.input));
  const out = $derived(item.output ? truncateLines(item.output, showAll ? Infinity : maxLines) : null);
  const diff = $derived(diffs ? diffLines(item.name, item.input) : null);
  const detail = $derived(
    typeof item.input.command === "string" ? item.input.command : JSON.stringify(item.input, null, 2),
  );
</script>

<div class="tool" class:nested={item.nested} data-status={item.status}>
  <button class="head" aria-expanded={open} onclick={() => (open = !open)}>
    <span class="dot" aria-hidden="true"></span>
    <span class="summary">{summary}</span>
    <span class="state">{item.status === "running" ? "running" : item.status === "error" ? "failed" : "done"}</span>
    <span class="chev" aria-hidden="true">{open ? "▾" : "▸"}</span>
  </button>
  {#if open}
    <div class="body">
      {#if diff}
        <pre class="diff">{#each diff as l}<span class="l" data-sign={l.sign}>{l.sign} {l.text}</span>
{/each}</pre>
      {:else}
        <pre class="in">{detail}</pre>
      {/if}
      {#if out}
        <pre class="out">{out.text}</pre>
        {#if out.truncated}
          <button class="more" onclick={() => (showAll = true)}>Show all {out.total} lines</button>
        {/if}
      {/if}
    </div>
  {/if}
</div>

<style>
  .tool {
    border-left: 2px solid var(--line);
    margin: 4px 0 4px 2px;
    overflow: hidden;
  }
  .nested {
    margin-left: 22px;
  }
  .tool[data-status="running"] {
    border-left-color: var(--accent);
  }
  .tool[data-status="error"] {
    border-left-color: var(--bad);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 4px 12px;
    background: none;
    border: 0;
    text-align: left;
  }
  .summary {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .state,
  .chev {
    color: var(--muted);
    font-size: 12.5px;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--muted);
    flex: none;
  }
  [data-status="running"] .dot {
    background: var(--accent);
    animation: pulse 1.2s ease-in-out infinite;
  }
  [data-status="done"] .dot {
    background: var(--ok);
  }
  [data-status="error"] .dot {
    background: var(--bad);
  }
  @keyframes pulse {
    50% {
      opacity: 0.35;
    }
  }
  .body {
    padding: 4px 12px 10px;
    background: color-mix(in srgb, var(--surface) 70%, transparent);
    border-radius: 0 8px 8px 0;
  }
  pre {
    margin: 0;
    font: 12.5px/1.5 var(--mono);
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 340px;
    overflow: auto;
  }
  .in {
    color: var(--muted);
  }
  .out {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px dashed var(--line);
  }
  .more {
    margin-top: 6px;
    background: none;
    border: 0;
    color: var(--accent);
    padding: 0;
  }
  .diff { margin: 0; padding: 8px 12px; font-family: var(--mono); font-size: 12.5px; overflow-x: auto; }
  .l[data-sign="+"] { color: var(--ok); }
  .l[data-sign="-"] { color: var(--bad); }
</style>
