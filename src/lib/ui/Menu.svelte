<script lang="ts">
  import { tick } from "svelte";
  import Icon from "./Icon.svelte";
  import type { IconName } from "./icons";

  type Option = { id: string; label: string; help?: string };
  let {
    label,
    value,
    options,
    onpick,
    icon,
    showLabel = false,
    disabled = false,
  }: { label: string; value: string; options: Option[]; onpick: (id: string) => void; icon?: IconName; showLabel?: boolean; disabled?: boolean } = $props();

  let open = $state(false);
  let active = $state(0);
  let button: HTMLButtonElement | undefined = $state();
  let list: HTMLUListElement | undefined = $state();
  let above = $state(false);
  let alignEnd = $state(false);
  const uid = $props.id();

  const current = $derived(options.find((o) => o.id === value) ?? options[0]);

  async function show() {
    if (disabled) return;
    const box = button?.getBoundingClientRect();
    // Open toward whichever side has room.
    above = !!box && box.bottom + 40 + options.length * 32 > window.innerHeight && box.top > window.innerHeight - box.bottom;
    alignEnd = !!box && box.left + 240 > window.innerWidth;
    active = Math.max(0, options.findIndex((o) => o.id === value));
    open = true;
    await tick();
    list?.focus();
  }

  function close(refocus = true) {
    open = false;
    if (refocus) button?.focus();
  }

  function pick(id: string) {
    close();
    onpick(id);
  }

  function onbutton(e: KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      void show();
    }
  }

  function onlist(e: KeyboardEvent) {
    const last = options.length - 1;
    if (e.key === "ArrowDown") active = active === last ? 0 : active + 1;
    else if (e.key === "ArrowUp") active = active === 0 ? last : active - 1;
    else if (e.key === "Home") active = 0;
    else if (e.key === "End") active = last;
    else if (e.key === "Enter" || e.key === " ") pick(options[active].id);
    else if (e.key === "Escape") close();
    else if (e.key === "Tab") return close(false);
    else return;
    e.preventDefault();
    e.stopPropagation();
  }
</script>

<div class="menu">
  <button
    bind:this={button}
    class="pill"
    type="button"
    {disabled}
    aria-haspopup="listbox"
    aria-expanded={open}
    aria-label="{label}: {current?.label ?? ''}"
    title={current?.help ?? label}
    onclick={() => (open ? close() : void show())}
    onkeydown={onbutton}
  >
    {#if icon}<Icon name={icon} size={14} />{/if}
    {#if showLabel}<span class="lb">{label}</span>{/if}
    <span class="val">{current?.label ?? ""}</span>
    <Icon name="chevronDown" size={13} />
  </button>
  {#if open}
    <ul
      bind:this={list}
      class="pop"
      class:above
      class:end={alignEnd}
      role="listbox"
      tabindex="-1"
      aria-label={label}
      aria-activedescendant="{uid}-{active}"
      onkeydown={onlist}
      onfocusout={(e) => {
        if (e.relatedTarget !== button && !list?.contains(e.relatedTarget as Node)) open = false;
      }}
    >
      {#each options as o, i (o.id)}
        <!-- svelte-ignore a11y_click_events_have_key_events -- the listbox handles the keyboard -->
        <li id="{uid}-{i}" role="option" aria-selected={o.id === value} class:active={i === active} onmouseenter={() => (active = i)} onmousedown={(e) => e.preventDefault()} onclick={() => pick(o.id)}>
          <span class="tick">{#if o.id === value}<Icon name="check" size={14} />{/if}</span>
          <span class="txt">{o.label}{#if o.help}<small>{o.help}</small>{/if}</span>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .menu { position: relative; display: inline-block; min-width: 0; }
  .lb { color: var(--muted); }
  .val { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pop { position: absolute; top: calc(100% + 6px); inset-inline-start: 0; z-index: 40; min-width: max(100%, 200px); max-width: 300px; max-height: 50vh; overflow-y: auto; margin: 0; padding: 5px; list-style: none; background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: 0 12px 34px rgb(0 0 0 / 0.35); }
  .pop.above { top: auto; bottom: calc(100% + 6px); }
  .pop.end { inset-inline-start: auto; inset-inline-end: 0; }
  li { display: flex; gap: 8px; align-items: flex-start; min-height: 30px; padding: 5px 10px 5px 6px; border-radius: var(--radius-sm); cursor: pointer; }
  li.active { background: var(--accent); color: var(--accent-ink); }
  .tick { width: 14px; padding-top: 2px; flex: none; }
  .txt { display: flex; flex-direction: column; text-align: start; }
  small { font-size: 11.5px; color: var(--muted); }
  li.active small { color: inherit; }
</style>
