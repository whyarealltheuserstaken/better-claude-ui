<script lang="ts">
  import { type Caps, MODELS, PERMISSION_MODES } from "../tier";
  import Menu from "../ui/Menu.svelte";

  let {
    variant,
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
    /** "panel" stacks labelled rows; "composer" is a compact row. */
    variant: "panel" | "composer";
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

  // Prefer the model list from the CLI; "default" means no --model flag.
  const modelOptions = $derived(
    models.length > 0
      ? models.map((m) => ({ id: m.value === "default" ? "" : m.value, label: m.value === "default" ? "Default" : m.display_name }))
      : MODELS,
  );
  const EFFORTS = [
    { id: "", label: "Default" },
    { id: "low", label: "Low" },
    { id: "medium", label: "Medium" },
    { id: "high", label: "High" },
    { id: "xhigh", label: "Extra high" },
    { id: "max", label: "Max" },
  ];
  const modes = $derived([{ id: "", label: "Default" }, ...PERMISSION_MODES.filter((m) => caps.permissionModes.includes(m.id))]);
  const named = $derived(variant === "panel");

  function pickMode(v: string) {
    if (v === "bypassPermissions" && !confirm("Bypass mode lets Claude run any command and edit any file without asking. Continue?")) return;
    onmode(v || null);
  }
</script>

{#snippet row(label: string, value: string, options: { id: string; label: string; help?: string }[], onpick: (id: string) => void)}
  <div class="row">
    {#if named}<span class="name">{label}</span>{/if}
    <Menu {label} {value} {options} {onpick} showLabel={!named && label !== "Model"} />
  </div>
{/snippet}

<div class={variant}>
  {#if caps.modelPicker}
    {@render row("Model", model ?? "", modelOptions, (v) => onmodel(v || null))}
    {@render row("Thinking", effort ?? "", EFFORTS, (v) => oneffort(v || null))}
  {/if}
  {#if caps.modePicker && !chat}
    {@render row("Permissions", permissionMode ?? "", modes, pickMode)}
  {/if}
  {#if chat}
    <label class="row chk" title="Lets Claude search the web and read pages in this chat. Nothing on your computer is touched.">
      <input type="checkbox" checked={webSearch} onchange={(e) => onweb(e.currentTarget.checked)} /> Web search
    </label>
  {/if}
</div>

<style>
  .panel { display: flex; flex-direction: column; gap: 4px; }
  .composer { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-width: 0; }
  .row { display: flex; align-items: center; gap: 8px; min-height: 30px; }
  .panel .row { justify-content: space-between; }
  .name { color: var(--muted); }
  .chk { cursor: pointer; }
</style>
