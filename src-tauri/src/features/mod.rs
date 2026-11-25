//! Feature registry: the app is a small core plus modules. Code mode, Chat mode and presets
//! register themselves here, so third-party-style add-ons use the same mechanism.

use serde::Serialize;

/// A place in the UI a feature contributes to (resolved by the frontend slot registry).
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct UiSlot {
    pub slot: String,
    pub component: String,
}

#[derive(Debug, Default)]
pub struct FeatureContext {
    pub ui_slots: Vec<UiSlot>,
}

impl FeatureContext {
    pub fn add_ui_slot(&mut self, slot: &str, component: &str) {
        self.ui_slots.push(UiSlot {
            slot: slot.into(),
            component: component.into(),
        });
    }
}

pub trait Feature: Send + Sync {
    fn id(&self) -> &'static str;
    fn title(&self) -> &'static str;
    fn register(&self, ctx: &mut FeatureContext);
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct FeatureInfo {
    pub id: String,
    pub title: String,
    pub ui_slots: Vec<UiSlot>,
}

#[derive(Debug, thiserror::Error, PartialEq)]
pub enum RegistryError {
    #[error("feature `{0}` is already registered")]
    Duplicate(String),
}

#[derive(Default)]
pub struct FeatureRegistry {
    features: Vec<FeatureInfo>,
}

impl FeatureRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn register(&mut self, feature: &dyn Feature) -> Result<(), RegistryError> {
        let id = feature.id();
        if self.features.iter().any(|f| f.id == id) {
            return Err(RegistryError::Duplicate(id.into()));
        }
        let mut ctx = FeatureContext::default();
        feature.register(&mut ctx);
        self.features.push(FeatureInfo {
            id: id.into(),
            title: feature.title().into(),
            ui_slots: ctx.ui_slots,
        });
        Ok(())
    }

    pub fn list(&self) -> &[FeatureInfo] {
        &self.features
    }
}

/// Built-in features shipped with the app.
pub struct CodeMode;

impl Feature for CodeMode {
    fn id(&self) -> &'static str {
        "code"
    }
    fn title(&self) -> &'static str {
        "Code"
    }
    fn register(&self, ctx: &mut FeatureContext) {
        ctx.add_ui_slot("mode", "CodeMode");
    }
}

pub fn builtin_registry() -> FeatureRegistry {
    let mut r = FeatureRegistry::new();
    r.register(&CodeMode)
        .expect("built-in feature ids are unique");
    r
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Dummy(&'static str);
    impl Feature for Dummy {
        fn id(&self) -> &'static str {
            self.0
        }
        fn title(&self) -> &'static str {
            "Dummy"
        }
        fn register(&self, ctx: &mut FeatureContext) {
            ctx.add_ui_slot("sidebar", self.0);
        }
    }

    #[test]
    fn registers_and_lists_features_in_order_with_their_slots() {
        let mut r = FeatureRegistry::new();
        r.register(&Dummy("a")).unwrap();
        r.register(&Dummy("b")).unwrap();
        let ids: Vec<_> = r.list().iter().map(|f| f.id.as_str()).collect();
        assert_eq!(ids, ["a", "b"]);
        assert_eq!(
            r.list()[0].ui_slots,
            vec![UiSlot {
                slot: "sidebar".into(),
                component: "a".into()
            }]
        );
    }

    #[test]
    fn duplicate_id_is_rejected_and_registry_unchanged() {
        let mut r = FeatureRegistry::new();
        r.register(&Dummy("a")).unwrap();
        assert_eq!(
            r.register(&Dummy("a")),
            Err(RegistryError::Duplicate("a".into()))
        );
        assert_eq!(r.list().len(), 1);
    }

    #[test]
    fn builtin_registry_contains_code_mode() {
        let r = builtin_registry();
        assert!(r.list().iter().any(|f| f.id == "code"));
    }
}
