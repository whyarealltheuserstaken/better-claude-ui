<script lang="ts">
  import { explainRisk, summarizeTool } from "../tools";
  import Icon from "../ui/Icon.svelte";
  import type { PendingPermission } from "../types";

  let {
    request,
    onresolve,
  }: { request: PendingPermission; onresolve: (id: string, decision: "allow" | "allow_always" | "deny") => void } = $props();

  const summary = $derived(summarizeTool(request.tool, request.input));
  const detail = $derived(
    typeof request.input.command === "string"
      ? request.input.command
      : typeof request.input.file_path === "string"
        ? request.input.file_path
        : "",
  );
</script>

<div class="gate" role="alertdialog" aria-label="Permission needed" aria-describedby="why-{request.request_id}">
  <span class="shield"><Icon name="shield" size={18} /></span>
  <div class="text">
    <strong>{summary}?</strong>
    <span id="why-{request.request_id}">{explainRisk(request.tool)}</span>
    {#if detail}<code title={detail}>{detail}</code>{/if}
  </div>
  <!-- Nothing here takes focus by itself: approving is always a deliberate choice. -->
  <div class="actions">
    <button class="btn deny" onclick={() => onresolve(request.request_id, "deny")}>Deny</button>
    <button class="btn" onclick={() => onresolve(request.request_id, "allow_always")} title="Stop asking for {request.tool} in this session">
      Always allow {request.tool}
    </button>
    <button class="btn btn-gate" onclick={() => onresolve(request.request_id, "allow")}>Allow</button>
  </div>
</div>

<style>
  .gate { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin: 0 0 8px; padding: 12px 16px; border-radius: var(--float-radius); background: color-mix(in srgb, var(--gate) 14%, var(--card)); border: 1px solid var(--gate); animation: rise 0.18s ease-out; }
  :global(:root[data-solid="true"]) .gate { border-width: 3px; background: var(--card); }
  @keyframes rise { from { transform: translateY(6px); opacity: 0; } }
  .shield { color: var(--gate-text); display: flex; }
  .text { flex: 1 1 240px; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .text span { color: var(--muted); font-size: 13px; }
  code { font: 12px var(--mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; margin-inline-start: auto; }
  .deny:hover { border-color: var(--bad); }
</style>
