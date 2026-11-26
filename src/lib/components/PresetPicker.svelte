<script lang="ts">
  import type { Preset } from "../types";
  import Dialog from "../ui/Dialog.svelte";

  let {
    presets,
    advanced,
    onstart,
    onclose,
  }: { presets: Preset[]; advanced: boolean; onstart: (p: Preset) => void; onclose: () => void } = $props();
</script>

<Dialog label="Agent teams" width="640px" {onclose}>
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
        <button class="btn btn-primary go" onclick={() => onstart(p)}>Start with this team</button>
      </article>
    {/each}
</Dialog>

<style>
  .lead { color: var(--muted); }
  article { border: 1px solid var(--line); border-radius: var(--radius-lg); padding: 12px 16px; margin-top: 12px; background: var(--bg); }
  h3 { margin: 0 0 4px; font-size: 15px; }
  article p { margin: 4px 0; }
  .cost, .team { color: var(--muted); font-size: 12.5px; }
  .tag { margin-left: 8px; font-size: 11px; color: var(--accent); border: 1px solid var(--accent); border-radius: var(--radius-lg); padding: 0 7px; }
  pre { max-height: 200px; overflow: auto; font-family: var(--mono); font-size: 12px; white-space: pre-wrap; background: var(--surface); padding: 8px; border-radius: var(--radius-sm); }
  .go { margin-top: 8px; }
</style>
