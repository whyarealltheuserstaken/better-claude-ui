<script lang="ts">
  import { type Caps, MODELS, PERMISSION_MODES } from "../tier";

  let {
    caps,
    model,
    permissionMode,
    chat,
    models = [],
    onmodel,
    onmode,
  }: {
    caps: Caps;
    model: string | null;
    permissionMode: string | null;
    chat: boolean;
    models?: { value: string; display_name: string }[];
    onmodel: (m: string | null) => void;
    onmode: (m: string | null) => void;
  } = $props();

  // Prefer the CLI's own model list; "default" means no --model flag.
  const modelOptions = $derived(
    models.length > 0
      ? models.map((m) => ({ id: m.value === "default" ? "" : m.value, label: m.value === "default" ? "Default" : m.display_name }))
      : MODELS,
  );
  const modes = $derived(PERMISSION_MODES.filter((m) => caps.permissionModes.includes(m.id)));

  function pickMode(v: string) {
    if (v === "bypassPermissions" && !confirm("Bypass mode lets Claude run any command and edit any file without asking. Continue?")) return;
    onmode(v || null);
  }
</script>

{#if caps.modelPicker || (caps.modePicker && !chat)}
  <div class="bar">
    {#if caps.modelPicker}
      <label
        >Model
        <select value={model ?? ""} onchange={(e) => onmodel(e.currentTarget.value || null)}>
          {#each modelOptions as m (m.id)}<option value={m.id}>{m.label}</option>{/each}
        </select>
      </label>
    {/if}
    {#if caps.modePicker && !chat}
      <label
        >Permissions
        <select value={permissionMode ?? ""} onchange={(e) => pickMode(e.currentTarget.value)} title={modes.find((m) => m.id === (permissionMode ?? "default"))?.help}>
          <option value="">Default</option>
          {#each modes as m (m.id)}<option value={m.id}>{m.label}</option>{/each}
        </select>
      </label>
    {/if}
  </div>
{/if}

<style>
  .bar { display: flex; gap: 16px; padding: 0 2px 8px; font-size: 12.5px; color: var(--muted); }
  label { display: flex; gap: 6px; align-items: center; }
  select { background: var(--raised); color: var(--text); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 3px 6px; font: inherit; }
</style>
