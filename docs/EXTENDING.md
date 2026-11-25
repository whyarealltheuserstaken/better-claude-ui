# Extending BetterClaudeUI

The app is a small core plus feature modules. v1 exposes the registry internally; loading third-party add-ons from disk is designed-for but not built yet.

## Adding a built-in feature (Rust)
Implement `Feature` in `src-tauri/src/features/` and register it in `builtin_registry()`:

```rust
pub struct MyFeature;
impl Feature for MyFeature {
    fn id(&self) -> &'static str { "my-feature" }       // unique, stable
    fn title(&self) -> &'static str { "My feature" }
    fn register(&self, ctx: &mut FeatureContext) {
        ctx.add_ui_slot("sidebar", "MyFeaturePanel");    // slot name + component id
    }
}
```
The UI reads the list via the `list_features` command. Slots planned: `mode`, `sidebar`, `settings`, `message-renderer`.

## Planned (not built yet)
- **Presets as data:** multi-agent presets as JSON/TOML in `presets/` and a user directory.
- **Themes:** CSS-variable files in a user directory (the tokens are in `src/app.css`).
- **Code add-ons:** user-dir manifests, after the registry API has settled.

Keep new features behind the registry so the core stays small.
