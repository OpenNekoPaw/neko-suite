//! PluginManager — scans, validates, and manages plugin lifecycle.
//!
//! Responsibilities:
//! - Scan plugin install directories for `plugin.json` manifests
//! - Validate manifest schema and engine version compatibility
//! - Track plugin state (enabled / disabled)
//! - Provide query API for the PluginsController

use super::activation::{
    PluginActivationError, PluginActivationOutcome, PluginActivationOutcomeKind,
    PluginActivationResult,
};
use super::audit::{PluginAuditContext, PluginAuditor, PluginPermissionAuditEvent};
use super::governance::{
    now_unix_millis, DefaultPluginLoadAuthority, PluginLicenseDecision, PluginLoadAuthority,
    PluginLoadError, PluginLoadGate, PluginLoadRecord, PluginTrustTier, WorkspaceTrustLevel,
};
use super::manifest::{EnginePluginManifest, PluginCapability, PluginKind, PluginSourceKind};
use super::system_info::{coarse_system_info, PluginSystemInfo};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

/// Callback for plugin activation/deactivation events.
///
/// Implementors register capabilities with the appropriate service
/// (e.g., EffectsService for shaders, MlService for models).
pub trait PluginActivationHandler: Send + Sync {
    /// Called when a plugin is enabled. Should register capabilities.
    fn on_activate(
        &self,
        plugin_id: &str,
        kind: PluginKind,
        capabilities: &[PluginCapability],
        install_path: &Path,
    ) -> PluginActivationResult<PluginActivationOutcome>;

    /// Called when a plugin is disabled. Should unregister capabilities.
    fn on_deactivate(
        &self,
        plugin_id: &str,
        kind: PluginKind,
    ) -> PluginActivationResult<PluginActivationOutcome>;
}

/// Plugin runtime state.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PluginState {
    /// Manifest loaded, not yet activated
    Disabled,
    /// Active and registered with the corresponding capability registry
    Enabled,
    /// Manifest or compatibility error
    Error,
}

/// A loaded plugin with its manifest and current state.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadedPlugin {
    pub manifest: EnginePluginManifest,
    pub state: PluginState,
    pub install_path: PathBuf,
    /// Error message if state is Error
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Plugin manager — owns the plugin registry and lifecycle.
pub struct PluginManager {
    plugins: Mutex<HashMap<String, LoadedPlugin>>,
    install_dirs: Vec<PathBuf>,
    engine_version: String,
    activation_handler: Option<Box<dyn PluginActivationHandler>>,
    load_authority: Box<dyn PluginLoadAuthority>,
    auditor: Arc<PluginAuditor>,
}

impl PluginManager {
    /// Create a new PluginManager.
    ///
    /// `install_dirs` — directories to scan for plugin packages.
    /// `engine_version` — current engine version for compatibility checks.
    pub fn new(install_dirs: Vec<PathBuf>, engine_version: &str) -> Self {
        Self {
            plugins: Mutex::new(HashMap::new()),
            install_dirs,
            engine_version: engine_version.to_string(),
            activation_handler: None,
            load_authority: Box::new(DefaultPluginLoadAuthority::default()),
            auditor: Arc::new(PluginAuditor::new()),
        }
    }

    /// Set the activation handler for plugin enable/disable lifecycle callbacks.
    pub fn with_activation_handler(mut self, handler: Box<dyn PluginActivationHandler>) -> Self {
        self.activation_handler = Some(handler);
        self
    }

    /// Set the Rust-side authority for license, trust, signature, and load gates.
    pub fn with_load_authority(mut self, authority: Box<dyn PluginLoadAuthority>) -> Self {
        self.load_authority = authority;
        self
    }

    /// Set the host-api auditor for plugin permission declarations.
    pub fn with_auditor(mut self, auditor: Arc<PluginAuditor>) -> Self {
        self.auditor = auditor;
        self
    }

    /// Scan all install directories for plugin manifests.
    pub fn scan(&self) -> usize {
        let mut plugins = self.plugins.lock().unwrap_or_else(|e| e.into_inner());
        let mut count = 0;

        for dir in &self.install_dirs {
            if !dir.is_dir() {
                tracing::debug!(dir = %dir.display(), "Plugin directory does not exist, skipping");
                continue;
            }

            let entries = match std::fs::read_dir(dir) {
                Ok(e) => e,
                Err(e) => {
                    tracing::warn!(dir = %dir.display(), error = %e, "Failed to read plugin directory");
                    continue;
                }
            };

            for entry in entries.flatten() {
                let path = entry.path();
                if !path.is_dir() {
                    continue;
                }

                let manifest_path = path.join("plugin.json");
                if !manifest_path.exists() {
                    continue;
                }

                match Self::load_manifest(&manifest_path) {
                    Ok(manifest) => {
                        let id = manifest.id.clone();
                        let state = self.validate_compatibility(&manifest);
                        let error = if state == PluginState::Error {
                            Some("Incompatible engine version".to_string())
                        } else {
                            None
                        };

                        tracing::info!(
                            plugin = %id,
                            version = %manifest.version,
                            kind = ?manifest.kind,
                            state = ?state,
                            "Plugin discovered"
                        );

                        plugins.insert(
                            id,
                            LoadedPlugin {
                                manifest,
                                state,
                                install_path: path,
                                error,
                            },
                        );
                        count += 1;
                    }
                    Err(e) => {
                        tracing::warn!(
                            path = %manifest_path.display(),
                            error = %e,
                            "Failed to load plugin manifest"
                        );
                    }
                }
            }
        }

        tracing::info!(count, "Plugin scan complete");
        count
    }

    /// List all loaded plugins.
    pub fn list(&self) -> Vec<LoadedPlugin> {
        let plugins = self.plugins.lock().unwrap_or_else(|e| e.into_inner());
        plugins.values().cloned().collect()
    }

    /// Get a specific plugin by ID.
    pub fn get(&self, id: &str) -> Option<LoadedPlugin> {
        let plugins = self.plugins.lock().unwrap_or_else(|e| e.into_inner());
        plugins.get(id).cloned()
    }

    /// Enable a plugin. Invokes the activation handler if set.
    pub fn enable(&self, id: &str) -> Result<(), String> {
        let (manifest, install_path) = {
            let mut plugins = self.plugins.lock().map_err(|e| e.to_string())?;
            let plugin = plugins
                .get_mut(id)
                .ok_or_else(|| format!("Plugin not found: {id}"))?;

            if plugin.state == PluginState::Error {
                return Err(format!(
                    "Cannot enable plugin with errors: {}",
                    plugin.error.as_deref().unwrap_or("unknown")
                ));
            }

            let manifest = plugin.manifest.clone();
            let install_path = plugin.install_path.clone();

            (manifest, install_path)
        };

        let license = if manifest.is_native_cdylib() {
            match self.run_load_gates(&manifest, &install_path) {
                Ok(license) => Some(license),
                Err(error) => {
                    self.audit_activation_failure(
                        id,
                        manifest.kind,
                        PluginActivationOutcomeKind::TrustFailure,
                        &error,
                    );
                    return Err(error);
                }
            }
        } else {
            None
        };

        // Invoke activation handler outside the lock
        if let Some(handler) = &self.activation_handler {
            if let Err(error) =
                handler.on_activate(id, manifest.kind, &manifest.capabilities, &install_path)
            {
                let e = error.to_string();
                tracing::warn!(plugin = %id, error = %e, "Activation handler failed");
                // Revert state
                if let Ok(mut plugins) = self.plugins.lock() {
                    if let Some(p) = plugins.get_mut(id) {
                        p.state = PluginState::Disabled;
                        p.error = Some(format!("Activation failed: {e}"));
                    }
                }
                self.audit_activation_failure(id, manifest.kind, error.outcome_kind(), &e);
                return Err(format!("Activation failed: {e}"));
            } else {
                self.auditor.record_lifecycle_event(
                    id,
                    manifest.kind,
                    "activation",
                    "registered",
                    "plugin activation bridge completed",
                );
            }
        } else {
            let error = PluginActivationError::UnsupportedCapability(format!(
                "no activation bridge configured for {:?}",
                manifest.kind
            ));
            let e = error.to_string();
            self.audit_activation_failure(id, manifest.kind, error.outcome_kind(), &e);
            return Err(format!("Activation failed: {e}"));
        }

        {
            let mut plugins = self.plugins.lock().map_err(|e| e.to_string())?;
            let plugin = plugins
                .get_mut(id)
                .ok_or_else(|| format!("Plugin not found after load gates: {id}"))?;
            plugin.state = PluginState::Enabled;
            plugin.error = None;
        }

        if let Some(license) = license {
            self.load_authority.record_load(PluginLoadRecord {
                plugin_id: manifest.id.clone(),
                entitlement_id: license.entitlement_id,
                purchaser_id: license.purchaser_id,
                session_id: license.session_id,
                watermark_id: license.watermark_id,
                timestamp: now_unix_millis(),
            });
        }

        tracing::info!(plugin = %id, "Plugin enabled");
        Ok(())
    }

    /// Record a host-api action made on behalf of a plugin.
    ///
    /// Audit is traceability for engine host-api usage only; it is not a native
    /// syscall sandbox. Direct libc/Win32/CoreFoundation calls remain outside
    /// the in-process PluginManager boundary.
    pub fn record_host_api_call(
        &self,
        plugin_id: &str,
        action: impl Into<String>,
        permission: impl Into<String>,
        context: Option<PluginAuditContext>,
    ) -> Result<PluginPermissionAuditEvent, String> {
        let manifest = {
            let plugins = self.plugins.lock().map_err(|e| e.to_string())?;
            plugins
                .get(plugin_id)
                .ok_or_else(|| format!("Plugin not found: {plugin_id}"))?
                .manifest
                .clone()
        };

        Ok(self
            .auditor
            .record_host_api_call(&manifest, action, permission, context))
    }

    /// Return coarse-grained system information to plugin callers.
    pub fn plugin_system_info(
        &self,
        plugin_id: &str,
        context: Option<PluginAuditContext>,
    ) -> Result<PluginSystemInfo, String> {
        let event = self.record_host_api_call(plugin_id, "system-info", "system-info", context)?;
        if !event.declared {
            tracing::warn!(
                plugin = %plugin_id,
                permission = %event.permission,
                "Plugin used undeclared host-api permission"
            );
        }
        Ok(coarse_system_info())
    }

    /// List recorded host-api audit events.
    pub fn audit_events(&self) -> Vec<PluginPermissionAuditEvent> {
        self.auditor.events()
    }

    /// List recorded activation/deactivation lifecycle audit events.
    pub fn lifecycle_audit_events(&self) -> Vec<super::audit::PluginLifecycleAuditEvent> {
        self.auditor.lifecycle_events()
    }

    /// Disable a plugin. Invokes the deactivation handler if set.
    pub fn disable(&self, id: &str) -> Result<(), String> {
        let kind = {
            let mut plugins = self.plugins.lock().map_err(|e| e.to_string())?;
            let plugin = plugins
                .get_mut(id)
                .ok_or_else(|| format!("Plugin not found: {id}"))?;

            let kind = plugin.manifest.kind;
            plugin.state = PluginState::Disabled;
            kind
        };

        if let Some(handler) = &self.activation_handler {
            match handler.on_deactivate(id, kind) {
                Ok(_) => {
                    self.auditor.record_lifecycle_event(
                        id,
                        kind,
                        "deactivation",
                        "registered",
                        "plugin deactivation bridge completed",
                    );
                }
                Err(error) => {
                    let e = error.to_string();
                    self.audit_activation_failure(id, kind, error.outcome_kind(), &e);
                    tracing::warn!(plugin = %id, error = %e, "Deactivation handler failed");
                }
            }
        }

        tracing::info!(plugin = %id, "Plugin disabled");
        Ok(())
    }

    /// Reload plugins — rescan all directories.
    pub fn reload(&self) -> usize {
        {
            let mut plugins = self.plugins.lock().unwrap_or_else(|e| e.into_inner());
            plugins.clear();
        }
        self.scan()
    }

    /// List plugins filtered by kind.
    pub fn list_by_kind(&self, kind: PluginKind) -> Vec<LoadedPlugin> {
        let plugins = self.plugins.lock().unwrap_or_else(|e| e.into_inner());
        plugins
            .values()
            .filter(|p| p.manifest.kind == kind)
            .cloned()
            .collect()
    }

    /// List only enabled plugins.
    pub fn list_enabled(&self) -> Vec<LoadedPlugin> {
        let plugins = self.plugins.lock().unwrap_or_else(|e| e.into_inner());
        plugins
            .values()
            .filter(|p| p.state == PluginState::Enabled)
            .cloned()
            .collect()
    }

    // =========================================================================
    // Internal
    // =========================================================================

    fn load_manifest(path: &Path) -> Result<EnginePluginManifest, String> {
        let content = std::fs::read_to_string(path).map_err(|e| format!("Read error: {e}"))?;
        serde_json::from_str(&content).map_err(|e| format!("Parse error: {e}"))
    }

    fn validate_compatibility(&self, manifest: &EnginePluginManifest) -> PluginState {
        let required = &manifest.engine_version;

        // Parse engine version
        let engine_ver = match semver::Version::parse(&self.engine_version) {
            Ok(v) => v,
            Err(_) => {
                tracing::warn!(version = %self.engine_version, "Invalid engine version");
                return PluginState::Error;
            }
        };

        // Parse version requirement (supports ^, ~, >=, =, *, ranges)
        let req = match semver::VersionReq::parse(required) {
            Ok(r) => r,
            Err(_) => {
                tracing::warn!(
                    plugin = %manifest.id,
                    requirement = %required,
                    "Invalid engineVersion requirement"
                );
                return PluginState::Error;
            }
        };

        if req.matches(&engine_ver) {
            PluginState::Disabled // compatible, needs explicit enable
        } else {
            PluginState::Error
        }
    }

    fn run_load_gates(
        &self,
        manifest: &EnginePluginManifest,
        install_path: &Path,
    ) -> Result<PluginLicenseDecision, String> {
        self.load_authority
            .verify_integrity(manifest, install_path)
            .map_err(Self::load_error_to_string)?;

        self.load_authority
            .verify_signature(manifest, install_path)
            .map_err(Self::load_error_to_string)?;

        let license = self
            .load_authority
            .check_license(manifest, install_path)
            .map_err(Self::load_error_to_string)?;
        if !license.allowed {
            return Err(Self::load_error_to_string(PluginLoadError::new(
                PluginLoadGate::License,
                &manifest.id,
                "engine license authority denied this plugin",
            )));
        }

        self.check_trust_tier(manifest)?;
        self.check_workspace_trust(manifest)?;
        self.check_target_triple(manifest)?;
        self.check_machine_binding(manifest, &license)?;

        Ok(license)
    }

    fn check_trust_tier(&self, manifest: &EnginePluginManifest) -> Result<(), String> {
        match manifest.trust_tier {
            PluginTrustTier::Core | PluginTrustTier::Verified => Ok(()),
            PluginTrustTier::Community => {
                if manifest.source == PluginSourceKind::Local
                    && self.load_authority.developer_mode_active()
                {
                    Ok(())
                } else {
                    Err(Self::load_error_to_string(PluginLoadError::new(
                        PluginLoadGate::TrustTier,
                        &manifest.id,
                        "community native plugins require Developer Mode local activation or verified publisher trust",
                    )))
                }
            }
            PluginTrustTier::Untrusted => {
                if manifest.source == PluginSourceKind::Local
                    && self.load_authority.developer_mode_active()
                {
                    Ok(())
                } else {
                    Err(Self::load_error_to_string(PluginLoadError::new(
                        PluginLoadGate::TrustTier,
                        &manifest.id,
                        "untrusted native plugin is blocked before activation",
                    )))
                }
            }
        }
    }

    fn check_workspace_trust(&self, manifest: &EnginePluginManifest) -> Result<(), String> {
        let trust = self.load_authority.workspace_trust_level(manifest);
        if manifest.source == PluginSourceKind::Local && trust != WorkspaceTrustLevel::Trusted {
            return Err(Self::load_error_to_string(PluginLoadError::new(
                PluginLoadGate::WorkspaceTrust,
                &manifest.id,
                "sideload native plugin requires trusted workspace",
            )));
        }

        match trust {
            WorkspaceTrustLevel::Trusted | WorkspaceTrustLevel::Restricted => Ok(()),
            WorkspaceTrustLevel::Limited if manifest.trust_tier == PluginTrustTier::Core => Ok(()),
            WorkspaceTrustLevel::Limited => Err(Self::load_error_to_string(PluginLoadError::new(
                PluginLoadGate::WorkspaceTrust,
                &manifest.id,
                "limited workspace allows only core native plugins",
            ))),
        }
    }

    fn check_target_triple(&self, manifest: &EnginePluginManifest) -> Result<(), String> {
        let Some(target_triple) = manifest.target_triple.as_deref() else {
            return Err(Self::load_error_to_string(PluginLoadError::new(
                PluginLoadGate::TargetTriple,
                &manifest.id,
                "native plugin target triple is missing",
            )));
        };

        let current = self.load_authority.current_target_triple();
        if target_triple == current {
            Ok(())
        } else {
            Err(Self::load_error_to_string(PluginLoadError::new(
                PluginLoadGate::TargetTriple,
                &manifest.id,
                format!("plugin target triple {target_triple} is incompatible with {current}"),
            )))
        }
    }

    fn check_machine_binding(
        &self,
        manifest: &EnginePluginManifest,
        license: &PluginLicenseDecision,
    ) -> Result<(), String> {
        let required = license.machine_binding_required
            || manifest
                .machine_binding
                .as_ref()
                .map(|binding| binding.required)
                .unwrap_or(false);
        if !required {
            return Ok(());
        }

        let expected = license
            .bound_machine
            .as_deref()
            .or_else(|| {
                manifest
                    .machine_binding
                    .as_ref()
                    .and_then(|binding| binding.machine_id.as_deref())
            })
            .ok_or_else(|| {
                Self::load_error_to_string(PluginLoadError::new(
                    PluginLoadGate::MachineBinding,
                    &manifest.id,
                    "machine binding is required but no bound machine was provided",
                ))
            })?;

        let current = self.load_authority.current_machine_id().ok_or_else(|| {
            Self::load_error_to_string(PluginLoadError::new(
                PluginLoadGate::MachineBinding,
                &manifest.id,
                "machine binding is required but current machine id is unavailable",
            ))
        })?;

        if current == expected {
            Ok(())
        } else {
            Err(Self::load_error_to_string(PluginLoadError::new(
                PluginLoadGate::MachineBinding,
                &manifest.id,
                "native plugin is bound to a different machine",
            )))
        }
    }

    fn load_error_to_string(error: PluginLoadError) -> String {
        error.to_string()
    }

    fn audit_activation_failure(
        &self,
        plugin_id: &str,
        plugin_kind: PluginKind,
        outcome: PluginActivationOutcomeKind,
        message: &str,
    ) {
        self.auditor.record_lifecycle_event(
            plugin_id,
            plugin_kind,
            "activation",
            format!("{outcome:?}"),
            message,
        );
    }
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::plugin::{EffectRegistryActivator, PluginAuditReporter, PluginLoadResult};
    use neko_engine_kernel::contracts::services::EffectRegistry;
    use neko_engine_types::EffectKind;
    use std::fs;
    use std::sync::{Arc, Mutex};

    fn create_test_plugin(dir: &Path, id: &str, kind: &str) {
        let plugin_dir = dir.join(id);
        fs::create_dir_all(&plugin_dir).unwrap();
        let manifest = serde_json::json!({
            "id": id,
            "name": format!("Test {}", id),
            "version": "0.1.0",
            "kind": kind,
            "engineVersion": "^0.1.0",
            "platforms": ["darwin-arm64"],
            "capabilities": [],
            "permissions": []
        });
        fs::write(
            plugin_dir.join("plugin.json"),
            serde_json::to_string_pretty(&manifest).unwrap(),
        )
        .unwrap();
    }

    fn create_effect_capability_plugin(
        dir: &Path,
        id: &str,
        capability_id: &str,
        entry: &str,
        write_entry: bool,
    ) {
        let plugin_dir = dir.join(id);
        fs::create_dir_all(&plugin_dir).unwrap();
        if write_entry {
            fs::write(plugin_dir.join(entry), "@compute fn main() {}").unwrap();
        }

        let manifest = serde_json::json!({
            "id": id,
            "name": format!("Effect {}", id),
            "version": "0.1.0",
            "kind": "shader",
            "engineVersion": "^0.1.0",
            "platforms": ["darwin-arm64"],
            "capabilities": [{
                "id": capability_id,
                "type": "effect-shader",
                "entry": entry,
                "name": "Plugin Shader",
                "category": "stylize",
                "params": [{
                    "name": "amount",
                    "type": "number",
                    "default": 0.5,
                    "min": 0.0,
                    "max": 1.0,
                    "step": 0.1,
                    "animatable": true
                }]
            }],
            "permissions": []
        });
        fs::write(
            plugin_dir.join("plugin.json"),
            serde_json::to_string_pretty(&manifest).unwrap(),
        )
        .unwrap();
    }

    #[derive(Clone)]
    struct RecordingAuthority {
        calls: Arc<Mutex<Vec<&'static str>>>,
        license_allowed: bool,
        workspace_trust: WorkspaceTrustLevel,
        current_target: String,
        developer_mode: bool,
        machine_id: Option<String>,
    }

    impl RecordingAuthority {
        fn new(calls: Arc<Mutex<Vec<&'static str>>>, current_target: impl Into<String>) -> Self {
            Self {
                calls,
                license_allowed: true,
                workspace_trust: WorkspaceTrustLevel::Trusted,
                current_target: current_target.into(),
                developer_mode: false,
                machine_id: None,
            }
        }

        fn with_license_allowed(mut self, allowed: bool) -> Self {
            self.license_allowed = allowed;
            self
        }

        fn with_workspace_trust(mut self, trust: WorkspaceTrustLevel) -> Self {
            self.workspace_trust = trust;
            self
        }

        fn with_machine_id(mut self, machine_id: impl Into<String>) -> Self {
            self.machine_id = Some(machine_id.into());
            self
        }

        fn with_developer_mode(mut self, active: bool) -> Self {
            self.developer_mode = active;
            self
        }

        fn push(&self, call: &'static str) {
            self.calls.lock().unwrap().push(call);
        }
    }

    impl PluginLoadAuthority for RecordingAuthority {
        fn verify_integrity(
            &self,
            _manifest: &EnginePluginManifest,
            _install_path: &Path,
        ) -> PluginLoadResult<()> {
            self.push("integrity");
            Ok(())
        }

        fn verify_signature(
            &self,
            _manifest: &EnginePluginManifest,
            _install_path: &Path,
        ) -> PluginLoadResult<()> {
            self.push("signature");
            Ok(())
        }

        fn check_license(
            &self,
            manifest: &EnginePluginManifest,
            _install_path: &Path,
        ) -> PluginLoadResult<PluginLicenseDecision> {
            self.push("license");
            Ok(PluginLicenseDecision {
                allowed: self.license_allowed,
                entitlement_id: Some(format!("entitlement-{}", manifest.id)),
                purchaser_id: Some("purchaser-1".to_string()),
                session_id: Some("session-1".to_string()),
                watermark_id: Some("watermark-1".to_string()),
                expires_at: None,
                machine_binding_required: false,
                bound_machine: None,
            })
        }

        fn workspace_trust_level(&self, _manifest: &EnginePluginManifest) -> WorkspaceTrustLevel {
            self.push("workspace");
            self.workspace_trust
        }

        fn developer_mode_active(&self) -> bool {
            self.developer_mode
        }

        fn current_target_triple(&self) -> String {
            self.push("target");
            self.current_target.clone()
        }

        fn current_machine_id(&self) -> Option<String> {
            self.push("machine");
            self.machine_id.clone()
        }

        fn record_load(&self, _record: PluginLoadRecord) {
            self.push("record-load");
        }
    }

    #[derive(Clone, Default)]
    struct RecordingActivationHandler {
        calls: Arc<Mutex<Vec<&'static str>>>,
    }

    impl PluginActivationHandler for RecordingActivationHandler {
        fn on_activate(
            &self,
            plugin_id: &str,
            kind: PluginKind,
            _capabilities: &[PluginCapability],
            _install_path: &Path,
        ) -> PluginActivationResult<PluginActivationOutcome> {
            self.calls.lock().unwrap().push("activate");
            Ok(PluginActivationOutcome::registered(
                plugin_id,
                kind,
                0,
                "recorded activation",
            ))
        }

        fn on_deactivate(
            &self,
            plugin_id: &str,
            kind: PluginKind,
        ) -> PluginActivationResult<PluginActivationOutcome> {
            self.calls.lock().unwrap().push("deactivate");
            Ok(PluginActivationOutcome::registered(
                plugin_id,
                kind,
                0,
                "recorded deactivation",
            ))
        }
    }

    #[derive(Default)]
    struct RecordingReporter {
        events: Arc<Mutex<Vec<PluginPermissionAuditEvent>>>,
    }

    impl PluginAuditReporter for RecordingReporter {
        fn report_permission_violation(&self, event: &PluginPermissionAuditEvent) {
            self.events.lock().unwrap().push(event.clone());
        }
    }

    fn create_native_plugin(dir: &Path, id: &str, target_triple: &str) {
        let plugin_dir = dir.join(id);
        fs::create_dir_all(&plugin_dir).unwrap();
        let manifest = serde_json::json!({
            "id": id,
            "name": format!("Native {}", id),
            "version": "1.0.0",
            "kind": "connector",
            "engineVersion": "^0.1.0",
            "platforms": [target_triple],
            "capabilities": [],
            "permissions": [],
            "runtimeArtifacts": ["cdylib"],
            "entryPoint": "neko_plugin_entry",
            "apiVersion": "0.1.0",
            "targetTriple": target_triple,
            "source": "registry",
            "trustTier": "verified",
            "integrity": {
                "algorithm": "sha256",
                "value": "abc123"
            },
            "signature": {
                "algorithm": "ed25519",
                "value": "sig123",
                "signedBy": "publisher",
                "publicKeyId": "key-1"
            }
        });
        fs::write(
            plugin_dir.join("plugin.json"),
            serde_json::to_string_pretty(&manifest).unwrap(),
        )
        .unwrap();
    }

    #[test]
    fn test_scan_discovers_plugins() {
        let tmp = tempfile::tempdir().unwrap();
        create_test_plugin(tmp.path(), "com.test.shader1", "shader");
        create_test_plugin(tmp.path(), "com.test.model1", "model");

        let mgr = PluginManager::new(vec![tmp.path().to_path_buf()], "0.1.0")
            .with_activation_handler(Box::new(RecordingActivationHandler::default()));
        let count = mgr.scan();
        assert_eq!(count, 2);
        assert_eq!(mgr.list().len(), 2);
    }

    #[test]
    fn test_scan_skips_nonexistent_dir() {
        let mgr = PluginManager::new(vec![PathBuf::from("/nonexistent/dir")], "0.1.0");
        let count = mgr.scan();
        assert_eq!(count, 0);
    }

    #[test]
    fn test_enable_disable() {
        let tmp = tempfile::tempdir().unwrap();
        create_test_plugin(tmp.path(), "com.test.p1", "shader");

        let mgr = PluginManager::new(vec![tmp.path().to_path_buf()], "0.1.0")
            .with_activation_handler(Box::new(RecordingActivationHandler::default()));
        mgr.scan();

        // Initially disabled
        let p = mgr.get("com.test.p1").unwrap();
        assert_eq!(p.state, PluginState::Disabled);

        // Enable
        mgr.enable("com.test.p1").unwrap();
        let p = mgr.get("com.test.p1").unwrap();
        assert_eq!(p.state, PluginState::Enabled);

        // Disable
        mgr.disable("com.test.p1").unwrap();
        let p = mgr.get("com.test.p1").unwrap();
        assert_eq!(p.state, PluginState::Disabled);
    }

    #[test]
    fn effect_registry_activator_registers_and_unregisters_via_manager() {
        let tmp = tempfile::tempdir().unwrap();
        create_effect_capability_plugin(
            tmp.path(),
            "com.test.effect",
            "com.test.effect.shader",
            "shader.wgsl",
            true,
        );

        let registry = Arc::new(EffectRegistry::with_builtins());
        let mgr = PluginManager::new(vec![tmp.path().to_path_buf()], "0.1.0")
            .with_activation_handler(Box::new(EffectRegistryActivator::new(registry.clone())));
        mgr.scan();

        mgr.enable("com.test.effect").unwrap();
        assert!(registry
            .list_capabilities()
            .iter()
            .any(|cap| { cap.id == "com.test.effect.shader" && cap.kind == EffectKind::Shader }));

        mgr.disable("com.test.effect").unwrap();
        assert!(!registry
            .list_capabilities()
            .iter()
            .any(|cap| cap.source_id.as_deref() == Some("com.test.effect")));
    }

    #[test]
    fn effect_registry_activator_failure_is_reported_on_plugin_state() {
        let tmp = tempfile::tempdir().unwrap();
        create_effect_capability_plugin(
            tmp.path(),
            "com.test.bad-effect",
            "com.test.bad.shader",
            "missing.wgsl",
            false,
        );

        let registry = Arc::new(EffectRegistry::with_builtins());
        let mgr = PluginManager::new(vec![tmp.path().to_path_buf()], "0.1.0")
            .with_activation_handler(Box::new(EffectRegistryActivator::new(registry)));
        mgr.scan();

        let err = mgr.enable("com.test.bad-effect").unwrap_err();
        assert!(err.contains("Activation failed"));
        assert!(err.contains("entry does not exist"));

        let plugin = mgr.get("com.test.bad-effect").unwrap();
        assert_eq!(plugin.state, PluginState::Disabled);
        assert!(plugin
            .error
            .as_deref()
            .unwrap_or_default()
            .contains("Activation failed"));
    }

    #[test]
    fn native_load_gates_run_before_activation() {
        let tmp = tempfile::tempdir().unwrap();
        create_native_plugin(tmp.path(), "com.test.native", "test-target");

        let calls = Arc::new(Mutex::new(Vec::new()));
        let authority = RecordingAuthority::new(calls.clone(), "test-target");
        let handler = RecordingActivationHandler {
            calls: calls.clone(),
        };
        let mgr = PluginManager::new(vec![tmp.path().to_path_buf()], "0.1.0")
            .with_load_authority(Box::new(authority))
            .with_activation_handler(Box::new(handler));
        mgr.scan();

        mgr.enable("com.test.native").unwrap();

        assert_eq!(
            calls.lock().unwrap().as_slice(),
            &[
                "integrity",
                "signature",
                "license",
                "workspace",
                "target",
                "activate",
                "record-load"
            ]
        );
        assert_eq!(
            mgr.get("com.test.native").unwrap().state,
            PluginState::Enabled
        );
    }

    #[test]
    fn native_load_rejects_target_triple_mismatch_before_activation() {
        let tmp = tempfile::tempdir().unwrap();
        create_native_plugin(tmp.path(), "com.test.native", "plugin-target");

        let calls = Arc::new(Mutex::new(Vec::new()));
        let authority = RecordingAuthority::new(calls.clone(), "engine-target");
        let handler = RecordingActivationHandler {
            calls: calls.clone(),
        };
        let mgr = PluginManager::new(vec![tmp.path().to_path_buf()], "0.1.0")
            .with_load_authority(Box::new(authority))
            .with_activation_handler(Box::new(handler));
        mgr.scan();

        let error = mgr.enable("com.test.native").unwrap_err();

        assert!(error.contains("TargetTriple"));
        assert!(error.contains("plugin-target"));
        assert!(error.contains("engine-target"));
        assert_eq!(
            calls.lock().unwrap().as_slice(),
            &["integrity", "signature", "license", "workspace", "target"]
        );
        assert_eq!(
            mgr.get("com.test.native").unwrap().state,
            PluginState::Disabled
        );
    }

    #[test]
    fn native_load_rejects_license_denial_before_activation() {
        let tmp = tempfile::tempdir().unwrap();
        create_native_plugin(tmp.path(), "com.test.native", "test-target");

        let calls = Arc::new(Mutex::new(Vec::new()));
        let authority =
            RecordingAuthority::new(calls.clone(), "test-target").with_license_allowed(false);
        let handler = RecordingActivationHandler {
            calls: calls.clone(),
        };
        let mgr = PluginManager::new(vec![tmp.path().to_path_buf()], "0.1.0")
            .with_load_authority(Box::new(authority))
            .with_activation_handler(Box::new(handler));
        mgr.scan();

        let error = mgr.enable("com.test.native").unwrap_err();

        assert!(error.contains("License"));
        assert!(error.contains("engine license authority denied"));
        assert_eq!(
            calls.lock().unwrap().as_slice(),
            &["integrity", "signature", "license"]
        );
        assert_eq!(
            mgr.get("com.test.native").unwrap().state,
            PluginState::Disabled
        );
    }

    #[test]
    fn default_signature_verifier_unavailable_blocks_registry_native_activation() {
        let tmp = tempfile::tempdir().unwrap();
        create_native_plugin(tmp.path(), "com.test.native", "test-target");

        let mgr = PluginManager::new(vec![tmp.path().to_path_buf()], "0.1.0")
            .with_activation_handler(Box::new(RecordingActivationHandler::default()));
        mgr.scan();

        let error = mgr.enable("com.test.native").unwrap_err();

        assert!(error.contains("Signature"));
        assert!(error.contains("ed25519 verification backend is not configured"));
        assert!(mgr
            .lifecycle_audit_events()
            .iter()
            .any(|event| event.message.contains("Signature")));
        assert_eq!(
            mgr.get("com.test.native").unwrap().state,
            PluginState::Disabled
        );
    }

    #[test]
    fn local_developer_mode_still_requires_explicit_activation_bridge() {
        let tmp = tempfile::tempdir().unwrap();
        create_native_plugin(tmp.path(), "com.test.local-native", "test-target");
        {
            let manifest_path = tmp.path().join("com.test.local-native/plugin.json");
            let mut manifest: serde_json::Value =
                serde_json::from_str(&fs::read_to_string(&manifest_path).unwrap()).unwrap();
            manifest["source"] = serde_json::json!("local");
            manifest["trustTier"] = serde_json::json!("community");
            manifest["capabilities"] = serde_json::json!([]);
            fs::write(
                manifest_path,
                serde_json::to_string_pretty(&manifest).unwrap(),
            )
            .unwrap();
        }

        let calls = Arc::new(Mutex::new(Vec::new()));
        let authority = RecordingAuthority::new(calls.clone(), "test-target")
            .with_workspace_trust(WorkspaceTrustLevel::Trusted)
            .with_developer_mode(true);
        let mgr = PluginManager::new(vec![tmp.path().to_path_buf()], "0.1.0")
            .with_load_authority(Box::new(authority));
        mgr.scan();

        let error = mgr.enable("com.test.local-native").unwrap_err();

        assert!(error.contains("no activation bridge configured"));
        assert_eq!(
            calls.lock().unwrap().as_slice(),
            &["integrity", "signature", "license", "workspace", "target"]
        );
    }

    #[test]
    fn native_load_rejects_machine_binding_mismatch() {
        let tmp = tempfile::tempdir().unwrap();
        create_native_plugin(tmp.path(), "com.test.native", "test-target");

        let calls = Arc::new(Mutex::new(Vec::new()));
        let authority =
            RecordingAuthority::new(calls.clone(), "test-target").with_machine_id("machine-b");
        let mgr = PluginManager::new(vec![tmp.path().to_path_buf()], "0.1.0")
            .with_load_authority(Box::new(authority));
        mgr.scan();

        {
            let mut plugins = mgr.plugins.lock().unwrap();
            let plugin = plugins.get_mut("com.test.native").unwrap();
            plugin.manifest.machine_binding = Some(crate::plugin::PluginMachineBinding {
                required: true,
                machine_id: Some("machine-a".to_string()),
            });
        }

        let error = mgr.enable("com.test.native").unwrap_err();

        assert!(error.contains("MachineBinding"));
        assert_eq!(
            calls.lock().unwrap().as_slice(),
            &[
                "integrity",
                "signature",
                "license",
                "workspace",
                "target",
                "machine"
            ]
        );
    }

    #[test]
    fn restricted_workspace_allows_verified_registry_native_plugin() {
        let tmp = tempfile::tempdir().unwrap();
        create_native_plugin(tmp.path(), "com.test.native", "test-target");

        let calls = Arc::new(Mutex::new(Vec::new()));
        let authority = RecordingAuthority::new(calls.clone(), "test-target")
            .with_workspace_trust(WorkspaceTrustLevel::Restricted);
        let mgr = PluginManager::new(vec![tmp.path().to_path_buf()], "0.1.0")
            .with_load_authority(Box::new(authority))
            .with_activation_handler(Box::new(RecordingActivationHandler {
                calls: calls.clone(),
            }));
        mgr.scan();

        mgr.enable("com.test.native").unwrap();

        assert_eq!(
            mgr.get("com.test.native").unwrap().state,
            PluginState::Enabled
        );
    }

    #[test]
    fn limited_workspace_rejects_verified_third_party_native_plugin() {
        let tmp = tempfile::tempdir().unwrap();
        create_native_plugin(tmp.path(), "com.test.native", "test-target");

        let calls = Arc::new(Mutex::new(Vec::new()));
        let authority = RecordingAuthority::new(calls.clone(), "test-target")
            .with_workspace_trust(WorkspaceTrustLevel::Limited);
        let mgr = PluginManager::new(vec![tmp.path().to_path_buf()], "0.1.0")
            .with_load_authority(Box::new(authority));
        mgr.scan();

        let error = mgr.enable("com.test.native").unwrap_err();

        assert!(error.contains("WorkspaceTrust"));
        assert!(error.contains("limited workspace allows only core"));
    }

    #[test]
    fn host_api_audit_reports_undeclared_permission_with_context() {
        let tmp = tempfile::tempdir().unwrap();
        create_test_plugin(tmp.path(), "com.test.audit", "connector");

        let reported = Arc::new(Mutex::new(Vec::new()));
        let reporter = RecordingReporter {
            events: reported.clone(),
        };
        let auditor = Arc::new(PluginAuditor::with_reporter(Box::new(reporter)));
        let mgr = PluginManager::new(vec![tmp.path().to_path_buf()], "0.1.0").with_auditor(auditor);
        mgr.scan();

        let event = mgr
            .record_host_api_call(
                "com.test.audit",
                "system-info",
                "system-info",
                Some(PluginAuditContext {
                    purchaser_id: Some("purchaser-1".to_string()),
                    session_id: Some("session-1".to_string()),
                    watermark_id: Some("watermark-1".to_string()),
                }),
            )
            .unwrap();

        assert_eq!(event.plugin_id, "com.test.audit");
        assert_eq!(event.permission, "system-info");
        assert!(!event.declared);
        assert_eq!(event.purchaser_id.as_deref(), Some("purchaser-1"));
        assert_eq!(event.session_id.as_deref(), Some("session-1"));
        assert_eq!(event.watermark_id.as_deref(), Some("watermark-1"));
        assert!(event.timestamp > 0);
        assert!(event.boundary_note.contains("Host-api audit only records"));
        assert_eq!(reported.lock().unwrap().len(), 1);
    }

    #[test]
    fn plugin_system_info_returns_coarse_values_and_records_audit() {
        let tmp = tempfile::tempdir().unwrap();
        create_test_plugin(tmp.path(), "com.test.info", "connector");

        let mgr = PluginManager::new(vec![tmp.path().to_path_buf()], "0.1.0");
        mgr.scan();

        let info = mgr.plugin_system_info("com.test.info", None).unwrap();
        let serialized = serde_json::to_value(&info).unwrap();

        assert!(serialized.get("osFamily").is_some());
        assert!(serialized.get("archFamily").is_some());
        assert!(serialized.get("cpuFamily").is_some());
        assert!(serialized.get("hostname").is_none());
        assert!(serialized.get("machineId").is_none());
        assert_eq!(mgr.audit_events().len(), 1);
    }

    #[test]
    fn test_enable_nonexistent_fails() {
        let mgr = PluginManager::new(vec![], "0.1.0");
        assert!(mgr.enable("ghost").is_err());
    }

    #[test]
    fn test_incompatible_version_is_error() {
        let tmp = tempfile::tempdir().unwrap();
        let plugin_dir = tmp.path().join("com.test.incompat");
        fs::create_dir_all(&plugin_dir).unwrap();
        let manifest = serde_json::json!({
            "id": "com.test.incompat",
            "name": "Incompatible",
            "version": "1.0.0",
            "kind": "shader",
            "engineVersion": "^2.0.0",
            "platforms": [],
            "capabilities": [],
            "permissions": []
        });
        fs::write(
            plugin_dir.join("plugin.json"),
            serde_json::to_string_pretty(&manifest).unwrap(),
        )
        .unwrap();

        let mgr = PluginManager::new(vec![tmp.path().to_path_buf()], "0.1.0");
        mgr.scan();

        let p = mgr.get("com.test.incompat").unwrap();
        assert_eq!(p.state, PluginState::Error);
        assert!(mgr.enable("com.test.incompat").is_err());
    }

    #[test]
    fn test_reload_clears_and_rescans() {
        let tmp = tempfile::tempdir().unwrap();
        create_test_plugin(tmp.path(), "com.test.r1", "shader");

        let mgr = PluginManager::new(vec![tmp.path().to_path_buf()], "0.1.0");
        mgr.scan();
        assert_eq!(mgr.list().len(), 1);

        // Add another plugin and reload
        create_test_plugin(tmp.path(), "com.test.r2", "model");
        let count = mgr.reload();
        assert_eq!(count, 2);
        assert_eq!(mgr.list().len(), 2);
    }

    #[test]
    fn test_list_by_kind() {
        let tmp = tempfile::tempdir().unwrap();
        create_test_plugin(tmp.path(), "com.test.s1", "shader");
        create_test_plugin(tmp.path(), "com.test.s2", "shader");
        create_test_plugin(tmp.path(), "com.test.m1", "model");

        let mgr = PluginManager::new(vec![tmp.path().to_path_buf()], "0.1.0");
        mgr.scan();

        assert_eq!(mgr.list_by_kind(PluginKind::Shader).len(), 2);
        assert_eq!(mgr.list_by_kind(PluginKind::Model).len(), 1);
        assert_eq!(mgr.list_by_kind(PluginKind::Format).len(), 0);
    }

    // ── semver tests ──

    fn create_plugin_with_version(dir: &Path, id: &str, engine_version: &str) {
        let plugin_dir = dir.join(id);
        fs::create_dir_all(&plugin_dir).unwrap();
        let manifest = serde_json::json!({
            "id": id,
            "name": format!("Test {}", id),
            "version": "1.0.0",
            "kind": "shader",
            "engineVersion": engine_version,
            "platforms": [],
            "capabilities": [],
            "permissions": []
        });
        fs::write(
            plugin_dir.join("plugin.json"),
            serde_json::to_string_pretty(&manifest).unwrap(),
        )
        .unwrap();
    }

    #[test]
    fn test_semver_caret_compatible() {
        let tmp = tempfile::tempdir().unwrap();
        create_plugin_with_version(tmp.path(), "p1", "^0.1.0");
        let mgr = PluginManager::new(vec![tmp.path().to_path_buf()], "0.1.5");
        mgr.scan();
        assert_eq!(mgr.get("p1").unwrap().state, PluginState::Disabled); // compatible
    }

    #[test]
    fn test_semver_caret_incompatible_minor() {
        let tmp = tempfile::tempdir().unwrap();
        // ^0.1.0 requires >=0.1.0 <0.2.0 for 0.x versions
        create_plugin_with_version(tmp.path(), "p1", "^0.1.0");
        let mgr = PluginManager::new(vec![tmp.path().to_path_buf()], "0.2.0");
        mgr.scan();
        assert_eq!(mgr.get("p1").unwrap().state, PluginState::Error);
    }

    #[test]
    fn test_semver_tilde() {
        let tmp = tempfile::tempdir().unwrap();
        create_plugin_with_version(tmp.path(), "p1", "~1.2.0");
        let mgr = PluginManager::new(vec![tmp.path().to_path_buf()], "1.2.9");
        mgr.scan();
        assert_eq!(mgr.get("p1").unwrap().state, PluginState::Disabled);
    }

    #[test]
    fn test_semver_tilde_incompatible() {
        let tmp = tempfile::tempdir().unwrap();
        create_plugin_with_version(tmp.path(), "p1", "~1.2.0");
        let mgr = PluginManager::new(vec![tmp.path().to_path_buf()], "1.3.0");
        mgr.scan();
        assert_eq!(mgr.get("p1").unwrap().state, PluginState::Error);
    }

    #[test]
    fn test_semver_exact() {
        let tmp = tempfile::tempdir().unwrap();
        create_plugin_with_version(tmp.path(), "p1", "=1.0.0");
        let mgr = PluginManager::new(vec![tmp.path().to_path_buf()], "1.0.0");
        mgr.scan();
        assert_eq!(mgr.get("p1").unwrap().state, PluginState::Disabled);

        let mgr2 = PluginManager::new(vec![tmp.path().to_path_buf()], "1.0.1");
        mgr2.scan();
        assert_eq!(mgr2.get("p1").unwrap().state, PluginState::Error);
    }

    #[test]
    fn test_semver_range() {
        let tmp = tempfile::tempdir().unwrap();
        create_plugin_with_version(tmp.path(), "p1", ">=0.2.0, <1.0.0");
        let mgr = PluginManager::new(vec![tmp.path().to_path_buf()], "0.5.0");
        mgr.scan();
        assert_eq!(mgr.get("p1").unwrap().state, PluginState::Disabled);
    }

    #[test]
    fn test_semver_invalid_requirement() {
        let tmp = tempfile::tempdir().unwrap();
        create_plugin_with_version(tmp.path(), "p1", "not_a_version");
        let mgr = PluginManager::new(vec![tmp.path().to_path_buf()], "0.1.0");
        mgr.scan();
        assert_eq!(mgr.get("p1").unwrap().state, PluginState::Error);
    }
}
