//! Plugin activation handler for effect capability discovery.

use super::activation::{PluginActivationError, PluginActivationOutcome, PluginActivationResult};
use super::manager::PluginActivationHandler;
use super::manifest::{PluginCapability, PluginKind};
use neko_engine_kernel::contracts::services::EffectRegistry;
use neko_engine_types::{EffectCapability, EffectKind, EffectSource, ParamDef};
use std::path::Path;
use std::sync::Arc;

/// Registers plugin-declared effect capabilities into the engine registry.
pub struct EffectRegistryActivator {
    registry: Arc<EffectRegistry>,
}

impl EffectRegistryActivator {
    pub fn new(registry: Arc<EffectRegistry>) -> Self {
        Self { registry }
    }

    fn capability_from_manifest(
        plugin_id: &str,
        kind: PluginKind,
        capability: &PluginCapability,
        install_path: &Path,
    ) -> PluginActivationResult<Option<EffectCapability>> {
        let effect_kind = effect_kind(kind, &capability.capability_type)?;
        let id = capability.id.clone().unwrap_or_else(|| {
            derived_capability_id(plugin_id, &capability.capability_type, &capability.entry)
        });
        let entry_path = install_path.join(&capability.entry);

        if matches!(effect_kind, EffectKind::Shader | EffectKind::Lut) && !entry_path.exists() {
            return Err(PluginActivationError::ValidationFailure(format!(
                "Capability '{}' entry does not exist: {}",
                id,
                entry_path.display()
            )));
        }

        Ok(Some(EffectCapability {
            id,
            kind: effect_kind,
            source: EffectSource::Plugin,
            source_id: Some(plugin_id.to_string()),
            name: capability
                .name
                .clone()
                .unwrap_or_else(|| humanize_id(&capability.capability_type)),
            name_key: capability.name_key.clone(),
            description: capability.description.clone(),
            category: capability.category.clone(),
            gpu_accelerated: matches!(effect_kind, EffectKind::Shader | EffectKind::Lut),
            entry: Some(capability.entry.clone()),
            params: capability
                .params
                .iter()
                .map(plugin_param_to_param_def)
                .collect(),
        }))
    }
}

impl PluginActivationHandler for EffectRegistryActivator {
    fn on_activate(
        &self,
        plugin_id: &str,
        kind: PluginKind,
        capabilities: &[PluginCapability],
        install_path: &Path,
    ) -> PluginActivationResult<PluginActivationOutcome> {
        if capabilities.is_empty() {
            return Err(PluginActivationError::UnsupportedCapability(format!(
                "{kind:?} plugin {plugin_id} declares no effect capabilities"
            )));
        }

        let mut registered = Vec::new();
        for capability in capabilities {
            if let Some(effect_capability) =
                Self::capability_from_manifest(plugin_id, kind, capability, install_path)?
            {
                registered.push(effect_capability);
            }
        }

        let registered_count = registered.len();
        self.registry.register_many(registered);
        Ok(PluginActivationOutcome::registered(
            plugin_id,
            kind,
            registered_count,
            format!("registered {registered_count} effect contribution(s)"),
        ))
    }

    fn on_deactivate(
        &self,
        plugin_id: &str,
        kind: PluginKind,
    ) -> PluginActivationResult<PluginActivationOutcome> {
        self.registry.unregister_source(plugin_id);
        Ok(PluginActivationOutcome::registered(
            plugin_id,
            kind,
            0,
            "unregistered effect plugin contributions",
        ))
    }
}

fn effect_kind(kind: PluginKind, capability_type: &str) -> PluginActivationResult<EffectKind> {
    match (kind, capability_type) {
        (PluginKind::Shader, "effect-shader") | (_, "shader") | (_, "effect-shader") => {
            Ok(EffectKind::Shader)
        }
        (PluginKind::Lut, "lut") | (_, "effect-lut") => Ok(EffectKind::Lut),
        (PluginKind::EffectPreset, "audio") | (_, "audio-effect") => Ok(EffectKind::Audio),
        (_, other) => Err(PluginActivationError::UnsupportedCapability(format!(
            "unsupported effect capability type: {other}"
        ))),
    }
}

fn plugin_param_to_param_def(param: &super::manifest::PluginParam) -> ParamDef {
    ParamDef {
        name: param.name.clone(),
        param_type: param.param_type.clone(),
        default: param.default.clone(),
        min: param.min,
        max: param.max,
        step: param.step,
        unit: param.unit.clone(),
        label_key: param.label_key.clone(),
        options: param
            .options
            .iter()
            .map(|option| neko_engine_types::ParamOption {
                value: option.value.clone(),
                label: option.label.clone(),
                label_key: option.label_key.clone(),
            })
            .collect(),
        animatable: param.animatable,
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

fn humanize_id(id: &str) -> String {
    id.split(['-', '_'])
        .map(|part| {
            let mut chars = part.chars();
            match chars.next() {
                Some(first) => first.to_uppercase().chain(chars).collect::<String>(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::plugin::{PluginParam, PluginParamOption};

    #[test]
    fn registers_shader_lut_and_audio_capabilities() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("shader.wgsl"), "@compute fn main() {}").unwrap();
        std::fs::write(tmp.path().join("look.cube"), "lut").unwrap();

        let registry = Arc::new(EffectRegistry::with_builtins());
        let activator = EffectRegistryActivator::new(registry.clone());

        let capabilities = vec![
            PluginCapability {
                id: Some("plugin.shader".to_string()),
                capability_type: "effect-shader".to_string(),
                entry: "shader.wgsl".to_string(),
                name: Some("Plugin Shader".to_string()),
                name_key: None,
                description: None,
                category: Some("stylize".to_string()),
                params: vec![PluginParam {
                    name: "amount".to_string(),
                    param_type: "number".to_string(),
                    default: serde_json::json!(0.5),
                    min: Some(0.0),
                    max: Some(1.0),
                    step: Some(0.1),
                    unit: None,
                    label_key: None,
                    options: vec![PluginParamOption {
                        value: serde_json::json!("soft"),
                        label: Some("Soft".to_string()),
                        label_key: None,
                    }],
                    animatable: true,
                }],
            },
            PluginCapability {
                id: Some("plugin.lut".to_string()),
                capability_type: "effect-lut".to_string(),
                entry: "look.cube".to_string(),
                name: Some("Plugin LUT".to_string()),
                name_key: None,
                description: None,
                category: Some("color".to_string()),
                params: Vec::new(),
            },
            PluginCapability {
                id: Some("plugin.audio".to_string()),
                capability_type: "audio-effect".to_string(),
                entry: "native".to_string(),
                name: Some("Plugin Audio".to_string()),
                name_key: None,
                description: None,
                category: Some("audio".to_string()),
                params: Vec::new(),
            },
        ];

        activator
            .on_activate("plugin.test", PluginKind::Shader, &capabilities, tmp.path())
            .unwrap();

        let listed = registry.list_capabilities();
        assert!(listed
            .iter()
            .any(|cap| cap.id == "plugin.shader" && cap.kind == EffectKind::Shader));
        assert!(listed
            .iter()
            .any(|cap| cap.id == "plugin.lut" && cap.kind == EffectKind::Lut));
        assert!(listed
            .iter()
            .any(|cap| cap.id == "plugin.audio" && cap.kind == EffectKind::Audio));

        activator
            .on_deactivate("plugin.test", PluginKind::Shader)
            .unwrap();
        assert!(!registry
            .list_capabilities()
            .iter()
            .any(|cap| cap.source_id.as_deref() == Some("plugin.test")));
    }

    #[test]
    fn activation_reports_missing_shader_entry() {
        let tmp = tempfile::tempdir().unwrap();
        let registry = Arc::new(EffectRegistry::with_builtins());
        let activator = EffectRegistryActivator::new(registry);

        let err = activator
            .on_activate(
                "plugin.test",
                PluginKind::Shader,
                &[PluginCapability {
                    id: Some("plugin.shader".to_string()),
                    capability_type: "effect-shader".to_string(),
                    entry: "missing.wgsl".to_string(),
                    name: None,
                    name_key: None,
                    description: None,
                    category: None,
                    params: Vec::new(),
                }],
                tmp.path(),
            )
            .unwrap_err();

        assert!(err.to_string().contains("entry does not exist"));
    }
}
