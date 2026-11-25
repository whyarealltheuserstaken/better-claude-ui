# 0002 — Content Security Policy

Status: accepted (2026-11-25)

## Decision
Production builds ship a strict CSP in `src-tauri/tauri.conf.json`:
`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' ipc: http://ipc.localhost; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`.
`devCsp` stays `null` so Vite's dev server and HMR work.

## Why
The UI renders model output as Markdown (`html: false`) and talks to a Rust core that can run commands. Defence in depth: even if markup injection slipped through, no remote script, frame or connection could load.

## Trade-offs
- `style-src 'unsafe-inline'` is required because Svelte injects component styles at runtime. Scripts remain locked to `'self'` (Tauri adds its own nonces).
- The app makes no network calls from the webview; everything goes through Tauri IPC. If a future feature needs remote images or fetches, extend `img-src`/`connect-src` explicitly and update this ADR.
- System fonts only, so `font-src 'self'` is sufficient.
