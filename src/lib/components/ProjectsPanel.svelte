<script lang="ts">
  import { untrack } from "svelte";
  import PageFrame from "./PageFrame.svelte";
  import { MAX_INSTRUCTIONS, type Project, newProjectId, remaining } from "../projects";

  let {
    projects,
    onsave,
    onstart,
    onpick,
    onback,
  }: {
    projects: Project[];
    onsave: (list: Project[]) => void;
    onstart: (p: Project, mode: "chat" | "code") => void;
    onpick: () => Promise<string | null>;
    onback: () => void;
  } = $props();

  // The panel is mounted fresh each time it opens, so reading the initial list once is intended.
  let selected = $state<string | null>(untrack(() => projects[0]?.id ?? null));
  let draft = $state({ name: "", instructions: "", cwd: "" });
  let creating = $state(untrack(() => projects.length === 0));
  let error = $state<string | null>(null);

  const current = $derived(creating ? null : (projects.find((p) => p.id === selected) ?? null));

  function load(p: Project | null) {
    draft = { name: p?.name ?? "", instructions: p?.instructions ?? "", cwd: p?.cwd ?? "" };
    error = null;
  }
  untrack(() => load(current));

  function choose(p: Project) {
    selected = p.id;
    creating = false;
    load(p);
  }

  function startNew() {
    creating = true;
    selected = null;
    load(null);
  }

  function save() {
    error = null;
    const name = draft.name.trim();
    if (!name) {
      error = "Give the project a name.";
      return;
    }
    const cwd = draft.cwd.trim() || null;
    if (current) {
      onsave(projects.map((p) => (p.id === current.id ? { ...p, name, instructions: draft.instructions, cwd } : p)));
    } else {
      const id = newProjectId(name, projects.map((p) => p.id));
      onsave([...projects, { id, name, instructions: draft.instructions, cwd }]);
      selected = id;
      creating = false;
    }
  }

  function remove() {
    if (!current || !confirm(`Delete the project "${current.name}"? Existing conversations stay in your history.`)) return;
    const rest = projects.filter((p) => p.id !== current.id);
    onsave(rest);
    selected = rest[0]?.id ?? null;
    creating = rest.length === 0;
    load(rest[0] ?? null);
  }

  async function browse() {
    const p = await onpick();
    if (p) draft.cwd = p;
  }
</script>

<PageFrame {onback}>
    <p class="sub">A project remembers standing instructions (tone, rules, background) and, for coding, a folder. Every conversation you start from it follows them.</p>
    <div class="cols">
      <nav aria-label="Your projects">
        {#each projects as p (p.id)}
          <button class="item" class:on={!creating && selected === p.id} onclick={() => choose(p)}>{p.name}</button>
        {/each}
        <button class="item add" class:on={creating} onclick={startNew}>+ New project</button>
      </nav>
      <div class="form">
        <label>Name <input bind:value={draft.name} maxlength="60" placeholder="e.g. Marketing site" /></label>
        <label>Instructions
          <textarea bind:value={draft.instructions} rows="8" maxlength={MAX_INSTRUCTIONS} placeholder="e.g. Write in plain English. Our users are non-technical. Never use jargon."></textarea>
          <small>{remaining(draft.instructions).toLocaleString()} characters left</small>
        </label>
        <label>Folder for coding (optional)
          <span class="pick"><input bind:value={draft.cwd} placeholder="C:\path\to\project" /><button onclick={browse}>Browse…</button></span>
        </label>
        {#if error}<p class="err" role="alert">{error}</p>{/if}
        <div class="row">
          <button class="primary" onclick={save}>{current ? "Save changes" : "Create project"}</button>
          {#if current}
            <button onclick={() => onstart(current, "chat")}>New chat</button>
            <button onclick={() => onstart(current, "code")}>New coding session</button>
            <button class="danger" onclick={remove}>Delete</button>
          {/if}
        </div>
      </div>
    </div>
</PageFrame>

<style>
  .sub { color: var(--muted); font-size: 13px; }
  .cols { display: grid; grid-template-columns: 200px 1fr; gap: 18px; }
  @media (max-width: 640px) { .cols { grid-template-columns: 1fr; } }
  nav { display: flex; flex-direction: column; gap: 2px; }
  .item { text-align: left; background: none; border: 0; border-radius: var(--radius-sm); padding: 7px 10px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .item.on { background: var(--raised); }
  .item.add { color: var(--accent); }
  .form { display: flex; flex-direction: column; gap: 12px; }
  label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
  input, textarea { background: var(--bg); color: var(--text); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 7px 9px; font: inherit; width: 100%; }
  textarea { resize: vertical; }
  small { color: var(--muted); }
  .pick { display: flex; gap: 8px; }
  .row { display: flex; gap: 10px; flex-wrap: wrap; }
  button { min-height: 30px; background: var(--fill); color: var(--text); border: 1px solid transparent; border-radius: var(--capsule); padding: 4px 14px; }
  button.primary { background: var(--accent); color: var(--accent-ink); border-color: transparent; font-weight: 600; }
  button.danger { color: var(--bad-text); margin-left: auto; }
  .err { color: var(--bad-text); margin: 0; }
</style>
