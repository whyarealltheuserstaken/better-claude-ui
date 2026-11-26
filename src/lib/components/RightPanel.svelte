<script lang="ts">
  import type { Snippet } from "svelte";
  import { activityFrom } from "../activity";
  import { fmtUsd } from "../format";
  import type { SessionMeta } from "../store.svelte";
  import type { SessionState } from "../types";
  import Icon from "../ui/Icon.svelte";

  let {
    meta,
    session,
    projectName = null,
    overlay = false,
    onjump,
    onclose,
    controls,
    widget,
  }: {
    meta: SessionMeta;
    session: SessionState;
    projectName?: string | null;
    overlay?: boolean;
    onjump: (itemId: string) => void;
    onclose: () => void;
    controls?: Snippet;
    widget?: Snippet;
  } = $props();

  const activity = $derived(activityFrom(session.items, session.pending));
  const STATUS = { running: "running", waiting: "Waiting for you", done: "done", error: "failed" };
</script>

<aside class="glass" class:overlay aria-label="Session details">
  {@render widget?.()}
  <section>
    <div class="head">
      <h2>This session</h2>
      {#if overlay}<button class="btn-icon" aria-label="Close the right panel" onclick={onclose}><Icon name="close" size={14} /></button>{/if}
    </div>
    {@render controls?.()}
    <dl>
      {#if projectName}<div><dt>Project</dt><dd>{projectName}</dd></div>{/if}
      {#if meta.preset}<div><dt>Agent team</dt><dd>{meta.preset}</dd></div>{/if}
      {#if meta.mode === "chat"}<div><dt>Tools</dt><dd>None in Chat</dd></div>{/if}
      <div title="Estimated at API prices, as of the last finished reply"><dt>Estimated cost</dt><dd>{session.costUsd > 0 ? fmtUsd(session.costUsd) : "None yet"}</dd></div>
    </dl>
  </section>
  <section>
    <h2>Activity</h2>
    {#if activity.length === 0}
      <p>{meta.mode === "chat" ? "Chat does not use tools on your computer." : "Actions Claude takes will be listed here."}</p>
    {:else}
      <ol>
        {#each activity as a (a.id)}
          <li class:nested={a.nested}>
            <button onclick={() => onjump(a.id)} data-status={a.status}>
              <span class="dot" aria-hidden="true"></span><span class="what">{a.summary}</span><span class="state">{STATUS[a.status]}</span>
            </button>
          </li>
        {/each}
      </ol>
    {/if}
  </section>
</aside>

<style>
  aside { width: 272px; flex: none; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; padding: 12px; border-radius: var(--float-radius); }
  aside.overlay { position: fixed; z-index: 25; inset-block: 10px; inset-inline-end: 10px; background: var(--card); }
  .head { display: flex; align-items: center; justify-content: space-between; min-height: 30px; }
  h2 { margin: 0; font-size: 12.5px; font-weight: 650; }
  dl { margin: 6px 0 0; }
  dl div { display: flex; justify-content: space-between; gap: 10px; padding: 3px 0; }
  dt { color: var(--muted); }
  dd { margin: 0; text-align: end; overflow-wrap: anywhere; }
  p { margin: 6px 0 0; color: var(--muted); font-size: 12.5px; }
  ol { list-style: none; margin: 6px 0 0; padding: 0; }
  li.nested { padding-inline-start: 14px; }
  li button { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 30px; padding: 3px 6px; background: none; border: 0; border-radius: var(--radius-sm); text-align: start; }
  li button:hover { background: var(--fill); }
  .dot { width: 7px; height: 7px; border-radius: 50%; flex: none; background: var(--ok); }
  [data-status="running"] .dot { background: var(--accent); }
  [data-status="waiting"] .dot { background: var(--gate); }
  [data-status="error"] .dot { background: var(--bad); }
  .what { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .state { color: var(--muted); font-size: 11.5px; white-space: nowrap; }
  [data-status="waiting"] .state { color: var(--gate-text); font-weight: 650; }
</style>
