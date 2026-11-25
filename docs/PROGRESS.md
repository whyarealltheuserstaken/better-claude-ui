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
- [ ] M5 Polish, installer, README screenshots, tighten CSP, v0.1.0 (Windows)
- [ ] M6 macOS (universal) + Linux release artifacts
