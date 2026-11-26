<script lang="ts">
  import { type PendingAttachment, canAdd, fmtSize, fromFile } from "../attachments";
  import { completeCommand, slashMatches, slashQuery } from "../slash";
  import { type Dictation, createDictation, dictationSupported, mergeTranscript } from "../dictation";
  import type { SessionStatus } from "../types";
  import type { Snippet } from "svelte";
  import Icon from "../ui/Icon.svelte";

  let {
    status,
    glyph = "",
    commands = [],
    descriptions = {},
    onsend,
    oninterrupt,
    controls,
  }: {
    controls?: Snippet;
    status: SessionStatus;
    glyph?: string;
    commands?: string[];
    descriptions?: Record<string, string>;
    onsend: (text: string, attachments: PendingAttachment[]) => void;
    oninterrupt: () => void;
  } = $props();

  let text = $state("");
  let atts = $state<PendingAttachment[]>([]);
  let problem = $state<string | null>(null);
  let dragging = $state(false);
  let picker: HTMLInputElement | undefined = $state();
  let sel = $state(0);
  let listening = $state(false);
  let voice: Dictation | null = null;
  let voiceBase = "";
  const canDictate = dictationSupported();

  function toggleVoice() {
    problem = null;
    if (listening) {
      voice?.stop();
      return;
    }
    voiceBase = text;
    voice ??= createDictation({
      onText: (fin, interim) => (text = mergeTranscript(voiceBase, fin, interim)),
      onState: (on) => (listening = on),
      onError: (m) => (problem = m),
    });
    voice?.start();
  }
  let dismissed = $state<string | null>(null);

  const query = $derived(slashQuery(text));
  const matches = $derived(query !== null && dismissed !== text ? slashMatches(query, commands) : []);
  $effect(() => {
    void matches;
    sel = 0;
  });

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

  function pick(cmd: string) {
    text = completeCommand(cmd);
  }

  function onkey(e: KeyboardEvent) {
    if (matches.length > 0) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        sel = (sel + (e.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length;
        return;
      }
      if ((e.key === "Enter" && !e.shiftKey) || e.key === "Tab") {
        e.preventDefault();
        pick(matches[sel]);
        return;
      }
      if (e.key === "Escape") {
        dismissed = text;
        return;
      }
    }
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
  class="composer glass"
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
  {#if matches.length > 0}
    <ul class="slash" role="listbox" aria-label="Commands">
      {#each matches as m, i (m)}
        <li role="option" aria-selected={i === sel}>
          <button class:on={i === sel} tabindex="-1" onmousedown={(e) => { e.preventDefault(); pick(m); }}><span class="cn">/{m}</span>{#if descriptions[m]}<span class="cd">{descriptions[m]}</span>{/if}</button>
        </li>
      {/each}
    </ul>
  {/if}
  <div class="row">
    {#if glyph}<span class="glyph" aria-hidden="true">{glyph}</span>{/if}
    <textarea
      bind:value={text}
      onkeydown={onkey}
      {onpaste}
      {disabled}
      rows="2"
      aria-label="Message"
      placeholder={disabled ? "This session has ended. Start a new one." : "Ask Claude to do something…"}
    ></textarea>
  </div>
  <div class="tools">
    <button class="btn-icon" onclick={() => picker?.click()} disabled={disabled} aria-label="Attach files" title="Attach images, PDFs or text files (or paste or drop them)"><Icon name="paperclip" /></button>
    <input bind:this={picker} type="file" multiple hidden accept="image/*,.pdf,text/*,.md,.json,.js,.ts,.tsx,.jsx,.py,.rs,.go,.java,.c,.cpp,.cs,.rb,.php,.html,.css,.svelte,.yaml,.yml,.toml,.sh,.csv,.log,.xml,.sql" onchange={(e) => { void addFiles([...(e.currentTarget.files ?? [])]); e.currentTarget.value = ""; }} />
    {#if canDictate}
      <button class="btn-icon" class:live={listening} onclick={toggleVoice} disabled={disabled} aria-pressed={listening} aria-label={listening ? "Stop dictation" : "Dictate with your voice"} title={listening ? "Stop dictation" : "Dictate with your voice"}><Icon name={listening ? "stop" : "mic"} /></button>
    {/if}
    {@render controls?.()}
    <span class="hint">Enter to send, Shift+Enter for a new line</span>
    {#if running}
      <button class="go stop" onclick={oninterrupt} aria-label="Stop (Esc)" title="Stop (Esc)"><Icon name="stop" size={14} /></button>
    {:else}
      <button class="go send" onclick={submit} disabled={!canSend} aria-label="Send" title="Send"><Icon name="send" /></button>
    {/if}
  </div>
  {#if problem}<p class="problem" role="alert">{problem}</p>{/if}
</div>

<style>
  .composer { position: relative; container-type: inline-size; padding: 10px 12px 8px; border-radius: var(--float-radius); }
  .composer:focus-within { border-color: var(--accent); }
  .composer.dragging { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, var(--card)); }
  .row { display: flex; gap: 8px; align-items: flex-start; }
  .glyph { color: var(--accent-text); font-weight: 700; padding: 4px 0 4px 4px; }
  textarea { flex: 1; resize: none; max-height: 220px; background: none; border: 0; outline: none; color: var(--text); font: inherit; padding: 4px 6px; }
  textarea::placeholder { color: var(--muted); }
  .tools { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .live { background: var(--bad); color: #fff; }
  .hint { flex: 1; min-width: 0; text-align: end; color: var(--muted); font-size: 11.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  @container (max-width: 560px) { .hint { display: none; } }
  .go { display: grid; place-items: center; flex: none; margin-inline-start: auto; width: 34px; height: 34px; padding: 0; border: 1px solid transparent; border-radius: var(--capsule); }
  .send { background: var(--accent); color: var(--accent-ink); }
  .send:disabled { opacity: 0.4; cursor: default; }
  .stop { background: var(--fill); color: var(--text); border-color: var(--line); }
  .chips { list-style: none; margin: 0 0 8px; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
  .chip { display: flex; align-items: center; gap: 6px; background: var(--raised); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 3px 4px 3px 6px; font-size: 12.5px; max-width: 240px; }
  .chip img { width: 22px; height: 22px; object-fit: cover; border-radius: 3px; }
  .ico { font-size: 10px; font-weight: 700; color: var(--muted); }
  .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sz { color: var(--muted); }
  .rm { background: none; border: 0; padding: 0 6px; color: var(--muted); font-size: 15px; }
  .slash { position: absolute; left: 10px; right: 10px; bottom: calc(100% + 6px); margin: 0; padding: 4px; list-style: none; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: 0 8px 24px rgb(0 0 0 / 0.25); z-index: 5; }
  .slash button { width: 100%; text-align: left; background: none; border: 0; padding: 5px 10px; border-radius: var(--radius-sm); font-family: var(--mono); font-size: 13px; font-weight: 500; color: var(--text); }
  .slash button { display: flex; gap: 12px; align-items: baseline; }
  .cn { flex: none; }
  .cd { color: var(--muted); font-family: var(--ui); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .slash button.on .cd { color: inherit; opacity: 0.85; }
  .slash button.on { background: var(--accent); color: var(--accent-ink); }
  .problem { color: var(--gate); margin: 6px 0 0; font-size: 12.5px; }
</style>
