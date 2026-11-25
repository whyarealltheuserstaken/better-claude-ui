# Progress

Legend: [x] done · [~] in progress · [ ] todo

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
## M5b — Setup wizard, themes, styles
- [x] In-app setup wizard: detects missing CLI and signed-out state; runs the official installer and `claude auth login` on explicit click, streaming output
- [x] 8 built-in themes + Match system; fully editable custom themes; import/export JSON
- [x] 4 built-in styles (Modern, Terminal, Compact, Reading); editable (font, size, corners, spacing, width, message and tool style, prompt symbol)
- [ ] Verify the installer + login steps end to end on a clean machine/VM (not run here: CLI already installed)

## M5 — Polish and release
- [x] Visual polish pass (PR #3)
- [x] Strict production CSP (ADR 0002); release build verified: NSIS 1.63 MB, MSI 2.35 MB, UI renders with zero CSP/console errors
- [ ] README screenshots
- [ ] Re-measure idle RAM; decide on relaxing the <100 MB target (WebView2 floor ~147 MB)
- [ ] Release workflow + v0.1.0 tag (Windows first)
- [ ] M6 macOS (universal) + Linux release artifacts
