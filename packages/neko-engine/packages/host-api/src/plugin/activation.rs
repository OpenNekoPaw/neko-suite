//! Focused plugin activation bridges.
//!
//! PluginManager owns lifecycle and load gates. These bridge traits own the
//! narrow registration contracts for each contribution family, keeping effect
//! registration from becoming the catch-all plugin activation path.

use super::manager::PluginActivationHandler;
use super::manifest::{PluginCapability, PluginKind};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};

/// High-level result category for activation lifecycle events.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PluginActivationOutcomeKind {
    Registered,
    UnsupportedCapability,
    ValidationFailure,
    TrustFailure,
    RollbackFailure,
}

/// Structured activation or deactivation outcome.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginActivationOutcome {
    pub plugin_id: String,
    pub plugin_kind: PluginKind,
    pub outcome: PluginActivationOutcomeKind,
    pub registered: usize,
    pub message: String,
}

impl PluginActivationOutcome {
    pub fn registered(
        plugin_id: impl Into<String>,
        plugin_kind: PluginKind,
        registered: usize,
        message: impl Into<String>,
    ) -> Self {
        Self {
            plugin_id: plugin_id.into(),
            plugin_kind,
            outcome: PluginActivationOutcomeKind::Registered,
            registered,
            message: message.into(),
        }
    }
}

/// Typed activation failure used by focused bridge implementations.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PluginActivationError {
    UnsupportedCapability(String),
    ValidationFailure(String),
    TrustFailure(String),
    RollbackFailure {
        cause: String,
        rollback_error: String,
    },
    RegistrationFailure(String),
}

impl PluginActivationError {
    pub fn outcome_kind(&self) -> PluginActivationOutcomeKind {
        match self {
            Self::UnsupportedCapability(_) => PluginActivationOutcomeKind::UnsupportedCapability,
            Self::ValidationFailure(_) => PluginActivationOutcomeKind::ValidationFailure,
            Self::TrustFailure(_) => PluginActivationOutcomeKind::TrustFailure,
            Self::RollbackFailure { .. } => PluginActivationOutcomeKind::RollbackFailure,
            Self::RegistrationFailure(_) => PluginActivationOutcomeKind::ValidationFailure,
        }
    }
}

impl std::fmt::Display for PluginActivationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::UnsupportedCapability(message) => {
                write!(f, "Unsupported plugin capability: {message}")
            }
            Self::ValidationFailure(message) => write!(f, "Plugin validation failed: {message}"),
            Self::TrustFailure(message) => write!(f, "Plugin trust check failed: {message}"),
            Self::RollbackFailure {
                cause,
                rollback_error,
            } => write!(
                f,
                "Plugin activation rollback failed after `{cause}`: {rollback_error}"
            ),
            Self::RegistrationFailure(message) => {
                write!(f, "Plugin registration failed: {message}")
            }
        }
    }
}

impl std::error::Error for PluginActivationError {}

pub type PluginActivationResult<T> = Result<T, PluginActivationError>;

/// Metadata recorded by registration-only bridge adapters.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginContribution {
    pub plugin_id: String,
    pub plugin_kind: PluginKind,
    pub capability_id: String,
    pub capability_type: String,
    pub entry: String,
    pub resolved_entry: PathBuf,
    pub name: Option<String>,
    pub category: Option<String>,
}

impl PluginContribution {
    pub fn from_capability(
        plugin_id: &str,
        plugin_kind: PluginKind,
        capability: &PluginCapability,
        install_path: &Path,
    ) -> Self {
        Self {
            plugin_id: plugin_id.to_string(),
            plugin_kind,
            capability_id: capability.id.clone().unwrap_or_else(|| {
                derived_capability_id(plugin_id, &capability.capability_type, &capability.entry)
            }),
            capability_type: capability.capability_type.clone(),
            entry: capability.entry.clone(),
            resolved_entry: install_path.join(&capability.entry),
            name: capability.name.clone(),
            category: capability.category.clone(),
        }
    }
}

pub trait FormatPluginRegistry: Send + Sync {
    fn register_format(
        &self,
        plugin_id: &str,
        capability: &PluginCapability,
        install_path: &Path,
    ) -> PluginActivationResult<()>;

    fn unregister_format_plugin(&self, plugin_id: &str) -> PluginActivationResult<()>;
}

pub trait DevicePluginRegistry: Send + Sync {
    fn register_device(
        &self,
        plugin_id: &str,
        capability: &PluginCapability,
        install_path: &Path,
    ) -> PluginActivationResult<()>;

    fn unregister_device_plugin(&self, plugin_id: &str) -> PluginActivationResult<()>;
}

pub trait ExporterPluginRegistry: Send + Sync {
    fn register_exporter(
        &self,
        plugin_id: &str,
        capability: &PluginCapability,
        install_path: &Path,
    ) -> PluginActivationResult<()>;

    fn unregister_exporter_plugin(&self, plugin_id: &str) -> PluginActivationResult<()>;
}

pub trait ConnectorPluginRegistry: Send + Sync {
    fn register_connector(
        &self,
        plugin_id: &str,
        capability: &PluginCapability,
        install_path: &Path,
    ) -> PluginActivationResult<()>;

    fn unregister_connector_plugin(&self, plugin_id: &str) -> PluginActivationResult<()>;
}

pub trait ModelPluginRegistry: Send + Sync {
    fn register_model(
        &self,
        plugin_id: &str,
        capability: &PluginCapability,
        install_path: &Path,
    ) -> PluginActivationResult<()>;

    fn unregister_model_plugin(&self, plugin_id: &str) -> PluginActivationResult<()>;
}

/// Registration-only registry used until each runtime family wires execution.
#[derive(Default)]
pub struct InMemoryPluginContributionRegistry {
    contributions: RwLock<HashMap<String, Vec<PluginContribution>>>,
}

impl InMemoryPluginContributionRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn contributions_for_plugin(&self, plugin_id: &str) -> Vec<PluginContribution> {
        let contributions = self.contributions.read().unwrap_or_else(|e| e.into_inner());
        contributions.get(plugin_id).cloned().unwrap_or_default()
    }

    fn register(
        &self,
        plugin_id: &str,
        plugin_kind: PluginKind,
        capability: &PluginCapability,
        install_path: &Path,
    ) {
        let contribution =
            PluginContribution::from_capability(plugin_id, plugin_kind, capability, install_path);
        let mut contributions = self
            .contributions
            .write()
            .unwrap_or_else(|e| e.into_inner());
        contributions
            .entry(plugin_id.to_string())
            .or_default()
            .push(contribution);
    }

    fn unregister(&self, plugin_id: &str) {
        let mut contributions = self
            .contributions
            .write()
            .unwrap_or_else(|e| e.into_inner());
        contributions.remove(plugin_id);
    }
}

macro_rules! impl_contribution_registry {
    ($trait_name:ident, $register_name:ident, $unregister_name:ident, $kind:expr) => {
        impl $trait_name for InMemoryPluginContributionRegistry {
            fn $register_name(
                &self,
                plugin_id: &str,
                capability: &PluginCapability,
                install_path: &Path,
            ) -> PluginActivationResult<()> {
                self.register(plugin_id, $kind, capability, install_path);
                Ok(())
            }

            fn $unregister_name(&self, plugin_id: &str) -> PluginActivationResult<()> {
                self.unregister(plugin_id);
                Ok(())
            }
        }
    };
}

impl_contribution_registry!(
    FormatPluginRegistry,
    register_format,
    unregister_format_plugin,
    PluginKind::Format
);
impl_contribution_registry!(
    DevicePluginRegistry,
    register_device,
    unregister_device_plugin,
    PluginKind::Device
);
impl_contribution_registry!(
    ExporterPluginRegistry,
    register_exporter,
    unregister_exporter_plugin,
    PluginKind::Exporter
);
impl_contribution_registry!(
    ConnectorPluginRegistry,
    register_connector,
    unregister_connector_plugin,
    PluginKind::Connector
);
impl_contribution_registry!(
    ModelPluginRegistry,
    register_model,
    unregister_model_plugin,
    PluginKind::Model
);

/// Routes PluginKind values to focused bridge registries.
pub struct PluginActivationRouter {
    effect_handler: Option<Box<dyn PluginActivationHandler>>,
    format_registry: Option<Arc<dyn FormatPluginRegistry>>,
    device_registry: Option<Arc<dyn DevicePluginRegistry>>,
    exporter_registry: Option<Arc<dyn ExporterPluginRegistry>>,
    connector_registry: Option<Arc<dyn ConnectorPluginRegistry>>,
    model_registry: Option<Arc<dyn ModelPluginRegistry>>,
}

impl PluginActivationRouter {
    pub fn new() -> Self {
        Self {
            effect_handler: None,
            format_registry: None,
            device_registry: None,
            exporter_registry: None,
            connector_registry: None,
            model_registry: None,
        }
    }

    pub fn with_effect_handler(mut self, handler: Box<dyn PluginActivationHandler>) -> Self {
        self.effect_handler = Some(handler);
        self
    }

    pub fn with_format_registry(mut self, registry: Arc<dyn FormatPluginRegistry>) -> Self {
        self.format_registry = Some(registry);
        self
    }

    pub fn with_device_registry(mut self, registry: Arc<dyn DevicePluginRegistry>) -> Self {
        self.device_registry = Some(registry);
        self
    }

    pub fn with_exporter_registry(mut self, registry: Arc<dyn ExporterPluginRegistry>) -> Self {
        self.exporter_registry = Some(registry);
        self
    }

    pub fn with_connector_registry(mut self, registry: Arc<dyn ConnectorPluginRegistry>) -> Self {
        self.connector_registry = Some(registry);
        self
    }

    pub fn with_model_registry(mut self, registry: Arc<dyn ModelPluginRegistry>) -> Self {
        self.model_registry = Some(registry);
        self
    }

    pub fn with_default_metadata_registries(
        effect_handler: Box<dyn PluginActivationHandler>,
    ) -> Self {
        let metadata = Arc::new(InMemoryPluginContributionRegistry::new());
        Self::new()
            .with_effect_handler(effect_handler)
            .with_format_registry(metadata.clone())
            .with_device_registry(metadata.clone())
            .with_exporter_registry(metadata.clone())
            .with_connector_registry(metadata.clone())
            .with_model_registry(metadata)
    }

    fn ensure_capabilities(
        plugin_id: &str,
        kind: PluginKind,
        capabilities: &[PluginCapability],
    ) -> PluginActivationResult<()> {
        if capabilities.is_empty() {
            return Err(PluginActivationError::UnsupportedCapability(format!(
                "{kind:?} plugin {plugin_id} declares no capabilities"
            )));
        }
        Ok(())
    }

    fn register_with_rollback<F, U>(
        &self,
        plugin_id: &str,
        kind: PluginKind,
        capabilities: &[PluginCapability],
        _install_path: &Path,
        mut register: F,
        unregister: U,
    ) -> PluginActivationResult<PluginActivationOutcome>
    where
        F: FnMut(&PluginCapability) -> PluginActivationResult<()>,
        U: FnOnce(&str) -> PluginActivationResult<()>,
    {
        Self::ensure_capabilities(plugin_id, kind, capabilities)?;

        let mut registered = 0;
        for capability in capabilities {
            if let Err(error) = register(capability) {
                if registered > 0 {
                    if let Err(rollback_error) = unregister(plugin_id) {
                        return Err(PluginActivationError::RollbackFailure {
                            cause: error.to_string(),
                            rollback_error: rollback_error.to_string(),
                        });
                    }
                }
                return Err(error);
            }
            registered += 1;
        }

        Ok(PluginActivationOutcome::registered(
            plugin_id,
            kind,
            registered,
            format!("registered {registered} {kind:?} plugin contribution(s)"),
        ))
    }
}

impl Default for PluginActivationRouter {
    fn default() -> Self {
        Self::new()
    }
}

impl PluginActivationHandler for PluginActivationRouter {
    fn on_activate(
        &self,
        plugin_id: &str,
        kind: PluginKind,
        capabilities: &[PluginCapability],
        install_path: &Path,
    ) -> PluginActivationResult<PluginActivationOutcome> {
        match kind {
            PluginKind::Shader | PluginKind::Lut | PluginKind::EffectPreset => {
                let Some(handler) = &self.effect_handler else {
                    return Err(PluginActivationError::UnsupportedCapability(format!(
                        "no effect activation bridge configured for {kind:?}"
                    )));
                };
                handler.on_activate(plugin_id, kind, capabilities, install_path)
            }
            PluginKind::Format => {
                let Some(registry) = &self.format_registry else {
                    return Err(PluginActivationError::UnsupportedCapability(
                        "no format plugin registry configured".to_string(),
                    ));
                };
                self.register_with_rollback(
                    plugin_id,
                    kind,
                    capabilities,
                    install_path,
                    |capability| registry.register_format(plugin_id, capability, install_path),
                    |id| registry.unregister_format_plugin(id),
                )
            }
            PluginKind::Device => {
                let Some(registry) = &self.device_registry else {
                    return Err(PluginActivationError::UnsupportedCapability(
                        "no device plugin registry configured".to_string(),
                    ));
                };
                self.register_with_rollback(
                    plugin_id,
                    kind,
                    capabilities,
                    install_path,
                    |capability| registry.register_device(plugin_id, capability, install_path),
                    |id| registry.unregister_device_plugin(id),
                )
            }
            PluginKind::Exporter => {
                let Some(registry) = &self.exporter_registry else {
                    return Err(PluginActivationError::UnsupportedCapability(
                        "no exporter plugin registry configured".to_string(),
                    ));
                };
                self.register_with_rollback(
                    plugin_id,
                    kind,
                    capabilities,
                    install_path,
                    |capability| registry.register_exporter(plugin_id, capability, install_path),
                    |id| registry.unregister_exporter_plugin(id),
                )
            }
            PluginKind::Connector => {
                let Some(registry) = &self.connector_registry else {
                    return Err(PluginActivationError::UnsupportedCapability(
                        "no connector plugin registry configured".to_string(),
                    ));
                };
                self.register_with_rollback(
                    plugin_id,
                    kind,
                    capabilities,
                    install_path,
                    |capability| registry.register_connector(plugin_id, capability, install_path),
                    |id| registry.unregister_connector_plugin(id),
                )
            }
            PluginKind::Model => {
                let Some(registry) = &self.model_registry else {
                    return Err(PluginActivationError::UnsupportedCapability(
                        "no model plugin registry configured".to_string(),
                    ));
                };
                self.register_with_rollback(
                    plugin_id,
                    kind,
                    capabilities,
                    install_path,
                    |capability| registry.register_model(plugin_id, capability, install_path),
                    |id| registry.unregister_model_plugin(id),
                )
            }
        }
    }

    fn on_deactivate(
        &self,
        plugin_id: &str,
        kind: PluginKind,
    ) -> PluginActivationResult<PluginActivationOutcome> {
        match kind {
            PluginKind::Shader | PluginKind::Lut | PluginKind::EffectPreset => {
                let Some(handler) = &self.effect_handler else {
                    return Err(PluginActivationError::UnsupportedCapability(format!(
                        "no effect activation bridge configured for {kind:?}"
                    )));
                };
                handler.on_deactivate(plugin_id, kind)
            }
            PluginKind::Format => {
                let Some(registry) = &self.format_registry else {
                    return Err(PluginActivationError::UnsupportedCapability(
                        "no format plugin registry configured".to_string(),
                    ));
                };
                registry.unregister_format_plugin(plugin_id)?;
                Ok(PluginActivationOutcome::registered(
                    plugin_id,
                    kind,
                    0,
                    "unregistered format plugin contributions",
                ))
            }
            PluginKind::Device => {
                let Some(registry) = &self.device_registry else {
                    return Err(PluginActivationError::UnsupportedCapability(
                        "no device plugin registry configured".to_string(),
                    ));
                };
                registry.unregister_device_plugin(plugin_id)?;
                Ok(PluginActivationOutcome::registered(
                    plugin_id,
                    kind,
                    0,
                    "unregistered device plugin contributions",
                ))
            }
            PluginKind::Exporter => {
                let Some(registry) = &self.exporter_registry else {
                    return Err(PluginActivationError::UnsupportedCapability(
                        "no exporter plugin registry configured".to_string(),
                    ));
                };
                registry.unregister_exporter_plugin(plugin_id)?;
                Ok(PluginActivationOutcome::registered(
                    plugin_id,
                    kind,
                    0,
                    "unregistered exporter plugin contributions",
                ))
            }
            PluginKind::Connector => {
                let Some(registry) = &self.connector_registry else {
                    return Err(PluginActivationError::UnsupportedCapability(
                        "no connector plugin registry configured".to_string(),
                    ));
                };
                registry.unregister_connector_plugin(plugin_id)?;
                Ok(PluginActivationOutcome::registered(
                    plugin_id,
                    kind,
                    0,
                    "unregistered connector plugin contributions",
                ))
            }
            PluginKind::Model => {
                let Some(registry) = &self.model_registry else {
                    return Err(PluginActivationError::UnsupportedCapability(
                        "no model plugin registry configured".to_string(),
                    ));
                };
                registry.unregister_model_plugin(plugin_id)?;
                Ok(PluginActivationOutcome::registered(
                    plugin_id,
                    kind,
                    0,
                    "unregistered model plugin contributions",
                ))
            }
        }
    }
}

fn derived_capability_id(plugin_id: &str, capability_type: &str, entry: &str) -> String {
    let entry_id = entry
        .rsplit('/')
        .next()
        .unwrap_or(entry)
        .split('.')
        .next()
        .unwrap_or(entry)
        .replace('_', "-");
    format!("{plugin_id}:{capability_type}:{entry_id}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::Mutex;

    fn capability(id: &str, capability_type: &str, entry: &str) -> PluginCapability {
        PluginCapability {
            id: Some(id.to_string()),
            capability_type: capability_type.to_string(),
            entry: entry.to_string(),
            name: Some(id.to_string()),
            name_key: None,
            description: None,
            category: None,
            params: Vec::new(),
        }
    }

    #[test]
    fn metadata_registry_registers_and_unregisters_by_plugin_id() {
        let tmp = tempfile::tempdir().unwrap();
        fs::write(tmp.path().join("format.wasm"), "format").unwrap();
        let registry = Arc::new(InMemoryPluginContributionRegistry::new());
        let router = PluginActivationRouter::new()
            .with_format_registry(registry.clone())
            .with_model_registry(registry.clone())
            .with_device_registry(registry.clone())
            .with_exporter_registry(registry.clone())
            .with_connector_registry(registry.clone());

        let outcome = router
            .on_activate(
                "plugin.format",
                PluginKind::Format,
                &[capability("format.cap", "format-probe", "format.wasm")],
                tmp.path(),
            )
            .unwrap();
        assert_eq!(outcome.outcome, PluginActivationOutcomeKind::Registered);
        assert_eq!(registry.contributions_for_plugin("plugin.format").len(), 1);

        router
            .on_deactivate("plugin.format", PluginKind::Format)
            .unwrap();
        assert!(registry
            .contributions_for_plugin("plugin.format")
            .is_empty());
    }

    #[derive(Default)]
    struct FailingModelRegistry {
        calls: Mutex<Vec<&'static str>>,
    }

    impl ModelPluginRegistry for FailingModelRegistry {
        fn register_model(
            &self,
            _plugin_id: &str,
            capability: &PluginCapability,
            _install_path: &Path,
        ) -> PluginActivationResult<()> {
            if capability.capability_type == "bad-model" {
                return Err(PluginActivationError::ValidationFailure(
                    "bad model capability".to_string(),
                ));
            }
            self.calls.lock().unwrap().push("register");
            Ok(())
        }

        fn unregister_model_plugin(&self, _plugin_id: &str) -> PluginActivationResult<()> {
            self.calls.lock().unwrap().push("rollback");
            Ok(())
        }
    }

    #[test]
    fn partial_activation_failure_rolls_back_registered_contributions() {
        let registry = Arc::new(FailingModelRegistry::default());
        let router = PluginActivationRouter::new().with_model_registry(registry.clone());

        let err = router
            .on_activate(
                "plugin.model",
                PluginKind::Model,
                &[
                    capability("model.good", "ml-model", "good.onnx"),
                    capability("model.bad", "bad-model", "bad.onnx"),
                ],
                Path::new("."),
            )
            .unwrap_err();

        assert!(matches!(err, PluginActivationError::ValidationFailure(_)));
        assert_eq!(
            registry.calls.lock().unwrap().as_slice(),
            &["register", "rollback"]
        );
    }

    #[test]
    fn missing_bridge_returns_unsupported_capability() {
        let router = PluginActivationRouter::new();
        let err = router
            .on_activate(
                "plugin.connector",
                PluginKind::Connector,
                &[capability("connector.cap", "connector", "connector.json")],
                Path::new("."),
            )
            .unwrap_err();

        assert!(matches!(
            err,
            PluginActivationError::UnsupportedCapability(_)
        ));
    }

    #[test]
    fn effect_registry_activator_stays_effect_scoped() {
        let source = std::fs::read_to_string(
            Path::new(env!("CARGO_MANIFEST_DIR")).join("src/plugin/effect_registry_activator.rs"),
        )
        .unwrap();

        for forbidden in [
            "PluginKind::Model",
            "PluginKind::Format",
            "PluginKind::Device",
            "PluginKind::Exporter",
            "PluginKind::Connector",
        ] {
            assert!(
                !source.contains(forbidden),
                "EffectRegistryActivator must not hardwire non-effect kind `{forbidden}`"
            );
        }
    }
}
