//! PluginManager — scans, validates, and manages plugin lifecycle.
//!
//! Responsibilities:
//! - Scan plugin install directories for `plugin.json` manifests
//! - Validate manifest schema and engine version compatibility
//! - Track plugin state (enabled / disabled)
//! - Provide query API for the PluginsController

use super::manifest::{EnginePluginManifest, PluginCapability, PluginKind};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

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
    ) -> std::result::Result<(), String>;

    /// Called when a plugin is disabled. Should unregister capabilities.
    fn on_deactivate(
        &self,
        plugin_id: &str,
        kind: PluginKind,
    ) -> std::result::Result<(), String>;
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
        }
    }

    /// Set the activation handler for plugin enable/disable lifecycle callbacks.
    pub fn with_activation_handler(mut self, handler: Box<dyn PluginActivationHandler>) -> Self {
        self.activation_handler = Some(handler);
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
        let (kind, capabilities, install_path) = {
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

            let kind = plugin.manifest.kind;
            let capabilities = plugin.manifest.capabilities.clone();
            let install_path = plugin.install_path.clone();

            plugin.state = PluginState::Enabled;
            (kind, capabilities, install_path)
        };

        // Invoke activation handler outside the lock
        if let Some(handler) = &self.activation_handler {
            if let Err(e) = handler.on_activate(id, kind, &capabilities, &install_path) {
                tracing::warn!(plugin = %id, error = %e, "Activation handler failed");
                // Revert state
                if let Ok(mut plugins) = self.plugins.lock() {
                    if let Some(p) = plugins.get_mut(id) {
                        p.state = PluginState::Disabled;
                        p.error = Some(format!("Activation failed: {e}"));
                    }
                }
                return Err(format!("Activation failed: {e}"));
            }
        }

        tracing::info!(plugin = %id, "Plugin enabled");
        Ok(())
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
            if let Err(e) = handler.on_deactivate(id, kind) {
                tracing::warn!(plugin = %id, error = %e, "Deactivation handler failed");
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
        let content =
            std::fs::read_to_string(path).map_err(|e| format!("Read error: {e}"))?;
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
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

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

    #[test]
    fn test_scan_discovers_plugins() {
        let tmp = tempfile::tempdir().unwrap();
        create_test_plugin(tmp.path(), "com.test.shader1", "shader");
        create_test_plugin(tmp.path(), "com.test.model1", "model");

        let mgr = PluginManager::new(vec![tmp.path().to_path_buf()], "0.1.0");
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

        let mgr = PluginManager::new(vec![tmp.path().to_path_buf()], "0.1.0");
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
