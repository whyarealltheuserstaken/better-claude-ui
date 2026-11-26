<script lang="ts">
  import type { SessionMeta } from "../store.svelte";
  import type { Project } from "../projects";
  import type { Mode, SavedSession, SessionState } from "../types";
  import Icon from "../ui/Icon.svelte";
  import Segmented from "../ui/Segmented.svelte";
  import type { IconName } from "../ui/icons";

  let {
    metas,
    states,
    activeId,
    mode,
    view,
    recents,
    projects,
    waiting,
    archiveCount = 0,
    advancedTools = false,
    onmode,
    onhome,
    onusage,
    onproject,
    onprojects,
    onresume,
    onforget,
    onsettings,
    onpresets,
    onarchive,
    oncaps,
    oneditor,
    onselect,
    onnew,
    onclose,
  }: {
    metas: SessionMeta[];
    states: Record<string, SessionState>;
    activeId: string | null;
    mode: Mode;
    view: string;
    recents: SavedSession[];
    projects: Project[];
    waiting: Set<Mode>;
    archiveCount?: number;
    advancedTools?: boolean;
    onmode: (m: Mode) => void;
    onhome: () => void;
    onusage: () => void;
    onproject: (id: string) => void;
    onprojects: () => void;
    onresume: (r: SavedSession) => void;
    onforget: (r: SavedSession) => void;
    onsettings: () => void;
    onpresets: () => void;
    onarchive: () => void;
    oncaps: () => void;
    oneditor: () => void;
    onselect: (id: string) => void;
    onnew: () => void;
    onclose: (id: string) => void;
  } = $props();

  const modes = $derived(
    (["chat", "code"] as const).map((id) => ({
      id,
      label: id === "chat" ? "Chat" : "Code",
      // Only the mode out of sight needs a mark.
      badge: id !== mode && waiting.has(id) ? "waiting for you" : undefined,
    })),
  );

  // Right-click offers the same action as the hover button on the row.
  let menu = $state<{ x: number; y: number; label: string; run: () => void } | null>(null);
  function openMenu(e: MouseEvent, label: string, run: () => void) {
    e.preventDefault();
    menu = { x: e.clientX, y: e.clientY, label, run };
  }
</script>

<svelte:window onclick={() => (menu = null)} onkeydown={(e) => e.key === "Escape" && (menu = null)} />

{#snippet item(icon: IconName, label: string, run: () => void, on = false)}
  <button class="nav" class:on aria-current={on ? "page" : undefined} onclick={run}><Icon name={icon} /><span class="name">{label}</span></button>
{/snippet}

<aside class="glass" aria-label="Navigation">
  <Segmented label="Mode" value={mode} options={modes} onpick={(m) => onmode(m as Mode)} />
  <div class="scroll">
    <div class="group">
      {@render item("plus", mode === "chat" ? "New chat" : "New session", onnew)}
      {@render item("home", "Home", onhome, view === "home")}
      {@render item("usage", "Usage", onusage, view === "usage")}
      {#if mode === "code"}{@render item("team", "Agent teams", onpresets)}{/if}
      {@render item("archive", archiveCount > 0 ? `Archive (${archiveCount})` : "Archive", onarchive, view === "archive")}
    </div>
    {#if metas.length > 0}
      <nav class="group" aria-label="Sessions">
        <h2>Open</h2>
        {#each metas as m (m.id)}
          {@const st = states[m.id]}
          {@const on = view === "session" && m.id === activeId}
          <!-- svelte-ignore a11y_no_static_element_interactions -- the same action has a button -->
          <div class="row" class:on oncontextmenu={(e) => openMenu(e, "Close session", () => onclose(m.id))}>
            <button class="pick" aria-current={on ? "page" : undefined} onclick={() => onselect(m.id)} title={m.cwd ?? ""}>
              <span class="dot" data-status={st?.status ?? "idle"} aria-hidden="true"></span>
              <span class="name">{m.title}</span>
              {#if st && st.pending.length > 0}<span class="badge" role="img" aria-label="Waiting for your permission" title="Waiting for your permission">{st.pending.length}</span>{/if}
            </button>
            <button class="btn-icon x" aria-label="Close {m.title}" onclick={() => onclose(m.id)}><Icon name="close" size={14} /></button>
          </div>
        {/each}
      </nav>
    {/if}
    {#if recents.length > 0}
      <div class="group">
        <h2>Recent</h2>
        {#each recents.slice(0, 12) as r (r.cli_session_id)}
          <!-- svelte-ignore a11y_no_static_element_interactions -- the same action has a button -->
          <div class="row" oncontextmenu={(e) => openMenu(e, "Forget conversation", () => onforget(r))}>
            <button class="pick" onclick={() => onresume(r)} title={r.cwd ?? r.title}><Icon name={r.mode === "chat" ? "chat" : "code"} /><span class="name">{r.title}</span></button>
            <button class="btn-icon x" aria-label="Forget {r.title}" onclick={() => onforget(r)}><Icon name="close" size={14} /></button>
          </div>
        {/each}
      </div>
    {/if}
    <div class="group">
      <div class="head"><h2>Projects</h2><button class="btn-icon" aria-label="Manage projects" title="Manage projects" onclick={onprojects}><Icon name="folderPlus" size={14} /></button></div>
      {#each projects as p (p.id)}
        {@render item("folder", p.name, () => onproject(p.id))}
      {/each}
    </div>
  </div>
  <div class="group foot">
    {#if advancedTools}
      {@render item("puzzle", "Capabilities", oncaps, view === "capabilities")}
      {@render item("doc", "Instructions", oneditor, view === "instructions")}
    {/if}
    {@render item("gear", "Settings", onsettings, view === "settings")}
  </div>
</aside>

{#if menu}
  <div class="ctx" role="menu" style="left: {menu.x}px; top: {menu.y}px">
    <button role="menuitem" onclick={menu.run}>{menu.label}</button>
  </div>
{/if}

<style>
  aside { width: 236px; flex: none; min-height: 0; display: flex; flex-direction: column; gap: 10px; padding: 10px; border-radius: var(--float-radius); }
  .scroll { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
  .group { display: flex; flex-direction: column; gap: 1px; }
  .foot { padding-top: 8px; border-top: 1px solid var(--line); }
  h2 { margin: 0; padding: 2px 9px; font-size: 11.5px; font-weight: 650; color: var(--muted); }
  .head { display: flex; align-items: center; justify-content: space-between; }
  .nav, .pick { display: flex; align-items: center; gap: 9px; width: 100%; min-width: 0; min-height: 31px; padding: 4px 9px; background: none; border: 0; border-radius: var(--radius-sm); text-align: start; }
  .nav :global(.icon), .pick :global(.icon) { color: var(--accent-text); }
  .nav:hover, .row:hover { background: var(--fill); }
  .nav.on, .row.on { background: var(--sel); }
  .row { display: flex; align-items: center; border-radius: var(--radius-sm); }
  .name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .x { width: 26px; height: 26px; opacity: 0; }
  .row:hover .x, .row:focus-within .x { opacity: 1; }
  .dot { width: 8px; height: 8px; margin: 0 4px; border-radius: 50%; flex: none; background: var(--muted); }
  .dot[data-status="running"] { background: var(--accent); }
  .dot[data-status="exited"] { background: var(--bad); }
  .ctx { position: fixed; z-index: 50; padding: 5px; background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: 0 12px 34px rgb(0 0 0 / 0.35); }
  .ctx button { min-height: 30px; padding: 4px 14px; background: none; border: 0; border-radius: var(--radius-sm); }
  .ctx button:hover, .ctx button:focus-visible { background: var(--accent); color: var(--accent-ink); }
  @media (hover: none) { .x { opacity: 1; } }
</style>
