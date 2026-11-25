# BetterClaudeUI M0+M1 (Foundation & Core Code Mode) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working Tauri app on Windows that starts a real `claude` session, streams responses, shows tool calls, and answers permission prompts, on top of a repo with CI, docs, handoff and progress tracking.

**Architecture:** Rust core spawns one `claude -p` child per session (stream-json in/out), a tolerant parser turns stdout lines into typed events, a permission broker answers host-routed prompts via the UI, and Tauri IPC forwards events to a Svelte 5 UI. Features register through a `Feature` registry from day one.

**Tech Stack:** Tauri v2, Rust (tokio, serde, serde_json, thiserror), Svelte 5 + TypeScript + Vite, Vitest, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-24-better-claude-ui-design.md` (approved 2026-11-24). Later plans (separate files, written when reached): M2 Chat+sessions, M3 Tiers+settings, M4 Presets, M5 Polish+release, M6 macOS/Linux release artifacts.

## Global Constraints
- App name "BetterClaudeUI"; repo `better-claude-ui`; MIT license; README states it is unofficial.
- Tauri v2, Svelte 5, TypeScript; Rust stable. Targets: Windows 10/11 first; macOS Universal + Linux later. No OS-specific code outside `src-tauri/src/platform/`.
- CLI flags used for sessions: `-p --input-format stream-json --output-format stream-json --include-partial-messages --permission-prompts host` (plus `--verbose` if the spike shows it is required).
- Chat mode (later) = `--tools ""`. Never default to bypass permissions.
- Perf targets: installer < 15 MB, idle RAM < 100 MB, cold start < 1.5 s (measured in M5).
- All CLI JSON parsing lives in `src-tauri/src/cli/events.rs`; unknown event/field must never crash, they become `Event::Unknown`.
- CI matrix: `windows-latest` from M1; `macos-latest` + `ubuntu-latest` build+test added in Task 1 as allowed-to-fail until M6.
- Every PR updates `docs/PROGRESS.md`; end of each session updates `docs/HANDOFF.md`.
- Workflow: one branch + one PR per task; squash-merge when CI green.

## Review Focus
1. `claude` not installed / not on PATH / not logged in → app shows a clear setup screen, never a blank window or panic.
2. CLI child dies mid-stream, or stdout emits a partial/invalid JSON line → session shows an error state, other sessions unaffected, no hang.
3. Unknown/new event types from a newer CLI version → ignored or shown as raw in Advanced, never a crash.
4. Very long output (tens of thousands of lines, huge tool results) → UI stays responsive (virtualized list, truncated tool output with expand).
5. User closes the app or a session with a prompt pending → child process is killed, no orphan `claude` processes.

---

## File Structure
```
better-claude-ui/
  README.md LICENSE CLAUDE.md CONTRIBUTING.md CHANGELOG.md
  .github/workflows/ci.yml  .github/ISSUE_TEMPLATE/  .github/pull_request_template.md
  docs/ PROGRESS.md HANDOFF.md PROTOCOL.md ARCHITECTURE.md EXTENDING.md DECISIONS/0001-tauri-and-cli-wrapping.md
  tools/capture-fixtures.ps1        # records real CLI output into fixtures
  src-tauri/
    Cargo.toml tauri.conf.json
    src/main.rs lib.rs commands.rs
    src/platform/mod.rs             # OS differences: config dir, process flags, CLI search paths
    src/cli/detect.rs events.rs     # CLI discovery; typed events + parser
    src/session/mod.rs process.rs   # SessionManager; child process wrapper
    src/permissions.rs              # PermissionBroker
    src/features/mod.rs             # Feature trait + registry
    tests/fixtures/*.jsonl          # real captured streams
    tests/fake_claude.rs            # stub binary replaying fixtures (cargo [[bin]] in tests)
  ui/ (Svelte 5 + Vite)
    src/App.svelte  src/lib/ipc.ts  src/lib/stores/sessions.ts
    src/lib/components/{MessageList,Message,ToolCard,PermissionPrompt,Composer,SetupScreen,Sidebar}.svelte
    src/lib/registry.ts             # UI slot registry
```

---

### Task 1: Repo, scaffold, CI, docs skeleton
**Files:** all root/docs/.github files above; `src-tauri/` and `ui/` from the Tauri Svelte-TS template.
**Interfaces:** Produces: buildable empty app (`npm run tauri dev`), CI workflow, PROGRESS/HANDOFF templates other tasks update.
- [ ] **Step 1:** `git init` in `C:\Users\henry\better-claude-ui`, create public repo `better-claude-ui` via GitHub MCP `create_repository` (description + topics `claude-code, claude-code-gui, tauri, rust, multi-agent, desktop-app`), add remote, push `main`.
- [ ] **Step 2:** Scaffold with `npm create tauri-app` (Svelte, TypeScript); app identifier `dev.betterclaudeui.app`; confirm `npm run tauri build -- --debug` succeeds locally (expected: exe produced).
- [ ] **Step 3:** Write LICENSE (MIT), README (unofficial notice, status, planned features), CLAUDE.md (points to HANDOFF/PROGRESS, conventions: TDD, branch-per-task, update docs), CONTRIBUTING, CHANGELOG, issue + PR templates, ADR 0001.
- [ ] **Step 4:** `.github/workflows/ci.yml`: jobs `rust` (fmt --check, clippy -D warnings, test) and `ui` (npm ci, check, test, build) on windows-latest; mac/ubuntu legs with `continue-on-error: true`. Expected: green on the scaffold.
- [ ] **Step 5:** Create labels, milestone epics M1–M6 and one issue per task below via GitHub MCP; write PROGRESS.md (checklist mirroring them) and HANDOFF.md (how to build/run/test, next steps).
- [ ] **Step 6:** Commit and push; open PR "chore: scaffold" and merge when CI green.

### Task 2: M0 spike — capture real protocol, write PROTOCOL.md
**Files:** Create `tools/capture-fixtures.ps1`, `docs/PROTOCOL.md`, `src-tauri/tests/fixtures/{simple_reply,tool_use,permission_prompt,error}.jsonl`.
**Interfaces:** Produces: ground truth for Tasks 3, 6, 7 (event shapes, how a host-answered permission request/response looks, how to send a user turn on stdin, how to interrupt).
- [ ] **Step 1:** Script runs `claude -p --input-format stream-json --output-format stream-json --include-partial-messages --permission-prompts host` in a temp dir, feeds a prompt on stdin, saves stdout lines verbatim. Capture: plain reply; a prompt causing a `Write` tool use; a permission request (observe and record the exact request shape and how a response must be sent); an error case (bad `--model`).
- [ ] **Step 2:** Verify by hand that every fixture line is valid JSON and that one fixture contains a permission request. Expected: 4 non-empty files; if permission shape can't be elicited, document the finding and fall back to `--permission-mode` + `--allowedTools` in PROTOCOL.md (decision recorded in an ADR) before continuing.
- [ ] **Step 3:** Write PROTOCOL.md: event types seen (with example line each), stdin message format for a user turn, permission request/response format, session id field, how to stop a turn, CLI version captured. Also record whether `--agents` parallel subagents emit distinguishable events (for M4).
- [ ] **Step 4:** Commit fixtures + doc; PR; merge.

### Task 3: Event parser (TDD)
**Files:** Create `src-tauri/src/cli/events.rs`; Test: same file `#[cfg(test)]` using fixtures.
**Interfaces:** Produces: `pub enum Event { SessionInit{session_id:String, model:String}, TextDelta{text:String}, AssistantMessage{text:String}, ToolUse{id:String,name:String,input:serde_json::Value}, ToolResult{id:String,output:String,is_error:bool}, PermissionRequest{request_id:String,tool:String,input:serde_json::Value}, TurnResult{is_error:bool,cost_usd:Option<f64>}, Unknown(serde_json::Value) }` and `pub fn parse_line(line:&str)->Result<Event,ParseError>`. (Exact field mapping follows PROTOCOL.md; adjust names there first if the spike shows differences.)
- [ ] **Step 1:** Tests: `parses_session_init_from_fixture`, `parses_text_delta`, `parses_tool_use_and_result`, `parses_permission_request`, `unknown_type_becomes_unknown_event` (line `{"type":"zzz"}` → `Event::Unknown`), `invalid_json_returns_parse_error_not_panic`, `empty_line_is_ignored` (returns `Ok` skip variant or `None` per signature `Option`).
- [ ] **Step 2:** Run `cargo test -p better-claude-ui events` → FAIL (missing).
- [ ] **Step 3:** Implement via `serde_json::Value` inspection by `type`/`subtype`, not strict structs, so unknown fields never fail.
- [ ] **Step 4:** Run tests → PASS. Commit `feat(core): stream-json event parser`.

### Task 4: Platform module + CLI detection (TDD)
**Files:** Create `src-tauri/src/platform/mod.rs`, `src-tauri/src/cli/detect.rs`.
**Interfaces:** Produces: `platform::config_dir()->PathBuf`, `platform::cli_search_paths()->Vec<PathBuf>`, `platform::configure_command(&mut tokio::process::Command)` (Windows: `CREATE_NO_WINDOW`; others: no-op); `cli::detect::detect(override_path:Option<&Path>)->CliStatus` where `CliStatus::{Found{path:PathBuf,version:String}, NotFound, Unusable{reason:String}}`.
- [ ] **Step 1:** Tests with a temp-dir fake `claude` script/exe: `finds_cli_via_override`, `reports_not_found_when_absent`, `parses_version_output` ("2.1.332 (Claude Code)" → "2.1.332"), `unusable_when_version_command_fails`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement: search override, then `PATH`, then known install dirs (Windows: `%USERPROFILE%\.local\bin`, npm global; mac/linux: `~/.local/bin`, `/usr/local/bin`), run `<path> --version` with 5 s timeout. **Step 4:** Run → PASS. Commit.

### Task 5: Fake `claude` stub for tests
**Files:** Create `src-tauri/tests/fake_claude.rs` (built as a `[[bin]] fake-claude` under a `test-support` feature).
**Interfaces:** Produces: binary that, given `FAKE_CLAUDE_FIXTURE=<path>`, prints fixture lines to stdout with a short delay, reads stdin lines, answers `--version`, and exits when stdin closes. Env `FAKE_CLAUDE_DIE_AFTER=<n>` exits abruptly after n lines (for Review Focus 2).
- [ ] **Step 1:** Test `fake_claude_replays_fixture_lines_in_order` and `fake_claude_exits_after_n_lines`. **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. Commit.

### Task 6: Session manager and process wrapper (TDD)
**Files:** Create `src-tauri/src/session/{mod.rs,process.rs}`.
**Interfaces:** Consumes: `Event`, `parse_line`, `CliStatus::Found.path`, `platform::configure_command`. Produces:
`SessionManager::new(cli_path:PathBuf)`, `async fn start(&self, opts:SessionOptions)->Result<SessionId>`, `async fn send(&self,id:&SessionId,text:String)->Result<()>`, `async fn interrupt(&self,id:&SessionId)->Result<()>`, `async fn stop(&self,id:&SessionId)->Result<()>`, `fn subscribe(&self)->tokio::sync::broadcast::Receiver<(SessionId,SessionEvent)>` where `SessionEvent::{Cli(Event), Error(String), Exited(Option<i32>)}`; `SessionOptions{cwd:PathBuf, model:Option<String>, permission_mode:Option<String>, resume:Option<String>, extra_args:Vec<String>}`. `stop` and `Drop` kill the child (Review Focus 5).
- [ ] **Step 1:** Tests (using fake-claude via `cli_path`): `start_emits_session_init`, `send_writes_json_user_turn_to_stdin` (stub echoes), `stdout_events_are_broadcast_in_order`, `child_crash_emits_exited_and_error_not_hang` (DIE_AFTER), `invalid_json_line_emits_error_event_and_continues`, `stop_kills_child` (process gone), `sessions_are_independent` (kill one, other still emits).
- [ ] **Step 2:** FAIL. **Step 3:** Implement with tokio `Command`, piped stdio, reader task per stream, stdin writer behind a mutex; args built per Global Constraints. **Step 4:** PASS. Commit.

### Task 7: Permission broker (TDD)
**Files:** Create `src-tauri/src/permissions.rs`.
**Interfaces:** Consumes: `Event::PermissionRequest`, `SessionManager::respond_permission(session, request_id, decision)` (added to session API here; writes the response format from PROTOCOL.md). Produces: `PermissionDecision::{Allow, Deny{reason:Option<String>}, AllowAlways}`; `PermissionBroker::{pending(&self)->Vec<PendingPermission>, resolve(&self,request_id,decision)->Result<()>}`; always-allow rules held per session in memory (persisted settings come in M3).
- [ ] **Step 1:** Tests: `request_becomes_pending`, `resolve_allow_writes_response_to_session`, `deny_includes_reason`, `allow_always_auto_answers_same_tool_next_time`, `resolving_unknown_request_errors`, `pending_cleared_when_session_exits`. **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. Commit.

### Task 8: Tauri commands, IPC, feature registry
**Files:** Create/modify `src-tauri/src/{commands.rs,lib.rs,features/mod.rs}`.
**Interfaces:** Consumes: SessionManager, PermissionBroker, detect. Produces Tauri commands `cli_status()`, `start_session(opts)`, `send_message(session_id,text)`, `interrupt(session_id)`, `stop_session(session_id)`, `resolve_permission(request_id,decision)`; Tauri event `session-event` with payload `{session_id, event}`; `trait Feature { fn id(&self)->&'static str; fn register(&self, ctx:&mut FeatureContext); }` and `FeatureRegistry::register/list` (Code mode registered as the first Feature).
- [ ] **Step 1:** Tests: registry `registers_and_lists_features_in_order`, `duplicate_id_rejected`; command-layer unit tests with fake-claude: `start_then_send_emits_ipc_events` using Tauri's mock runtime. **Step 2:** FAIL. **Step 3:** Implement; forward broadcast events to `app.emit("session-event")`; kill all sessions on window close (Review Focus 5). **Step 4:** PASS. Commit.

### Task 9: UI shell, IPC client, session store (TDD)
**Files:** Create `ui/src/lib/{ipc.ts,stores/sessions.ts,registry.ts}`, `ui/src/App.svelte`, `Sidebar.svelte`, `SetupScreen.svelte`.
**Interfaces:** Produces: `ipc.startSession/sendMessage/...` typed wrappers; `sessionsStore` reducing `session-event` payloads into `{messages: Message[], pendingPermissions, status}` with pure `reduce(state,event)`; `registry.registerSidebarSection/Panel`.
- [ ] **Step 1:** Vitest: `reduce_appends_text_deltas_into_one_message`, `reduce_tool_use_then_result_links_by_id`, `reduce_unknown_event_is_kept_raw_not_thrown`, `reduce_exited_sets_status_error`. **Step 2:** FAIL. **Step 3:** Implement reducer + wrappers; App shows `SetupScreen` when `cli_status` ≠ Found with install/login instructions and a path override field (Review Focus 1). **Step 4:** PASS; `npm run check` clean. Commit.

### Task 10: Message list, markdown, tool cards (TDD)
**Files:** Create `MessageList.svelte`, `Message.svelte`, `ToolCard.svelte`.
- [ ] **Step 1:** Component tests: `renders_markdown_code_block_with_highlight`, `tool_card_collapsed_by_default_and_expands`, `tool_output_truncated_over_N_lines_with_show_more` (N=200), `list_virtualizes_10000_messages` (DOM node count stays < 200). **Step 2:** FAIL. **Step 3:** Implement (markdown-it + shiki or highlight.js lazily loaded; windowed list). **Step 4:** PASS. Commit.

### Task 11: Composer and permission prompt UI (TDD)
**Files:** Create `Composer.svelte`, `PermissionPrompt.svelte`.
- [ ] **Step 1:** Tests: `enter_sends_shift_enter_newline`, `composer_disabled_while_session_exited`, `permission_prompt_shows_tool_and_input_and_three_buttons`, `clicking_allow_calls_resolve_permission_with_Allow`, `esc_interrupts_running_turn`. **Step 2:** FAIL. **Step 3:** Implement with the frontend-design skill for a distinct dark-first visual direction (one accent colour, tight type); keep Beginner copy plain-language hooks in place for M3. **Step 4:** PASS. Commit.

### Task 12: End-to-end verification
**Files:** Create `src-tauri/tests/e2e_session.rs`; update PROGRESS/HANDOFF.
- [ ] **Step 1:** E2E test with fake-claude: start → send → receive streamed text → permission request → resolve → turn result; plus crash case. Expected PASS.
- [ ] **Step 2:** Manual run against the real CLI: `npm run tauri dev`, start a session in a scratch dir, ask for a file creation, approve the permission, see diff/tool card, interrupt a long turn, close window and confirm no orphan `claude` processes (`Get-Process claude`). Record results in HANDOFF.md.
- [ ] **Step 3:** Measure idle RAM and cold start; record (target check deferred to M5).
- [ ] **Step 4:** Tag `v0.0.1-alpha`; PR merged; update PROGRESS.md (M0, M1 done) and write next-plan stub for M2.
