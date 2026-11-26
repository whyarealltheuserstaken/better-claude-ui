<script lang="ts" generics="S extends { items: WidgetItem[]; size: Size; position?: Position }">
  import Icon from "../ui/Icon.svelte";
  import Segmented from "../ui/Segmented.svelte";
  import { type Display, type Position, type ReadingId, type Size, type WidgetItem, allowedDisplays, moveItem } from "../widget/config";
  import { READING_LABELS } from "../widget/readings";

  /** The tray's settings have no position; its controls carry a prefix so they stay apart from the widget's. */
  let { settings, onchange, prefix = "", listLabel = "Readings" }: { settings: S; onchange: (next: S) => void; prefix?: string; listLabel?: string } = $props();

  const SIZES = [{ id: "compact", label: "Compact" }, { id: "regular", label: "Regular" }, { id: "large", label: "Large" }];
  const POSITIONS: { id: Position; label: string }[] = [
    { id: "panel", label: "Right panel" },
    { id: "floating", label: "Floating" },
    { id: "toolbar", label: "Toolbar" },
    { id: "hidden", label: "Hidden" },
  ];
  const DISPLAY_NAMES: Record<Display, string> = { number: "Number", bar: "Bar", ring: "Ring", chart: "Chart" };

  const save = (patch: { items?: WidgetItem[]; size?: Size; position?: Position }) => onchange({ ...settings, ...patch });
  const setItem = (id: ReadingId, patch: Partial<WidgetItem>) => save({ items: settings.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
</script>

<div class="customize">
  <div class="list">
    {#if settings.position !== undefined}
      <label class="split">Position
        <select class="field" value={settings.position} onchange={(e) => save({ position: e.currentTarget.value as Position })}>
          {#each POSITIONS as p (p.id)}<option value={p.id}>{p.label}</option>{/each}
        </select>
      </label>
    {/if}
    <div class="split"><span>Size</span><Segmented label="{prefix}Size" value={settings.size} options={SIZES} onpick={(v) => save({ size: v as Size })} /></div>
  </div>
  {#if settings.position !== undefined}
    <p>In the toolbar, the first three chosen readings are shown. The right panel only appears beside a session, so elsewhere the widget moves to the toolbar.</p>
  {/if}
  <ul class="list" aria-label={listLabel}>
    {#each settings.items as item, index (item.id)}
      {@const shownName = READING_LABELS[item.id]}
      {@const name = prefix + shownName}
      {@const displays = allowedDisplays(item.id)}
      <li>
        <label class="pick"><input type="checkbox" aria-label={prefix ? name : undefined} checked={item.on} onchange={(e) => setItem(item.id, { on: e.currentTarget.checked })} />{shownName}</label>
        {#if displays.length > 1}
          <select class="field" aria-label="Show {name} as" value={item.as} onchange={(e) => setItem(item.id, { as: e.currentTarget.value as Display })}>
            {#each displays as d (d)}<option value={d}>{DISPLAY_NAMES[d]}</option>{/each}
          </select>
        {/if}
        <button type="button" class="btn-icon" aria-label="Move {name} up" title="Move up" disabled={index === 0} onclick={() => save({ items: moveItem(settings.items, index, -1) })}><Icon name="chevronUp" size={14} /></button>
        <button type="button" class="btn-icon" aria-label="Move {name} down" title="Move down" disabled={index === settings.items.length - 1} onclick={() => save({ items: moveItem(settings.items, index, 1) })}><Icon name="chevronDown" size={14} /></button>
      </li>
    {/each}
  </ul>
</div>

<style>
  .customize { display: flex; flex-direction: column; gap: 10px; container-type: inline-size; }
  /* The tray panel is 300px wide: stack the size choice and tighten the reading rows. */
  @container (max-width: 340px) {
    .list > .split { flex-direction: column; align-items: stretch; gap: 6px; }
    .list > li { gap: 2px; padding-inline: 8px; }
    li .pick { gap: 7px; font-size: 12.5px; }
    li select { width: 80px; flex: none; padding-inline: 6px; font-size: 12.5px; }
  }
  .split { justify-content: space-between; }
  p { margin: 0; color: var(--muted); font-size: 12.5px; }
  ul { list-style: none; margin: 0; padding: 0; }
  .list > li { min-height: 44px; gap: 6px; padding-block: 6px; }
  .pick { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; min-height: 28px; }
  input { width: 16px; height: 16px; margin: 0; accent-color: var(--accent); }
</style>
