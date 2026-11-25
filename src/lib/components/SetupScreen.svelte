<script lang="ts">
  import type { CliStatus } from "../types";

  let { status, oncheck }: { status: CliStatus; oncheck: (overridePath?: string) => void } = $props();
  let path = $state("");
</script>

<main class="setup">
  <h1>Claude isn't set up yet</h1>
  {#if status.state === "unusable"}
    <p>BetterClaudeUI found the <code>claude</code> program but couldn't run it: <em>{status.reason}</em></p>
  {:else}
    <p>BetterClaudeUI works on top of the official <code>claude</code> command-line tool, and couldn't find it on this computer.</p>
  {/if}
  <ol>
    <li>Install Claude Code from <a href="https://claude.com/claude-code" target="_blank" rel="noopener noreferrer">claude.com/claude-code</a>.</li>
    <li>Open a terminal once and run <code>claude</code> to sign in.</li>
    <li>Come back and press Check again.</li>
  </ol>
  <div class="row">
    <button class="primary" onclick={() => oncheck()}>Check again</button>
  </div>
  <details>
    <summary>It's installed somewhere unusual</summary>
    <div class="row">
      <input bind:value={path} placeholder="Full path to the claude program" aria-label="Path to claude" />
      <button onclick={() => oncheck(path.trim() || undefined)} disabled={!path.trim()}>Use this path</button>
    </div>
  </details>
</main>

<style>
  .setup {
    max-width: 560px;
    margin: 12vh auto 0;
    padding: 0 24px;
  }
  h1 {
    font-size: 26px;
    margin: 0 0 12px;
    letter-spacing: -0.01em;
  }
  code {
    font-family: var(--mono);
    background: var(--raised);
    padding: 0.1em 0.4em;
    border-radius: 4px;
  }
  a {
    color: var(--accent);
  }
  .row {
    display: flex;
    gap: 10px;
    margin: 16px 0;
  }
  input {
    flex: 1;
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 8px 10px;
    font: inherit;
  }
  button {
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 8px 16px;
  }
  .primary {
    background: var(--accent);
    color: var(--accent-ink);
    border-color: var(--accent);
    font-weight: 600;
  }
  summary {
    cursor: pointer;
    color: var(--muted);
  }
</style>
