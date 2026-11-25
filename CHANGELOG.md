# Changelog

## Unreleased
- Planned before 0.1.0 ships: in-app updater, plus a few owner-chosen features (see `docs/GOALS.md`).

## 0.1.0 (candidate, not released)
First complete version, pending the release gate in `docs/GOALS.md`.
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

Known limits: no in-app updater yet; installers are unsigned; macOS and Linux untested on real hardware; dictation and the installer/sign-in flow were not exercised end to end.

