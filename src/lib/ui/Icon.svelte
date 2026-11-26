<script lang="ts">
  import { ICONS, type IconName } from "./icons";

  let { name, size = 16 }: { name: IconName; size?: number } = $props();
</script>

<!-- eslint-disable-next-line svelte/no-at-html-tags -- constant markup from icons.ts, never user input -->
<svg class="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{@html ICONS[name]}</svg>

<style>
  .icon { flex: none; }
</style>
