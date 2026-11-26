<script lang="ts">
  import type { AppConfig } from "../types";

  // Shown both in Settings and on the Usage page.
  let { config, onsave }: { config: AppConfig; onsave: (patch: Partial<AppConfig>) => void } = $props();

  const num = (v: string) => (v.trim() === "" || Number(v) <= 0 ? null : Number(v));
</script>

<div class="budgets">
  <label>Daily budget ($)
    <input class="field" type="number" min="0" step="1" value={config.budget_daily_usd ?? ""} placeholder="None" onchange={(e) => onsave({ budget_daily_usd: num(e.currentTarget.value) })} />
  </label>
  <label>Monthly budget ($)
    <input class="field" type="number" min="0" step="1" value={config.budget_monthly_usd ?? ""} placeholder="None" onchange={(e) => onsave({ budget_monthly_usd: num(e.currentTarget.value) })} />
  </label>
</div>

<style>
  .budgets { display: flex; gap: 20px; flex-wrap: wrap; }
  label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
  input { width: 150px; }
</style>
