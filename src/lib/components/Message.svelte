<script lang="ts">
  import { renderMarkdown } from "../markdown";
  import type { ChatItem } from "../types";
  import ToolCard from "./ToolCard.svelte";

  import { itemText } from "../export";

  let { item, diffs = false, oncopy }: { item: ChatItem; diffs?: boolean; oncopy?: (text: string) => void } = $props();
</script>

{#if item.kind === "user"}
  <div class="user hov">
    {#if oncopy}<button class="copy" aria-label="Copy message" onclick={() => oncopy(itemText(item))}>Copy</button>{/if}
    <p>{item.text}</p>
    {#if item.attachments && item.attachments.length > 0}
      <div class="atts">{#each item.attachments as a}<span class="att">{a.kind === "image" ? "Image" : a.kind === "pdf" ? "PDF" : "File"}: {a.name}</span>{/each}</div>
    {/if}
  </div>
{:else if item.kind === "assistant"}
  <div class="assistant md hov" class:nested={item.nested} class:streaming={item.streaming}>
    {#if oncopy && !item.streaming}<button class="copy" aria-label="Copy reply" onclick={() => oncopy(itemText(item))}>Copy</button>{/if}
    <!-- eslint-disable-next-line svelte/no-at-html-tags -- markdown-it runs with html:false -->
    {@html renderMarkdown(item.text)}
  </div>
{:else if item.kind === "tool"}
  <ToolCard {item} {diffs} />
{:else}
  <div class="notice" data-level={item.level} role={item.level === "error" ? "alert" : "status"}>{item.text}</div>
{/if}

<style>
  .user {
    margin: 26px 0 10px;
    padding: 10px 14px;
    background: var(--raised);
    border-radius: var(--radius-lg);
    font-weight: 560;
    max-width: 88%;
  }
  .user p {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .assistant {
    margin: 10px 0;
    overflow-wrap: anywhere;
  }
  .nested {
    margin-left: 22px;
    color: var(--muted);
  }
  .streaming::after {
    content: "";
    display: inline-block;
    width: 7px;
    height: 1em;
    margin-left: 2px;
    vertical-align: text-bottom;
    background: var(--accent);
    animation: blink 1s steps(2) infinite;
  }
  @keyframes blink {
    50% {
      opacity: 0;
    }
  }
  .notice {
    margin: 10px 0;
    padding: 9px 12px;
    border-radius: var(--radius);
    background: var(--surface);
    border: 1px solid var(--line);
    color: var(--muted);
  }
  .notice[data-level="error"] {
    color: var(--bad);
    border-color: color-mix(in srgb, var(--bad) 45%, var(--line));
  }
  :global(:root[data-user="bar"]) .user {
    background: none;
    border-radius: 0;
    border-left: 3px solid var(--accent);
    padding: 2px 0 2px 14px;
    max-width: none;
  }
  :global(:root[data-user="prompt"]) .user {
    background: none;
    border-radius: 0;
    padding: 0;
    max-width: none;
    font-weight: 600;
    color: var(--accent);
  }
  :global(:root[data-user="prompt"]) .user p::before {
    content: "❯ ";
  }
  .user { margin-top: calc(26px * var(--density)); }
  .assistant { margin: calc(10px * var(--density)) 0; }
  .hov { position: relative; }
  .copy { position: absolute; top: 4px; right: 6px; opacity: 0; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 0 8px; font-size: 11.5px; color: var(--muted); font-weight: 400; }
  .hov:hover .copy, .copy:focus-visible { opacity: 1; }
  .atts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
  .att { font-size: 12px; font-weight: 400; color: var(--muted); border: 1px solid var(--line); border-radius: 999px; padding: 0 8px; }
</style>
