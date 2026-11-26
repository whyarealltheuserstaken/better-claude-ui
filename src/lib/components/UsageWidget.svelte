<script lang="ts">
  import { onMount, tick as settled } from "svelte";
  import Icon from "../ui/Icon.svelte";
  import Meter from "../ui/Meter.svelte";
  import DailyChart from "../widgets/DailyChart.svelte";
  import { type WidgetSettings, clampPoint, toolbarItems } from "../widget/config";
  import { type WidgetData, type WidgetStatus, readingFor } from "../widget/readings";

  let {
    settings,
    data,
    status,
    variant,
    oncustomize,
    onmove = () => {},
  }: {
    settings: WidgetSettings;
    data: WidgetData;
    status: WidgetStatus;
    variant: "panel" | "floating" | "toolbar";
    oncustomize: () => void;
    onmove?: (x: number, y: number) => void;
  } = $props();

  const STATUS: Record<WidgetStatus, string> = { working: "Working", waiting: "Waiting for you", idle: "Idle" };
  const STEPS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

  // Ages such as "1 min ago" and reset countdowns move on their own.
  let clock = $state(0);
  onMount(() => {
    const timer = setInterval(() => (clock += 1), 30_000);
    return () => clearInterval(timer);
  });

  const items = $derived(variant === "toolbar" ? toolbarItems(settings) : settings.items.filter((i) => i.on));
  const shown = $derived.by(() => {
    void clock;
    const now = Date.now();
    return items.map((item) => ({ item, r: readingFor(item.id, data, now) }));
  });

  // ---- Floating position ----
  let box: HTMLElement | undefined = $state();
  let winW = $state(typeof window === "undefined" ? 1100 : window.innerWidth);
  let winH = $state(typeof window === "undefined" ? 760 : window.innerHeight);
  let size = $state({ w: 0, h: 0 });
  /** Where it is while being moved; the saved position otherwise. */
  let moving = $state<{ x: number; y: number } | null>(null);
  let grab: { dx: number; dy: number } | null = null;

  const inside = (x: number, y: number) => clampPoint(x, y, size.w, size.h, winW, winH);
  const at = $derived(inside(moving?.x ?? settings.x, moving?.y ?? settings.y));

  $effect(() => {
    // The box changes height with its readings and size, so measure again after each change.
    void [shown, settings.size, winW, winH];
    if (variant !== "floating") return;
    void settled().then(() => {
      if (box && (box.offsetWidth !== size.w || box.offsetHeight !== size.h)) size = { w: box.offsetWidth, h: box.offsetHeight };
    });
  });

  async function release() {
    grab = null;
    if (!moving) return;
    const { x, y } = at;
    onmove(x, y);
    await settled(); // by now the saved position holds the same point
    moving = null;
  }

  function onkeydown(e: KeyboardEvent) {
    const step = STEPS[e.key];
    if (!step) return;
    e.preventDefault();
    const by = e.shiftKey ? 1 : 8;
    moving = inside(at.x + step[0] * by, at.y + step[1] * by);
  }
  function onkeyup(e: KeyboardEvent) {
    if (STEPS[e.key]) void release();
  }
  function onpointerdown(e: PointerEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    grab = { dx: e.clientX - at.x, dy: e.clientY - at.y };
    const target = e.currentTarget as HTMLElement;
    target.focus();
    target.setPointerCapture?.(e.pointerId);
  }
  function onpointermove(e: PointerEvent) {    if (grab) moving = inside(e.clientX - grab.dx, e.clientY - grab.dy);
  }
</script>

<svelte:window bind:innerWidth={winW} bind:innerHeight={winH} />

{#snippet gear()}
  <button type="button" class="btn-icon gear" aria-label="Customize the usage widget" title="Customize the usage widget" onclick={oncustomize}><Icon name="gear" size={14} /></button>
{/snippet}

{#if variant === "toolbar"}
  <section class="strip glass" aria-label="Usage widget" data-status={status}>
    {#if status === "waiting"}<span class="waiting" title={STATUS.waiting}><span class="mark" aria-hidden="true"><Icon name="alert" size={13} /></span><span class="words">{STATUS.waiting}</span></span>{/if}
    <span class="chips">
      {#each shown as { item, r } (item.id)}
        <span class="chip" class:warn={r.warn} data-reading={item.id} title={r.sub ? `${r.label}: ${r.value}. ${r.sub}` : `${r.label}: ${r.value}`}>
          <span class="name">{r.label}</span><strong>{r.value}</strong>
        </span>
      {/each}
    </span>
    {@render gear()}
  </section>
{:else}
  <section
    bind:this={box}
    class="widget {variant} {settings.size}"
    class:glass={variant === "floating"}
    aria-label="Usage widget"
    data-status={status}
    style={variant === "floating" ? `left: ${at.x}px; top: ${at.y}px` : undefined}
  >
    <header>
      {#if variant === "floating"}
        <button type="button" class="handle" aria-label="Move the usage widget with the arrow keys or by dragging" title="Drag, or use the arrow keys (Shift for small steps)" {onkeydown} {onkeyup} {onpointerdown} {onpointermove} onpointerup={release} onpointercancel={release} onblur={release}>
          <Icon name="grip" size={14} /><span class="title">Usage</span>
        </button>
      {:else}
        <h2>Usage</h2>
      {/if}
      <span class="status"><span class="dot" aria-hidden="true"></span>{STATUS[status]}</span>
      {@render gear()}
    </header>
    {#if shown.length === 0}
      <p class="none">No readings chosen. Use the gear to add some.</p>
    {:else}
      <dl>
        {#each shown as { item, r } (item.id)}
          <div class="reading as-{item.as}" class:warn={r.warn} data-reading={item.id}>
            <dt>{r.label}</dt>
            <dd class="value">{r.value}</dd>
            {#if item.as === "chart"}
              <dd class="graph"><DailyChart daily={data.usage?.daily ?? []} metric="cost" /></dd>
            {:else if (item.as === "bar" || item.as === "ring") && r.percent !== null}
              <dd class="graph"><Meter percent={r.percent} label={r.label} kind={item.as} warn={r.warn} /></dd>
            {/if}
            {#if r.sub && settings.size !== "compact"}<dd class="sub">{r.sub}</dd>{/if}
          </div>
        {/each}
      </dl>
    {/if}
  </section>
{/if}

<style>
  .widget { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .widget.panel { padding-bottom: 10px; border-bottom: 1px solid var(--line); }
  .widget.floating { position: fixed; z-index: 10; width: 250px; max-height: calc(100vh - 16px); overflow-y: auto; padding: 8px 12px 12px; border-radius: var(--float-radius); }
  .widget.floating.compact { width: 212px; }
  .widget.floating.large { width: 300px; }
  header { display: flex; align-items: center; gap: 8px; min-height: 30px; }
  h2 { margin: 0; font-size: 12.5px; font-weight: 650; }
  .handle { display: flex; align-items: center; gap: 6px; min-height: 28px; padding: 2px 6px 2px 2px; background: none; border: 1px solid transparent; border-radius: var(--radius-sm); color: var(--muted); cursor: move; touch-action: none; }
  .handle:hover { background: var(--fill); }
  .title { color: var(--text); font-size: 12.5px; font-weight: 650; }
  .status { display: flex; align-items: center; gap: 5px; margin-inline-start: auto; color: var(--muted); font-size: 11.5px; white-space: nowrap; }
  .dot { width: 7px; height: 7px; border-radius: 50%; border: 1px solid var(--muted); }
  [data-status="working"] .dot { background: var(--accent); border-color: var(--accent); }
  [data-status="waiting"] .status { color: var(--gate-text); font-weight: 650; }
  [data-status="waiting"] .dot { background: var(--gate); border-color: var(--gate); }
  dl { display: flex; flex-direction: column; gap: 9px; margin: 0; }
  dd { margin: 0; }
  .reading { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; column-gap: 10px; row-gap: 3px; }
  /* A ring sits beside its text: ring, label, value, with the second line under them. */
  .reading.as-ring:has(.graph) { grid-template-columns: auto minmax(0, 1fr) auto; }
  .as-ring .graph { grid-column: 1; grid-row: 1 / span 2; }
  .as-ring:has(.graph) dt { grid-column: 2; grid-row: 1; }
  .as-ring:has(.graph) .value { grid-column: 3; grid-row: 1; }
  .as-ring:has(.graph) .sub { grid-column: 2 / -1; grid-row: 2; }
  dt { color: var(--muted); font-size: 12.5px; }
  .value { font-weight: 650; text-align: end; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
  .graph { grid-column: 1 / -1; }
  .graph :global(svg) { height: 52px; }
  .sub { grid-column: 1 / -1; color: var(--muted); font-size: 11.5px; line-height: 1.35; }
  .large .value { font-size: 19px; letter-spacing: -0.01em; }
  .large dt { font-size: 13px; }
  .large .sub { font-size: 12.5px; }
  .compact dl { gap: 5px; }
  .none { margin: 0; color: var(--muted); font-size: 12.5px; }

  .strip { display: flex; align-items: center; gap: 4px; min-width: 0; min-height: 32px; padding: 0 1px 0 4px; border-radius: var(--capsule); }
  .chips { display: contents; }
  .chip { display: flex; flex-direction: column; justify-content: center; padding: 0 6px; line-height: 1.15; white-space: nowrap; }
  .chip .name { color: var(--muted); font-size: 11px; }
  .chip strong { font-size: 12.5px; font-variant-numeric: tabular-nums; }
  .chip.warn strong { color: var(--gate-text); }
  .waiting { padding: 2px 9px; border-radius: var(--capsule); background: var(--gate); color: var(--gate-ink); font-size: 11.5px; font-weight: 700; white-space: nowrap; }
  .strip .gear { width: 28px; height: 28px; border-radius: 50%; }
  /* The toolbar is narrow in a small window: keep fewer chips, never the gear or the waiting mark. */
  @container (max-width: 860px) { .chip:nth-of-type(n + 3) { display: none; } }
  @container (max-width: 700px) {
    .chip:nth-of-type(n + 2) { display: none; }
    /* No room for both, and the session title must stay readable: waiting comes first. */
    [data-status="waiting"] .chip { display: none; }
  }
  .mark { display: none; }
  @container (max-width: 520px) {
    .chip { display: none; }
    /* A shape instead of the words, which stay readable to screen readers. */
    .waiting { display: grid; place-items: center; width: 22px; height: 22px; padding: 0; }
    .mark { display: grid; }
    .words { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  }
  @media (forced-colors: active) { .dot { background: CanvasText; } [data-status="idle"] .dot { background: Canvas; } }
</style>
