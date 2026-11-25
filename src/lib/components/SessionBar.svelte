<script lang="ts">
  import { type Caps, MODELS, PERMISSION_MODES } from "../tier";

  let {
    caps,
    model,
    permissionMode,
    chat,
    models = [],
    effort = null,
    webSearch = false,
    onmodel,
    onmode,
    oneffort,
    onweb,
  }: {
    caps: Caps;
    model: string | null;
    permissionMode: string | null;
    chat: boolean;
    models?: { value: string; display_name: string }[];
    effort?: string | null;
    webSearch?: boolean;
    oneffort: (e: string | null) => void;
    onweb: (on: boolean) => void;
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

{#if caps.modelPicker || chat || (caps.modePicker && !chat)}
  <div class="bar">
    {#if caps.modelPicker}
      <label
        >Model
        <select value={model ?? ""} onchange={(e) => onmodel(e.currentTarget.value || null)}>
          {#each modelOptions as m (m.id)}<option value={m.id}>{m.label}</option>{/each}
        </select>
      </label>
    {/if}
    {#if caps.modelPicker}
      <label
        >Thinking
        <select value={effort ?? ""} onchange={(e) => oneffort(e.currentTarget.value || null)} title="How much effort Claude puts into thinking. Higher is slower and uses more of your allowance.">
          <option value="">Default</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="xhigh">Extra high</option>
          <option value="max">Max</option>
        </select>
      </label>
    {/if}
    {#if chat}
      <label class="chk" title="Lets Claude search the web and read pages in this chat. Nothing on your computer is touched."
        ><input type="checkbox" checked={webSearch} onchange={(e) => onweb(e.currentTarget.checked)} /> Web search</label
      >
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
  .chk { cursor: pointer; }
  select { background: var(--raised); color: var(--text); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 3px 6px; font: inherit; }
</style>
