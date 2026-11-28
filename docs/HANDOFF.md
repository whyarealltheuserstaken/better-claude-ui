# Handoff

_Last updated: 2026-11-27 · Written so a fresh Claude Code session on another machine can resume cold._

> **v0.1.0 is published** (2026-11-27, https://github.com/whyarealltheuserstaken/better-claude-ui/releases/tag/v0.1.0). The release gate is closed. Statements further down that say it is unreleased or gated, or that the release workflow never ran, are history. **Next:** owner-chosen features for a later version; an off-machine copy of the updater key (now urgent, because installed copies depend on it); and on the next release, check that an installed 0.1.0 updates from the published `latest.json`. Releases are still the owner's call. The workflow warns that `actions/checkout@v4` and `actions/setup-node@v4` target the deprecated Node 20.

**Read order for a new session:** this file → `docs/GOALS.md` (what to build next; **v0.1.0 is gated on the in-app updater**) → `docs/PROGRESS.md` → `docs/superpowers/specs/2026-11-24-better-claude-ui-design.md` (approved design) → `docs/superpowers/plans/` (plans) → `docs/PROTOCOL.md` (CLI protocol facts) → `docs/ARCHITECTURE.md`.

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

**Feature-complete for a 0.1.0 candidate, but NOT releasable yet: the owner gated v0.1.0 on an in-app updater (not started) plus a few more owner-chosen features (see `docs/GOALS.md`).** Do not tag or publish until those are done. Everything below is merged to `main`, CI is green on Windows, macOS and Linux, and every feature marked "real-app verified" was exercised in the actual app against the real `claude` CLI via `node tools/e2e.mjs <scenario>`.

| Area | Status |
|---|---|
| Code mode (streaming, tool cards, permission gate, interrupt, diffs, resume) | Real-app verified (`basic`) |
| Chat mode, truly tool-free incl. MCP; optional web search | Real-app verified (`chat`) |
| Attachments (images, PDFs, text) | Real-app verified (`attach`) |
| Slash menu, Capabilities (MCP/skills/agents/plugins/tools), CLAUDE.md + settings.json editors | Real-app verified (`caps`) |
| Projects, conversation search, Ctrl+K palette, export, effort picker | Real-app verified (`projects`, `chat`) |
| Usage ledger, plan-allowance meters, budgets, Home widgets, Usage page | Unit-tested + screenshot-reviewed; real numbers flow from the CLI |
| Setup wizard (detect CLI, sign-in state) | `auth_status` verified vs the real CLI; **install and browser sign-in flows never run end to end** |
| Themes (8) and styles (4) with editors, import/export | Unit-tested + screenshot-reviewed |
| Agent teams: Coordinator, Deep Research, Code+Review | Deep Research run end to end on the real CLI (`tools/preset-smoke.mjs`); UI picker not click-tested |
| Artifact preview (sandboxed) | Real-app and release-build verified (`preview`) |
| Voice dictation | API present in WebView2; **not tested with real speech** |
| Continue in terminal | Windows only exercised (argument construction); macOS/Linux unverified |
| In-app updater | **Implemented and verified on Windows**: against a local signed server (genuine, tampered, wrong key, replayed older installer, bad JSON, 404, offline) AND a real install-and-relaunch (0.1.0 to 0.1.1, relaunched in about 8 s). GitHub signing secrets are set. **Not yet done:** the owner's private-key backup; macOS/Linux update paths never run (`docs/GOALS.md`) |
| Release workflow | Written (`.github/workflows/release.yml`), **never run** (needs a tag; publishing is the owner's call; has no updater signing yet) |

**Measured (Windows release build, 2026-11-25):** NSIS installer 2.58 MB, MSI 3.57 MB (the updater added about 0.85 MB; earlier figures 1.74/2.51 MB were before it); Home visible in about 0.9 s from launch (including test attach); idle memory about 157 MB private across 7 processes (the app exe itself is 6 MB; the rest is WebView2), rising to about 255 MB after a real chat with a preview open. The original "under 100 MB" target is not achievable with WebView2; treat about 160 MB idle as the realistic figure (still far below Electron).

**Tests:** Rust 100+ unit and 8 integration (134 lib tests), clippy `-D warnings` and fmt clean; UI 148 Vitest tests, `npm run check` 0 errors; 11 real-app E2E scenarios (`basic`, `attach`, `caps`, `chat`, `projects`, `preview`, `updater`, `data`, `limits`, `autorefresh`, `probe`).

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

## 10l. Plan allowance freshness (session 3)
- The allowance (`rate_limit_event.unifiedWindows`) arrives **once per reply and not otherwise**. Nothing in `claude --help`, `claude auth status` or the `initialize` reply exposes it, so there is no free way to poll it. Do not add background polling: every refresh spends a little of the user's allowance.
- `refresh_limits` (commands.rs, `usage::refresh_args`) runs the smallest possible request: `-p --model haiku --tools "" --strict-mcp-config --disable-slash-commands --no-session-persistence --max-turns 1`. **Never add `--bare`**: it skips OAuth/keychain, which breaks subscription sign-in. It records its tiny cost in the ledger (session id `limits-refresh`).
- UI logic is in `src/lib/limits.ts` (as-of label, reset detection, "may be behind"). `node tools/e2e.mjs limits` seeds a stale snapshot with an already-reset window in a throwaway profile and checks the live refresh.

- **Automatic refresh** (`auto_refresh_limits`, `refresh_limits_minutes` in config, default off/15): scheduling rules are pure in `limits.ts` (`shouldAutoRefresh`), the timer is `autoRefreshTick` in the store (first check ~20 s after launch, then every 60 s, runs only when due). `refresh_args` now includes `--setting-sources project` (measured: no plugin hooks, ~2 s, ~5x cheaper, sign-in unaffected). `node tools/e2e.mjs autorefresh` proves it with nothing clicked.
- **Scope of the meters:** the 5-hour/weekly percentages are the account's plan-wide windows as reported by Claude Code (they matched the Claude app to the percent), so they reflect usage elsewhere too. The cost/token tables (Today, month, by model, by project) only count what ran through THIS app. Do not claim either covers a specific other product (for example Cowork) without verifying.

## 10k. Data export / import / Archive (session 3)
- Code: `src-tauri/src/exchange/` (`model` shared types and helpers, `parse` importers, `archive` store, `export`, `import`), commands `export_data`, `inspect_import`, `run_import`, `archive_*` in `commands.rs`; UI `ImportPanel.svelte`, `ArchivePage.svelte`, Settings "Your data", sidebar "Archive"; helpers `exchange.ts`, `archive.ts`. Spec: `docs/EXPORT_FORMAT.md`; decisions and security: ADR 0004.
- **Imported chats are not CLI sessions**, so they live in `<config>/archive/` (not in recents, which are capped at 50) and are read-only; "Continue in a new chat" attaches the transcript to a new chat's first message.
- Archive ids are stable hashes (`imp-<fnv1a>`) so re-imports add nothing; archive items inside a backup keep their id, so restoring on the same machine never duplicates. Search (`search.rs`) covers transcripts AND the archive (a bug where a missing transcripts folder skipped the archive was found by the E2E and fixed).
- Importer formats are from community descriptions only; keep warnings honest and add fixtures if a real export breaks one. The Grok path is generic best-effort.
- **Testing aid:** `BCU_CONFIG_DIR` (debug builds only) redirects the app to a throwaway profile; `node tools/e2e.mjs data` uses it and also builds sample ZIP/JSON/Markdown files. The native file dialog can't be driven (the Tauri bridge is immutable by design), so the E2E replaces the dialog plugin module at the network layer.

## 10j. Updater notes (session 3)
- Design and security: `docs/DECISIONS/0003-in-app-updater.md`. Code: `src-tauri/src/updates.rs` (pure), commands in `commands.rs`, UI state machine in `src/lib/updates.ts`, UI in `UpdatePanel.svelte` and the Settings "Updates" section.
- **Signed builds.** `createUpdaterArtifacts` is on, so `tauri build` signs and needs `TAURI_SIGNING_PRIVATE_KEY` (this CLI version does NOT read `TAURI_SIGNING_PRIVATE_KEY_PATH`; passing the key file path in `TAURI_SIGNING_PRIVATE_KEY` works) and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Without them the bundles are built but the signing step errors.
- **The signature is bound to the version.** The plugin rejects an installer whose signed version differs from the version the manifest announces (replay protection). So the version in `tauri.conf.json` at build time IS the signed version: bump it before tagging. To test locally with another version without editing files: `npm run tauri build -- --config '{"version":"0.1.1"}'`.
- **Local test server:** `tools/update-server.mjs` (signs a dummy payload with the real key, plus tampered / wrong-key / replay / bad-JSON / 404 modes). `node tools/e2e.mjs updater` runs the whole matrix against the real app; add `BCU_REAL_ARTIFACT=<signed setup.exe>` and `BCU_REPLAY_ARTIFACT=<setup.exe signed for an older version>` for the real-installer checks. The tests stop at "Install and restart" and never click it. The debug-only override is the `BCU_UPDATE_ENDPOINT` env var; it does not exist in release builds.
- **Real install test (Windows, modifies this machine, needs the owner's approval):** `node tools/update-install-test.mjs --old <test-0.1.0 setup.exe> --new <signed-0.1.1 setup.exe>`. Preflight refuses to run if the app is already installed or running; it installs silently per-user, drives the real UI, clicks "Install and restart", checks the version changed and the app relaunched, then ALWAYS uninstalls. The "old" build must be a test build with `--config '{"plugins":{"updater":{"endpoints":["https://127.0.0.1:9488/latest.json"],"dangerousAcceptInvalidCerts":true}}}'` (release builds refuse plain-HTTP downloads, which is the hardening working: an earlier run stopped there). The server uses a throwaway self-signed cert (`openssl` required). It rewrites `last_update_check` in the real config, so save and restore `auto_update_check`, `last_update_check`, `skipped_version` around it.
- Result 2026-11-26: PASSED, 0.1.0 to 0.1.1, relaunched. (A first attempt looked like "no relaunch" only because the test's process check had a bug.)
- **Key backup (2026-11-26):** `C:\ProgramData\BetterClaudeUI\updater-key-backup\` (read-only; normal account cannot delete/overwrite/rename; verified). `node tools/check-updater-key.mjs` checks key/backup/public-key/secrets consistency and that the backup can actually sign. Recovery steps are in `docs/RELEASING.md`. Note the password is stored beside the key locally, so this protects against accidental deletion and profile corruption, not against someone with access to the machine, and not against losing the machine: an off-machine copy is still open.
- Keys live outside the repo in `%USERPROFILE%\.bcu-updater\` on the machine that generated them; `*.key` is gitignored. Never print or paste them.

## 10m. UI and UX revamp (finished 2026-11-26)
- Spec and plan: `docs/superpowers/specs/2026-11-26-ui-revamp-design.md`, `docs/superpowers/plans/2026-11-26-ui-revamp.md`. Progress log (local, git-ignored): `.superpowers/sdd/2026-11-26-ui-revamp/progress.md`.
- **Done:** all seven stages (design system, shell, conversation and right panel, Home and Usage, Settings and the other pages, dialogs, usage widget, tray). **Next:** the owner's extra features (section 11), then publishing v0.1.0 only on the owner's go-ahead.
- **Verified** by Vitest, type check, CI, screenshots against the mock backend (`npm run dev`, then `node tools/screenshots.mjs <dir>`; it also checks that the floating widget never covers Deny, Always allow, Allow or Send), and the real app on Windows: E2E `data`, `basic`, `caps`, `projects` and `widget` (throwaway profile) passed on 2026-11-26.
- Widget rules to keep: the composer column draws above the floating widget; its CSS class names must not collide with reading kinds (`as-bar`, `as-ring`); toolbar chips stay alone inside `.chips` because the narrow-window rules count them. The tray should reuse `widget/readings.ts` and `app.widgetData`.
- On the final code every `tools/e2e.mjs` scenario passed (including `tray`), and the title bar followed the light theme. **Not checked:** `tools/update-install-test.mjs` since the layout changed, clicking the real tray icon and the panel's placement and focus behaviour, macOS and Linux (on Linux a missing `libappindicator` may crash the app when the tray is turned on).
- `e2e.mjs` rule: Windows has helper windows with the app's title, so native calls must filter by the app's own process (a title-only search once sent close messages to Explorer's windows).
- Only one copy of the app runs. A debug build and an installed release share the app id, so close one before starting the other.
- Idle memory rose by about 40 MB (see PROGRESS.md); accepted by the owner for now.
- Known small gaps: on macOS the Dock icon does not show a window hidden to the tray; with the tray on, its view is rebuilt on every streamed piece of text; a budget at exactly 80% can read as below it (rounding).
- Two things only a real browser shows: a page's Escape check must run in the capture phase (a closing dialog is gone before a normal window handler runs), and dialogs must use `ui/Dialog.svelte` so focus and Escape work.
- The final review was done by the author: the fresh reviewer did not finish. A separate review is still worth doing.
- Shell heredocs fail on long scripts here: use the Write tool for those.

## 11. Next steps (in order)
1. ~~Build the in-app updater~~ **Done and verified** (ADR 0003). Key safety: a protected read-only local backup exists and `node tools/check-updater-key.mjs` verifies it; still open is an off-machine copy of the key (owner's choice). See "Updater status" in `docs/GOALS.md`.
1b. ~~The UI and UX revamp~~ **Done** (section 10m). **Now: the extra features the owner is defining** (listed in `docs/GOALS.md`). Development stays with Claude Code on one device.
1c. **Only after 1 and 1b: publish v0.1.0** (owner decision). Follow `docs/RELEASING.md`: push a `v0.1.0` tag, let the workflow build a DRAFT release, test the installers, publish. Builds are unsigned (SmartScreen / Gatekeeper warnings).
2. Run the installer + browser sign-in wizard steps on a clean machine or VM (never exercised end to end), and try dictation with a real microphone.
3. Try the macOS and Linux builds on real hardware (CI only builds and tests them); verify "Continue in terminal" there.
4. Click through the agent-teams picker and preset flows once in the real app.
5. Ideas not built: embedded PTY terminal, in-app preset editor, notifications when a turn finishes, code signing (the updater itself is NOT optional: see item 1), a "working in background" state for background subagents (their `Agent` tool_result returns immediately), user-facing theme gallery.

## 12. Setting up on a new machine
1. Install Node 20+, Rust (rustup, MSVC on Windows), Tauri prerequisites, git, the `claude` CLI; run `claude` once to log in.
2. Install the same Claude Code plugins (`superpowers`, `frontend-design`); the owner's personal memory/config does **not** travel with the repo, which is why working agreements are written above.
3. `git clone https://github.com/whyarealltheuserstaken/better-claude-ui && cd better-claude-ui && npm install`, then run the commands in §4 to confirm a green baseline before changing anything.
4. Update this file and `docs/PROGRESS.md` at the end of every session.
