<script lang="ts">
  import { previewDocument } from "../preview";
  import Dialog from "../ui/Dialog.svelte";

  let { code, lang, oncopy, onclose }: { code: string; lang: string; oncopy: (text: string) => void; onclose: () => void } = $props();

  let tab = $state<"preview" | "code">("preview");
  const doc = $derived(previewDocument(code, lang));
</script>

<Dialog label="Preview" width="900px" height="min(680px, 90vh)" {onclose}>
  {#snippet header()}
    <div class="tabs" role="tablist">
      <button role="tab" aria-selected={tab === "preview"} class:on={tab === "preview"} onclick={() => (tab = "preview")}>Preview</button>
      <button role="tab" aria-selected={tab === "code"} class:on={tab === "code"} onclick={() => (tab = "code")}>Code</button>
    </div>
    <button class="btn copy" onclick={() => oncopy(code)}>Copy code</button>
  {/snippet}
  <div class="body">
    {#if tab === "preview"}
      <!-- No sandbox permissions at all: no scripts, no same-origin access, no popups. -->
      <iframe title="Preview of the code block" sandbox="" srcdoc={doc} referrerpolicy="no-referrer"></iframe>
      <p class="note">Static preview. Scripts and network access are blocked for your safety. For an interactive app, ask Claude to save it as a file in a Code session.</p>
    {:else}
      <pre>{code}</pre>
    {/if}
  </div>
</Dialog>

<style>
  .body { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
  .tabs { display: flex; gap: 4px; }
  .tabs button { min-height: 30px; background: none; border: 0; border-bottom: 2px solid transparent; padding: 6px 12px; color: var(--muted); }
  .tabs button.on { color: var(--text); border-bottom-color: var(--accent); }
  .copy { margin-left: auto; }
  iframe { flex: 1; width: 100%; border: 1px solid var(--line); border-radius: var(--radius-sm); background: #fff; }
  pre { flex: 1; overflow: auto; margin: 0; background: var(--bg); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 10px; font: 12.5px/1.5 var(--mono); white-space: pre-wrap; }
  .note { margin: 0; color: var(--muted); font-size: 12px; }
</style>
