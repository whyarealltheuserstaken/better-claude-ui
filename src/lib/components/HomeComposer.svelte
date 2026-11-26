<script lang="ts">
  import type { PendingAttachment } from "../attachments";
  import type { Project } from "../projects";
  import type { Mode } from "../types";
  import Menu from "../ui/Menu.svelte";
  import Segmented from "../ui/Segmented.svelte";
  import Composer from "./Composer.svelte";

  let {
    initialMode,
    projects,
    onstart,
  }: {
    initialMode: Mode;
    projects: Project[];
    /** Resolve false to keep the typed text. */
    onstart: (text: string, attachments: PendingAttachment[], mode: Mode, projectId: string | null) => Promise<boolean>;
  } = $props();

  // svelte-ignore state_referenced_locally -- the box only starts on the current mode
  let mode = $state<Mode>(initialMode);
  let projectId = $state("");
  let busy = $state(false);

  const options = $derived([{ id: "", label: "No project" }, ...projects.map((p) => ({ id: p.id, label: p.name }))]);

  async function send(text: string, attachments: PendingAttachment[]) {
    if (busy) return false;
    busy = true;
    try {
      return await onstart(text, attachments, mode, projectId || null);
    } finally {
      busy = false;
    }
  }
</script>

<section class="start">
  <h2>What are we working on?</h2>
  <Composer status={busy ? "running" : "idle"} onsend={send} oninterrupt={() => {}}>
    {#snippet controls()}
      <Segmented label="Start in" value={mode} options={[{ id: "chat", label: "Chat" }, { id: "code", label: "Code" }]} onpick={(m) => (mode = m as Mode)} />
      {#if projects.length > 0}
        <Menu label="Project" icon="folder" value={projectId} {options} onpick={(id) => (projectId = id)} />
      {/if}
    {/snippet}
  </Composer>
</section>

<style>
  .start { max-width: 760px; width: 100%; margin: 0 auto; padding: 18px 24px 4px; }
  h2 { margin: 0 0 16px; font-size: clamp(24px, 4vw, 36px); font-weight: 650; line-height: 1.2; letter-spacing: -0.02em; }
</style>
