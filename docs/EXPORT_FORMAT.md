# Export format

"Export all my data" (Settings, Your data) writes a new folder, `better-claude-ui-export-YYYYMMDD-HHMMSS`, that is **never** written over an existing folder:

| File | What it is |
|---|---|
| `backup.json` | Everything, restorable by BetterClaudeUI: settings, projects, conversations (with tool activity), usage history, your agent-team presets. |
| `universal.json` | Your conversations in the simple format below, for other tools and other assistants. |
| `conversations/NNN-title.md` | One readable Markdown file per conversation, to paste into any assistant. |
| `README.txt` | What each file is, and a privacy note. |

**Privacy:** these files contain your conversations (and possibly file paths and text you attached). Anyone with the folder can read them. Account details (email, organisation) are never included.

## Universal format (`universal.json`)

```json
{
  "format": "universal-chat-export",
  "version": 1,
  "exported_at": 1795608000,
  "exported_by": "BetterClaudeUI",
  "conversations": [
    {
      "id": "string, stable per conversation",
      "title": "string",
      "source": "claude.ai | chatgpt | better-claude-ui | markdown | other | ...",
      "created": 1700000000,
      "updated": 1700000100,
      "messages": [
        { "role": "user", "text": "string", "at": 1700000001 },
        { "role": "assistant", "text": "string" }
      ]
    }
  ]
}
```

- Times are Unix seconds and may be `null`/absent. `role` is `user` or `assistant`; anything else is ignored on import. `text` is Markdown. Tool activity is **not** in this format (it is in `backup.json`).
- Readers must ignore unknown fields. `version` is bumped only for breaking changes.

## Markdown files

```
# Title

_Source: claude.ai · 2026-03-01 10:10 UTC · exported from BetterClaudeUI_

## You

text

## Assistant

text
```

`## You` and `## Assistant` headings split the turns. The importer also accepts `### User`, `**You:**`, `## Claude`, `## ChatGPT`, `## Grok` and similar. A file with no such headings is imported as one message you can continue from.

## Backup format (`backup.json`)

`{"format":"better-claude-ui-backup","version":1, ...}` with `config`, `conversations` (each with `messages`, and `items` = the app's own transcript items including tool cards), `usage` (the usage ledger), and `presets` (your custom agent teams). A backup from a **newer** version is refused with a clear message.

**What a restore will never do:** it does not turn on "always allow" tool rules, extra command-line flags, or a permission-bypass default, and it ignores onboarding, saved-session lists and update bookkeeping, even if a (possibly hand-edited or malicious) backup contains them. See `sanitize_settings` in `src-tauri/src/exchange/import.rs`.

## Importing other assistants' exports

| Source | How to get it | What is read |
|---|---|---|
| Claude.ai | Settings, Privacy, Export data (a ZIP arrives by email) | `conversations.json`, `projects.json` from the ZIP. Account files such as `users.json` are never read. Attached files are listed by name only. |
| ChatGPT | Settings, Data controls, Export data (a ZIP) | `conversations.json` (also the `conversations-NNN.json` shards). The conversation tree is flattened to the branch you last saw; hidden, system and tool messages are skipped. |
| BetterClaudeUI | `backup.json` or an export folder | everything in the backup |
| Anything else | a Markdown or text file, or `universal.json` | see above |
| Other JSON (for example Grok via a third-party exporter) | whatever the tool produces | **best effort**: lists of conversations that contain messages with a role/sender and text. A warning is shown. |

**Caveats, stated plainly.** Claude.ai's and ChatGPT's formats are not officially documented; the importers follow community descriptions and were tested against fixtures built from those descriptions, **not against real exports** (the format can change). Grok has no verified official format at the time of writing, so support is best-effort only. Always read the preview before importing.

Imported conversations go to the **Archive**: read-only, searchable, with a "Continue in a new chat" button (the transcript is attached to the first message, keeping the most recent part if it is very long). They cannot be resumed as live Claude Code sessions because they were never CLI sessions.
