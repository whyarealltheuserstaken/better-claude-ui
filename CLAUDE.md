# BetterClaudeUI — agent guide

Desktop UI wrapping the `claude` CLI (Tauri v2 + Rust core + SvelteKit/Svelte 5 static UI in `src/`).

**Start here:** read `docs/HANDOFF.md` (current state, next steps), `docs/GOALS.md` (the v0.1.0 release gate and what to build next) and `docs/PROGRESS.md`. Design: `docs/superpowers/specs/`. Plans: `docs/superpowers/plans/`.

Conventions:
- TDD: failing test first, at the parser/session seams (Rust) and reducers/components (Vitest).
- One branch + one PR per ticket; squash-merge when CI is green; update `docs/PROGRESS.md` in every PR and `docs/HANDOFF.md` at the end of every session.
- All CLI JSON parsing lives in `src-tauri/src/cli/events.rs`; unknown events must never crash.
- OS-specific code only in `src-tauri/src/platform/`.
- Never default to bypassing permissions. Never claim the app is official.
- Non-obvious decisions get an ADR in `docs/DECISIONS/`.
