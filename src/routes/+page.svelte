<script lang="ts">
  import { onMount } from "svelte";
  import PresetPicker from "$lib/components/PresetPicker.svelte";
  import Onboarding from "$lib/components/Onboarding.svelte";
  import RawLog from "$lib/components/RawLog.svelte";
  import SessionBar from "$lib/components/SessionBar.svelte";
  import Settings from "$lib/components/Settings.svelte";
  import Composer from "$lib/components/Composer.svelte";
  import MessageList from "$lib/components/MessageList.svelte";
  import PermissionPrompt from "$lib/components/PermissionPrompt.svelte";
  import SetupScreen from "$lib/components/SetupScreen.svelte";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import { app } from "$lib/store.svelte";

  const CODE_STARTERS = [
    "Explain what this project does and how it is organised.",
    "Find likely bugs and list them, without changing anything.",
    "Suggest three small improvements, then wait for my choice.",
  ];
  const CHAT_STARTERS = [
    "Help me think through a decision.",
    "Explain something I find confusing.",
    "Proofread and tighten some writing.",
  ];

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
{:else if !app.config.onboarded}
  <Onboarding ondone={(t) => app.updateConfig({ tier: t, onboarded: true })} />
{:else}
  <div class="shell">
    <Sidebar
      metas={app.visibleMetas}
      states={app.states}
      activeId={app.activeId}
      {version}
      mode={app.mode}
      recents={app.recents}
      onresume={(r) => app.resume(r)}
      onforget={(r) => app.forget(r)}
      onsettings={() => (app.showSettings = true)}
      onpresets={() => (app.showPresets = true)}
      onselect={(id) => app.select(id)}
      onnew={() => app.newSession()}
      onclose={(id) => app.close(id)}
    />
    <section class="main">
      <div class="topbar">
        <div class="seg" role="tablist" aria-label="Mode">
          <button role="tab" aria-selected={app.mode === "chat"} class:on={app.mode === "chat"} onclick={() => app.setMode("chat")}>Chat</button>
          <button role="tab" aria-selected={app.mode === "code"} class:on={app.mode === "code"} onclick={() => app.setMode("code")}>Code</button>
        </div>
        {#if active}
          <span class="cwd" title={active.cwd ?? ""}>{app.activeMeta?.mode === "chat" ? "No tools in Chat" : (active.cwd ?? "")}</span>
        {/if}
        <span class="tier">{[app.tier, active?.model, app.activeMeta?.preset ? `team: ${app.activeMeta.preset}` : null].filter(Boolean).join(" · ")}</span>
      </div>
      {#if app.error}
        <div class="banner" role="alert">
          {app.error}
          <button onclick={() => (app.error = null)} aria-label="Dismiss">×</button>
        </div>
      {/if}
      {#if active}
        {#if active.items.length === 0}
          <div class="starters">
            <h2>{app.activeMeta?.mode === "chat" ? "Ask anything" : "Where should Claude start?"}</h2>
            {#each app.activeMeta?.mode === "chat" ? CHAT_STARTERS : CODE_STARTERS as s (s)}
              <button onclick={() => app.send(s)}>{s}</button>
            {/each}
          </div>
        {:else}
          <MessageList items={active.items} diffs={app.caps.diffs} />
        {/if}
        <div class="dock">
          <div class="column">
            {#each active.pending as p (p.request_id)}
              <PermissionPrompt request={p} onresolve={(id, d) => app.resolve(id, d)} />
            {/each}
            {#if app.activeMeta}
              <SessionBar
                caps={app.caps}
                model={app.activeMeta.model}
                permissionMode={app.activeMeta.permissionMode}
                chat={app.activeMeta.mode === "chat"}
                onmodel={(m) => app.reconfigure(app.activeMeta!.id, { model: m })}
                onmode={(m) => app.reconfigure(app.activeMeta!.id, { permissionMode: m })}
              />
            {/if}
            <Composer status={active.status} onsend={(t) => app.send(t)} oninterrupt={() => app.interrupt()} />
            {#if app.caps.rawLog}<RawLog events={active.raw} />{/if}
          </div>
        </div>
      {:else}
        <div class="empty">
          {#if app.mode === "chat"}
            <h1>What is on your mind?</h1>
            <p>Chat with Claude. No files or commands are touched in this mode.</p>
            <button onclick={() => app.newSession()}>Start a chat</button>
          {:else}
            <h1>What are we working on?</h1>
            <p>Pick a project folder and Claude will work inside it.</p>
            <button onclick={() => app.newSession()}>Choose a folder</button>
          {/if}
        </div>
      {/if}
    </section>
  </div>
{/if}

{#if app.showPresets}
  <PresetPicker presets={app.presets} advanced={app.tier === "advanced"} onstart={(p) => app.startPreset(p)} onclose={() => (app.showPresets = false)} />
{/if}
{#if app.showSettings}
  <Settings config={app.config} onsave={(patch) => app.updateConfig(patch)} onclose={() => (app.showSettings = false)} />
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
  .topbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 24px;
    border-bottom: 1px solid var(--line);
  }
  .seg {
    display: inline-flex;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 9px;
    padding: 2px;
  }
  .seg button {
    background: none;
    border: 0;
    border-radius: 7px;
    padding: 4px 16px;
    color: var(--muted);
    font-weight: 600;
  }
  .seg button.on {
    background: var(--accent);
    color: var(--accent-ink);
  }
  .tier {
    color: var(--muted);
    font-size: 12.5px;
  }
  .tier::first-letter {
    text-transform: uppercase;
  }
  .starters {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 8px;
    max-width: 560px;
    width: 100%;
    margin: 0 auto;
    padding: 24px;
  }
  .starters h2 {
    margin: 0 0 8px;
    font-size: 22px;
    letter-spacing: -0.015em;
  }
  .starters button {
    text-align: left;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 11px 14px;
  }
  .starters button:hover {
    border-color: var(--accent);
  }
  .cwd {
    flex: 1;
    min-width: 0;
    margin: 0 18px;
    color: var(--muted);
    font-size: 13px;
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
