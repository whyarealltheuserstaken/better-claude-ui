<script lang="ts">
  import { TIERS, type Tier } from "../tier";
  let { ondone }: { ondone: (tier: Tier) => void } = $props();
  let pick = $state<Tier>("beginner");
</script>

<main>
  <div class="card">
    <h1>Welcome to BetterClaudeUI</h1>
    <p class="lead">A friendlier home for Claude Code. Pick how much you want to see. You can change this any time in Settings.</p>
    {#each TIERS as t (t.id)}
      <label class="tier" class:on={pick === t.id}>
        <input type="radio" name="tier" value={t.id} bind:group={pick} />
        <span><strong>{t.label}</strong><small>{t.blurb}</small></span>
      </label>
    {/each}
    <button class="go" onclick={() => ondone(pick)}>Get started</button>
    <p class="fine">Unofficial community project, not affiliated with Anthropic. It runs the Claude Code CLI you already have installed and logged in.</p>
  </div>
</main>

<style>
  main { display: grid; place-items: center; min-height: 100vh; padding: 24px; }
  .card { width: min(520px, 100%); }
  h1 { font-size: 26px; letter-spacing: -0.015em; margin: 0 0 6px; }
  .lead { color: var(--muted); margin: 0 0 18px; }
  .tier { display: flex; gap: 12px; padding: 12px 14px; margin-bottom: 8px; border: 1px solid var(--line); border-radius: var(--radius-lg); background: var(--surface); cursor: pointer; }
  .tier.on { border-color: var(--accent); }
  .tier span { display: flex; flex-direction: column; }
  small { color: var(--muted); }
  .go { margin-top: 10px; width: 100%; background: var(--accent); color: var(--accent-ink); border: 0; border-radius: var(--radius); padding: 11px; font-weight: 600; }
  .fine { color: var(--muted); font-size: 12.5px; margin-top: 16px; }
</style>
