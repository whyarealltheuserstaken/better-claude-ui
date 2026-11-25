# Handoff

_Last updated: 2026-11-25 (session 2) · Written so a fresh Claude Code session on another machine can resume cold._

**Read order for a new session:** this file → `docs/PROGRESS.md` → `docs/superpowers/specs/2026-11-24-better-claude-ui-design.md` (approved design) → `docs/superpowers/plans/` (plans) → `docs/PROTOCOL.md` (CLI protocol facts) → `docs/ARCHITECTURE.md`.

---

## 1. What this project is, and the owner's expectations

**BetterClaudeUI** (repo `whyarealltheuserstaken/better-claude-ui`, public, MIT, unofficial) is a lightweight desktop app that wraps the real `claude` CLI so the owner gets *all* of Claude Code's power with a far better UI than a terminal. It is a custom launcher, not a reimplementation.

What the owner asked for, in their own terms:
- Full Claude Code CLI functionality, better UX/UI than a terminal. They are going to use Claude and Claude Code heavily.
- **Chat mode and Code mode** in one app (like Claude Desktop's two modes).
- **Experience tiers: Beginner / Intermediate / Advanced** ("settings that allow beginners, intermediates and advanced users to use it effectively").
- **Multi-agent features with options to enable**: coordinator + workers with cross-agent communication, and popular workflows like **research**. The owner "has no idea how to set it up", so the app must offer guided presets.
- **Very light** (hence Rust + Tauri, not Electron).
- **All platforms**: Windows 10/11, macOS Intel + Apple Silicon (universal build), Linux. Windows first.
- Open source on GitHub with a real development structure, **room for future add-ons**, and a good **handoff + progress tracker** for developing the app itself.
- Name: `BetterClaudeUI` / repo `better-claude-ui` (chosen for search discoverability; the owner accepted the small trademark risk of "Claude" in the name).
- Their question "does the CLI have an edge over Claude Desktop's Code mode?": answered yes, mostly (new features land in the CLI first, it is scriptable, fuller configuration). Don't overclaim specifics; verify.

**How the owner wants you to work (working agreements):**
- Work **autonomously**; decide things yourself. Ask only for critical decisions (irreversible/destructive actions, security-sensitive actions, publishing/pushing to shared places outside the established flow, or a plan so broken every path is a guess).
- **Test it yourself** as far as possible before reporting back. Report when there's a fully working version.
- **Merge your own PRs when CI is green** (agents merge; routine work is done unasked).
- **Be token-efficient**: targeted reads, batched tool calls, short status updates; clearly flag anything the owner must do themselves.
- Workflow used so far: brainstorm → approved design doc → plan → TDD → one PR per task (batched where sensible) → self-review. Skills from the `superpowers` and `frontend-design` plugins are expected to be installed (`superpowers:brainstorming`, `writing-plans`, `executing-plans`, `test-driven-development`, `verification-before-completion`, `finishing-a-development-branch`, `frontend-design`).
- Commit trailer: `Co-Authored-By: Claude <noreply@anthropic.com>` style attribution; PR bodies end with the Claude Code attribution line.
- The repo is **public**: never commit secrets, personal data, local paths, or raw captures (fixtures are scrubbed by `tools/sanitize-fixture.mjs`).
- Note: user-level hooks on the owner's machines (e.g. a "fact-forcing gate" before the first shell command or file write) may block a tool call until you state facts. That's expected: state them and retry.

## 2. Vision (what "done" looks like)

```
┌ BetterClaudeUI ───────────[Chat | Code]──[Beginner ▾]──┐
│ Sessions │  conversation (streaming, collapsible tools) │
│  + New   │  ▸ Created notes.txt            [done]       │
│  proj-A  │  ┃ Create notes.txt?  [Allow][Always][Deny]  │  ← amber "gate" above composer
│  proj-B  │──────────────────────────────────────────────│
│ Presets  │  > message…         model ▾  mode ▾  [Send]  │
└──────────┴──────────────────────────────────────────────┘
```
- **Tiers** (design §8): Beginner = clean chat, tool actions in plain language, safe permission defaults (never offers bypass), one-click presets with explainers. Intermediate = diffs, file tree, permission-mode picker, MCP/skills panels, preset editor. Advanced = raw event stream, tokens/cost, hooks, raw `--agents` JSON editor, extra CLI flags, direct settings.json, embedded-terminal fallback, bypass-permissions only behind a confirm.
- **Presets** (design §9): Coordinator + Workers; Deep Research (parallel researcher subagents → synthesizer writes a cited report to a file); Code + Review (implementer, then independent read-only reviewer). Built on the CLI's native `--agents`. Honest limit shown in UI: agents talk through the coordinator and shared files, not peer-to-peer.
- **Chat mode**: same process type with `--tools ""` (no tools), scratch cwd, own session list; runs on the user's existing `claude` login (no API key).
- **Extensible**: `Feature` registry (Rust) + UI slot registry; presets are data files; themes are CSS-variable files. See `docs/EXTENDING.md`.
- **Targets**: installer < 15 MB, idle RAM < 100 MB, cold start < 1.5 s (measure in M5).
- Visual direction: dark-first deep blue-graphite, one periwinkle accent, **amber reserved for the permission gate**, system fonts only (keeps it light), left-aligned readable column (max 780px). Auto light theme via `prefers-color-scheme`. Deliberately avoids cream/terracotta and black/acid-green clichés.

## 3. Current state (honest)

**Not finished.** Milestones M0 and M1 (foundation + core Code mode) are done and verified. M2–M6 are **not started**:

| Milestone | Status |
|---|---|
| M0 spike (protocol) + M1 core Code mode | **Done** (see below) |
| M2 Chat mode, session list/resume, model/mode switching | **Done in PR #2** (slash-command list deferred) |
| M3 Tiers + settings + onboarding | **Done in PR #2** |
| M4 Multi-agent presets | **Done in PR #2**; parallelism + full Deep Research run not yet verified end to end |
| M5 Polish, installer, screenshots, measure perf targets, v0.1.0 (Windows) | Not started |
| M6 macOS (universal) + Linux release artifacts | Not started (CI builds/tests already pass on all three) |

**What works today (Windows, verified):** launch app → detects `claude` (shows version) → choose folder → starts a real session → streams replies with markdown + code highlighting → tool calls as collapsible cards with plain-language summaries → permission prompts (Allow / Always allow `<tool>` / Deny) answered over the CLI's control protocol → interrupt (Esc/Stop) → multiple sessions in sidebar → setup screen when the CLI is missing/unusable → kills all child processes on exit.

**Verification evidence (all run this session):**
- Rust: 42 tests (34 unit + 8 integration against `fake-claude`), clippy `-D warnings` clean, fmt clean.
- UI: 34 Vitest tests pass; `npm run check` 0 errors.
- Real CLI smoke tests (`--ignored`): simple prompt streams "pong"; permission **deny** blocks the write; **interrupt** ends the turn in ~57 ms.
- Full app E2E (`node tools/e2e.mjs`): real app + real Claude, driven over WebView2 debug port: permission prompt appears, Allow clicked, file created with expected content, 3 tool cards rendered. PASSED.
- CI (GitHub Actions) green on windows-latest, macos-latest, ubuntu-latest, and UI job (PR #1).
- **Release build (Windows, measured 2026-11-25):** NSIS installer **1.57 MB**, MSI 2.28 MB, `better-claude-ui.exe` 4.7 MB; main window visible in **0.39 s**; idle memory with 7 processes (app + WebView2 helpers) = **~147 MB private** (main exe alone 26 MB; the naive working-set sum of 342 MB double-counts shared pages). So size and startup beat the targets, but **idle RAM misses the <100 MB target** because WebView2 itself has a floor. Recommendation: relax the target to ≲150 MB (still far below Electron) unless M5 finds savings (e.g. avoid loading highlight.js languages eagerly, trim UI work at idle).

## 4. How to build, run, test

Prereqs: Node 20+ (22 in CI), Rust stable (MSVC toolchain + VS Build Tools on Windows), WebView2 (preinstalled on Win 11), Tauri prerequisites for your OS, the `claude` CLI installed **and logged in**.

```
npm install
npm run tauri dev                                   # run the app (Vite on :1420)
npm run dev                                         # UI only in a browser, using src/lib/mock.ts as a fake backend
npm run check && npm test                           # UI types + Vitest
cargo test --manifest-path src-tauri/Cargo.toml --features test-support
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --features test-support -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --features test-support --test real_cli -- --ignored --nocapture   # real CLI, uses tokens
node tools/e2e.mjs                                  # full app E2E (Windows; E2E_SHOTS=<dir> saves screenshots; E2E_PORT overrides 9477)
```
Re-capturing protocol fixtures: `tools/capture-fixtures.mjs` then `tools/sanitize-fixture.mjs` (see header comments).

## 5. Architecture in one paragraph
Rust core spawns one `claude -p --input-format stream-json --output-format stream-json --include-partial-messages --verbose --permission-prompt-tool stdio` child per session; stdout lines → `cli/events.rs` (`parse_line` → typed `Event`s, tolerant) → `SessionManager` broadcast → Tauri `session-event` → Svelte store → pure `reduce()` → components. Permissions go through `PermissionBroker` (pending + per-session always-allow) and are answered by writing a `control_response` to the child's stdin. Details: `docs/ARCHITECTURE.md`, `docs/PROTOCOL.md`.

## 6. Hard-won facts (don't rediscover)
1. **`--permission-prompts host` alone never prompts** (it auto-denies with a `permission_denied` system event). You need **`--permission-prompt-tool stdio`** to receive `control_request`/`can_use_tool`. No `initialize` handshake is required.
2. Permission answers: `{"type":"control_response","response":{"subtype":"success","request_id":ID,"response":{"behavior":"allow","updatedInput":<input>}}}` or `{"behavior":"deny","message":"…"}`. Verified, including that deny truly blocks.
3. Interrupt: `{"type":"control_request","request_id":X,"request":{"subtype":"interrupt"}}` works (turn ends with a normal `result`).
4. `--verbose` is required with stream-json output. PowerShell drops empty-string args (`--tools ""`); Rust `Command::arg("")` is fine.
5. User hooks/plugins run inside sessions and emit many `system` events (hook_started, commands_changed, …) and can reject tool calls; the parser treats unknowns as `Info`/`Unknown`. Consider `--setting-sources` for an "isolated" option.
6. WebView2 remote debugging: another WebView2 app (e.g. Lenovo Vantage) may already own port 9222, so use a private port (the E2E uses 9477) and filter pages by URL.
7. Tauri template here is **SvelteKit + adapter-static** (UI in `src/`, not `ui/` as the plan sketched). `ssr=false`.
8. Windows release builds: see Known issues (rustc crash).

## 7. Rulings I made (cost if wrong in brackets)
- UI lives in `src/` (SvelteKit template) instead of `ui/` [low].
- `parse_line` returns `Vec<Event>` (a `user` line can carry several tool_results; plan said `Option`) [low].
- No separate `ToolUse` event: tool uses ride inside `AssistantMessage { blocks }`; the reducer creates tool items [low].
- `fake-claude` is a feature-gated `[[bin]]` (`test-support`, `autobins=false`, `default-run`) rather than inside `tests/` [low]; integration tests are gated with `#![cfg(feature = "test-support")]`; CI uses `--features test-support`.
- Long transcripts: render a recent window of 150 items with "Show earlier" instead of full virtualization [medium: very long single messages still render fully].
- Batched plan tasks T2–T11 into two PRs instead of one PR per task [low].
- Permission "always allow" is **in-memory per session** (persisted rules arrive with settings in M3) [low].
- CSP is strict in production, `null` only for dev (ADR 0002).
- Chat mode will reuse the CLI with `--tools ""`; no API-key mode in v1 [medium: some claude.ai Chat features won't exist].

## 8. TDD honesty
The parser, broker and registry were written test-first with a RED run observed. `platform`, `cli/detect`, `session` unit tests, `tools.ts`, `markdown.ts` and the component tests were written alongside their implementation (shell tooling was intermittently unavailable at times). Session behavior is additionally covered by 8 integration tests + 3 real-CLI smoke tests + the app E2E. When extending, follow strict RED→GREEN.

## 9. Bugs found & fixes (log)
| Issue | Cause | Fix |
|---|---|---|
| No permission prompts ever arrived | `--permission-prompts host` isn't sufficient | add `--permission-prompt-tool stdio`; documented in PROTOCOL.md |
| `--tools ""` "argument missing" | PowerShell drops empty args | only affects shell experiments; Rust passes it correctly (unit-tested) |
| Parser test failed linking tool_use↔tool_result | fixture's first Write was rejected by a user hook and its result was scrubbed | test now asserts *some* tool_use links to a result |
| clippy: collapsible_if / unnecessary clone | edition 2024 let-chains; `from_ref` | fixed |
| E2E attached to wrong window | Lenovo Vantage held port 9222 | private port 9477 + page URL filter |
| Events could arrive before `start_session` resolved | race in store | store creates state on first event |
| Fixtures leaked local paths/hook noise | raw captures | `sanitize-fixture.mjs` scrubs paths, drops noisy events |
| `npm run tauri build` (release) crashed | `rustc` died with `STATUS_STACK_BUFFER_OVERRUN` compiling the `windows` crate at opt-level 3 (first attempt, default jobs, other apps running) | retry with `CARGO_BUILD_JOBS=2` **succeeded** (use this on this machine) |

## 10. Known issues / risks / unverified
- **Release build** on the author's Windows machine hit a rustc crash once (above); `CARGO_BUILD_JOBS=2` fixed it. If it recurs: lower jobs, close other apps, or try `opt-level="s"`/`codegen-units` tweaks; rustc 1.98.1 used.
- **Idle RAM target** (<100 MB) is missed on Windows (~147 MB private); see §3.
- **macOS/Linux:** CI builds and tests pass, but the app has **never been run** on real macOS/Linux hardware. Universal macOS build, Linux packaging (AppImage/.deb), and signing/notarization are unbuilt (M6). Windows installer is unsigned → SmartScreen warning.
- Parallel subagent output distinguishability (`parent_tool_use_id`) is assumed from the protocol, **not yet verified** with `--agents` (M4 must verify before building Deep Research).
- Subscription/usage-limit behavior when many agents run is unknown; surface cost/usage in Advanced.
- `ToolCard` shows raw JSON input for non-command tools; no diff viewer yet (planned for Intermediate tier).
- No session persistence/resume yet (CLI `--resume <cliSessionId>`; the id is captured in `SessionState.cliSessionId`).
- No model/permission-mode pickers yet (`StartOptions` already carries `model`/`permission_mode`).
- GitHub issues/labels/project board for M2–M6: PROGRESS.md is the source of truth; epic issues may not exist yet.

## 10b. Session 2 notes
- PR #2 (branch `feat/m2-m3-chat-settings-tiers`) holds M2-M4. CI green on all platforms; locally: Rust 44+8 tests, clippy/fmt clean, `npm run check` 0 errors, 42 Vitest tests. **Its merge was blocked by the permission classifier, so it may still be open: merge it first.**
- Not yet exercised in the real app: Chat mode, resume, pickers, onboarding, presets UI (only unit tests + CI). Run `npm run tauri dev` and click through, then re-run `node tools/e2e.mjs`.
- `--agents` verified with the real CLI: delegation goes through the `Agent` tool; subagent events carry `parent_tool_use_id`.
- Config lives in `<config_dir>/config.json`; transcripts in `transcripts/`; user presets in `presets/*.json`.
- Tooling gotchas: Python is not installed; use Node for scripted edits. npm registry needs a non-restricted network.

## 10c. Setup wizard, themes, styles (session 2, later)
- `cli/setup.rs`: `auth_status` (parses `claude auth status`), `run_streaming` (installer/login output -> `setup-log` events). Installer command per OS is in `platform::installer_command` (official `claude.ai/install` scripts). Commands: `auth_status`, `installer_preview`, `run_setup_step`.
- UI: `SetupWizard.svelte` gates the app until the CLI is found and signed in ("Continue anyway" if status is unknown). Appearance: `theme.ts`, `Appearance.svelte`, applied as CSS variables on `<html>` from `+page.svelte`.
- The installer and login flows are unit-tested and `auth_status` is verified against the real CLI, but the install + browser login flows have NOT been run end to end on a clean machine.
- The app does not bundle the Claude CLI (redistribution/licensing); the wizard downloads Anthropic's official installer with the user's consent.

## 10d. Usage tracking and widgets (session 2, later)
- **Protocol facts (verified on the real CLI):** `result.total_cost_usd` and `result.modelUsage` are CUMULATIVE for the session process; top-level `result.usage` is per turn. `usage.rs::DeltaTracker` diffs them per (session, model); never record raw values. `rate_limit_event.rate_limit_info.unifiedWindows` gives `five_hour`/`seven_day` `utilization` (0..1) and `resetsAt`. `claude auth status` includes `subscriptionType` (plan). Costs are API list-price estimates, not what a subscriber pays; the UI says so. There is no API for invoices, so the app links to claude.ai/settings/usage and console billing instead of faking billing data.
- Ledger: `<config>/usage.jsonl` (append-only), limits snapshot: `<config>/limits.json`. Summaries are computed in Rust (`usage::summarize`) with the local UTC offset passed from the UI.
- Widgets live in `src/lib/widgets/` + `components/HomePage.svelte`; list/order in `config.home_widgets`.
- **Deep Research finding:** background subagents return their `Agent` tool_result immediately (~0.6 s after launch) while still working, so a delegation card shows "done" early. They do run concurrently. Consider a "working in background" state.
- Python is not installed; use Node. The Bash tool breaks on heredocs containing apostrophes, so write scripts with the Write tool.

## 10e. Capabilities, slash commands, editors (session 2, later)
- **Protocol facts (verified):** `system/init` is emitted only with the FIRST turn. The `initialize` control request (`{"type":"control_request","request_id":"bcu-init","request":{"subtype":"initialize"}}`) works before any message and returns `commands` (with descriptions), `agents`, `models` (value/displayName), `available_output_styles`, version and the account (we deliberately drop the account/email). `SessionManager::start` now sends it automatically; the reply becomes `Event::Initialized`. `init` (first turn) additionally carries skills, tools, MCP server status and plugins (`Event::SessionInit.caps`).
- `files.rs` edits only four fixed targets (user/project CLAUDE.md and settings.json), validates settings JSON, writes a `.bak`. `run_cli` runs only allow-listed `claude` subcommands (`mcp list|get|add|remove`, `plugin list`) with no shell. MCP form input is validated in `mcp.ts` (names cannot start with `-`).
- Tauri `dragDropEnabled` is false so HTML5 file drops reach the page.
- E2E: `node tools/e2e.mjs [attach|caps]`. The `caps` scenario temporarily sets your tier to Intermediate and restores it.

## 10f. Chat power-ups (session 2, later)
- **Bug found and fixed:** `--tools ""` only disables BUILT-IN tools. The user's MCP servers (e.g. GitHub, browser control) stayed available in Chat. Chat now also passes `--strict-mcp-config` (verified: 0 tools, or exactly WebFetch+WebSearch with web search on). If you add other restricted modes, remember this.
- `--effort low|medium|high|xhigh|max` is validated in Rust (`is_effort`) before being passed.
- "Continue in terminal" (`platform::terminal_launch`): Windows `cmd /C start`, macOS `osascript` (Terminal), Linux `x-terminal-emulator`. Only the Windows path has been exercised (and only its argument construction in tests: it was not launched live). macOS/Linux paths are unverified.
- Command palette is data-driven (`palette.ts`, items built in `+page.svelte`); add actions there.

## 10g. Projects and search (session 2, later)
- Projects live in `config.projects` (validated by `projects.ts`, instructions up to 20,000 chars). They become `--append-system-prompt`; with an agent team the two are merged into ONE flag (`presets::cli_args_with`), because repeated flags may not stack. `SavedSession.project` lets resumed conversations keep their project.
- The new "projects" Home widget is in the default list; users who already customised their widgets must enable it via Customize.
- Search (`search.rs`) scans `<config>/transcripts/*.json` (user + assistant text only, newest first, 30 hits). Transcripts are saved at the end of each turn.

## 10h. Artifact preview and dictation (session 2, later)
- Code blocks get a Copy bar (all) and Preview (html/svg). Preview uses `<iframe sandbox="" srcdoc>` AND a CSP meta tag injected by `preview.ts` (default-src 'none'; img-src data:). Do not add `allow-scripts`/`allow-same-origin` without a fresh threat review: previews render model output.
- Dictation (`dictation.ts`): WebView2 exposes `webkitSpeechRecognition` (probed with `node tools/e2e.mjs probe`). Real recognition was NOT exercised: it may need microphone permission and an internet speech service. Clicking the mic in an automated run could raise an OS permission prompt, so tests do not click it.
- Dev-only gotcha for browser test scripts: with Vite HMR, `import("/src/lib/store.svelte.ts")` from `page.evaluate` can return a different module instance than the app's; drive the UI instead (the Tauri E2E scenarios are unaffected).

## 10i. E2E safety rules (learned the hard way)
- The Tauri E2E scenarios (`node tools/e2e.mjs [attach|caps|chat|projects|probe]`) run against the developer's REAL app data (`%APPDATA%/better-claude-ui`, `~/.claude`) and the real CLI. They must never delete anything they did not create.
- Incident (2026-11-25): a first version of the cleanup compared "recents now" against a snapshot taken before the app had finished loading its config, so it treated every saved conversation as test data and deleted two real ones. They were rebuilt from the CLI's own session files (`~/.claude/projects/<folder>/<id>.jsonl`), which is a useful recovery path: the CLI keeps its own copy of every session.
- Rule now: `tidy()` in `tools/e2e.mjs` only forgets conversations whose `cliSessionId` belongs to a session that is LIVE in the freshly launched app (opened by the test). Never use a before/after diff of saved history. Scenarios that change settings (`tier`, `projects`) restore them in a `finally`.
- E2E spend still appears in the Usage ledger (it is real spend).

## 11. Next steps (in order)
0. PRs #2 and #3 are merged (M2-M4 + UI polish). The owner confirmed Code and Chat work in `tauri dev`; presets, resume and Settings still deserve a manual click-through.
1. **Merge PR #1** (CI green) and tag `v0.0.1-alpha`; record release-build size/RAM in PROGRESS.md.
2. ~~Tighten CSP~~ done (ADR 0002); release build smoke-tested under it.
3. **M2:** model/permission-mode pickers (pass via `StartOptions`; `--model`, `--permission-mode`), session persistence + resume (`--resume`), **Chat mode** (`no_tools: true`, scratch cwd, mode switch in the header, registered as a `Feature`), slash-command list via the `initialize` control request.
4. **M3:** settings store (`platform::config_dir()`), tier switch (Beginner/Intermediate/Advanced) gating UI per design §8, onboarding, persisted always-allow rules, diff viewer for Edit/Write.
5. **M4:** presets as data files → generate `--agents` JSON + appended system prompt; **first verify** parallel subagents and event attribution against the real CLI; Deep Research must write a cited report file.
6. **M5/M6:** polish, installer, README screenshots, perf measurements vs targets, release workflow producing Windows + macOS universal + Linux artifacts, signing notes.

## 12. Setting up on a new machine
1. Install Node 20+, Rust (rustup, MSVC on Windows), Tauri prerequisites, git, the `claude` CLI; run `claude` once to log in.
2. Install the same Claude Code plugins (`superpowers`, `frontend-design`); the owner's personal memory/config does **not** travel with the repo, which is why working agreements are written above.
3. `git clone https://github.com/whyarealltheuserstaken/better-claude-ui && cd better-claude-ui && npm install`, then run the commands in §4 to confirm a green baseline before changing anything.
4. Update this file and `docs/PROGRESS.md` at the end of every session.
