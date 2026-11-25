<script lang="ts">
  import { type UpdateState, installBlockedReason, progressFraction } from "../updates";

  let {
    state,
    currentVersion,
    running,
    pending,
    ondownload,
    oninstall,
    onskip,
    onretry,
    ondismiss,
    onclose,
  }: {
    state: UpdateState;
    currentVersion: string;
    running: number;
    pending: number;
    ondownload: () => void;
    oninstall: () => void;
    onskip: () => void;
    onretry: () => void;
    ondismiss: () => void;
    onclose: () => void;
  } = $props();

  const info = $derived("info" in state ? state.info : null);
  const blocked = $derived(installBlockedReason(running, pending));
  const frac = $derived(state.phase === "downloading" ? progressFraction(state.downloaded, state.total) : null);
  const mb = (n: number) => (n / 1024 / 1024).toFixed(1);
  const dateText = $derived(info?.date ? new Date(info.date * 1000).toLocaleDateString() : null);
</script>

<div class="scrim" role="presentation" onclick={() => state.phase !== "installing" && onclose()} onkeydown={(e) => e.key === "Escape" && state.phase !== "installing" && onclose()}>
  <div class="panel" role="dialog" aria-modal="true" aria-label="App update" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
    <header>
      <h2>{info?.version ? `Version ${info.version}` : "Updates"}</h2>
      {#if state.phase !== "installing"}<button class="x" onclick={onclose} aria-label="Close">×</button>{/if}
    </header>
    <p class="sub">{[`You have version ${currentVersion}.`, dateText ? `Released ${dateText}.` : null].filter(Boolean).join(" ")}</p>

    {#if info?.notes}
      <section class="notes" aria-label="What's new">
        <h3>What's new</h3>
        <pre>{info.notes}</pre>
      </section>
    {/if}

    {#if state.phase === "available"}
      <p>Downloading is safe: the file is checked against the project's signature before anything is installed.</p>
      <div class="row">
        <button class="primary" onclick={ondownload}>Download update</button>
        <button onclick={onclose}>Later</button>
        <button class="quiet" onclick={onskip}>Skip this version</button>
      </div>
    {:else if state.phase === "downloading"}
      <div class="bar" role="progressbar" aria-label="Download progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow={frac === null ? undefined : Math.round(frac * 100)}>
        <div class="fill" class:indeterminate={frac === null} style={frac === null ? "" : `width:${frac * 100}%`}></div>
      </div>
      <p class="sub">{mb(state.downloaded)} MB{state.total ? ` of ${mb(state.total)} MB` : ""}</p>
    {:else if state.phase === "ready"}
      <p>Downloaded and verified. Installing will close the app and reopen it on the new version. Your conversations are saved.</p>
      {#if blocked}<p class="warn" role="alert">{blocked}</p>{/if}
      <div class="row">
        <button class="primary" disabled={blocked !== null} onclick={oninstall}>Install and restart</button>
        <button onclick={onclose}>Later</button>
      </div>
    {:else if state.phase === "installing"}
      <p role="status">Installing. The app will close and reopen in a moment.</p>
    {:else if state.phase === "error"}
      <p class="err" role="alert">{state.problem.message}</p>
      <details><summary>Technical details</summary><pre class="detail">{state.problem.detail}</pre></details>
      <div class="row">
        {#if state.during === "check"}<button class="primary" onclick={onretry}>Try again</button>{:else}<button class="primary" onclick={ondismiss}>Back</button>{/if}
        <button onclick={onclose}>Close</button>
      </div>
    {:else if state.phase === "uptodate"}
      <p>You're up to date.</p>
      <div class="row"><button onclick={onclose}>Close</button></div>
    {:else if state.phase === "checking"}
      <p>Checking for updates…</p>
    {:else}
      <p>No update information yet.</p>
      <div class="row"><button class="primary" onclick={onretry}>Check for updates</button></div>
    {/if}
  </div>
</div>

<style>
  .scrim { position: fixed; inset: 0; background: rgb(0 0 0 / 0.5); display: grid; place-items: center; z-index: 12; }
  .panel { width: min(520px, 94vw); max-height: 88vh; overflow: auto; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-lg); padding: 18px 22px; }
  header { display: flex; justify-content: space-between; align-items: center; }
  h2 { margin: 0; font-size: 18px; }
  h3 { margin: 12px 0 4px; font-size: 13px; color: var(--muted); font-weight: 600; }
  .x { background: none; border: 0; color: var(--muted); font-size: 22px; }
  .sub { color: var(--muted); font-size: 13px; margin: 4px 0; }
  .notes pre { margin: 0; max-height: 180px; overflow: auto; background: var(--bg); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 10px; font: inherit; font-size: 13px; white-space: pre-wrap; }
  .row { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 12px; }
  button { background: var(--raised); color: var(--text); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 6px 14px; }
  button.primary { background: var(--accent); color: var(--accent-ink); border-color: transparent; font-weight: 600; }
  button.quiet { background: none; border-color: transparent; color: var(--muted); margin-left: auto; }
  button:disabled { opacity: 0.5; cursor: default; }
  .bar { height: 8px; background: var(--raised); border-radius: 999px; overflow: hidden; margin-top: 12px; }
  .fill { height: 100%; background: var(--accent); border-radius: 999px; transition: width 0.15s; }
  .fill.indeterminate { width: 35%; animation: slide 1.1s ease-in-out infinite alternate; }
  @keyframes slide { to { margin-left: 65%; } }
  .warn { color: var(--gate); }
  .err { color: var(--bad); }
  .detail { font: 12px/1.5 var(--mono); white-space: pre-wrap; background: var(--bg); padding: 8px; border-radius: var(--radius-sm); }
</style>
