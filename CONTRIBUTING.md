# Contributing

1. Pick or open an issue. Comment so work isn't duplicated.
2. Branch from `main` (`feat/<topic>`, `fix/<topic>`).
3. Write the failing test first, then the code. Run `cargo test` (in `src-tauri/`) and `npm run check && npm test`.
4. Update `docs/PROGRESS.md` (and `docs/HANDOFF.md` if state changed).
5. Open a PR using the template; CI must be green.

Keep it light: avoid heavy dependencies; justify any new one in the PR.
Platform-specific code goes in `src-tauri/src/platform/` only.
