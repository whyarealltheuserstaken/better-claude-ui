<script lang="ts">
  import { onMount } from "svelte";
  import Composer from "$lib/components/Composer.svelte";
  import MessageList from "$lib/components/MessageList.svelte";
  import PermissionPrompt from "$lib/components/PermissionPrompt.svelte";
  import SetupScreen from "$lib/components/SetupScreen.svelte";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import { app } from "$lib/store.svelte";

  onMount(() => {
    void app.init();
  });

  const version = $derived(app.cli?.state === "found" ? app.cli.version : null);
  const active = $derived(app.active);
</script>

<svelte:head><title>BetterClaudeUI</title></svelte:head>

{#if !app.cliChecked}
  <main class="center"><p class="muted">Looking for Claude…</p></main>
{:else if app.cli && app.cli.state !== "found"}
  <SetupScreen status={app.cli} oncheck={(p) => app.checkCli(p)} />
{:else}
  <div class="shell">
    <Sidebar
      metas={app.metas}
      states={app.states}
      activeId={app.activeId}
      {version}
      onselect={(id) => app.select(id)}
      onnew={() => app.newSession()}
      onclose={(id) => app.close(id)}
    />
    <section class="main">
      {#if app.error}
        <div class="banner" role="alert">
          {app.error}
          <button onclick={() => (app.error = null)} aria-label="Dismiss">×</button>
        </div>
      {/if}
      {#if active}
        <header>
          <span class="cwd" title={active.cwd ?? ""}>{active.cwd ?? ""}</span>
          {#if active.model}<span class="model">{active.model}</span>{/if}
        </header>
        <MessageList items={active.items} />
        <div class="dock">
          <div class="column">
            {#each active.pending as p (p.request_id)}
              <PermissionPrompt request={p} onresolve={(id, d) => app.resolve(id, d)} />
            {/each}
            <Composer status={active.status} onsend={(t) => app.send(t)} oninterrupt={() => app.interrupt()} />
          </div>
        </div>
      {:else}
        <div class="empty">
          <h1>What are we working on?</h1>
          <p>Pick a project folder and Claude will work inside it.</p>
          <button onclick={() => app.newSession()}>Choose a folder</button>
        </div>
      {/if}
    </section>
  </div>
{/if}

<style>
  .shell {
    display: flex;
    height: 100vh;
  }
  .main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  header {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    padding: 10px 24px;
    border-bottom: 1px solid var(--line);
    color: var(--muted);
    font-size: 13px;
  }
  .cwd {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--mono);
    direction: rtl;
    text-align: left;
  }
  .dock {
    padding: 0 24px 18px;
  }
  .column {
    max-width: 780px;
    margin: 0 auto;
  }
  .empty {
    margin: auto;
    text-align: center;
    padding: 24px;
  }
  .empty h1 {
    font-size: 28px;
    letter-spacing: -0.015em;
    margin: 0 0 8px;
  }
  .empty p {
    color: var(--muted);
    margin: 0 0 20px;
  }
  .empty button {
    background: var(--accent);
    color: var(--accent-ink);
    border: 0;
    border-radius: 10px;
    padding: 10px 22px;
    font-weight: 600;
  }
  .banner {
    background: color-mix(in srgb, var(--bad) 14%, var(--surface));
    color: var(--bad);
    padding: 8px 24px;
    display: flex;
    justify-content: space-between;
  }
  .banner button {
    background: none;
    border: 0;
    color: inherit;
  }
  .center {
    display: grid;
    place-items: center;
    height: 100vh;
  }
  .muted {
    color: var(--muted);
  }
</style>
