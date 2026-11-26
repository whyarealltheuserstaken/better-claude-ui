# 0004 — Data export and import

Status: accepted (2026-11-26)

## Decision
Add "Export all my data" and "Import data" (Settings, Your data), plus an **Archive** for imported conversations. Code: `src-tauri/src/exchange/` (`model`, `parse`, `archive`, `export`, `import`), commands in `commands.rs`, screens `ImportPanel.svelte` and `ArchivePage.svelte`, pure helpers `exchange.ts`, `archive.ts`. Format spec: `docs/EXPORT_FORMAT.md`.

## Why an Archive instead of recents
Imported chats are not Claude Code sessions, so they cannot be resumed with `--resume`. Recents are capped at 50 and tied to CLI sessions; an import can bring hundreds. The Archive is a separate store (`<config>/archive/index.json` + one file per conversation), read-only, searchable (also from the Ctrl+K palette), with "Continue in a new chat" that attaches the transcript to the first message (the most recent part if it exceeds the attachment limit).

## Security and privacy
- **Imports are untrusted.** Size limits on everything read (300 MB per file, 600 MB total), ZIP entries are read into memory by an allow-listed base name (never extracted to disk, so no path traversal), limits on conversations, messages and message length, cycle protection when flattening ChatGPT's tree, and ids are validated before they become file names.
- **A restored backup cannot weaken safety.** `sanitize_settings` is an allow-list; `always_allow`, `extra_args`, `default_permission_mode` and others are never restored, and the UI validates again (`settingsPatch`). Restored custom themes and styles go through the same sanitizers as the theme editor.
- **Preview before saving.** Inspecting a file reads it and saves nothing. Account files in provider ZIPs (for example `users.json`) are never read.
- **Exports contain conversations.** The export folder includes a privacy note; account details are not included. Exports never overwrite an existing folder.
- **Idempotent.** Archive ids are stable (a hash of source and the conversation's own id), so importing the same file twice, or exporting and restoring on the same machine, adds nothing. Verified by tests and in the real app.
- The UI owns `config.json`, so Rust returns projects and settings for the UI to merge rather than writing the config itself (avoids a save race); usage and presets are written by Rust.

## Honest limits
- Claude.ai and ChatGPT export formats are not officially documented. Importers follow community descriptions and were tested with fixtures built from them, not real exports. Grok has no verified format; JSON from other tools is read best-effort with a warning.
- Attached files in provider exports are listed by name only. Project documents are not imported (names and instructions only).
- Restored folders for projects are not restored (they belong to the other computer).

## Testing aid added with this
`BCU_CONFIG_DIR` (debug builds only) points the app at a throwaway profile. `node tools/e2e.mjs data` uses it, so it cannot touch real data. The native file dialog is replaced at the network layer in dev mode (the Tauri bridge itself is immutable on purpose).
