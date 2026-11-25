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

## Themes and styles
Both are plain JSON (see `src/lib/theme.ts`). A **theme** is 12 hex colours plus a light/dark base. A **style** is font, size, corner radius, spacing, reading width, user-message look (`bubble`/`bar`/`prompt`), tool-action look (`rail`/`card`/`line`) and a prompt symbol. Users create them in Settings → Appearance (Customize, Export, Import); they are stored in `config.json` (`custom_themes`, `custom_styles`). All input is sanitised (`sanitizeTheme`/`sanitizeStyle`): bad colours fall back, numbers are clamped, font names cannot inject CSS. To ship a new built-in, add it to `BUILTIN_THEMES`/`BUILTIN_STYLES`. Components must use the CSS variables (`--radius*`, `--density`, `--col`, colours), never hardcoded values.
