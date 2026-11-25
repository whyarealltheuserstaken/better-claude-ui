<script lang="ts">
  import { type UpdateState, describeUpdateStatus } from "../updates";
  import Appearance from "./Appearance.svelte";
  import { MODELS, PERMISSION_MODES, TIERS, splitArgs, type Tier } from "../tier";
  import type { AppConfig } from "../types";

  let {
    config,
    appVersion = "",
    update = { phase: "idle" },
    oncheck = () => {},
    onviewupdate = () => {},
    onsave,
    onclose,
  }: {
    config: AppConfig;
    appVersion?: string;
    update?: UpdateState;
    oncheck?: () => void;
    onviewupdate?: () => void;
    onsave: (patch: Partial<AppConfig>) => void;
    onclose: () => void;
  } = $props();

  let extra = $state(config.extra_args.join(" "));
  const modes = $derived(PERMISSION_MODES.filter((m) => m.id !== "bypassPermissions" || config.tier === "advanced"));

  function setMode(v: string) {
    if (
      v === "bypassPermissions" &&
      !confirm("Bypass mode lets Claude run any command and edit any file without asking. Only use it in a throwaway folder. Enable it as the default?")
    )
      return;
    onsave({ default_permission_mode: v || null });
  }
</script>

<div class="scrim" role="presentation" onclick={onclose} onkeydown={(e) => e.key === "Escape" && onclose()}>
  <div class="panel" role="dialog" aria-modal="true" aria-label="Settings" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
    <header>
      <h2>Settings</h2>
      <button class="x" onclick={onclose} aria-label="Close settings">×</button>
    </header>

    <section>
      <h3>Experience level</h3>
      {#each TIERS as t (t.id)}
        <label class="opt">
          <input type="radio" name="tier" checked={config.tier === t.id} onchange={() => onsave({ tier: t.id as Tier })} />
          <span><strong>{t.label}</strong><small>{t.blurb}</small></span>
        </label>
      {/each}
    </section>

    <section>
      <h3>Updates</h3>
      <p class="upd">BetterClaudeUI {appVersion ? `version ${appVersion}` : ""}</p>
      <div class="updrow">
        <button disabled={update.phase === "checking" || update.phase === "downloading" || update.phase === "installing"} onclick={oncheck}>Check for updates</button>
        {#if update.phase === "available" || update.phase === "ready" || update.phase === "downloading"}
          <button class="primary" onclick={onviewupdate}>View update</button>
        {/if}
      </div>
      {#if describeUpdateStatus(update, Date.now())}<p class="updstatus" role="status" class:bad={update.phase === "error"}>{describeUpdateStatus(update, Date.now())}</p>{/if}
      <label class="opt">
        <input type="checkbox" checked={config.auto_update_check} onchange={(e) => onsave({ auto_update_check: e.currentTarget.checked })} />
        <span><strong>Check for updates automatically</strong><small>At most once a day. Nothing is downloaded or installed without your OK.</small></span>
      </label>
    </section>

    <section>
      <h3>Appearance</h3>
      <Appearance {config} {onsave} />
    </section>

    {#if config.tier !== "beginner"}
      <section>
        <h3>Defaults for new sessions</h3>
        <label class="row"
          >Model
          <select value={config.default_model ?? ""} onchange={(e) => onsave({ default_model: e.currentTarget.value || null })}>
            {#each MODELS as m (m.id)}<option value={m.id}>{m.label}</option>{/each}
          </select>
        </label>
        <label class="row"
          >Permissions
          <select value={config.default_permission_mode ?? ""} onchange={(e) => setMode(e.currentTarget.value)}>
            <option value="">Default</option>
            {#each modes as m (m.id)}<option value={m.id}>{m.label}</option>{/each}
          </select>
        </label>
      </section>
    {/if}

    {#if config.tier === "advanced"}
      <section>
        <h3>Extra CLI flags</h3>
        <input class="mono" placeholder="--add-dir C:\other\project" bind:value={extra} onchange={() => onsave({ extra_args: splitArgs(extra) })} />
        <small>Appended to every Code session. Takes effect for new sessions.</small>
      </section>
    {/if}

    <section>
      <h3>Always-allowed tools</h3>
      {#if config.always_allow.length === 0}
        <small>None. Tools you choose to “always allow” in a prompt only last for that session.</small>
      {:else}
        <div class="chips">
          {#each config.always_allow as t (t)}
            <button class="chip" onclick={() => onsave({ always_allow: config.always_allow.filter((x) => x !== t) })}>{t} ×</button>
          {/each}
        </div>
      {/if}
    </section>
  </div>
</div>

<style>
  .scrim { position: fixed; inset: 0; background: rgb(0 0 0 / 0.5); display: grid; place-items: center; z-index: 10; }
  .panel { width: min(620px, 94vw); max-height: 86vh; overflow: auto; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-lg); padding: 18px 22px; }
  header { display: flex; justify-content: space-between; align-items: center; }
  h2 { margin: 0; font-size: 18px; }
  h3 { margin: 18px 0 8px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
  .x { background: none; border: 0; color: var(--muted); font-size: 22px; }
  .opt { display: flex; gap: 10px; padding: 6px 0; align-items: flex-start; }
  .opt span { display: flex; flex-direction: column; }
  small { color: var(--muted); }
  .row { display: flex; justify-content: space-between; align-items: center; padding: 5px 0; }
  select, input.mono { background: var(--raised); color: var(--text); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 6px 8px; font: inherit; }
  input.mono { width: 100%; font-family: var(--mono); margin-bottom: 4px; }
  .upd { margin: 0 0 8px; }
  .updrow { display: flex; gap: 8px; margin-bottom: 6px; }
  .updrow button { background: var(--raised); color: var(--text); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 5px 12px; }
  .updrow button.primary { background: var(--accent); color: var(--accent-ink); border-color: transparent; font-weight: 600; }
  .updrow button:disabled { opacity: 0.5; }
  .updstatus { margin: 4px 0 8px; color: var(--muted); font-size: 13px; }
  .updstatus.bad { color: var(--bad); }
  .chips { display: flex; gap: 6px; flex-wrap: wrap; }
  .chip { background: var(--raised); color: var(--text); border: 1px solid var(--line); border-radius: var(--radius-lg); padding: 3px 10px; }
</style>
