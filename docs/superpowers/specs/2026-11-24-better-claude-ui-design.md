# BetterClaudeUI — Design

Date: 2026-11-24 · Status: DRAFT, awaiting approval · Repo: `better-claude-ui` (public, MIT)

## 1. Intent
A light desktop app that wraps the real `claude` CLI so you get all of Claude Code's power with a far better UI than a terminal, plus a Chat mode, experience tiers (Beginner / Intermediate / Advanced) and guided multi-agent presets. The user will use Claude heavily and wants one fast, pleasant place for it.

**Why wrap the CLI:** the CLI gets new features first (hooks, plugins, skills, MCP, subagents, slash commands) and is the engine the Agent SDK uses. Driving it means nothing is re-implemented and new CLI features arrive for free.

## 2. Goals
- G1 Full-fidelity Code mode: streaming responses, tool calls, diffs, permission prompts, session resume, slash commands, model and permission-mode switching.
- G2 Chat mode: conversational use with no tools, in the same app, on the user's existing `claude` login (no API key).
- G3 Experience tiers that change what the UI shows and defaults, switchable any time.
- G4 Multi-agent presets, toggleable, built on the CLI's native subagents (`--agents`): Coordinator+Workers, Deep Research, Code+Review.
- G5 Light: installer target under ~15 MB, idle RAM under ~100 MB, cold start under ~1.5 s.
- G6 Open-source project hygiene: CI, tests, issue templates, contributing guide, releases.

## 3. Non-goals (v1)
- Not a replacement for the `claude` binary; it must be installed and logged in. The app detects and guides the user otherwise.
- No direct Anthropic API-key mode, no non-Anthropic models.
- No true peer-to-peer agent messaging (not reliably supported by the CLI). Cross-agent communication = through the coordinator + shared files in the workspace.
- No mobile or web version. Windows first; macOS/Linux builds after v1 (Tauri makes this cheap, but untested).
- No scraping or modifying Claude Desktop.

## 4. Anti-goals (failures even if it "works")
- Heavy, slow or Electron-like footprint.
- Silently weakening safety: bypassing permissions must never be a default or one-click for Beginner.
- Losing features vs terminal with no escape hatch (Advanced always offers raw flags and an embedded terminal fallback).
- Using Anthropic branding as if official. README states it is unofficial.

## 5. Constraints
- Windows 11 dev machine; Node 26, Rust (cargo), Python, git available. `gh` not installed; GitHub via MCP tools.
- Runs on the user's `claude` CLI (v2.1.x). Verified flags: `-p`, `--output-format stream-json`, `--input-format stream-json`, `--include-partial-messages`, `--permission-prompts host`, `--permission-mode`, `--agents`, `--tools ""`, `--resume`, `--session-id`, `--model`, `--add-dir`, `--mcp-config`, `--append-system-prompt`, `--setting-sources`.
- CLI JSON event schema may change between versions → isolate parsing in one module with tolerant parsing and fixture tests.

## 6. Approaches considered
| | Approach | Trade-off |
|---|---|---|
| A | **Tauri v2 (Rust core + Svelte/TS UI in WebView2)** | ~10 MB, low RAM, rich UI quickly. Web tech for the view layer. **Chosen by user.** |
| B | Pure Rust GUI (egui/iced) | Lightest, but rich markdown/diff UI is slow to build and looks rough. |
| C | Electron | Easiest but 150 MB+; violates "very light". |

Integration layer options (builder's call, decided here): (1) spawn `claude -p` with stream-json in/out per session — **chosen**; (2) Agent SDK (Node sidecar) — heavier, adds a runtime; (3) embed a PTY terminal — keeps terminal UX, defeats purpose (kept only as Advanced fallback).

## 7. Architecture
```
Svelte UI  <-- Tauri IPC events -->  Rust core
                                       ├─ session manager (1 child process per session, tokio)
                                       ├─ stream-json parser -> typed events (isolated module)
                                       ├─ permission broker (host-answered prompts)
                                       ├─ preset engine (builds --agents JSON + system prompt)
                                       ├─ settings store (tier, defaults, per-project)
                                       └─ cli detector (path, version, login state)
```
- Session = a long-lived `claude -p --input-format stream-json --output-format stream-json --include-partial-messages --permission-prompts host` child. User messages go to stdin as JSON; events stream from stdout.
- Chat mode = same process type with `--tools ""`, no project cwd (a scratch dir), own session list.
- Presets generate `--agents` JSON plus an appended system prompt telling the main agent to act as coordinator; shown to the user in Advanced ("what will actually run").
- Frontend: Svelte 5 + TypeScript + Vite; markdown + syntax highlighting; virtualized message list for long sessions.

## 8. Experience tiers
| | Beginner | Intermediate | Advanced |
|---|---|---|---|
| View | Clean chat, tool actions summarized in plain language | + diffs, file tree, tool detail | + raw event stream, token/cost, hooks, flags |
| Permissions | Ask for everything risky; explanations; never offers bypass | Mode picker (default/acceptEdits/plan) | All modes incl. bypass behind confirm |
| Multi-agent | One-click presets with explainers | Preset editor | Raw `--agents` JSON editor |
| Config | Guided onboarding | MCP/skills/plugins panels | Direct settings.json, extra CLI args, terminal fallback |

## 9. Multi-agent presets (v1)
1. **Coordinator + Workers** — main agent plans, delegates to named subagents (researcher, coder, reviewer), merges results.
2. **Deep Research** — coordinator fans out N parallel researcher subagents, then a synthesizer writes a cited report to a file.
3. **Code + Review** — implementer subagent, then independent reviewer subagent with read-only tools.
Each preset: description, what it costs (more tokens), enable toggle, editable prompts in Intermediate+.
Honest limit stated in UI: agents communicate via the coordinator and shared files.

## 10. UI sketch
```
┌ BetterClaudeUI ──────────────[Chat | Code]──[Beginner ▾]─┐
│ Sessions │  conversation (streaming, collapsible tools)  │
│  + New   │  ▸ Edited src/app.ts  [view diff]             │
│  proj-A  │  ⚠ Run `npm test`?   [Allow] [Deny] [Always]  │
│  proj-B  │───────────────────────────────────────────────│
│ Presets  │  > message…        model ▾  mode ▾  [Send]    │
└──────────┴───────────────────────────────────────────────┘
```
Visual direction (frontend-design skill): dark-first, calm, high-contrast, one accent colour, tight typography; decided during build and iterated with the user.

## 11. Development structure
- Repo: `better-claude-ui`, MIT, public. Branch-per-ticket, PR per ticket, squash-merge when CI is green (user's standing preference: agent merges own green PRs).
- Issues: epic + tickets per milestone; labels (`area:core`, `area:ui`, `preset`, `good first issue`).
- CI (GitHub Actions, Windows): `cargo fmt/clippy/test`, `npm run check/test`, Tauri build. Tests: Rust unit tests with recorded stream-json fixtures (TDD at the parser/session seams), frontend component tests (Vitest), a fake-`claude` stub binary for end-to-end tests, plus manual run against the real CLI.
- Docs: README (unofficial notice, install, screenshots), ARCHITECTURE.md, CONTRIBUTING.md, CHANGELOG, issue/PR templates.
- Topics: claude-code, claude-code-gui, tauri, rust, multi-agent, desktop-app.

## 12. Milestones
- M0 Spike (throwaway): prove stream-json round trip + host-answered permission prompt against the real CLI.
- M1 Core: CLI detection, session manager, parser, minimal Code UI (stream, tools, permissions).
- M2 Chat mode, session list/resume, model/mode switching.
- M3 Tiers + settings + onboarding.
- M4 Presets (3) with enable toggles.
- M5 Polish, installer, README/screenshots, v0.1.0 release.

## 13. Decided by user vs. my calls
User decided: Tauri; wrap CLI via streaming mode; Chat + Code modes; tiers; multi-agent/research presets; light; public GitHub repo under their account; name `better-claude-ui` (display "BetterClaudeUI").
My calls (flag to change): Svelte 5; MIT; Windows-first; chat via CLI with tools off; peer-to-peer agent messaging out of scope; size/RAM targets; milestone order.

## 13b. Approved additions (2026-11-24, user)
**Status: design APPROVED by user.**

**Platforms (target):** Windows 10/11, macOS Intel + Apple Silicon (single Universal build), Linux (AppImage + .deb). **Windows ships first** (v0.1.0); mac/Linux follow once CI builds are green on those runners. From day one: no Windows-only code outside a `platform/` module (paths, process spawning, CLI discovery, keychain/config dirs), CI matrix includes `windows-latest`, `macos-latest`, `ubuntu-latest` as soon as M1 lands (build + tests; release artifacts per platform when ready). This supersedes the Windows-first-only line in section 3.

**Extensibility (add-ons):** the app is built as a small core plus *features as modules*.
- Rust side: a `Feature` trait/registry (id, settings schema, event hooks, commands); presets, Chat mode and Deep Research are the first built-in features, so the API is proven by real use.
- UI side: a panel/slot registry (sidebar sections, message-renderer overrides for tool types, settings pages, command-palette entries).
- Presets are data files (JSON/TOML in `presets/` plus user dir) so users add agent teams without code.
- v1 exposes the registry internally and documents it in `docs/EXTENDING.md`; third-party loading (user-dir manifests for presets/themes first, code plugins later) is designed-for, not built, in v1.
- Themes are CSS-variable files in a user dir.

**Handoff and progress tracking (for developing the app):**
- `docs/PROGRESS.md`: milestone checklist with status, updated in every PR.
- `docs/HANDOFF.md`: current state, how to build/run/test, what's in flight, next 3 steps, known issues, decisions and gotchas. Updated at the end of every working session so any agent or human can resume cold.
- `docs/DECISIONS/NNNN-title.md`: lightweight ADRs for non-obvious choices.
- `CLAUDE.md` in repo root pointing agents to HANDOFF/PROGRESS and conventions.
- GitHub: one epic issue per milestone with sub-issues per ticket, plus a GitHub Project board mirroring PROGRESS.md.

## 14. Left to the builder / open risks
- Universal macOS build and Linux packaging can't be verified on this Windows machine; they rely on CI runners and are marked "unverified on real hardware" until someone tests.
- Exact stream-json event shapes and permission-prompt protocol under `--permission-prompts host` — confirmed in the M0 spike before committing to the parser design.
- Whether `--agents` subagents can run in parallel as the Research preset assumes; if not, the preset falls back to sequential and says so.
- Subscription/usage-limit behaviour when many agents run; surface cost/usage in Advanced.
- Code signing for the installer (unsigned builds trigger SmartScreen): documented, not solved in v1.
