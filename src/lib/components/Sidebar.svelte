<script lang="ts">
  import type { SessionMeta } from "../store.svelte";
  import type { SessionState } from "../types";

  let {
    metas,
    states,
    activeId,
    version,
    onselect,
    onnew,
    onclose,
  }: {
    metas: SessionMeta[];
    states: Record<string, SessionState>;
    activeId: string | null;
    version: string | null;
    onselect: (id: string) => void;
    onnew: () => void;
    onclose: (id: string) => void;
  } = $props();
</script>

<aside>
  <div class="brand">BetterClaudeUI</div>
  <button class="new" onclick={onnew}>New session</button>
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
  <div class="foot">{version ? `Claude Code ${version}` : ""}</div>
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
    letter-spacing: -0.01em;
    padding: 0 6px;
  }
  .new {
    background: var(--accent);
    color: var(--accent-ink);
    border: 0;
    border-radius: 9px;
    padding: 8px;
    font-weight: 600;
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
    border-radius: 8px;
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
    border-radius: 999px;
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
  }
</style>
