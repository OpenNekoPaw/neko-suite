//! Native plugin load governance.
//!
//! The engine owns the final decision before a native `cdylib` is activated.
//! These types keep that decision inside Rust and make the check order testable
//! without coupling host-api to marketplace UI state.

use super::manifest::EnginePluginManifest;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

pub const NATIVE_SYSCALL_AUDIT_BOUNDARY_NOTE: &str =
    "Host-api audit only records calls made through engine APIs; in-process native plugins can still call OS libraries directly.";

/// Publisher/runtime trust tier used by native plugin load gates.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum PluginTrustTier {
    Core,
    Verified,
    #[default]
    Community,
    Untrusted,
}

/// Workspace Trust level supplied by the local machine-owned trust authority.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum WorkspaceTrustLevel {
    Trusted,
    Restricted,
    Limited,
}

/// Native load gate order.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PluginLoadGate {
    Integrity,
    Signature,
    License,
    TrustTier,
    WorkspaceTrust,
    TargetTriple,
    MachineBinding,
}

/// Structured load denial used by PluginManager before activation.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginLoadError {
    pub gate: PluginLoadGate,
    pub plugin_id: String,
    pub message: String,
    pub boundary_note: String,
}

impl PluginLoadError {
    pub fn new(
        gate: PluginLoadGate,
        plugin_id: impl Into<String>,
        message: impl Into<String>,
    ) -> Self {
        Self {
            gate,
            plugin_id: plugin_id.into(),
            message: message.into(),
            boundary_note: NATIVE_SYSCALL_AUDIT_BOUNDARY_NOTE.to_string(),
        }
    }
}

impl std::fmt::Display for PluginLoadError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "Plugin load denied at {:?} gate for {}: {}. {}",
            self.gate, self.plugin_id, self.message, self.boundary_note
        )
    }
}

impl std::error::Error for PluginLoadError {}

pub type PluginLoadResult<T> = Result<T, PluginLoadError>;

/// Server-owned license decision after local cache or remote validation.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PluginLicenseDecision {
    pub allowed: bool,
    pub entitlement_id: Option<String>,
    pub expires_at: Option<u64>,
    pub purchaser_id: Option<String>,
    pub session_id: Option<String>,
    pub watermark_id: Option<String>,
    pub machine_binding_required: bool,
    pub bound_machine: Option<String>,
}

impl PluginLicenseDecision {
    pub fn allowed() -> Self {
        Self {
            allowed: true,
            ..Self::default()
        }
    }
}

/// Record emitted after an activation handler successfully accepts a native artifact.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginLoadRecord {
    pub plugin_id: String,
    pub entitlement_id: Option<String>,
    pub purchaser_id: Option<String>,
    pub session_id: Option<String>,
    pub watermark_id: Option<String>,
    pub timestamp: u64,
}

/// Rust-side authority for native plugin load gates.
pub trait PluginLoadAuthority: Send + Sync {
    fn verify_integrity(
        &self,
        manifest: &EnginePluginManifest,
        install_path: &Path,
    ) -> PluginLoadResult<()>;

    fn verify_signature(
        &self,
        manifest: &EnginePluginManifest,
        install_path: &Path,
    ) -> PluginLoadResult<()>;

    fn check_license(
        &self,
        manifest: &EnginePluginManifest,
        install_path: &Path,
    ) -> PluginLoadResult<PluginLicenseDecision>;

    fn workspace_trust_level(&self, manifest: &EnginePluginManifest) -> WorkspaceTrustLevel;

    fn developer_mode_active(&self) -> bool {
        false
    }

    fn current_target_triple(&self) -> String {
        current_target_triple()
    }

    fn current_machine_id(&self) -> Option<String> {
        None
    }

    fn record_load(&self, _record: PluginLoadRecord) {}
}

/// Conservative built-in authority used when no registry/license adapter is wired.
///
/// It does not trust TypeScript UI state. Registry native plugins are denied at
/// the license gate unless a real authority is injected; local native plugins
/// remain denied unless an injected authority explicitly enables Developer Mode.
#[derive(Debug, Default)]
pub struct DefaultPluginLoadAuthority;

impl PluginLoadAuthority for DefaultPluginLoadAuthority {
    fn verify_integrity(
        &self,
        manifest: &EnginePluginManifest,
        _install_path: &Path,
    ) -> PluginLoadResult<()> {
        let Some(integrity) = &manifest.integrity else {
            if manifest.is_registry_native_plugin() {
                return Err(PluginLoadError::new(
                    PluginLoadGate::Integrity,
                    &manifest.id,
                    "registry native plugin requires integrity metadata",
                ));
            }
            return Ok(());
        };

        if integrity.algorithm.trim().is_empty() || integrity.value.trim().is_empty() {
            return Err(PluginLoadError::new(
                PluginLoadGate::Integrity,
                &manifest.id,
                "integrity metadata is incomplete",
            ));
        }
        Ok(())
    }

    fn verify_signature(
        &self,
        manifest: &EnginePluginManifest,
        _install_path: &Path,
    ) -> PluginLoadResult<()> {
        let Some(signature) = &manifest.signature else {
            if manifest.is_registry_native_plugin() {
                return Err(PluginLoadError::new(
                    PluginLoadGate::Signature,
                    &manifest.id,
                    "registry native plugin requires engine-verifiable signature metadata",
                ));
            }
            return Ok(());
        };

        if signature.algorithm.trim().is_empty() || signature.value.trim().is_empty() {
            return Err(PluginLoadError::new(
                PluginLoadGate::Signature,
                &manifest.id,
                "signature metadata is incomplete",
            ));
        }
        Ok(())
    }

    fn check_license(
        &self,
        manifest: &EnginePluginManifest,
        _install_path: &Path,
    ) -> PluginLoadResult<PluginLicenseDecision> {
        if manifest.is_registry_native_plugin() {
            return Err(PluginLoadError::new(
                PluginLoadGate::License,
                &manifest.id,
                "engine license authority is not configured",
            ));
        }
        Ok(PluginLicenseDecision::allowed())
    }

    fn workspace_trust_level(&self, _manifest: &EnginePluginManifest) -> WorkspaceTrustLevel {
        WorkspaceTrustLevel::Restricted
    }
}

pub fn now_unix_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default()
}

pub fn current_target_triple() -> String {
    match (std::env::consts::ARCH, std::env::consts::OS) {
        ("aarch64", "macos") => "aarch64-apple-darwin".to_string(),
        ("x86_64", "macos") => "x86_64-apple-darwin".to_string(),
        ("aarch64", "linux") => "aarch64-unknown-linux-gnu".to_string(),
        ("x86_64", "linux") => "x86_64-unknown-linux-gnu".to_string(),
        ("aarch64", "windows") => "aarch64-pc-windows-msvc".to_string(),
        ("x86_64", "windows") => "x86_64-pc-windows-msvc".to_string(),
        (arch, os) => format!("{arch}-{os}"),
    }
}
