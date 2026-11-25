<script lang="ts">
  import { onMount } from "svelte";
  import { ipc } from "../ipc";

  let {
    project,
    advanced,
    onclose,
  }: { project: string | null; advanced: boolean; onclose: () => void } = $props();

  interface Tab {
    id: string;
    label: string;
    help: string;
    needsProject: boolean;
    advancedOnly: boolean;
  }

  const ALL: Tab[] = [
    { id: "project_instructions", label: "Project instructions", help: "CLAUDE.md in this project folder. Claude reads it at the start of every session here: put conventions, commands and preferences.", needsProject: true, advancedOnly: false },
    { id: "user_instructions", label: "My instructions", help: "~/.claude/CLAUDE.md. Applies to every project.", needsProject: false, advancedOnly: false },
    { id: "project_settings", label: "Project settings", help: ".claude/settings.json in this project (permissions, hooks, environment). Must be valid JSON.", needsProject: true, advancedOnly: true },
    { id: "user_settings", label: "My settings", help: "~/.claude/settings.json. Applies everywhere. Must be valid JSON.", needsProject: false, advancedOnly: true },
  ];

  const tabs = $derived(ALL.filter((t) => (advanced || !t.advancedOnly)));
  let current = $state("user_instructions");
  let text = $state("");
  let saved = $state("");
  let error = $state<string | null>(null);
  let note = $state<string | null>(null);
  let loading = $state(false);

  const tab = $derived(ALL.find((t) => t.id === current)!);
  const blocked = $derived(tab.needsProject && !project);
  const dirty = $derived(text !== saved);

  async function load(id: string) {
    loading = true;
    error = note = null;
    try {
      const t = ALL.find((x) => x.id === id)!;
      if (t.needsProject && !project) {
        text = saved = "";
      } else {
        text = saved = await ipc.readConfigFile(id, project);
      }
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
    }
  }

  function choose(id: string) {
    if (dirty && !confirm("Discard your unsaved changes?")) return;
    current = id;
    void load(id);
  }

  async function save() {
    error = note = null;
    try {
      await ipc.writeConfigFile(current, project, text);
      saved = text;
      note = "Saved. Applies to sessions you start next. The previous version was kept as a .bak file.";
    } catch (e) {
      error = String(e);
    }
  }

  onMount(() => void load(current));
</script>

<div class="scrim" role="presentation" onclick={() => (!dirty || confirm("Discard your unsaved changes?")) && onclose()} onkeydown={() => {}}>
  <div class="panel" role="dialog" aria-modal="true" aria-label="Instructions and settings" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
    <header>
      <h2>Instructions and settings</h2>
      <button class="x" onclick={() => (!dirty || confirm("Discard your unsaved changes?")) && onclose()} aria-label="Close">×</button>
    </header>
    <div class="tabs" role="tablist">
      {#each tabs as t (t.id)}
        <button role="tab" aria-selected={current === t.id} class:on={current === t.id} onclick={() => choose(t.id)}>{t.label}</button>
      {/each}
    </div>
    <p class="sub">{tab.help}</p>
    {#if blocked}
      <p class="sub">Open a Code session in a project folder to edit this file.</p>
    {:else}
      <textarea bind:value={text} spellcheck="false" aria-label={tab.label} disabled={loading} rows="16" class:mono={tab.id.endsWith("settings")}></textarea>
      <div class="row">
        <button class="primary" disabled={!dirty || loading} onclick={save}>Save</button>
        <button disabled={!dirty} onclick={() => (text = saved)}>Revert</button>
        {#if saved === "" && !dirty}<span class="sub">This file doesn't exist yet. Saving creates it.</span>{/if}
      </div>
    {/if}
    {#if error}<p class="err" role="alert">{error}</p>{/if}
    {#if note}<p class="ok" role="status">{note}</p>{/if}
  </div>
</div>

<style>
  .scrim { position: fixed; inset: 0; background: rgb(0 0 0 / 0.5); display: grid; place-items: center; z-index: 10; }
  .panel { width: min(720px, 94vw); max-height: 90vh; overflow: auto; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-lg); padding: 18px 22px; }
  header { display: flex; justify-content: space-between; align-items: center; }
  h2 { margin: 0; font-size: 18px; }
  .x { background: none; border: 0; color: var(--muted); font-size: 22px; }
  .tabs { display: flex; gap: 4px; flex-wrap: wrap; margin: 10px 0 4px; border-bottom: 1px solid var(--line); }
  .tabs button { background: none; border: 0; border-bottom: 2px solid transparent; padding: 6px 10px; color: var(--muted); }
  .tabs button.on { color: var(--text); border-bottom-color: var(--accent); }
  .sub { color: var(--muted); font-size: 13px; }
  textarea { width: 100%; background: var(--bg); color: var(--text); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 10px; font: inherit; resize: vertical; }
  textarea.mono { font-family: var(--mono); font-size: 12.5px; }
  .row { display: flex; gap: 10px; align-items: center; margin-top: 10px; }
  button { background: var(--raised); color: var(--text); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 6px 14px; }
  button.primary { background: var(--accent); color: var(--accent-ink); border-color: transparent; font-weight: 600; }
  button:disabled { opacity: 0.5; }
  .err { color: var(--bad); }
  .ok { color: var(--ok); }
</style>
