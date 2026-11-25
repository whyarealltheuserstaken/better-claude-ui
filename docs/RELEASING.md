# Releasing

Releases are built by `.github/workflows/release.yml` when a tag like `v0.1.0` is pushed.

> **v0.1.0 is gated** (owner decision): do not tag it until the in-app updater and the owner's extra features are done. See `docs/GOALS.md`. The updater also changes this process: once it exists, every release must be signed with the updater key (stored as GitHub secrets) and publish the updater JSON.

## Steps
1. Make sure `main` is green and `CHANGELOG.md` has the version's notes.
2. Versions must match in `package.json`, `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`.
3. Tag and push: `git tag v0.1.0 && git push origin v0.1.0`.
4. The workflow builds Windows (NSIS + MSI), macOS (universal `.dmg`/`.app`) and Linux (`.deb`, `.AppImage`) and attaches them to a **draft** release.
5. Download and test at least the installer for your OS, then publish the draft.

## What is NOT done yet
- **Code signing.** Windows builds are unsigned (SmartScreen will warn: "More info" then "Run anyway"). macOS builds are unsigned and not notarized (right-click the app, "Open"). Signing needs certificates that belong to the project owner; add them as repository secrets and extend the workflow when available.
- **In-app updater.** Not implemented (required before v0.1.0; see `docs/GOALS.md`). Until then users download new versions manually.
- **macOS and Linux hardware testing.** CI builds and tests them, but the app has never been run on real macOS or Linux machines.

## Local release build (Windows)
`CARGO_BUILD_JOBS=2 npm run tauri build` (the reduced job count avoids an out-of-memory rustc crash seen on some machines). Installers land in `src-tauri/target/release/bundle/`.
