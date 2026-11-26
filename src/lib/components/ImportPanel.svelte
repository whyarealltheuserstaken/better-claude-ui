<script lang="ts">
  import { type ImportOptions, type ImportResult, type Inspection, defaultOptions, nothingSelected, summarizeResult } from "../exchange";
  import { dateLabel } from "../archive";

  let {
    pickFile,
    pickFolder,
    inspect,
    run,
    finish,
    onopenarchive,
    onclose,
  }: {
    pickFile: () => Promise<string | null>;
    pickFolder: () => Promise<string | null>;
    inspect: (path: string) => Promise<Inspection>;
    run: (path: string, options: ImportOptions) => Promise<ImportResult>;
    finish: (r: ImportResult) => Promise<{ projectsAdded: number; settingsApplied: boolean }>;
    onopenarchive: () => void;
    onclose: () => void;
  } = $props();

  type Phase = "choose" | "inspecting" | "preview" | "importing" | "done" | "error";
  let phase = $state<Phase>("choose");
  let path = $state("");
  let info = $state<Inspection | null>(null);
  let options = $state<ImportOptions>({ conversations: true, projects: false, settings: false, usage: false });
  let lines = $state<string[]>([]);
  let error = $state<string | null>(null);

  async function choose(kind: "file" | "folder") {
    const p = await (kind === "file" ? pickFile() : pickFolder());
    if (!p) return;
    path = p;
    phase = "inspecting";
    error = null;
    try {
      info = await inspect(p);
      options = defaultOptions(info);
      phase = "preview";
    } catch (e) {
      error = String(e);
      phase = "error";
    }
  }

  async function doImport() {
    if (!info) return;
    phase = "importing";
    try {
      const r = await run(path, options);
      const f = await finish(r);
      lines = summarizeResult(r, f.projectsAdded, f.settingsApplied);
      phase = "done";
    } catch (e) {
      error = String(e);
      phase = "error";
    }
  }

  const range = $derived(info?.date_from && info?.date_to ? `${dateLabel(info.date_from)} to ${dateLabel(info.date_to)}` : null);
  const blocked = $derived(phase === "inspecting" || phase === "importing");
</script>

<div class="scrim" role="presentation" onclick={() => !blocked && onclose()} onkeydown={(e) => e.key === "Escape" && !blocked && onclose()}>
  <div class="panel" role="dialog" aria-modal="true" aria-label="Import data" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
    <header>
      <h2>Import data</h2>
      {#if !blocked}<button class="x" onclick={onclose} aria-label="Close">×</button>{/if}
    </header>

    {#if phase === "choose" || phase === "error"}
      {#if phase === "error"}<p class="err" role="alert">{error}</p>{/if}
      <p>Bring conversations, projects and settings from another assistant, or restore a BetterClaudeUI backup.</p>
      <div class="row">
        <button class="primary" onclick={() => choose("file")}>Choose a file…</button>
        <button onclick={() => choose("folder")}>Choose a folder…</button>
      </div>
      <details open>
        <summary>Where do I get an export?</summary>
        <ul class="help">
          <li><strong>Claude.ai:</strong> Settings, Privacy, Export data. You'll get a ZIP by email; choose it here as is.</li>
          <li><strong>ChatGPT:</strong> Settings, Data controls, Export data. Choose the ZIP (or <code>conversations.json</code>).</li>
          <li><strong>BetterClaudeUI:</strong> a <code>backup.json</code> or an export folder made by <em>Export all my data</em>.</li>
          <li><strong>Grok and others:</strong> there's no verified official format, so JSON files are read on a best-effort basis. A Markdown or text file with "## You" and "## Assistant" headings always works.</li>
        </ul>
        <p class="sub">Nothing is saved until you've seen a preview. Your files are only read, never changed.</p>
      </details>
    {:else if phase === "inspecting"}
      <p role="status">Reading the file…</p>
    {:else if phase === "preview" && info}
      <section class="card">
        <strong>{info.format}</strong>
        <div class="sub">{info.conversations} conversation{info.conversations === 1 ? "" : "s"}, {info.messages} messages{range ? ` · ${range}` : ""}</div>
        {#if info.samples.length > 0}
          <ul class="samples">{#each info.samples as s}<li>{s}</li>{/each}{#if info.conversations > info.samples.length}<li class="sub">and {info.conversations - info.samples.length} more…</li>{/if}</ul>
        {/if}
      </section>
      {#if info.warnings.length > 0}
        <ul class="warns" aria-label="Things to know">{#each info.warnings as w}<li>{w}</li>{/each}</ul>
      {/if}
      <fieldset>
        <legend>What to import</legend>
        <label><input type="checkbox" bind:checked={options.conversations} disabled={info.conversations === 0} /> Conversations ({info.conversations}) <small>go to your Archive: you can read and search them, and continue any in a new chat</small></label>
        {#if info.projects > 0}<label><input type="checkbox" bind:checked={options.projects} /> Projects ({info.projects}) <small>names and instructions only</small></label>{/if}
        {#if info.has_settings}<label><input type="checkbox" bind:checked={options.settings} /> Settings and themes <small>never turns on "always allow", extra flags or bypass mode</small></label>{/if}
        {#if info.usage_records > 0}<label><input type="checkbox" bind:checked={options.usage} /> Usage history ({info.usage_records} records)</label>{/if}
        {#if info.presets > 0}<small class="sub">{info.presets} agent team{info.presets === 1 ? "" : "s"} come along with settings.</small>{/if}
      </fieldset>
      <div class="row">
        <button class="primary" disabled={nothingSelected(options, info)} onclick={doImport}>Import</button>
        <button onclick={() => (phase = "choose")}>Choose a different file</button>
      </div>
    {:else if phase === "importing"}
      <p role="status">Importing…</p>
    {:else if phase === "done"}
      <p class="ok" role="status">Done.</p>
      <ul>{#each lines as l}<li>{l}</li>{/each}</ul>
      <div class="row">
        <button class="primary" onclick={() => { onclose(); onopenarchive(); }}>Open Archive</button>
        <button onclick={onclose}>Close</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .scrim { position: fixed; inset: 0; background: rgb(0 0 0 / 0.5); display: grid; place-items: center; z-index: 12; }
  .panel { width: min(600px, 94vw); max-height: 90vh; overflow: auto; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-lg); padding: 18px 22px; }
  header { display: flex; justify-content: space-between; align-items: center; }
  h2 { margin: 0; font-size: 18px; }
  .x { background: none; border: 0; color: var(--muted); font-size: 22px; }
  .sub, small { color: var(--muted); font-size: 12.5px; }
  .row { display: flex; gap: 10px; flex-wrap: wrap; margin: 12px 0; }
  button { background: var(--raised); color: var(--text); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 6px 14px; }
  button.primary { background: var(--accent); color: var(--accent-ink); border-color: transparent; font-weight: 600; }
  button:disabled { opacity: 0.5; }
  .card { background: var(--bg); border: 1px solid var(--line); border-radius: var(--radius); padding: 10px 14px; margin: 10px 0; }
  .samples { margin: 6px 0 0; padding-left: 18px; font-size: 13px; }
  .warns { margin: 6px 0; padding: 8px 8px 8px 26px; background: color-mix(in srgb, var(--gate) 12%, var(--surface)); border-radius: var(--radius-sm); font-size: 13px; }
  fieldset { border: 1px solid var(--line); border-radius: var(--radius); margin: 10px 0; padding: 8px 12px; }
  legend { color: var(--muted); font-size: 12.5px; padding: 0 6px; }
  fieldset label { display: block; padding: 3px 0; }
  .help { padding-left: 18px; font-size: 13px; }
  code { font-family: var(--mono); background: var(--raised); padding: 0 4px; border-radius: 4px; }
  .err { color: var(--bad); }
  .ok { color: var(--ok); font-weight: 600; }
</style>
