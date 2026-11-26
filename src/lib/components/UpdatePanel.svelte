<script lang="ts">
  import { type UpdateState, installBlockedReason, progressFraction } from "../updates";
  import Dialog from "../ui/Dialog.svelte";

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

<Dialog label="App update" title={info?.version ? `Version ${info.version}` : "Updates"} width="520px" closable={state.phase !== "installing"} {onclose}>
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
        <button class="btn btn-primary" onclick={ondownload}>Download update</button>
        <button class="btn" onclick={onclose}>Later</button>
        <button class="btn quiet" onclick={onskip}>Skip this version</button>
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
        <button class="btn btn-primary" disabled={blocked !== null} onclick={oninstall}>Install and restart</button>
        <button class="btn" onclick={onclose}>Later</button>
      </div>
    {:else if state.phase === "installing"}
      <p role="status">Installing. The app will close and reopen in a moment.</p>
    {:else if state.phase === "error"}
      <p class="err" role="alert">{state.problem.message}</p>
      <details><summary>Technical details</summary><pre class="detail">{state.problem.detail}</pre></details>
      <div class="row">
        {#if state.during === "check"}<button class="btn btn-primary" onclick={onretry}>Try again</button>{:else}<button class="btn btn-primary" onclick={ondismiss}>Back</button>{/if}
        <button class="btn" onclick={onclose}>Done</button>
      </div>
    {:else if state.phase === "uptodate"}
      <p>You're up to date.</p>
      <div class="row"><button class="btn" onclick={onclose}>Done</button></div>
    {:else if state.phase === "checking"}
      <p>Checking for updates…</p>
    {:else}
      <p>No update information yet.</p>
      <div class="row"><button class="btn btn-primary" onclick={onretry}>Check for updates</button></div>
    {/if}
</Dialog>

<style>
  h3 { margin: 12px 0 4px; font-size: 13px; color: var(--muted); font-weight: 600; }
  .sub { color: var(--muted); font-size: 13px; margin: 4px 0; }
  .notes pre { margin: 0; max-height: 180px; overflow: auto; background: var(--bg); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 10px; font: inherit; font-size: 13px; white-space: pre-wrap; }
  .row { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 12px; }
  .quiet { background: none; color: var(--muted); margin-left: auto; }
  .bar { height: 8px; background: var(--raised); border-radius: 999px; overflow: hidden; margin-top: 12px; }
  .fill { height: 100%; background: var(--accent); border-radius: 999px; transition: width 0.15s; }
  .fill.indeterminate { width: 35%; animation: slide 1.1s ease-in-out infinite alternate; }
  @keyframes slide { to { margin-left: 65%; } }
  .warn { color: var(--gate-text); }
  .err { color: var(--bad-text); }
  .detail { font: 12px/1.5 var(--mono); white-space: pre-wrap; background: var(--bg); padding: 8px; border-radius: var(--radius-sm); }
</style>
