# Architecture

```
Svelte UI (src/)  <-- Tauri commands + "session-event" -->  Rust core (src-tauri/src/)
```

## Rust core
| Module | Responsibility |
|---|---|
| `platform/` | The only place with OS-specific code: config dir, CLI search paths/file names, hidden-console spawn flags. |
| `cli/detect.rs` | Find `claude` (override → PATH → known dirs), run `--version` with a 5 s timeout → `CliStatus`. |
| `cli/events.rs` | The only place that knows the CLI's stream-json shapes. `parse_line` → `Vec<Event>`; unknown shapes become `Event::Unknown`, never panics. |
| `session/` | `SessionManager`: one `claude -p` child per session (`kill_on_drop`), stdout → events → `broadcast` channel, stdin writer for user turns / permission answers / interrupts. `build_args` is pure and unit-tested. |
| `permissions.rs` | `PermissionBroker`: pending `can_use_tool` requests and per-session "always allow" rules. Pure state. |
| `features/` | `Feature` trait + `FeatureRegistry`. Code mode is the first built-in feature; Chat, presets, etc. register the same way. |
| `commands.rs` | Tauri IPC glue; forwards session events to the UI as `session-event`, auto-answers always-allowed permissions, kills all children on exit. |
| `bin/fake_claude.rs` | Test double for the CLI (feature `test-support`). |

Protocol details and gotchas: [PROTOCOL.md](PROTOCOL.md).

## UI (SvelteKit static, Svelte 5 runes)
- `lib/types.ts` mirrors the Rust serde output.
- `lib/reducer.ts`: pure `reduce(state, event)` turning events into transcript items (streaming text, tool cards linked by id, pending permissions, notices). Heavily unit-tested.
- `lib/store.svelte.ts`: app state (CLI status, sessions, active session); the only stateful module.
- `lib/ipc.ts`: typed wrappers over Tauri `invoke`/`listen`; falls back to `lib/mock.ts` in a plain browser (`npm run dev`) so UI work needs no backend.
- `lib/components/`: `MessageList` (renders a recent window of long transcripts), `Message`, `ToolCard` (collapsed, output truncated at 200 lines), `PermissionPrompt` (the amber "gate"), `Composer`, `Sidebar`, `SetupScreen`.

## Testing
- Rust: unit tests + integration tests against `fake-claude` (`cargo test --features test-support`).
- Real CLI smoke tests (ignored by default): `cargo test --features test-support --test real_cli -- --ignored`.
- UI: `npm test` (Vitest + Testing Library).
- Full app end-to-end (real app + real CLI, driven over WebView2's debug port): `node tools/e2e.mjs` (Windows).
