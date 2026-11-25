<script lang="ts">
  import { explainRisk, summarizeTool } from "../tools";
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
  <div class="text">
    <strong>{summary}?</strong>
    <span id="why-{request.request_id}">{explainRisk(request.tool)}</span>
    {#if detail}<code>{detail}</code>{/if}
  </div>
  <div class="actions">
    <button class="allow" onclick={() => onresolve(request.request_id, "allow")}>Allow</button>
    <button onclick={() => onresolve(request.request_id, "allow_always")} title="Stop asking for {request.tool} in this session">
      Always allow {request.tool}
    </button>
    <button class="deny" onclick={() => onresolve(request.request_id, "deny")}>Deny</button>
  </div>
</div>

<style>
  .gate {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
    margin: 0 0 10px;
    padding: 11px 14px;
    background: color-mix(in srgb, var(--gate) 11%, var(--surface));
    border: 1px solid color-mix(in srgb, var(--gate) 55%, var(--line));
    border-left: 4px solid var(--gate);
    border-radius: var(--radius);
    animation: rise 0.18s ease-out;
  }
  @keyframes rise {
    from {
      transform: translateY(6px);
      opacity: 0;
    }
  }
  .text {
    flex: 1 1 260px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .text span {
    color: var(--muted);
    font-size: 13px;
  }
  code {
    font: 12.5px var(--mono);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  button {
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 6px 12px;
  }
  .allow {
    background: var(--gate);
    color: var(--gate-ink);
    border-color: var(--gate);
    font-weight: 600;
  }
  .deny:hover {
    border-color: var(--bad);
    color: var(--bad);
  }
</style>
