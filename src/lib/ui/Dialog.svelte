<script lang="ts">
  import { onMount, type Snippet } from "svelte";
  import Icon from "./Icon.svelte";

  let {
    label,
    title = label,
    onclose,
    closable = true,
    width = "600px",
    height = "auto",
    header,
    children,
  }: {
    label: string;
    title?: string;
    onclose: () => void;
    /** False while closing would interrupt something, such as an install. */
    closable?: boolean;
    width?: string;
    height?: string;
    /** Replaces the title, e.g. with tabs. */
    header?: Snippet;
    children: Snippet;
  } = $props();

  let panel: HTMLDivElement | undefined = $state();

  const FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, iframe, [tabindex]:not([tabindex="-1"])';

  onMount(() => {
    const opener = document.activeElement;
    panel?.focus();
    return () => {
      // Give focus back only if the dialog still holds it, so we never steal it from the next screen.
      const now = document.activeElement;
      if (opener instanceof HTMLElement && opener.isConnected && (!now || now === document.body || panel?.contains(now))) opener.focus();
    };
  });

  // On the window, so Escape keeps working when a button that had focus disappears.
  function onkey(e: KeyboardEvent) {
    if (!panel) return;
    const all = document.querySelectorAll('[role="dialog"]');
    if (all[all.length - 1] !== panel) return; // only the topmost dialog answers
    if (e.key === "Escape" && !e.defaultPrevented) {
      if (closable) onclose();
    } else if (e.key === "Tab") {
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const at = document.activeElement;
      const outside = !panel.contains(at) || at === panel;
      if (e.shiftKey && (outside || at === first)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (at === last || !panel.contains(at))) {
        e.preventDefault();
        first.focus();
      }
    }
  }
</script>

<svelte:window onkeydown={onkey} />

<div class="scrim" role="presentation" onclick={(e) => e.target === e.currentTarget && closable && onclose()}>
  <div bind:this={panel} class="dialog" role="dialog" aria-modal="true" aria-label={label} tabindex="-1" style="width: min({width}, 94vw); height: {height}">
    <header>
      {#if header}{@render header()}{:else}<h2>{title}</h2>{/if}
      {#if closable}<button class="btn-icon" aria-label="Close" title="Close" onclick={onclose}><Icon name="close" /></button>{/if}
    </header>
    {@render children()}
  </div>
</div>

<style>
  .scrim { position: fixed; inset: 0; z-index: 12; display: grid; place-items: center; background: rgb(0 0 0 / 0.5); }
  .dialog { display: flex; flex-direction: column; max-height: 90vh; overflow: auto; padding: 14px 22px 20px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--float-radius); box-shadow: 0 24px 70px rgb(0 0 0 / 0.45); }
  .dialog:focus { outline: none; }
  .dialog > :global(*) { flex-shrink: 0; }
  header { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  header .btn-icon { margin-right: -8px; margin-left: auto; }
  h2 { margin: 0; font-size: 18px; letter-spacing: -0.01em; }
</style>
