# 0001 — Tauri v2 and wrapping the `claude` CLI

Status: accepted (2026-11-24)

- **Tauri v2 (Rust + WebView)** over Electron (too heavy) and pure-Rust GUI (rich markdown/diff UI too costly).
- **Wrap the CLI via `claude -p` stream-json** over the Agent SDK (extra Node runtime) or embedded PTY (defeats the purpose). New CLI features come for free.
- **SvelteKit (static adapter) layout kept from the Tauri template** (UI in `src/`, not `ui/` as first sketched in the plan).
- See `docs/superpowers/specs/2026-11-24-better-claude-ui-design.md`.
