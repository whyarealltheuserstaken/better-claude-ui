# CLI protocol notes (verified against `claude` 2.1.332, 2026-11-24)

Captured with `tools/capture-fixtures.mjs`, scrubbed with `tools/sanitize-fixture.mjs`; fixtures in `src-tauri/tests/fixtures/`. A line starting with `//` in a fixture is a capture annotation (e.g. `// SENT {…}` = what the host wrote to stdin) and is not CLI output.

## Spawn
```
claude -p --input-format stream-json --output-format stream-json \
       --include-partial-messages --verbose \
       --permission-prompt-tool stdio [--model M] [--permission-mode MODE] [--resume ID] [--tools ""]
```
- `--verbose` is required with stream-json output.
- **`--permission-prompts host` alone is NOT enough**: without `--permission-prompt-tool stdio` the CLI never asks; it auto-denies with `{"type":"system","subtype":"permission_denied",…}`. With `stdio`, prompts arrive as `control_request`. No `initialize` handshake is needed.
- Empty-string args (`--tools ""`) are dropped by PowerShell; pass via `Command::arg` in Rust (fine).
- The process stays alive between turns while stdin is open; closing stdin ends the session.

## stdin (host → CLI), one JSON object per line
- User turn: `{"type":"user","message":{"role":"user","content":"text"}}`
- Permission answer, allow: `{"type":"control_response","response":{"subtype":"success","request_id":"<id>","response":{"behavior":"allow","updatedInput":<tool input object>}}}`
- Permission answer, deny: same envelope with `"response":{"behavior":"deny","message":"…"}`. Verified: tool does not run.
- Optional: `{"type":"control_request","request_id":"x","request":{"subtype":"initialize"}}` → `control_response` listing slash commands (useful later for slash-command UI).

## stdout (CLI → host), one JSON object per line
| `type` | notes |
|---|---|
| `system` / `init` | `session_id`, `cwd`, `model`, `tools`, `permissionMode`, … |
| `system` / `hook_started`, `hook_response`, `status`, `commands_changed`, `thinking_tokens`, `permission_denied` | informational; user hooks/plugins produce many of these |
| `stream_event` | `event.type` = `message_start`, `content_block_start`, `content_block_delta` (`delta.type` = `text_delta` {text}, `input_json_delta` {partial_json}, `thinking_delta`), `content_block_stop`, `message_delta`, `message_stop`; also `parent_tool_use_id` (non-null for subagent output) |
| `assistant` | full message: `message.content[]` blocks `text`, `thinking`, `tool_use` {id,name,input} |
| `user` | `message.content[]` `tool_result` {tool_use_id, content, is_error?}; also `parent_tool_use_id` |
| `control_request` | `request.subtype == "can_use_tool"`: `request_id`, `request.tool_name`, `request.input`, `request.description`, `request.tool_use_id`, `request.permission_suggestions[]` |
| `rate_limit_event` | informational |
| `result` | end of turn: `subtype` ("success"…), `is_error`, `result` (text), `total_cost_usd`, `session_id`, `num_turns`, `duration_ms`, `usage` |

Errors: an invalid `--model` yields a normal stream whose `result` has `is_error:true` and `result` = human message (stderr also gets a `[claude-code:…]` line).

## Gotchas
- A user's own hooks (e.g. PreToolUse gates) run inside the session and can reject tool calls; surface hook output rather than hiding it. Consider `--setting-sources` to let users opt out of project/user settings.
- Parallel subagent output is distinguishable by `parent_tool_use_id` on `stream_event`/`assistant`/`user` lines (to be confirmed in M4).
