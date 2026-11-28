# Changelog

## 0.1.0 (2026-11-27)
The first public release.

- **New look and layout:** glass sidebar, toolbar and right panel (session controls and activity) over a glow that turns amber while Claude waits; all navigation in the sidebar; Settings, Projects, Capabilities and Instructions are full pages; every theme is kept readable without changing your saved colors. The standard window frame stays.
- **Home message box:** start a chat or coding session by typing.
- **Usage widget:** nine readings, three sizes; right panel, floating, toolbar or hidden; token counts move while Claude replies.
- **System tray / menu bar** (optional, off by default): readings, a waiting icon, and close-to-tray if you turn it on. Nothing can be approved from it. Tested on Windows only.
- Only one copy of the app runs at a time: starting it again brings the running window back.
- **In-app updater**: signed updates only (tampered, wrongly signed and replayed installers are rejected), quiet daily check, manual check, release notes, progress, skip a version, never installs without a click or mid-reply. Verified against a local signed test server and with a real install-and-relaunch on Windows (0.1.0 to 0.1.1).
- **Automatic allowance refresh** (opt-in): refresh the plan meters every 5 to 180 minutes while the app is visible; replies postpone it; pauses after repeated failures. Refreshes skip plugin hooks, so they take about 2 s and cost about $0.0001.
- **Plan allowance freshness**: the usage meters say when they were last updated and why they can lag (Claude Code only reports them with each reply), a window that has reset no longer shows its old percentage, and a Refresh button fetches the live numbers with one tiny request (about a tenth of a cent).
- **Export and import**: one-click export (restorable backup, documented universal JSON, Markdown per conversation), import from Claude.ai and ChatGPT exports, BetterClaudeUI backups and Markdown/text (best-effort for other JSON), preview before saving, a read-only Archive with "Continue in a new chat", and a safe restore that never re-enables risky settings. Tested against fixtures, not real exports.
- **Code mode:** streaming replies, markdown and code highlighting, plain-language tool cards, permission prompts (allow / always / deny), interrupt, diffs, session resume.
- **Chat mode:** genuinely tool-free (including MCP servers), optional web search, attachments (images, PDFs, text files).
- **Setup wizard:** detects missing or signed-out Claude Code; installs it and signs in on request.
- **Experience levels:** Beginner, Intermediate, Advanced.
- **Agent teams:** Coordinator + Workers, Deep Research, Code + Review.
- **Usage tracker:** per-turn token and estimated-cost ledger, plan allowance meters, budgets; Home dashboard with configurable widgets.
- **Projects**, conversation search, Ctrl+K command palette, slash-command menu, Capabilities panel (MCP, skills, agents, plugins, tools), CLAUDE.md and settings.json editors.
- **Themes and styles:** 8 themes, 4 styles, fully customizable and shareable.
- Artifact preview (sandboxed), voice dictation (where the webview supports it), export to Markdown, continue in terminal.
- Strict production CSP; unofficial and not affiliated with Anthropic.

Known limits: installers are not code-signed; macOS and Linux untested on real hardware; dictation and the installer/sign-in flow were not exercised end to end.

