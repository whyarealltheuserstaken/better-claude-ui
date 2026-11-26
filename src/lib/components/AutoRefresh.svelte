<script lang="ts">
  import { REFRESH_CHOICES, clampMinutes } from "../limits";

  let {
    enabled,
    minutes,
    paused = false,
    onchange,
  }: {
    enabled: boolean;
    minutes: number;
    paused?: boolean;
    onchange: (patch: { auto_refresh_limits?: boolean; refresh_limits_minutes?: number }) => void;
  } = $props();

  const m = $derived(clampMinutes(minutes));
  // Keep a custom saved value selectable even if it isn't one of the presets.
  const choices = $derived(REFRESH_CHOICES.includes(m) ? REFRESH_CHOICES : [...REFRESH_CHOICES, m].sort((a, b) => a - b));
</script>

<div class="auto">
  <label>
    <input type="checkbox" checked={enabled} onchange={(e) => onchange({ auto_refresh_limits: e.currentTarget.checked })} />
    Refresh automatically every
  </label>
  <select value={m} disabled={!enabled} aria-label="Minutes between automatic refreshes" onchange={(e) => onchange({ refresh_limits_minutes: Number(e.currentTarget.value) })}>
    {#each choices as c (c)}<option value={c}>{c} min</option>{/each}
  </select>
</div>
<p class="note">
  {#if paused}<span class="warn">Paused after repeated failures. Press Refresh to try again.</span>{/if}
  Each refresh is one tiny request (about $0.0001, a couple of seconds) that counts a hair toward your allowance. It only runs while the app is open and visible, and replies you send here postpone the next one.
</p>

<style>
  .auto { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 13px; margin-top: 8px; }
  label { display: flex; align-items: center; gap: 6px; }
  select { background: var(--raised); color: var(--text); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 2px 6px; font: inherit; }
  select:disabled { opacity: 0.5; }
  .note { color: var(--muted); font-size: 12px; margin: 4px 0 0; }
  .warn { color: var(--gate); }
</style>
