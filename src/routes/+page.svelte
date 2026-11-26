<script lang="ts">
  import { onMount } from "svelte";
  import CapabilitiesPanel from "$lib/components/CapabilitiesPanel.svelte";
  import EditorPanel from "$lib/components/EditorPanel.svelte";
  import ArchivePage from "$lib/components/ArchivePage.svelte";
  import ImportPanel from "$lib/components/ImportPanel.svelte";
  import UpdatePanel from "$lib/components/UpdatePanel.svelte";
  import { reduceUpdate, shouldShowChip, progressFraction } from "$lib/updates";
  import ArtifactPreview from "$lib/components/ArtifactPreview.svelte";
  import ProjectsPanel from "$lib/components/ProjectsPanel.svelte";
  import { pickFolder, pickImportFile, setWindowTheme } from "$lib/ipc";
  import Backdrop from "$lib/components/Backdrop.svelte";
  import Toolbar from "$lib/components/Toolbar.svelte";
  import { PANEL_DOCK_MIN_WIDTH, panelState, waitingModes } from "$lib/shell";
  import Palette from "$lib/components/Palette.svelte";
  import { allStyles, allThemes } from "$lib/theme";
  import type { PaletteItem } from "$lib/palette";
  import HomePage from "$lib/components/HomePage.svelte";
  import UsagePage from "$lib/components/UsagePage.svelte";
  import { ipc, openUrl } from "$lib/ipc";
  import { budgetState, fmtUsd } from "$lib/format";
  import PresetPicker from "$lib/components/PresetPicker.svelte";
  import Onboarding from "$lib/components/Onboarding.svelte";
  import RawLog from "$lib/components/RawLog.svelte";
  import SessionControls from "$lib/components/SessionControls.svelte";
  import RightPanel from "$lib/components/RightPanel.svelte";
  import { findProject } from "$lib/projects";
  import HomeComposer from "$lib/components/HomeComposer.svelte";
  import { startFromHome } from "$lib/homeStart";
  import type { PendingAttachment } from "$lib/attachments";
  import type { Mode } from "$lib/types";
  import SettingsPage from "$lib/components/SettingsPage.svelte";
  import { CATEGORIES, cleanCategory, escapeGoesBack } from "$lib/settingsNav";
  import Composer from "$lib/components/Composer.svelte";
  import MessageList from "$lib/components/MessageList.svelte";
  import PermissionPrompt from "$lib/components/PermissionPrompt.svelte";
  import SetupWizard from "$lib/components/SetupWizard.svelte";
  import { applyAppearance, resolveStyle, resolveTheme } from "$lib/theme";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import { app } from "$lib/store.svelte";

  const CODE_STARTERS = [
    "Explain what this project does and how it is organised.",
    "Find likely bugs and list them, without changing anything.",
    "Suggest three small improvements, then wait for my choice.",
  ];
  const CHAT_STARTERS = [
    "Help me think through a decision.",
    "Explain something I find confusing.",
    "Proofread and tighten some writing.",
  ];

  onMount(() => {
    void app.init();
  });

  let systemDark = $state(typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches);
  onMount(() => {
    if (typeof matchMedia !== "function") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = () => (systemDark = mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  });
  $effect(() => {
    const theme = resolveTheme(app.config.theme, app.config.custom_themes, systemDark);
    applyAppearance(document.documentElement, theme, resolveStyle(app.config.style, app.config.custom_styles));
    void setWindowTheme(theme.scheme);
  });
  const paletteItems = $derived.by((): PaletteItem[] => {
    const items: PaletteItem[] = [
      { id: "go-home", label: "Home", group: "Go to", keywords: "dashboard widgets", run: () => app.go("home") },
      { id: "go-chat", label: "Chat", group: "Go to", run: () => app.setMode("chat") },
      { id: "go-code", label: "Code", group: "Go to", run: () => app.setMode("code") },
      { id: "go-usage", label: "Usage", group: "Go to", keywords: "tokens cost billing budget limits", run: () => app.go("usage") },
      { id: "new-chat", label: "New chat", group: "Start", run: () => { app.setMode("chat"); void app.newSession(); } },
      { id: "new-code", label: "New coding session", group: "Start", keywords: "project folder", run: () => { app.setMode("code"); void app.newSession(); } },
      { id: "teams", label: "Agent teams", group: "Start", keywords: "preset research coordinator review", run: () => (app.showPresets = true) },
      { id: "projects", label: "Projects", group: "App", keywords: "instructions manage", run: () => (app.showProjects = true) },
      { id: "archive", label: "Archive", group: "Go to", keywords: "imported conversations restored", run: () => app.go("archive") },
      { id: "export", label: "Export all my data", group: "Your data", keywords: "backup save migrate", run: () => void app.exportAll() },
      { id: "import", label: "Import data", group: "Your data", keywords: "restore claude chatgpt grok migrate", run: () => (app.showImport = true) },
      { id: "settings", label: "Settings", group: "App", keywords: "preferences appearance tier", run: () => app.openPage("settings") },
    ];
    if (app.tier !== "beginner") {
      items.push(
        { id: "caps", label: "Capabilities", group: "App", keywords: "mcp skills plugins tools servers", run: () => (app.showCaps = true) },
        { id: "editor", label: "Instructions and settings", group: "App", keywords: "claude.md settings.json", run: () => (app.showEditor = true) },
      );
    }
    if (active && active.items.length > 0) {
      items.push(
        { id: "export", label: "Export this conversation", group: "Conversation", keywords: "markdown copy", run: () => app.exportActive() },
        { id: "terminal", label: "Continue in terminal", group: "Conversation", run: () => void app.openTerminal() },
      );
    }
    for (const p of app.projects) {
      items.push(
        { id: "proj-chat-" + p.id, label: `Chat in ${p.name}`, group: "Project", keywords: "new", run: () => { app.setMode("chat"); void app.newSession({ projectId: p.id }); } },
        { id: "proj-code-" + p.id, label: `Code in ${p.name}`, group: "Project", keywords: "new coding session", run: () => { app.setMode("code"); void app.newSession({ projectId: p.id }); } },
      );
    }
    for (const t of [{ id: "auto", name: "Match system" }, ...allThemes(app.config.custom_themes)])
      items.push({ id: "theme-" + t.id, label: "Theme: " + t.name, group: "Theme", run: () => void app.updateConfig({ theme: t.id }) });
    for (const s of allStyles(app.config.custom_styles))
      items.push({ id: "style-" + s.id, label: "Style: " + s.name, group: "Style", run: () => void app.updateConfig({ style: s.id }) });
    for (const m of app.metas) items.push({ id: "sess-" + m.id, label: m.title, group: "Open", run: () => app.select(m.id) });
    for (const r of app.config.recents.slice(0, 30)) items.push({ id: "rec-" + r.cli_session_id, label: r.title, group: "Recent", keywords: r.cwd ?? "", run: () => void app.resume(r) });
    return items;
  });

  async function searchConversations(q: string): Promise<PaletteItem[]> {
    const hits = await ipc.searchConversations(q);
    return hits.flatMap((h) => {
      if (h.archive) {
        const a = app.archive.find((x) => x.id === h.cli_session_id);
        return a ? [{ id: "hit-" + a.id, label: `${a.title}: ${h.snippet}`, group: "In archive", run: () => void app.openArchive(a.id) }] : [];
      }
      const r = app.config.recents.find((x) => x.cli_session_id === h.cli_session_id);
      return r ? [{ id: "hit-" + h.cli_session_id, label: `${r.title}: ${h.snippet}`, group: "In conversation", run: () => void app.resume(r) }] : [];
    });
  }

  async function startAtHome(text: string, attachments: PendingAttachment[], mode: Mode, projectId: string | null): Promise<boolean> {
    const result = await startFromHome(
      {
        pickFolder,
        start: (m, o) => {
          app.mode = m;
          return app.newSession({ cwd: o.cwd, projectId: o.projectId });
        },
        // A composer "send" adds the message to the transcript, so it stays visible even if delivery fails.
        send: (t, a) => app.send(t, a),
      },
      { text, attachments, mode, projectId, projectCwd: findProject(app.config.projects, projectId)?.cwd ?? null },
    );
    return result === "sent";
  }

  const toggleSidebar = () => void app.updateConfig({ sidebar_hidden: !app.config.sidebar_hidden });
  const waiting = $derived(waitingModes(app.metas, app.states));
  const waitingHere = $derived(app.view === "session" && (app.active?.pending.length ?? 0) > 0);

  let width = $state(1100);
  let overlayOpen = $state(false);
  const panel = $derived(app.active && app.activeMeta ? panelState(width, app.config.panel_hidden, app.view, overlayOpen) : "closed");
  const hasPanel = $derived(app.view === "session" && !!app.active && !!app.activeMeta);
  function togglePanel() {
    if (width >= PANEL_DOCK_MIN_WIDTH) void app.updateConfig({ panel_hidden: !app.config.panel_hidden });
    else overlayOpen = !overlayOpen;
  }
  const waitingIds = $derived(new Set((app.active?.pending ?? []).map((p) => p.tool_use_id)));
  let transcript: ReturnType<typeof MessageList> | undefined = $state();
  function jump(id: string) {
    overlayOpen = false;
    void transcript?.jumpTo(id);
  }

  const heading = $derived.by((): { title: string; subtitle: string } => {
    if (app.view === "home") return { title: "Home", subtitle: "Your usage and shortcuts" };
    if (app.view === "usage") return { title: "Usage", subtitle: "Tokens and estimated cost on this computer" };
    if (app.view === "archive") return { title: "Archive", subtitle: "Imported conversations" };
    if (app.view === "settings") return { title: "Settings", subtitle: CATEGORIES.find((c) => c.id === cleanCategory(app.config.settings_category))?.label ?? "" };
    if (!app.active || !app.activeMeta) return { title: app.mode === "chat" ? "Chat" : "Code", subtitle: "" };
    return { title: app.activeMeta.title, subtitle: app.activeMeta.mode === "chat" ? "No tools in Chat" : (app.active.cwd ?? app.activeMeta.cwd ?? "") };
  });

  // Runs in the capture phase: once a dialog has handled Escape it is already gone from the document,
  // and the same keypress would then leave the page too.
  function onEscape(e: KeyboardEvent) {
    if (escapeGoesBack(e, app.view, !!document.querySelector('[role="dialog"], [role="menu"], [role="listbox"]'))) app.back();
  }

  function onGlobalKey(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === ",") {
      e.preventDefault();
      app.openPage("settings");
      return;
    }
    const typing = e.target instanceof HTMLElement && !!e.target.closest("input, textarea, select, [contenteditable]");
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b" && !typing) {
      e.preventDefault();
      toggleSidebar();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      app.showPalette = !app.showPalette;
    }
  }

  const todayBudget = $derived(budgetState(app.usage?.today.cost_usd ?? 0, app.config.budget_daily_usd));
  const glyph = $derived(resolveStyle(app.config.style, app.config.custom_styles).glyph);

  const needsSetup = $derived(
    !!app.cli && (app.cli.state !== "found" || (!app.authSkipped && app.auth !== null && app.auth.state !== "logged_in")),
  );

  const version = $derived(app.cli?.state === "found" ? app.cli.version : null);
  const active = $derived(app.active);
</script>

<svelte:head><title>BetterClaudeUI</title></svelte:head>
<svelte:window onkeydowncapture={onEscape} onkeydown={(e) => { if (e.key === "Escape") overlayOpen = false; onGlobalKey(e); }} bind:innerWidth={width} />

{#if !app.cliChecked}
  <main class="center"><p class="muted">Looking for Claude…</p></main>
{:else if app.cli && needsSetup}
  <SetupWizard cli={app.cli} auth={app.auth} oncheck={(p) => app.checkCli(p)} onrecheck={() => app.checkAuth()} onskip={() => (app.authSkipped = true)} />
{:else if !app.config.onboarded}
  <Onboarding ondone={(t) => app.updateConfig({ tier: t, onboarded: true })} />
{:else}
  <Backdrop waiting={waitingHere} />
  <div class="shell">
    {#if !app.config.sidebar_hidden}
      <Sidebar
        metas={app.visibleMetas}
        states={app.states}
        activeId={app.activeId}
        mode={app.mode}
        view={app.view}
        recents={app.recents}
        projects={app.projects}
        {waiting}
        onmode={(m) => app.setMode(m)}
        onhome={() => app.go("home")}
        onusage={() => app.go("usage")}
        onproject={(id) => void app.newSession({ projectId: id })}
        onprojects={() => (app.showProjects = true)}
        onresume={(r) => app.resume(r)}
        onforget={(r) => app.forget(r)}
        onsettings={() => app.openPage("settings")}
        onpresets={() => (app.showPresets = true)}
        archiveCount={app.archive.length}
        onarchive={() => app.go("archive")}
        advancedTools={app.tier !== "beginner"}
        oncaps={() => (app.showCaps = true)}
        oneditor={() => (app.showEditor = true)}
        onselect={(id) => app.select(id)}
        onnew={() => app.newSession()}
        onclose={(id) => app.close(id)}
      />
    {/if}
    <section class="main">
      <Toolbar
        title={heading.title}
        subtitle={heading.subtitle}
        onsidebar={toggleSidebar}
        onsearch={() => (app.showPalette = true)}
        onexport={app.view === "session" && active && active.items.length > 0 ? () => app.exportActive() : undefined}
        onterminal={app.view === "session" && active && active.items.length > 0 ? () => app.openTerminal() : undefined}
        onpanel={hasPanel ? togglePanel : undefined}
      >
        {#if shouldShowChip(app.update, app.config.skipped_version)}
          <button class="pill accent" onclick={() => (app.showUpdate = true)} title="A new version of BetterClaudeUI is available">
            {#if app.update.phase === "downloading"}Updating… {Math.round((progressFraction(app.update.downloaded, app.update.total) ?? 0) * 100)}%{:else if app.update.phase === "ready"}Ready to install{:else if app.update.phase === "installing"}Installing…{:else}Update available{/if}
          </button>
        {/if}
        {#if todayBudget.level !== "none"}
          <button class="pill" data-level={todayBudget.level} onclick={() => app.go("usage")} title="Today's estimated cost against your daily budget">Today {fmtUsd(app.usage?.today.cost_usd ?? 0)}</button>
        {/if}
      </Toolbar>
      {#if app.error}
        <div class="banner" role="alert">
          {app.error}
          <button onclick={() => (app.error = null)} aria-label="Dismiss">×</button>
        </div>
      {/if}
      {#if app.view === "home"}
        <div class="scrollpage">
          <HomeComposer initialMode={app.mode} projects={app.projects} onstart={startAtHome} />
          <HomePage
            config={app.config}
            usage={app.usage}
            limits={app.limits}
            cli={app.cli}
            auth={app.auth}
            editing={app.homeEditing}
            onsave={(patch) => app.updateConfig(patch)}
            onedit={(v) => (app.homeEditing = v)}
            onnewchat={() => { app.setMode("chat"); void app.newSession(); }}
            onnewcode={() => { app.setMode("code"); void app.newSession(); }}
            onteams={() => (app.showPresets = true)}
            onresume={(r) => app.resume(r)}
            onusage={() => app.go("usage")}
            refreshing={app.limitsRefreshing}
            refreshError={app.limitsError}
            onrefreshlimits={() => app.refreshLimits()}
            onautorefresh={(p) => app.setAutoRefresh(p)}
            limitsPaused={app.limitsPaused}
            projects={app.projects}
            onproject={(id, mode) => { app.setMode(mode); void app.newSession({ projectId: id }); }}
            onprojects={() => (app.showProjects = true)}
          />
        </div>
      {:else if app.view === "settings"}
        <SettingsPage
          config={app.config}
          cliVersion={version}
          appVersion={app.appVersion}
          update={app.update}
          oncheck={() => app.checkUpdates(true)}
          onviewupdate={() => (app.showUpdate = true)}
          exportState={app.exportState}
          onexport={() => app.exportAll()}
          onimport={() => (app.showImport = true)}
          limitsPaused={app.limitsPaused}
          onautorefresh={(p) => app.setAutoRefresh(p)}
          onsave={(patch) => app.updateConfig(patch)}
          onback={() => app.back()}
        />
      {:else if app.view === "archive"}
        <ArchivePage
          entries={app.archive}
          viewing={app.viewing}
          onopen={(id) => app.openArchive(id)}
          onback={() => (app.viewing = null)}
          ondelete={(id) => app.deleteArchive(id)}
          oncontinue={(id) => app.continueFromArchive(id)}
          onimport={() => (app.showImport = true)}
          oncopy={(t) => app.copyText(t)}
          onpreview={(code, lang) => (app.preview = { code, lang })}
        />
      {:else if app.view === "usage"}
        <div class="scrollpage">
          <UsagePage
            config={app.config}
            usage={app.usage}
            limits={app.limits}
            auth={app.auth}
            days={app.usageDays}
            onrange={(d) => app.refreshUsage(d)}
            onsave={(patch) => app.updateConfig(patch)}
            onclear={async () => { await ipc.usageClear(); await app.refreshUsage(); }}
            refreshing={app.limitsRefreshing}
            refreshError={app.limitsError}
            onrefreshlimits={() => app.refreshLimits()}
            onautorefresh={(p) => app.setAutoRefresh(p)}
            limitsPaused={app.limitsPaused}
            onopen={(u) => void openUrl(u)}
          />
        </div>
      {:else if active}
        {#if active.items.length === 0}
          <div class="starters">
            <h2>{app.activeMeta?.mode === "chat" ? "Ask anything" : "Where should Claude start?"}</h2>
            {#each app.activeMeta?.mode === "chat" ? CHAT_STARTERS : CODE_STARTERS as s (s)}
              <button onclick={() => app.send(s)}>{s}</button>
            {/each}
          </div>
        {:else}
          <MessageList bind:this={transcript} items={active.items} {waitingIds} diffs={app.caps.diffs} oncopy={(t) => app.copyText(t)} onpreview={(code, lang) => (app.preview = { code, lang })} />
        {/if}
        <div class="dock">
          <div class="column">
            {#each active.pending as p (p.request_id)}
              <PermissionPrompt request={p} onresolve={(id, d) => app.resolve(id, d)} />
            {/each}
            <Composer status={active.status} {glyph} commands={active.info ? active.info.commands.map((c) => c.name) : (active.caps?.slash_commands ?? [])} descriptions={Object.fromEntries((active.info?.commands ?? []).map((c) => [c.name, c.description]))} onsend={(t, a) => app.send(t, a)} oninterrupt={() => app.interrupt()}>
              {#snippet controls()}
                {#if panel === "closed"}{@render sessionControls("composer")}{/if}
              {/snippet}
            </Composer>
            {#if app.caps.rawLog}<RawLog events={active.raw} />{/if}
          </div>
        </div>
      {:else}
        <div class="empty">
          {#if app.mode === "chat"}
            <h1>What is on your mind?</h1>
            <p>Chat with Claude. No files or commands are touched in this mode.</p>
            <button onclick={() => app.newSession()}>Start a chat</button>
          {:else}
            <h1>What are we working on?</h1>
            <p>Pick a project folder and Claude will work inside it.</p>
            <button onclick={() => app.newSession()}>Choose a folder</button>
          {/if}
        </div>
      {/if}
    </section>
    {#if panel !== "closed" && app.active && app.activeMeta}
      {#if panel === "overlay"}<button class="scrim" aria-label="Dismiss the right panel" onclick={() => (overlayOpen = false)}></button>{/if}
      <RightPanel meta={app.activeMeta} session={app.active} projectName={findProject(app.config.projects, app.activeMeta.project)?.name ?? null} overlay={panel === "overlay"} onjump={jump} onclose={() => (overlayOpen = false)}>
        {#snippet controls()}{@render sessionControls("panel")}{/snippet}
      </RightPanel>
    {/if}
  </div>
{/if}

{#snippet sessionControls(variant: "panel" | "composer")}
  {#if app.activeMeta}
    <SessionControls
      {variant}
      caps={app.caps}
      model={app.activeMeta.model}
      permissionMode={app.activeMeta.permissionMode}
      chat={app.activeMeta.mode === "chat"}
      models={app.active?.info?.models ?? []}
      effort={app.activeMeta.effort}
      webSearch={app.activeMeta.webSearch}
      oneffort={(e) => app.reconfigure(app.activeMeta!.id, { effort: e })}
      onweb={(on) => app.reconfigure(app.activeMeta!.id, { webSearch: on })}
      onmodel={(m) => app.reconfigure(app.activeMeta!.id, { model: m })}
      onmode={(m) => app.reconfigure(app.activeMeta!.id, { permissionMode: m })}
    />
  {/if}
{/snippet}

{#if app.showPalette}
  <Palette items={paletteItems} search={searchConversations} onclose={() => (app.showPalette = false)} />
{/if}
{#if app.showImport}
  <ImportPanel
    pickFile={pickImportFile}
    {pickFolder}
    inspect={(p) => ipc.inspectImport(p)}
    run={(p, o) => ipc.runImport(p, o)}
    finish={(r) => app.finishImport(r)}
    onopenarchive={() => app.go("archive")}
    onclose={() => (app.showImport = false)}
  />
{/if}
{#if app.showUpdate}
  <UpdatePanel
    state={app.update}
    currentVersion={app.appVersion}
    running={Object.values(app.states).filter((s) => s.status === "running").length}
    pending={Object.values(app.states).reduce((n, s) => n + s.pending.length, 0)}
    ondownload={() => app.downloadUpdate()}
    oninstall={() => app.installUpdate()}
    onskip={() => app.skipUpdateVersion()}
    onretry={() => app.checkUpdates(true)}
    ondismiss={() => (app.update = reduceUpdate(app.update, { type: "dismiss" }))}
    onclose={() => (app.showUpdate = false)}
  />
{/if}
{#if app.preview}
  <ArtifactPreview code={app.preview.code} lang={app.preview.lang} oncopy={(t) => app.copyText(t, "Code copied")} onclose={() => (app.preview = null)} />
{/if}
{#if app.showProjects}
  <ProjectsPanel
    projects={app.projects}
    onsave={(list) => app.updateConfig({ projects: list })}
    onstart={(p, mode) => { app.showProjects = false; app.setMode(mode); void app.newSession({ projectId: p.id }); }}
    onpick={pickFolder}
    onclose={() => (app.showProjects = false)}
  />
{/if}
{#if app.toast}<div class="toast" role="status">{app.toast}</div>{/if}
{#if app.showCaps}
  <CapabilitiesPanel caps={app.active?.caps ?? null} run={(a) => ipc.runCli(a, app.activeMeta?.cwd ?? null)} onclose={() => (app.showCaps = false)} />
{/if}
{#if app.showEditor}
  <EditorPanel project={app.activeMeta?.mode === "code" ? (app.activeMeta.cwd ?? null) : null} advanced={app.tier === "advanced"} onclose={() => (app.showEditor = false)} />
{/if}
{#if app.showPresets}
  <PresetPicker presets={app.presets} advanced={app.tier === "advanced"} onstart={(p) => app.startPreset(p)} onclose={() => (app.showPresets = false)} />
{/if}

<style>
  .shell {
    display: flex;
    gap: 10px;
    height: 100vh;
    padding: 10px;
  }
  .main {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: var(--sheet);
    border: 1px solid var(--line);
    border-radius: var(--float-radius);
    overflow: hidden;
  }
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 24;
    border: 0;
    background: rgb(0 0 0 / 0.35);
  }
  .toast {
    position: fixed;
    bottom: 22px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 6px 16px;
    font-size: 13px;
    z-index: 30;
  }
  .scrollpage {
    flex: 1;
    overflow-y: auto;
  }
  .pill.accent {
    border-color: var(--accent);
    color: var(--accent-text);
  }
  .pill[data-level="warn"] {
    border-color: var(--gate);
    color: var(--gate-text);
  }
  .pill[data-level="over"] {
    border-color: var(--bad);
    color: var(--bad-text);
  }
  .starters {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 8px;
    max-width: 560px;
    width: 100%;
    margin: 0 auto;
    padding: 24px;
  }
  .starters h2 {
    margin: 0 0 8px;
    font-size: 22px;
    letter-spacing: -0.015em;
  }
  .starters button {
    text-align: left;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 11px 14px;
  }
  .starters button:hover {
    border-color: var(--accent);
  }
  .dock {
    padding: 0 24px 18px;
  }
  .column {
    max-width: var(--col, 780px);
    margin: 0 auto;
  }
  .empty {
    margin: auto;
    text-align: center;
    padding: 24px;
  }
  .empty h1 {
    font-size: 28px;
    letter-spacing: -0.015em;
    margin: 0 0 8px;
  }
  .empty p {
    color: var(--muted);
    margin: 0 0 20px;
  }
  .empty button {
    background: var(--accent);
    color: var(--accent-ink);
    border: 0;
    border-radius: var(--radius);
    padding: 10px 22px;
    font-weight: 600;
  }
  .banner {
    background: color-mix(in srgb, var(--bad) 14%, var(--surface));
    color: var(--bad);
    padding: 8px 24px;
    display: flex;
    justify-content: space-between;
  }
  .banner button {
    background: none;
    border: 0;
    color: inherit;
  }
  .center {
    display: grid;
    place-items: center;
    height: 100vh;
  }
  .muted {
    color: var(--muted);
  }
</style>
