# Releasing

Releases are built by `.github/workflows/release.yml` when a tag like `v0.1.0` is pushed.

> Publishing is the owner's call: do not push a `v*` tag without their go-ahead. Every release must be signed with the updater key (stored as GitHub secrets) and publish the updater JSON.

## One-time setup: updater signing (needs the repository owner)
The in-app updater only installs updates signed with the project's key (ADR 0003).
1. The keypair already exists: the public key is committed in `src-tauri/tauri.conf.json`; the private key and password are on the machine that generated them (`%USERPROFILE%\.bcu-updater\updater.key` and `key.password`).
2. **What this key is.** It is the *project's publishing key*, not something end users have. Installed apps contain only the PUBLIC half (built into the program, so a reinstall always restores it). Losing the PRIVATE key means the project can no longer publish updates that installed copies accept.
   - **Protected local backup (automatic, already in place on the maintainer's machine):** `C:\ProgramData\BetterClaudeUI\updater-key-backup\` holds `updater.key`, `updater.key.pub` and `key.password`: outside the user profile and AppData, files read-only, and the normal account may read but not modify or delete them (admin rights are needed to change them). Verified by trying to delete, overwrite and rename them.
   - **Check it any time:** `node tools/check-updater-key.mjs`. It confirms the public key in `tauri.conf.json` matches the working key and the backup, the backup is byte-identical and can really sign, it is outside the profile and read-only, and the GitHub secrets exist. Run it before every release.
   - **Limit:** a copy on the same computer does not survive that computer's disk dying or being reinstalled. GitHub secrets cannot be read back, so they are not a backup. Keep one **off-machine** copy as well (see `docs/GOALS.md`).
   - **Recovery:** copy the three files from the backup folder to `%USERPROFILE%\.bcu-updater\`, re-add the two GitHub secrets (`gh secret set TAURI_SIGNING_PRIVATE_KEY < updater.key`, same for the password). If every copy is lost, generate a new keypair, put the new public key in `tauri.conf.json`, and ship a build that users must install by hand once.
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
