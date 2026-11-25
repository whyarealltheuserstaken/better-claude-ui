<script lang="ts">
  import type { SessionStatus } from "../types";

  let {
    status,
    glyph = "",
    onsend,
    oninterrupt,
  }: { status: SessionStatus; glyph?: string; onsend: (text: string) => void; oninterrupt: () => void } = $props();

  let text = $state("");
  const running = $derived(status === "running");
  const disabled = $derived(status === "exited");

  function submit() {
    const t = text.trim();
    if (!t || disabled || running) return;
    onsend(t);
    text = "";
  }

  function onkey(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      submit();
    } else if (e.key === "Escape" && running) {
      oninterrupt();
    }
  }
</script>

<div class="composer">
  {#if glyph}<span class="glyph" aria-hidden="true">{glyph}</span>{/if}
  <textarea
    bind:value={text}
    onkeydown={onkey}
    {disabled}
    rows="2"
    aria-label="Message"
    placeholder={disabled ? "This session has ended. Start a new one." : "Ask Claude to do something…  (Enter to send, Shift+Enter for a new line)"}
  ></textarea>
  {#if running}
    <button class="stop" onclick={oninterrupt} aria-label="Stop (Esc)">Stop</button>
  {:else}
    <button class="send" onclick={submit} disabled={disabled || !text.trim()}>Send</button>
  {/if}
</div>

<style>
  .composer {
    display: flex;
    gap: 10px;
    align-items: flex-end;
    padding: 10px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
  }
  .composer:focus-within {
    border-color: var(--accent);
  }
  .glyph {
    color: var(--accent);
    font-weight: 700;
    padding: 4px 0 4px 4px;
  }
  textarea {
    flex: 1;
    resize: none;
    max-height: 220px;
    background: none;
    border: 0;
    outline: none;
    color: var(--text);
    font: inherit;
    padding: 4px 6px;
  }
  button {
    border-radius: var(--radius);
    border: 0;
    padding: 8px 18px;
    font-weight: 600;
  }
  .send {
    background: var(--accent);
    color: var(--accent-ink);
  }
  .send:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .stop {
    background: var(--raised);
    color: var(--text);
    border: 1px solid var(--line);
  }
</style>
