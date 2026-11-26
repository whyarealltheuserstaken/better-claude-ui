<script lang="ts">
  import {
    COLOR_KEYS, allStyles, allThemes, duplicateId, resolveTheme, sanitizeStyle, sanitizeTheme,
    type StyleDef, type Theme,
  } from "../theme";
  import type { AppConfig } from "../types";

  let { config, onsave }: { config: AppConfig; onsave: (patch: Partial<AppConfig>) => void } = $props();

  const themes = $derived(allThemes(config.custom_themes));
  const styles = $derived(allStyles(config.custom_styles));
  const dark = typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = $derived(resolveTheme(config.theme, config.custom_themes, dark));
  const style = $derived(styles.find((s) => s.id === config.style) ?? styles[0]);

  let ioMode = $state<null | "theme" | "style">(null);
  let ioText = $state("");
  let ioError = $state<string | null>(null);

  const swatch = (t: Theme) => [t.colors.bg, t.colors.surface, t.colors.accent, t.colors.text];

  // ---- themes ----
  function customizeTheme() {
    const id = duplicateId(theme.id, themes.map((t) => t.id));
    const copy = { ...theme, id, name: `${theme.name} copy`, custom: true };
    onsave({ custom_themes: [...config.custom_themes, copy], theme: id });
  }
  function patchTheme(patch: Partial<Theme>) {
    onsave({ custom_themes: config.custom_themes.map((t) => ((t as Theme).id === theme.id ? { ...(t as Theme), ...patch } : t)) });
  }
  function deleteTheme() {
    onsave({ custom_themes: config.custom_themes.filter((t) => (t as Theme).id !== theme.id), theme: "auto" });
  }

  // ---- styles ----
  function customizeStyle() {
    const id = duplicateId(style.id, styles.map((s) => s.id));
    onsave({ custom_styles: [...config.custom_styles, { ...style, id, name: `${style.name} copy`, custom: true }], style: id });
  }
  function patchStyle(patch: Partial<StyleDef>) {
    onsave({ custom_styles: config.custom_styles.map((s) => ((s as StyleDef).id === style.id ? { ...(s as StyleDef), ...patch } : s)) });
  }
  function deleteStyle() {
    onsave({ custom_styles: config.custom_styles.filter((s) => (s as StyleDef).id !== style.id), style: "modern" });
  }

  // ---- share ----
  function openExport(kind: "theme" | "style") {
    ioMode = kind;
    ioError = null;
    ioText = JSON.stringify(kind === "theme" ? theme : style, null, 2);
  }
  function openImport(kind: "theme" | "style") {
    ioMode = kind;
    ioError = null;
    ioText = "";
  }
  function doImport() {
    ioError = null;
    try {
      const raw = JSON.parse(ioText);
      if (ioMode === "theme") {
        const t = sanitizeTheme(raw);
        if (!t) throw new Error("That isn't a theme: it needs at least a name.");
        if (themes.some((x) => x.id === t.id)) t.id = duplicateId(t.id, themes.map((x) => x.id));
        onsave({ custom_themes: [...config.custom_themes, t], theme: t.id });
      } else {
        const s = sanitizeStyle(raw);
        if (!s) throw new Error("That isn't a style: it needs at least a name.");
        if (styles.some((x) => x.id === s.id)) s.id = duplicateId(s.id, styles.map((x) => x.id));
        onsave({ custom_styles: [...config.custom_styles, s], style: s.id });
      }
      ioMode = null;
    } catch (e) {
      ioError = e instanceof SyntaxError ? "That text isn't valid JSON." : String(e instanceof Error ? e.message : e);
    }
  }
</script>

<h3>Theme</h3>
<div class="grid" role="radiogroup" aria-label="Theme">
  <button class="card" role="radio" aria-checked={config.theme === "auto"} class:on={config.theme === "auto"} onclick={() => onsave({ theme: "auto" })}>
    <span class="sw"><i style="background:#0f121a"></i><i style="background:#f1f3f8"></i></span>
    <span>Match system</span>
  </button>
  {#each themes as t (t.id)}
    <button class="card" role="radio" aria-checked={config.theme === t.id} class:on={config.theme === t.id} onclick={() => onsave({ theme: t.id })}>
      <span class="sw">{#each swatch(t) as col}<i style="background:{col}"></i>{/each}</span>
      <span>{t.name}</span>
    </button>
  {/each}
</div>

<div class="actions">
  {#if !theme.custom}<button onclick={customizeTheme}>Customize this theme</button>{/if}
  <button onclick={() => openExport("theme")}>Export</button>
  <button onclick={() => openImport("theme")}>Import</button>
</div>

{#if theme.custom}
  <div class="editor">
    <label class="wide">Name <input value={theme.name} onchange={(e) => patchTheme({ name: e.currentTarget.value.trim() || theme.name })} /></label>
    <label class="wide">Base
      <select value={theme.scheme} onchange={(e) => patchTheme({ scheme: e.currentTarget.value as "dark" | "light" })}>
        <option value="dark">Dark</option><option value="light">Light</option>
      </select>
    </label>
    {#each COLOR_KEYS as k (k.key)}
      <label class="color">
        <input type="color" value={theme.colors[k.key]} oninput={(e) => patchTheme({ colors: { ...theme.colors, [k.key]: e.currentTarget.value } })} />
        {k.label}
      </label>
    {/each}
    <button class="danger" onclick={deleteTheme}>Delete theme</button>
  </div>
{/if}

<h3>Style</h3>
<div class="grid" role="radiogroup" aria-label="Style">
  {#each styles as s (s.id)}
    <button class="card plain" role="radio" aria-checked={config.style === s.id} class:on={config.style === s.id} onclick={() => onsave({ style: s.id })}>
      <span>{s.name}</span>
    </button>
  {/each}
</div>
<small>Style changes fonts, corners, spacing and how messages and tool actions look. “Terminal” is monospace with prompts and one-line actions.</small>

<div class="actions">
  {#if !style.custom}<button onclick={customizeStyle}>Customize this style</button>{/if}
  <button onclick={() => openExport("style")}>Export</button>
  <button onclick={() => openImport("style")}>Import</button>
</div>

{#if style.custom}
  <div class="editor">
    <label class="wide">Name <input value={style.name} onchange={(e) => patchStyle({ name: e.currentTarget.value.trim() || style.name })} /></label>
    <label class="wide">Font
      <select value={style.font} onchange={(e) => patchStyle({ font: e.currentTarget.value as StyleDef["font"] })}>
        <option value="system">System</option><option value="mono">Monospace</option><option value="serif">Serif</option>
      </select>
    </label>
    <label class="wide">Custom font <input placeholder="e.g. Fira Code (optional)" value={style.fontFamily ?? ""} onchange={(e) => patchStyle({ fontFamily: e.currentTarget.value || undefined })} /></label>
    <label class="wide">Text size {style.fontSize}px <input type="range" min="11" max="22" step="0.5" value={style.fontSize} oninput={(e) => patchStyle({ fontSize: +e.currentTarget.value })} /></label>
    <label class="wide">Corner roundness {style.radius}px <input type="range" min="0" max="24" value={style.radius} oninput={(e) => patchStyle({ radius: +e.currentTarget.value })} /></label>
    <label class="wide">Spacing <input type="range" min="0.7" max="1.5" step="0.05" value={style.density} oninput={(e) => patchStyle({ density: +e.currentTarget.value })} /></label>
    <label class="wide">Reading width {style.width}px <input type="range" min="480" max="1400" step="20" value={style.width} oninput={(e) => patchStyle({ width: +e.currentTarget.value })} /></label>
    <label class="wide">Your messages
      <select value={style.userStyle} onchange={(e) => patchStyle({ userStyle: e.currentTarget.value as StyleDef["userStyle"] })}>
        <option value="bubble">Bubble</option><option value="bar">Side bar</option><option value="prompt">Prompt line (❯)</option>
      </select>
    </label>
    <label class="wide">Tool actions
      <select value={style.toolStyle} onchange={(e) => patchStyle({ toolStyle: e.currentTarget.value as StyleDef["toolStyle"] })}>
        <option value="rail">Rail</option><option value="card">Cards</option><option value="line">One line ($)</option>
      </select>
    </label>
    <label class="wide">Input prompt symbol <input maxlength="3" value={style.glyph} onchange={(e) => patchStyle({ glyph: e.currentTarget.value })} /></label>
    <button class="danger" onclick={deleteStyle}>Delete style</button>
  </div>
{/if}

{#if ioMode}
  <div class="io">
    <strong>{ioMode === "theme" ? "Theme" : "Style"} JSON</strong>
    <textarea bind:value={ioText} rows="8" aria-label="JSON" placeholder="Paste JSON here to import"></textarea>
    {#if ioError}<p class="err" role="alert">{ioError}</p>{/if}
    <div class="actions">
      <button class="primary" onclick={doImport}>Import this</button>
      <button onclick={() => (ioMode = null)}>Close</button>
    </div>
  </div>
{/if}

<style>
  h3 { margin: 18px 0 8px; font-size: 13px; letter-spacing: 0.02em; color: var(--muted); }
  h3:first-child { margin-top: 0; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; }
  .card { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; padding: 8px; background: var(--bg); border: 1px solid var(--line); border-radius: var(--radius); text-align: left; }
  .card.plain { padding: 10px 12px; }
  .card.on { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  .sw { display: flex; width: 100%; height: 22px; border-radius: var(--radius-sm); overflow: hidden; border: 1px solid var(--line); }
  .sw i { flex: 1; }
  .actions { display: flex; gap: 8px; margin: 10px 0; flex-wrap: wrap; }
  button { background: var(--raised); color: var(--text); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 5px 12px; }
  button.card { background: var(--bg); }
  button.primary { background: var(--accent); color: var(--accent-ink); border-color: transparent; font-weight: 600; }
  button.danger { color: var(--bad); grid-column: 1 / -1; justify-self: start; }
  .editor { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; padding: 12px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--bg); }
  .wide { grid-column: 1 / -1; display: flex; flex-direction: column; gap: 3px; font-size: 13px; }
  .color { display: flex; gap: 8px; align-items: center; font-size: 13px; }
  .color input { width: 34px; height: 24px; padding: 0; border: 1px solid var(--line); background: none; }
  input:not([type="color"]):not([type="range"]), select, textarea { background: var(--surface); color: var(--text); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 5px 8px; font: inherit; }
  textarea { width: 100%; font-family: var(--mono); font-size: 12px; }
  .io { margin-top: 12px; display: flex; flex-direction: column; gap: 6px; }
  .err { color: var(--bad); margin: 0; }
  small { color: var(--muted); }
</style>
