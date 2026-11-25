# Handoff

_Last updated: 2026-11-24_

## State
Scaffolded Tauri v2 + SvelteKit (static) app builds. CI configured. No product code yet.

## Build / run / test
```
npm install
npm run tauri dev
npm run check
cargo test --manifest-path src-tauri/Cargo.toml
```
Requires Rust stable (MSVC on Windows), Node 20+, WebView2, and the `claude` CLI (v2.1.x tested).

## In flight
Task 1 of the M0/M1 plan.

## Next 3 steps
1. T2: capture real stream-json fixtures; write `docs/PROTOCOL.md`.
2. T3: event parser (TDD) against fixtures.
3. T4/T5: CLI detection + fake claude stub.

## Known issues / gotchas
- UI lives in `src/` (SvelteKit static adapter), not `ui/`.
- macOS/Linux CI legs are allowed to fail until M6.
