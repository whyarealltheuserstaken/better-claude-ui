<script lang="ts">
  import { previewDocument } from "../preview";

  let { code, lang, oncopy, onclose }: { code: string; lang: string; oncopy: (text: string) => void; onclose: () => void } = $props();

  let tab = $state<"preview" | "code">("preview");
  const doc = $derived(previewDocument(code, lang));
</script>

<div class="scrim" role="presentation" onclick={onclose} onkeydown={(e) => e.key === "Escape" && onclose()}>
  <div class="panel" role="dialog" aria-modal="true" aria-label="Preview" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
    <header>
      <div class="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "preview"} class:on={tab === "preview"} onclick={() => (tab = "preview")}>Preview</button>
        <button role="tab" aria-selected={tab === "code"} class:on={tab === "code"} onclick={() => (tab = "code")}>Code</button>
      </div>
      <span class="acts">
        <button onclick={() => oncopy(code)}>Copy code</button>
        <button class="x" onclick={onclose} aria-label="Close">×</button>
      </span>
    </header>
    {#if tab === "preview"}
      <!-- No sandbox permissions at all: no scripts, no same-origin access, no popups. -->
      <iframe title="Preview of the code block" sandbox="" srcdoc={doc} referrerpolicy="no-referrer"></iframe>
      <p class="note">Static preview. Scripts and network access are blocked for your safety. For an interactive app, ask Claude to save it as a file in a Code session.</p>
    {:else}
      <pre>{code}</pre>
    {/if}
  </div>
</div>

<style>
  .scrim { position: fixed; inset: 0; background: rgb(0 0 0 / 0.55); display: grid; place-items: center; z-index: 10; }
  .panel { width: min(900px, 95vw); height: min(680px, 90vh); display: flex; flex-direction: column; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-lg); padding: 12px 16px; gap: 8px; }
  header { display: flex; justify-content: space-between; align-items: center; }
  .tabs { display: flex; gap: 4px; }
  .tabs button { background: none; border: 0; border-bottom: 2px solid transparent; padding: 6px 12px; color: var(--muted); }
  .tabs button.on { color: var(--text); border-bottom-color: var(--accent); }
  .acts { display: flex; gap: 8px; align-items: center; }
  button { background: var(--raised); color: var(--text); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 4px 12px; }
  .x { background: none; border: 0; font-size: 22px; color: var(--muted); padding: 0 6px; }
  iframe { flex: 1; width: 100%; border: 1px solid var(--line); border-radius: var(--radius-sm); background: #fff; }
  pre { flex: 1; overflow: auto; margin: 0; background: var(--bg); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 10px; font: 12.5px/1.5 var(--mono); white-space: pre-wrap; }
  .note { margin: 0; color: var(--muted); font-size: 12px; }
</style>
