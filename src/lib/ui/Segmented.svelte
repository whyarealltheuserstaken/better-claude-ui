<script lang="ts">
  type Option = { id: string; label: string; badge?: string };
  let { label, value, options, onpick }: { label: string; value: string; options: Option[]; onpick: (id: string) => void } = $props();

  let root: HTMLDivElement | undefined = $state();

  function onkey(e: KeyboardEvent, index: number) {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (index + step + options.length) % options.length;
    onpick(options[next].id);
    root?.querySelectorAll("button")[next]?.focus();
  }
</script>

<div bind:this={root} class="seg" role="tablist" aria-label={label}>
  {#each options as o, i (o.id)}
    <button type="button" role="tab" aria-selected={o.id === value} aria-label={o.badge ? `${o.label}, ${o.badge}` : undefined} tabindex={o.id === value || (i === 0 && !options.some((x) => x.id === value)) ? 0 : -1} class:on={o.id === value} onclick={() => onpick(o.id)} onkeydown={(e) => onkey(e, i)}>
      {o.label}{#if o.badge}<span class="mark" title={o.badge}></span>{/if}
    </button>
  {/each}
</div>

<style>
  .seg { display: flex; gap: 2px; padding: 3px; border-radius: var(--radius); background: var(--fill); }
  button { flex: 1; min-height: 28px; padding: 3px 12px; display: flex; align-items: center; justify-content: center; gap: 6px; background: none; border: 1px solid transparent; border-radius: var(--radius-sm); color: var(--muted); font-weight: 600; white-space: nowrap; }
  button.on { background: var(--raised); color: var(--text); border-color: var(--line); box-shadow: 0 1px 4px rgb(0 0 0 / 0.2); }
  .mark { width: 8px; height: 8px; border-radius: 50%; background: var(--gate); }
</style>
