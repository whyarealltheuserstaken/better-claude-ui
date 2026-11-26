<script lang="ts">
  import PageFrame from "./PageFrame.svelte";
  import { buildMcpAdd, buildMcpRemove, isPluginServer, type McpForm } from "../mcp";
  import type { Capabilities, CliOutput } from "../types";

  let {
    caps,
    run,
    onback,
  }: {
    caps: Capabilities | null;
    run: (args: string[]) => Promise<CliOutput>;
    onback: () => void;
  } = $props();

  type Tab = "mcp" | "skills" | "agents" | "plugins" | "tools";
  let tab = $state<Tab>("mcp");
  let filter = $state("");
  let output = $state<string | null>(null);
  let busy = $state(false);
  let error = $state<string | null>(null);
  let form = $state<McpForm>({ name: "", transport: "http", target: "", args: "", scope: "user" });

  const tabs: { id: Tab; label: string; count: (c: Capabilities) => number }[] = [
    { id: "mcp", label: "MCP servers", count: (c) => c.mcp_servers.length },
    { id: "skills", label: "Skills", count: (c) => c.skills.length },
    { id: "agents", label: "Agents", count: (c) => c.agents.length },
    { id: "plugins", label: "Plugins", count: (c) => c.plugins.length },
    { id: "tools", label: "Tools", count: (c) => c.tools.length },
  ];

  const list = $derived.by(() => {
    if (!caps) return [];
    const src = tab === "skills" ? caps.skills : tab === "agents" ? caps.agents : tab === "plugins" ? caps.plugins : tab === "tools" ? caps.tools : [];
    const f = filter.trim().toLowerCase();
    return f ? src.filter((x) => x.toLowerCase().includes(f)) : src;
  });

  async function exec(args: string[], display: string, confirmText?: string) {
    error = null;
    if (confirmText && !confirm(confirmText + "\n\n" + display)) return;
    busy = true;
    try {
      const r = await run(args);
      output = r.output || (r.code === 0 ? "Done." : `Exited with code ${r.code}`);
      if (r.code !== 0) error = "The command reported a problem. See the output below.";
    } catch (e) {
      error = String(e);
    } finally {
      busy = false;
    }
  }

  function add() {
    const b = buildMcpAdd(form);
    if (!b.ok) {
      error = b.error;
      return;
    }
    void exec(b.args, b.display, "This will add an MCP server. Servers can run programs on your computer, so only add ones you trust.");
  }

  function remove(name: string) {
    const b = buildMcpRemove(name);
    if (!b.ok) {
      error = b.error;
      return;
    }
    void exec(b.args, b.display, `Remove the MCP server "${name}"?`);
  }
</script>

<PageFrame {onback}>
    {#if !caps}
      <p class="sub">Send your first message in a session: Claude reports its skills, tools and servers once it starts working. You can check your MCP servers any time.</p>
      <div class="actions"><button disabled={busy} onclick={() => exec(["mcp", "list"], "claude mcp list")}>Check server health</button></div>
      {#if error}<p class="err" role="alert">{error}</p>{/if}
      {#if output}<pre class="out">{output}</pre>{/if}
    {:else}
      <div class="tabs" role="tablist">
        {#each tabs as t (t.id)}
          <button role="tab" aria-selected={tab === t.id} class:on={tab === t.id} onclick={() => { tab = t.id; filter = ""; }}>{t.label} <span class="n">{t.count(caps)}</span></button>
        {/each}
      </div>

      {#if tab === "mcp"}
        <p class="sub">MCP servers give Claude extra tools (GitHub, browsers, databases). Changes apply to sessions you start next.</p>
        {#if caps.mcp_servers.length === 0}<p class="sub">No servers connected in this session.</p>{/if}
        <ul class="rows">
          {#each caps.mcp_servers as s (s.name)}
            <li>
              <span class="dot" data-status={s.status}></span>
              <span class="name">{s.name}</span>
              <span class="st">{s.status || "unknown"}</span>
              {#if isPluginServer(s.name)}<span class="st">via plugin</span>{:else}<button class="small" disabled={busy} onclick={() => remove(s.name)}>Remove</button>{/if}
            </li>
          {/each}
        </ul>
        <details>
          <summary>Add a server</summary>
          <div class="form">
            <label>Name <input bind:value={form.name} placeholder="github" /></label>
            <label>Type
              <select bind:value={form.transport}>
                <option value="http">Remote (HTTP)</option>
                <option value="sse">Remote (SSE)</option>
                <option value="stdio">Local program</option>
              </select>
            </label>
            <label class="wide">{form.transport === "stdio" ? "Command" : "URL"} <input bind:value={form.target} placeholder={form.transport === "stdio" ? "npx" : "https://example.com/mcp"} /></label>
            {#if form.transport === "stdio"}<label class="wide">Arguments <input bind:value={form.args} placeholder="-y @modelcontextprotocol/server-filesystem ." /></label>{/if}
            <label>Available to
              <select bind:value={form.scope}>
                <option value="user">All my projects</option>
                <option value="project">This project (shared)</option>
                <option value="local">This project (just me)</option>
              </select>
            </label>
            <button class="primary" disabled={busy} onclick={add}>Add server</button>
          </div>
        </details>
        <div class="actions"><button disabled={busy} onclick={() => exec(["mcp", "list"], "claude mcp list")}>Check server health</button></div>
      {:else if tab === "plugins"}
        <ul class="rows">{#each caps.plugins as p (p)}<li><span class="name">{p}</span></li>{/each}</ul>
        <div class="actions"><button disabled={busy} onclick={() => exec(["plugin", "list"], "claude plugin list")}>Show plugin details</button></div>
      {:else}
        <input class="search" placeholder="Search {tab}" bind:value={filter} aria-label="Search" />
        <ul class="rows scroll">{#each list.slice(0, 300) as x (x)}<li><span class="name mono">{x}</span></li>{/each}</ul>
        {#if list.length > 300}<p class="sub">Showing 300 of {list.length}. Search to narrow.</p>{/if}
        {#if list.length === 0}<p class="sub">Nothing matches.</p>{/if}
      {/if}

      {#if error}<p class="err" role="alert">{error}</p>{/if}
      {#if output}<pre class="out">{output}</pre>{/if}
      <p class="sub foot">Claude Code {caps.version}</p>
    {/if}
</PageFrame>

<style>
  .sub { color: var(--muted); font-size: 13px; }
  .foot { margin-bottom: 0; }
  .tabs { display: flex; gap: 4px; flex-wrap: wrap; margin: 10px 0; border-bottom: 1px solid var(--line); }
  .tabs button { background: none; border: 0; border-bottom: 2px solid transparent; border-radius: 0; padding: 6px 10px; color: var(--muted); }
  .tabs button.on { color: var(--text); border-bottom-color: var(--accent); }
  .n { font-size: 11px; color: var(--muted); }
  .rows { list-style: none; margin: 8px 0; padding: 0; }
  .rows.scroll { max-height: 300px; overflow: auto; }
  .rows li { display: flex; align-items: center; gap: 10px; padding: 5px 2px; border-bottom: 1px solid var(--line); }
  .name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mono { font-family: var(--mono); font-size: 12.5px; }
  .st { color: var(--muted); font-size: 12.5px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); }
  .dot[data-status="connected"] { background: var(--ok); }
  .dot[data-status="failed"], .dot[data-status="error"] { background: var(--bad); }
  .dot[data-status="pending"] { background: var(--gate); }
  .form { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 14px; padding: 10px 0; }
  .form label { display: flex; flex-direction: column; gap: 3px; font-size: 13px; }
  .form .wide { grid-column: 1 / -1; }
  input, select { background: var(--bg); color: var(--text); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 6px 8px; font: inherit; }
  .search { width: 100%; }
  button { min-height: 30px; background: var(--fill); color: var(--text); border: 1px solid transparent; border-radius: var(--capsule); padding: 4px 14px; }
  button.small { min-height: 28px; padding: 2px 10px; }
  button.primary { background: var(--accent); color: var(--accent-ink); border-color: transparent; font-weight: 600; align-self: end; }
  button:disabled { opacity: 0.5; }
  .actions { margin: 8px 0; }
  .err { color: var(--bad-text); }
  .out { max-height: 200px; overflow: auto; background: var(--bg); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 8px; font: 12px/1.5 var(--mono); white-space: pre-wrap; }
</style>
