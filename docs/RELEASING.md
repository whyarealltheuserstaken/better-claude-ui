# Releasing

Releases are built by `.github/workflows/release.yml` when a tag like `v0.1.0` is pushed.

> **v0.1.0 is gated** (owner decision): do not tag it until the in-app updater and the owner's extra features are done. See `docs/GOALS.md`. The updater also changes this process: once it exists, every release must be signed with the updater key (stored as GitHub secrets) and publish the updater JSON.

## One-time setup: updater signing (needs the repository owner)
The in-app updater only installs updates signed with the project's key (ADR 0003).
1. The keypair already exists: the public key is committed in `src-tauri/tauri.conf.json`; the private key and password are on the machine that generated them (`%USERPROFILE%\.bcu-updater\updater.key` and `key.password`).
2. **Back them up** somewhere safe and separate (password manager). **If the private key is lost, installed copies can never be updated** and users must reinstall by hand with a build carrying a new public key.
3. Add two repository secrets (Settings, Secrets and variables, Actions): `TAURI_SIGNING_PRIVATE_KEY` (the CONTENT of `updater.key`) and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. The release workflow stops with a clear error if the first is missing.
4. Never commit, print or paste the private key or password. `*.key` is gitignored.

## Steps
1. Make sure `main` is green and `CHANGELOG.md` has the version's notes.
2. Versions must match in `package.json`, `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`. **The version in `tauri.conf.json` is also the version the installer is signed for**; the updater rejects an installer whose signed version differs from the announced one, so bump it before tagging.
3. Tag and push: `git tag v0.1.0 && git push origin v0.1.0`.
4. The workflow builds Windows (NSIS + MSI), macOS (universal `.dmg`/`.app`) and Linux (`.deb`, `.AppImage`) and attaches them to a **draft** release.
5. Download and test at least the installer for your OS, then publish the draft.

## What is NOT done yet
- **Code signing.** Windows builds are unsigned (SmartScreen will warn: "More info" then "Run anyway"). macOS builds are unsigned and not notarized (right-click the app, "Open"). Signing needs certificates that belong to the project owner; add them as repository secrets and extend the workflow when available.
- **Updater end-to-end on a real install.** Implemented and verified in the real app against a local signed server, but installing an update and relaunching has not been run on a real install (needs approval). macOS and Linux update paths have never run on real hardware.
- **`latest.json` appears only when published.** `tauri-action` attaches it to the release; the app reads `releases/latest/download/latest.json`, which only exists once the release is **published**. A draft is not public, so test updates only after publishing.
- **macOS and Linux hardware testing.** CI builds and tests them, but the app has never been run on real macOS or Linux machines.

## Local release build (Windows)
`CARGO_BUILD_JOBS=2 TAURI_SIGNING_PRIVATE_KEY=<path to updater.key> TAURI_SIGNING_PRIVATE_KEY_PASSWORD=<password> npm run tauri build` (the signing variables are required because updater artifacts are on; without them the bundles are built but the signing step errors) (the reduced job count avoids an out-of-memory rustc crash seen on some machines). Installers land in `src-tauri/target/release/bundle/`.
