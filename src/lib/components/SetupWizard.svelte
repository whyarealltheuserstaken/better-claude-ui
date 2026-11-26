<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { ipc, onSetupLog } from "../ipc";
  import type { AuthStatus, CliStatus } from "../types";
  import Backdrop from "./Backdrop.svelte";

  let {
    cli,
    auth,
    oncheck,
    onrecheck,
    onskip,
  }: {
    cli: CliStatus;
    auth: AuthStatus | null;
    oncheck: (overridePath?: string) => Promise<void>;
    onrecheck: () => Promise<void>;
    onskip: () => void;
  } = $props();

  let path = $state("");
  let preview = $state("");
  let log = $state<string[]>([]);
  let busy = $state<"install" | "login" | "check" | null>(null);
  let note = $state<string | null>(null);
  let unlisten: (() => void) | null = null;

  const installed = $derived(cli.state === "found");
  const signedIn = $derived(auth?.state === "logged_in");

  onMount(async () => {
    unlisten = await onSetupLog((l) => (log = [...log.slice(-200), l]));
    preview = await ipc.installerPreview().catch(() => "");
  });
  onDestroy(() => unlisten?.());

  async function run(step: "install" | "login") {
    busy = step;
    note = null;
    log = [];
    try {
      const code = await ipc.runSetupStep(step);
      if (step === "install") await oncheck();
      else await onrecheck();
      if (code !== 0 && code !== null) note = `The ${step === "install" ? "installer" : "sign-in"} finished with code ${code}. Check the messages above, then press Check again.`;
    } catch (e) {
      note = String(e);
    } finally {
      busy = null;
    }
  }

  async function check() {
    busy = "check";
    await oncheck();
    busy = null;
  }
</script>

<Backdrop waiting={false} />
<main class="wizard">
  <h1>Let's get Claude ready</h1>
  <p class="lead">BetterClaudeUI runs on the official Claude Code tool, so two things need to be in place. This takes a few minutes, once.</p>

  <section class:done={installed}>
    <h2><span class="mark">{installed ? "✓" : "1"}</span> Install Claude Code</h2>
    {#if installed && cli.state === "found"}
      <p class="ok">Found version {cli.version}.</p>
    {:else}
      {#if cli.state === "unusable"}
        <p>Found <code>claude</code> but couldn't run it: <em>{cli.reason}</em></p>
      {:else}
        <p>Claude Code wasn't found on this computer.</p>
      {/if}
      <p>This downloads and runs Anthropic's official installer. It will run exactly:</p>
      <pre class="cmd">{preview}</pre>
      <div class="row">
        <button class="primary" disabled={busy !== null} onclick={() => run("install")}>
          {busy === "install" ? "Installing…" : "Install Claude Code"}
        </button>
        <button disabled={busy !== null} onclick={check}>Check again</button>
      </div>
      <details>
        <summary>Already installed somewhere unusual?</summary>
        <div class="row">
          <input bind:value={path} placeholder="Full path to the claude program" aria-label="Path to claude" />
          <button disabled={!path.trim() || busy !== null} onclick={() => oncheck(path.trim())}>Use this path</button>
        </div>
      </details>
    {/if}
  </section>

  <section class:done={signedIn} class:locked={!installed}>
    <h2><span class="mark">{signedIn ? "✓" : "2"}</span> Sign in</h2>
    {#if !installed}
      <p class="muted">Available after step 1.</p>
    {:else if signedIn && auth?.state === "logged_in"}
      <p class="ok">Signed in with {auth.method}.</p>
    {:else}
      <p>
        {auth?.state === "unknown" ? "Couldn't confirm your sign-in status." : "You're not signed in yet."}
        Sign-in opens your web browser, where you approve access with your Claude account.
      </p>
      <div class="row">
        <button class="primary" disabled={busy !== null} onclick={() => run("login")}>
          {busy === "login" ? "Waiting for the browser…" : "Sign in with browser"}
        </button>
        <button disabled={busy !== null} onclick={onrecheck}>I've signed in</button>
        {#if auth?.state === "unknown"}<button onclick={onskip}>Continue anyway</button>{/if}
      </div>
    {/if}
  </section>

  {#if note}<p class="note" role="alert">{note}</p>{/if}
  {#if log.length > 0}<pre class="log" aria-live="polite">{log.join("\n")}</pre>{/if}
</main>

<style>
  .wizard { max-width: 600px; margin: 8vh auto 40px; padding: 0 24px; }
  h1 { font-size: 26px; margin: 0 0 8px; letter-spacing: -0.015em; }
  h2 { font-size: 16px; margin: 0 0 8px; display: flex; gap: 10px; align-items: center; }
  .lead { color: var(--muted); margin: 0 0 22px; }
  section { border: 1px solid var(--line); border-radius: var(--radius-lg); padding: 14px 18px; margin-bottom: 12px; background: var(--surface); }
  section.locked { opacity: 0.55; }
  section.done { border-color: color-mix(in srgb, var(--ok) 50%, var(--line)); }
  .mark { display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: var(--raised); font-size: 12.5px; }
  .done .mark { background: var(--ok); color: var(--bg); }
  p { margin: 6px 0; }
  .ok { color: var(--ok-text); }
  .muted { color: var(--muted); }
  code, .cmd { font-family: var(--mono); }
  code { background: var(--raised); padding: 0.1em 0.4em; border-radius: var(--radius-sm); }
  .cmd { background: var(--raised); padding: 8px 12px; border-radius: var(--radius-sm); overflow-x: auto; margin: 6px 0; font-size: 12.5px; }
  .row { display: flex; gap: 10px; margin: 12px 0 4px; flex-wrap: wrap; }
  input { flex: 1; min-width: 200px; background: var(--bg); color: var(--text); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 8px 10px; font: inherit; }
  button { min-height: 30px; background: var(--fill); color: var(--text); border: 1px solid transparent; border-radius: var(--capsule); padding: 6px 16px; }
  button.primary { background: var(--accent); color: var(--accent-ink); border-color: transparent; font-weight: 600; }
  button:disabled { opacity: 0.5; cursor: default; }
  .note { color: var(--gate-text); }
  .log { max-height: 200px; overflow: auto; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 8px; font: 12px/1.5 var(--mono); white-space: pre-wrap; }
</style>
