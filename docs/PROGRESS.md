# Progress

Legend: [x] done · [~] in progress · [ ] todo

## Data export and import (requested 2026-11-26; ADR 0004, spec in `docs/EXPORT_FORMAT.md`)
- [x] Export all my data: restorable `backup.json`, documented `universal.json`, one Markdown file per conversation, README with a privacy note; never overwrites a folder
- [x] Import: Claude.ai ZIP, ChatGPT ZIP/JSON (tree flattened to the branch you saw), BetterClaudeUI backup or export folder, Markdown/text, best-effort for other JSON (Grok exporters etc., with a warning); preview before anything is saved; re-imports add nothing
- [x] Archive: read-only imported conversations (searchable, also in Ctrl+K), "Continue in a new chat" with the transcript attached; Archive link in the sidebar
- [x] Safety: untrusted-input limits, allow-listed ZIP reads, restored settings can never re-enable "always allow", extra flags or bypass mode
- [x] Verified in the real app in a throwaway profile (`node tools/e2e.mjs data`): ZIP + ChatGPT + Markdown import, duplicates skipped, junk refused, export files on disk, restore into the same profile adds nothing, and the real CLI used the imported transcript
- [ ] Not verified: **real** Claude.ai / ChatGPT / Grok exports (tested only against fixtures built from community descriptions); Grok has no verified format

## v0.1.0 release gate (owner decision, details in `docs/GOALS.md`)
- [x] **In-app updater implemented and verified in the real app** (ADR 0003, `node tools/e2e.mjs updater`): signed updates, daily quiet check + manual check, release notes, progress, skip version; tampered / wrong-key / replayed installers rejected
- [x] Updater: GitHub signing secrets added; real install-and-relaunch verified on Windows (0.1.0 to 0.1.1, relaunched)
- [x] Updater: protected local key backup in place and machine-verified (`node tools/check-updater-key.mjs`)
- [ ] Updater: an off-machine copy of the key (owner to choose where)
- [ ] A few more features, defined by the owner and built by a different agent (list in `docs/GOALS.md`, currently empty)
- [ ] Then tag and publish v0.1.0 (see the last item of M5 below)

## M0/M1 — Foundation & core Code mode (plan: `docs/superpowers/plans/2026-11-24-m0-m1-core-foundation.md`)
- [x] T1 Repo, scaffold, CI, docs
- [x] T2 Spike: capture real protocol → `docs/PROTOCOL.md`
- [x] T3 Event parser
- [x] T4 Platform module + CLI detection
- [x] T5 Fake `claude` stub
- [x] T6 Session manager
- [x] T7 Permission broker
- [x] T8 Tauri commands + feature registry
- [x] T9 UI shell + session store
- [x] T10 Message list / markdown / tool cards
- [x] T11 Composer + permission prompt UI
- [x] T12 E2E + verification: real-CLI smoke + app E2E pass; release build OK (installer 1.57 MB, window 0.39 s, ~147 MB idle private RAM, misses <100 MB target); tagged v0.0.1-alpha

## M2 — Chat mode, resume, model/mode switching
- [x] Config store (`config.rs`): settings, recents, transcripts, chat scratch dir (Rust, tested)
- [x] Chat mode (`--tools ""`, scratch cwd), Chat | Code switch, own session list
- [x] Session persistence + resume (`--resume`, saved transcripts)
- [x] Model + permission-mode pickers (switch = resume in a fresh process)
- [ ] Slash-command list via `initialize` control request (deferred)

## M3 — Tiers, settings, onboarding
- [x] Tier module (`tier.ts`) gating UI: Beginner / Intermediate / Advanced
- [x] Onboarding (tier choice), Settings panel, persisted always-allow rules
- [x] Diff view for Edit/Write (Intermediate+), raw event log + extra CLI flags (Advanced)
- [x] Bypass-permissions only in Advanced, behind a confirm

## M4 — Multi-agent presets
- [x] Presets as data files (`src-tauri/presets/*.json` + user dir) -> `--agents` + appended system prompt
- [x] Coordinator + Workers, Deep Research, Code + Review
- [x] Agent teams picker UI (Advanced shows exactly what will run)
- [x] Verified `--agents` against the real CLI: main agent delegates via the `Agent` tool, subagent events carry `parent_tool_use_id`
- [ ] Verify truly parallel subagents + a full Deep Research run end to end (uses many tokens)
- [ ] In-app preset editor (Intermediate+); for now users add JSON files to `<config>/presets/`

## Later
## M7 — Full-replacement push (Claude Desktop + Code)
- [x] Verified Deep Research end to end on the real CLI (4 researchers launched back-to-back in the background, writer produced a 7.7 KB cited report, $0.77). Tool: `tools/preset-smoke.mjs`
- [x] Usage ledger (per-turn deltas, JSONL), subscription limit windows (5-hour / weekly) from `rate_limit_event`, daily/monthly budgets
- [x] Home page with configurable widgets (9), Usage page (ranges, per model/project, CSV copy, billing links)
- [x] Attachments: images, PDFs, text/code files (paste, drop, or +). Verified in the real app with the real CLI (`node tools/e2e.mjs attach`)
- [x] Slash-command menu with descriptions (before the first message), real model list from the CLI
- [x] Capabilities panel: MCP servers (status, add, remove, health), skills, agents, plugins, tools
- [x] Instructions and settings editors: project/user CLAUDE.md, project/user settings.json (Advanced), JSON-validated with .bak backups
- Verified in the real app: `node tools/e2e.mjs caps`
- [x] Chat web search (Chat limited to exactly WebSearch + WebFetch), thinking-effort picker, copy message, export conversation as Markdown, Ctrl+K command palette, "Continue in terminal" escape hatch
- [x] Fixed: Chat is now truly tool-free (`--strict-mcp-config`); `--tools` alone left the user's MCP tools available. Verified on the real CLI.
- [x] Model/permission/effort changes before the first message now just restart the empty session
- Verified in the real app: `node tools/e2e.mjs chat`
- [x] Projects: named instructions + optional folder, applied to every conversation started from them (combined with agent-team prompts in one flag); manager panel, Home widget, palette entries. Verified in the real app (`node tools/e2e.mjs projects`)
- [x] Search conversations by content (Rust full-text over saved transcripts), surfaced in the Ctrl+K palette
- [x] Artifact preview for HTML/SVG code blocks: sandboxed (no permissions) frame plus a restrictive CSP inside the document; verified in Edge that a script tag does not run and cannot touch the app. Static only: interactive/JS apps are intentionally not run
- [x] Voice dictation via the webview speech API (mic button appears only where supported). **Not tested with real speech** (needs a microphone and OS speech services); error messages are unit-tested

## M5b — Setup wizard, themes, styles
- [x] In-app setup wizard: detects missing CLI and signed-out state; runs the official installer and `claude auth login` on explicit click, streaming output
- [x] 8 built-in themes + Match system; fully editable custom themes; import/export JSON
- [x] 4 built-in styles (Modern, Terminal, Compact, Reading); editable (font, size, corners, spacing, width, message and tool style, prompt symbol)
- [ ] Verify the installer + login steps end to end on a clean machine/VM (not run here: CLI already installed)

## M5 — Polish and release
- [x] Visual polish pass (PR #3)
- [x] Strict production CSP (ADR 0002); release build verified: NSIS 1.63 MB, MSI 2.35 MB, UI renders with zero CSP/console errors
- [x] README screenshots (docs/screenshots, demo data)
- [x] Idle RAM re-measured: ~157 MB (7 processes); the <100 MB target is not achievable with WebView2 and is retired
- [x] Release workflow + docs/RELEASING.md written (never run)
- [ ] Tag and publish v0.1.0 (owner decision; **blocked on the release gate at the top of this file**)
- [ ] M6 macOS (universal) + Linux release artifacts
