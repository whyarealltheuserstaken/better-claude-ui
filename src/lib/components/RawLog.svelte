<script lang="ts">
  import type { SessionEvent } from "../types";
  let { events }: { events: SessionEvent[] } = $props();
  const recent = $derived(events.slice(-200).reverse());
</script>

<details class="raw">
  <summary>Raw events ({events.length})</summary>
  <pre>{recent.map((e) => JSON.stringify(e)).join("\n")}</pre>
</details>

<style>
  .raw { margin-top: 8px; font-size: 12px; color: var(--muted); }
  pre { max-height: 220px; overflow: auto; background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 8px; font-family: var(--mono); white-space: pre-wrap; word-break: break-all; }
</style>
