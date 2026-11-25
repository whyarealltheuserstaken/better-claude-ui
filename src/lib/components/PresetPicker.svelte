<script lang="ts">
  import type { Preset } from "../types";

  let {
    presets,
    advanced,
    onstart,
    onclose,
  }: { presets: Preset[]; advanced: boolean; onstart: (p: Preset) => void; onclose: () => void } = $props();
</script>

<div class="scrim" role="presentation" onclick={onclose} onkeydown={(e) => e.key === "Escape" && onclose()}>
  <div class="panel" role="dialog" aria-modal="true" aria-label="Agent teams" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
    <header>
      <h2>Agent teams</h2>
      <button class="x" onclick={onclose} aria-label="Close">×</button>
    </header>
    <p class="lead">
      Start a session where Claude coordinates a team of helpers. Helpers report back to Claude, and Claude passes information between them; they do not talk to each other directly.
    </p>
    {#each presets as p (p.id)}
      <article>
        <h3>{p.title}{#if p.custom}<span class="tag">yours</span>{/if}</h3>
        <p>{p.description}</p>
        <p class="cost">{p.cost_note}</p>
        <p class="team">Team: {Object.keys(p.agents).join(", ")}</p>
        {#if advanced}
          <details>
            <summary>What will actually run</summary>
            <pre>{JSON.stringify({ agents: p.agents, append_system_prompt: p.system_prompt }, null, 2)}</pre>
          </details>
        {/if}
        <button class="go" onclick={() => onstart(p)}>Start with this team</button>
      </article>
    {/each}
  </div>
</div>

<style>
  .scrim { position: fixed; inset: 0; background: rgb(0 0 0 / 0.5); display: grid; place-items: center; z-index: 10; }
  .panel { width: min(640px, 94vw); max-height: 88vh; overflow: auto; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-lg); padding: 18px 22px; }
  header { display: flex; justify-content: space-between; align-items: center; }
  h2 { margin: 0; font-size: 18px; }
  .x { background: none; border: 0; color: var(--muted); font-size: 22px; }
  .lead { color: var(--muted); }
  article { border: 1px solid var(--line); border-radius: var(--radius-lg); padding: 12px 16px; margin-top: 12px; background: var(--bg); }
  h3 { margin: 0 0 4px; font-size: 15px; }
  article p { margin: 4px 0; }
  .cost, .team { color: var(--muted); font-size: 12.5px; }
  .tag { margin-left: 8px; font-size: 11px; color: var(--accent); border: 1px solid var(--accent); border-radius: var(--radius-lg); padding: 0 7px; }
  pre { max-height: 200px; overflow: auto; font-family: var(--mono); font-size: 12px; white-space: pre-wrap; background: var(--surface); padding: 8px; border-radius: var(--radius-sm); }
  .go { margin-top: 8px; background: var(--accent); color: var(--accent-ink); border: 0; border-radius: var(--radius); padding: 7px 16px; font-weight: 600; }
</style>
