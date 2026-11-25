<script lang="ts">
  import { type PendingAttachment, canAdd, fmtSize, fromFile } from "../attachments";
  import type { SessionStatus } from "../types";

  let {
    status,
    glyph = "",
    onsend,
    oninterrupt,
  }: {
    status: SessionStatus;
    glyph?: string;
    onsend: (text: string, attachments: PendingAttachment[]) => void;
    oninterrupt: () => void;
  } = $props();

  let text = $state("");
  let atts = $state<PendingAttachment[]>([]);
  let problem = $state<string | null>(null);
  let dragging = $state(false);
  let picker: HTMLInputElement | undefined = $state();

  const running = $derived(status === "running");
  const disabled = $derived(status === "exited");
  const canSend = $derived(!disabled && !running && (text.trim().length > 0 || atts.length > 0));

  async function addFiles(files: File[]) {
    problem = null;
    for (const f of files) {
      const limit = canAdd(atts);
      if (limit) {
        problem = limit;
        break;
      }
      const r = await fromFile(f);
      if ("error" in r) problem = r.error;
      else atts = [...atts, r];
    }
  }

  function submit() {
    if (!canSend) return;
    onsend(text.trim(), atts);
    text = "";
    atts = [];
    problem = null;
  }

  function onkey(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      submit();
    } else if (e.key === "Escape" && running) {
      oninterrupt();
    }
  }

  function onpaste(e: ClipboardEvent) {
    const files = [...(e.clipboardData?.files ?? [])];
    if (files.length > 0) {
      e.preventDefault();
      void addFiles(files);
    }
  }

  function ondrop(e: DragEvent) {
    e.preventDefault();
    dragging = false;
    void addFiles([...(e.dataTransfer?.files ?? [])]);
  }
</script>

<div
  class="composer"
  class:dragging
  role="group"
  aria-label="Composer"
  ondragover={(e) => {
    e.preventDefault();
    dragging = true;
  }}
  ondragleave={() => (dragging = false)}
  {ondrop}
>
  {#if atts.length > 0}
    <ul class="chips" aria-label="Attachments">
      {#each atts as a (a.id)}
        <li class="chip">
          {#if a.preview}<img src={a.preview} alt="" />{:else}<span class="ico" aria-hidden="true">{a.kind === "pdf" ? "PDF" : "TXT"}</span>{/if}
          <span class="nm" title={a.name}>{a.name}</span>
          <span class="sz">{fmtSize(a.size)}</span>
          <button class="rm" aria-label="Remove {a.name}" onclick={() => (atts = atts.filter((x) => x.id !== a.id))}>×</button>
        </li>
      {/each}
    </ul>
  {/if}
  <div class="row">
    {#if glyph}<span class="glyph" aria-hidden="true">{glyph}</span>{/if}
    <button class="attach" onclick={() => picker?.click()} disabled={disabled} aria-label="Attach files" title="Attach images, PDFs or text files (or paste or drop them)">+</button>
    <input bind:this={picker} type="file" multiple hidden accept="image/*,.pdf,text/*,.md,.json,.js,.ts,.tsx,.jsx,.py,.rs,.go,.java,.c,.cpp,.cs,.rb,.php,.html,.css,.svelte,.yaml,.yml,.toml,.sh,.csv,.log,.xml,.sql" onchange={(e) => { void addFiles([...(e.currentTarget.files ?? [])]); e.currentTarget.value = ""; }} />
    <textarea
      bind:value={text}
      onkeydown={onkey}
      {onpaste}
      {disabled}
      rows="2"
      aria-label="Message"
      placeholder={disabled ? "This session has ended. Start a new one." : "Ask Claude to do something…  (Enter to send, Shift+Enter for a new line)"}
    ></textarea>
    {#if running}
      <button class="stop" onclick={oninterrupt} aria-label="Stop (Esc)">Stop</button>
    {:else}
      <button class="send" onclick={submit} disabled={!canSend}>Send</button>
    {/if}
  </div>
  {#if problem}<p class="problem" role="alert">{problem}</p>{/if}
</div>

<style>
  .composer { padding: 10px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-lg); }
  .composer:focus-within { border-color: var(--accent); }
  .composer.dragging { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, var(--surface)); }
  .row { display: flex; gap: 10px; align-items: flex-end; }
  .glyph { color: var(--accent); font-weight: 700; padding: 4px 0 4px 4px; }
  textarea { flex: 1; resize: none; max-height: 220px; background: none; border: 0; outline: none; color: var(--text); font: inherit; padding: 4px 6px; }
  button { border-radius: var(--radius); border: 0; padding: 8px 18px; font-weight: 600; }
  .send { background: var(--accent); color: var(--accent-ink); }
  .send:disabled { opacity: 0.4; cursor: default; }
  .stop { background: var(--raised); color: var(--text); border: 1px solid var(--line); }
  .attach { background: var(--raised); color: var(--text); padding: 6px 12px; font-size: 16px; line-height: 1; border: 1px solid var(--line); }
  .attach:disabled { opacity: 0.4; }
  .chips { list-style: none; margin: 0 0 8px; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
  .chip { display: flex; align-items: center; gap: 6px; background: var(--raised); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 3px 4px 3px 6px; font-size: 12.5px; max-width: 240px; }
  .chip img { width: 22px; height: 22px; object-fit: cover; border-radius: 3px; }
  .ico { font-size: 10px; font-weight: 700; color: var(--muted); }
  .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sz { color: var(--muted); }
  .rm { background: none; border: 0; padding: 0 6px; color: var(--muted); font-size: 15px; }
  .problem { color: var(--gate); margin: 6px 0 0; font-size: 12.5px; }
</style>
