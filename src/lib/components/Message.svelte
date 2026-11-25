<script lang="ts">
  import { renderMarkdown } from "../markdown";
  import type { ChatItem } from "../types";
  import ToolCard from "./ToolCard.svelte";

  let { item, diffs = false }: { item: ChatItem; diffs?: boolean } = $props();
</script>

{#if item.kind === "user"}
  <div class="user"><p>{item.text}</p></div>
{:else if item.kind === "assistant"}
  <div class="assistant md" class:nested={item.nested} class:streaming={item.streaming}>
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
    border-radius: 12px;
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
</style>
