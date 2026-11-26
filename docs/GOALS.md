# Goals

The single place for "what must happen before the first release, and what comes next". Owner decisions are marked **(owner)**. Keep this file current: move items to `docs/PROGRESS.md` when they are done.

## v0.1.0 release gate (owner decision, 2026-11-25)

**Do not tag or publish v0.1.0 until every item below is done.** The app itself is otherwise feature-complete (see `docs/HANDOFF.md` section 3).

1. **In-app updater, built first.** Status: **implemented and fully verified on Windows, including a real install-and-relaunch (0.1.0 to 0.1.1).** Only the owner's key backup and non-Windows paths remain. Design: `docs/DECISIONS/0003-in-app-updater.md`. Remaining owner actions are listed under "Updater status" below.
2. **A few more features, defined by the owner and built by a different agent.** Status: **not started; list to be added by the owner.** Put them here as they are decided, one line each with acceptance criteria:
   - _(owner to fill in)_
   - _(owner to fill in)_
   - _(owner to fill in)_
3. Then the existing release steps in `docs/RELEASING.md`.

Why the updater comes first: v0.1.0 is the baseline everyone installs. An updater can only update versions that already contain it, so shipping v0.1.0 without one would force every early user to reinstall by hand.

## Updater status (2026-11-26)

Built (PR for branch `feat/updater`; design and security notes in ADR 0003):
- [x] Signing keypair generated (public key committed in `tauri.conf.json`; the private key and password are NOT in the repo)
- [x] Rust commands: check, download (signature verified), install (relaunch); plain-language errors; HTTPS-only in release builds; debug-only test endpoint
- [x] UI: Settings section (version, Check for updates, automatic checks on/off), quiet "Update available" chip, update panel with release notes, progress, "Skip this version", install blocked while Claude is replying
- [x] Release workflow signs builds and fails early if the signing secret is missing
- [x] Verified in the real app against a local signed test server (`node tools/e2e.mjs updater`): genuine update verified; tampered bytes, wrong key and **replayed older installer** rejected; bad JSON, 404 and offline give friendly messages
- [x] A real `tauri build` installer, signed as 0.1.1, verifies against the app's public key (`BCU_REAL_ARTIFACT`)

**Still open (owner actions or approval needed):**
- [x] **GitHub Actions secrets added** (2026-11-26, with the owner's approval): `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. The key is also at `%USERPROFILE%\.bcu-updater\updater.key` (password in `key.password`) on the machine that generated it.
- [x] **Protected local backup of the private key and password** (automatic, outside AppData and the user profile, read-only, delete/overwrite blocked for the normal account; verify with `node tools/check-updater-key.mjs`). See `docs/RELEASING.md`.
- [ ] **Off-machine copy of the key** (a single disk failure or OS reinstall would still lose the local ones). Awaiting the owner's choice of where; see HANDOFF 10j.
- [x] **Real install-and-relaunch test passed** (2026-11-26, approved by the owner): a silent per-user install of a test 0.1.0, the real UI check, download, verify, "Install and restart", then the installed program was 0.1.1 and relaunched, all in about 8 s; then fully uninstalled. Reproduce with `tools/update-install-test.mjs` (see HANDOFF 10j).
- [ ] macOS and Linux update paths (never run on real hardware)

## Brief: in-app updater (original spec, kept for reference)

**Goal.** The installed app can find, download and install a newer release without the user visiting GitHub, and can never install something that was not signed by the project owner.

**Original state (before this work):** nothing existed. See "Updater status" below for what exists now.

**Likely approach** (written from knowledge of Tauri v2; verify against the current Tauri docs before relying on any detail):
- Rust: `tauri-plugin-updater` (and `tauri-plugin-process` to relaunch after install). Register in `src-tauri/src/lib.rs`, add `updater:default` (and process permissions) to `src-tauri/capabilities/default.json`.
- Config: in `src-tauri/tauri.conf.json` set `bundle.createUpdaterArtifacts` and `plugins.updater` with the **public key** and an `endpoints` list pointing at the GitHub release asset `latest.json`.
- **Signing keys (needs the owner).** Generate a keypair with `npm run tauri signer generate`. The public key is committed in config. The **private key and its password are secrets**: store them only as GitHub Actions secrets (for example `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`). Never commit them, print them, or paste them in chat. Losing the private key means existing installs can never be updated, so the owner must back it up.
- Release workflow (`.github/workflows/release.yml`): pass the signing secrets to `tauri-apps/tauri-action` and have it publish the updater JSON and `.sig` files with each release. Decide how draft releases and the `latest.json` endpoint interact (a draft is not publicly downloadable, so the endpoint only works after the owner publishes).
- UI: check on launch (quietly, at most once a day) plus a manual "Check for updates" in Settings; show the new version and release notes; download with progress; "Restart to finish". Respect the user: never restart mid-conversation without asking, and do not interrupt a running session. Allow turning the automatic check off. Show a clear message when offline or when the check fails; failures must never block normal use.
- Security: signature verification is mandatory and must not be bypassable from the UI or settings. Updates are fetched over HTTPS only. The webview CSP (`docs/DECISIONS/0002-content-security-policy.md`) should not need loosening, because the update check and download happen in Rust, not in the webview; keep it that way. Write an ADR in `docs/DECISIONS/` for the final design.
- Platforms: Windows (NSIS) is the tested platform. macOS needs the updater bundle (`.app.tar.gz` plus signature) and Linux needs the AppImage; neither has been run on real hardware, so say so in the release notes.

**Acceptance criteria.**
- With version N installed and a signed N+1 published, the app finds it, downloads it, verifies the signature, installs it and relaunches into N+1 (Windows, verified on a real machine or VM).
- A tampered or unsigned update is rejected and the app keeps working (add an automated test for the verification path where possible, plus a manual check).
- Offline, endpoint-404 and malformed-JSON cases show a friendly message and never block the app (unit-test the pure parts).
- The check can be disabled in Settings, and the preference persists.
- Docs updated: `docs/RELEASING.md` (key handling, how to cut an updatable release), `docs/PROGRESS.md`, `docs/HANDOFF.md`, README status, CHANGELOG.

**End-to-end testing note.** A real test needs two published, signed versions (for example a pre-release `0.1.0-test.1` and `0.1.0-test.2`). Publishing even a test release is an outward-facing action, so ask the owner first.

## Backlog (not committed; nothing here blocks v0.1.0)
- Embedded terminal (PTY) as an Advanced fallback
- In-app preset editor for agent teams
- Notifications when a turn finishes or a permission is needed while the app is in the background
- A "working in the background" state for background subagents (their `Agent` tool_result returns immediately)
- Code signing (Windows Authenticode, macOS notarization). This is separate from the updater signature above and needs owner-held certificates
- Theme gallery / community sharing
- Verify on real hardware: macOS and Linux builds, the installer and browser sign-in steps of the setup wizard, voice dictation
