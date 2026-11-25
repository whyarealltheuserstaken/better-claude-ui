# BetterClaudeUI

A lightweight desktop UI for [Claude Code](https://claude.com/claude-code): the full power of the `claude` CLI, with a better interface than a terminal.

> **Unofficial.** BetterClaudeUI is an independent open-source project. It is not affiliated with or endorsed by Anthropic. It requires the official `claude` CLI, installed and logged in.

## Why
- **Full fidelity:** it drives the real CLI (streaming JSON mode), so hooks, skills, plugins, MCP, subagents and slash commands all work, and new CLI features arrive for free.
- **Light:** Tauri + Rust, not Electron.
- **Code and Chat modes** in one app.
- **Experience tiers:** Beginner, Intermediate, Advanced.
- **Setup wizard:** detects a missing or signed-out Claude Code and walks you through installing and signing in.
- **Themes and styles:** 8 themes, 4 styles (including a Terminal look), all editable, importable and exportable.
- **Multi-agent presets:** Coordinator + Workers, Deep Research, Code + Review.
- **Extensible:** features, presets and themes are modules/data files (see `docs/EXTENDING.md`).

## Status
Early development. See [`docs/PROGRESS.md`](docs/PROGRESS.md) for the roadmap and [`docs/HANDOFF.md`](docs/HANDOFF.md) for the current state.

Platforms: Windows 10/11 first; macOS (Intel + Apple Silicon, universal) and Linux to follow.

## Develop
Prerequisites: Node 20+, Rust stable, the `claude` CLI, and the [Tauri prerequisites](https://tauri.app/start/prerequisites/).

```
npm install
npm run tauri dev      # run the app
npm run check          # type-check UI
cargo test --manifest-path src-tauri/Cargo.toml
```

See [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## License
MIT
