<script lang="ts">
  import type { SessionMeta } from "../store.svelte";
  import type { Mode, SavedSession, SessionState } from "../types";

  let {
    metas,
    states,
    activeId,
    version,
    mode,
    recents,
    onresume,
    onforget,
    onsettings,
    onpresets,
    archiveCount = 0,
    onarchive = () => {},
    advancedTools = false,
    oncaps,
    oneditor,
    onselect,
    onnew,
    onclose,
  }: {
    metas: SessionMeta[];
    states: Record<string, SessionState>;
    activeId: string | null;
    version: string | null;
    mode: Mode;
    recents: SavedSession[];
    onresume: (r: SavedSession) => void;
    onforget: (r: SavedSession) => void;
    onsettings: () => void;
    onpresets: () => void;
    archiveCount?: number;
    onarchive?: () => void;
    advancedTools?: boolean;
    oncaps: () => void;
    oneditor: () => void;
    onselect: (id: string) => void;
    onnew: () => void;
    onclose: (id: string) => void;
  } = $props();
</script>

<aside>
  <div class="brand">Better<span>Claude</span>UI</div>
  <button class="new" onclick={onnew}>{mode === "chat" ? "New chat" : "New session"}</button>
  {#if mode === "code"}<button class="presets" onclick={onpresets}>Agent teams</button>{/if}
  <button class="presets" onclick={onarchive}>Archive{archiveCount > 0 ? ` (${archiveCount})` : ""}</button>
  {#if advancedTools}
    <button class="presets" onclick={oncaps}>Capabilities</button>
    <button class="presets" onclick={oneditor}>Instructions and settings</button>
  {/if}
  <nav aria-label="Sessions">
    {#each metas as m (m.id)}
      {@const st = states[m.id]}
      <div class="row" class:active={m.id === activeId}>
        <button class="pick" onclick={() => onselect(m.id)} title={m.cwd ?? ""}>
          <span class="dot" data-status={st?.status ?? "idle"} aria-hidden="true"></span>
          <span class="name">{m.title}</span>
          {#if st && st.pending.length > 0}<span class="badge" title="Waiting for your permission">{st.pending.length}</span>{/if}
        </button>
        <button class="x" aria-label="Close {m.title}" onclick={() => onclose(m.id)}>×</button>
      </div>
    {/each}
  </nav>
  {#if recents.length > 0}
    <div class="sub">Recent</div>
    <div class="recents">
      {#each recents.slice(0, 12) as r (r.cli_session_id)}
        <div class="row">
          <button class="pick" onclick={() => onresume(r)} title={r.cwd ?? r.title}><span class="name">{r.title}</span></button>
          <button class="x" aria-label="Forget {r.title}" onclick={() => onforget(r)}>×</button>
        </div>
      {/each}
    </div>
  {/if}
  <div class="foot">
    <span>{version ? `Claude Code ${version}` : ""}</span>
    <button class="gear" onclick={onsettings} aria-label="Settings">Settings</button>
  </div>
</aside>

<style>
  aside {
    width: 232px;
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px 12px;
    background: var(--surface);
    border-right: 1px solid var(--line);
  }
  .brand {
    font-weight: 700;
    letter-spacing: -0.02em;
    padding: 2px 6px 4px;
  }
  .brand span {
    color: var(--accent);
  }
  .new {
    background: none;
    color: var(--text);
    border: 1px solid var(--accent);
    border-radius: var(--radius);
    padding: 7px;
    font-weight: 600;
  }
  .new:hover {
    background: color-mix(in srgb, var(--accent) 14%, transparent);
  }
  .presets {
    background: none;
    color: var(--muted);
    border: 0;
    text-align: left;
    padding: 2px 6px;
  }
  .presets:hover {
    color: var(--text);
  }
  nav {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .row {
    display: flex;
    align-items: center;
    border-radius: var(--radius-sm);
  }
  .row.active {
    background: var(--raised);
  }
  .pick {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 9px;
    background: none;
    border: 0;
    padding: 7px 8px;
    text-align: left;
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--muted);
    flex: none;
  }
  .dot[data-status="running"] {
    background: var(--accent);
  }
  .dot[data-status="exited"] {
    background: var(--bad);
  }
  .badge {
    background: var(--gate);
    color: var(--gate-ink);
    border-radius: var(--radius-lg);
    padding: 0 7px;
    font-size: 12px;
    font-weight: 700;
  }
  .x {
    background: none;
    border: 0;
    color: var(--muted);
    padding: 4px 9px;
    font-size: 17px;
    line-height: 1;
  }
  .x:hover {
    color: var(--text);
  }
  .foot {
    color: var(--muted);
    font-size: 12px;
    padding: 0 6px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .gear {
    background: none;
    border: 0;
    color: var(--muted);
    font-size: 12px;
  }
  .gear:hover {
    color: var(--text);
  }
  .sub {
    color: var(--muted);
    font-size: 11.5px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 0 6px;
  }
  .recents {
    max-height: 28vh;
    overflow-y: auto;
  }
</style>
