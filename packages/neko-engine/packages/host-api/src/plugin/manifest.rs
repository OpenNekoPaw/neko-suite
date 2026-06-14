//! Plugin manifest types — the contract for plugin packages.
//!
//! Every plugin must ship a `plugin.json` manifest that conforms to
//! `EnginePluginManifest`. The PluginManager validates manifests at
//! scan time and rejects incompatible plugins.

use serde::{Deserialize, Serialize};

use super::governance::PluginTrustTier;

/// Top-level plugin manifest.
///
/// Corresponds to the RFC manifest schema (engine-plugin-rfc.md §6).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnginePluginManifest {
    /// Reverse-domain plugin ID (e.g. "com.neko.shader.chromatic-bloom")
    pub id: String,

    /// Human-readable name
    pub name: String,

    /// SemVer version
    pub version: String,

    /// Plugin kind — determines which capability registry handles it
    pub kind: PluginKind,

    /// Engine version compatibility (SemVer range, e.g. "^0.2.0")
    pub engine_version: String,

    /// Supported platforms (e.g. ["darwin-arm64", "linux-x64"])
    #[serde(default)]
    pub platforms: Vec<String>,

    /// Capabilities provided by this plugin
    #[serde(default)]
    pub capabilities: Vec<PluginCapability>,

    /// Permissions requested by this plugin
    #[serde(default)]
    pub permissions: Vec<String>,

    /// Native runtime artifacts. Marketplace plugin governance only permits cdylib.
    #[serde(default)]
    pub runtime_artifacts: Vec<PluginRuntimeArtifact>,

    /// Native entry point symbol or relative artifact entry.
    #[serde(default)]
    pub entry_point: Option<String>,

    /// Engine host-api version expected by this plugin.
    #[serde(default)]
    pub api_version: Option<String>,

    /// Target triple for the native artifact (e.g. "aarch64-apple-darwin").
    #[serde(default)]
    pub target_triple: Option<String>,

    /// Registry, core, or local development source marker.
    #[serde(default)]
    pub source: PluginSourceKind,

    /// Trust tier projected by signed server manifest or local development flow.
    #[serde(default)]
    pub trust_tier: PluginTrustTier,

    /// Publisher signature metadata used before native activation.
    #[serde(default)]
    pub signature: Option<PluginSignatureInfo>,

    /// Machine binding metadata for per-user commercial native artifacts.
    #[serde(default)]
    pub machine_binding: Option<PluginMachineBinding>,

    /// Content integrity (hash for verification)
    pub integrity: Option<IntegrityInfo>,

    /// Optional description
    pub description: Option<String>,

    /// Optional author
    pub author: Option<String>,

    /// Optional license identifier (SPDX)
    pub license: Option<String>,
}

impl EnginePluginManifest {
    pub fn is_native_cdylib(&self) -> bool {
        self.runtime_artifacts
            .contains(&PluginRuntimeArtifact::Cdylib)
    }

    pub fn is_registry_native_plugin(&self) -> bool {
        self.source == PluginSourceKind::Registry && self.is_native_cdylib()
    }
}

/// Plugin kind — maps to a fixed capability group.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PluginKind {
    /// WGSL Shader / Effect Preset
    Shader,
    /// LUT (Look-Up Table) for color grading
    Lut,
    /// Effect preset (references existing shaders with parameter presets)
    EffectPreset,
    /// AI Model (ONNX / inference task adapter)
    Model,
    /// File format probe / preview adapter
    Format,
    /// Device adapter (camera, MIDI, gamepad extensions)
    Device,
    /// Exporter / encoding preset
    Exporter,
    /// External runtime connector (sidecar / remote service)
    Connector,
}

/// Native runtime artifact shape.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PluginRuntimeArtifact {
    Cdylib,
}

/// Plugin source kind relevant to engine-side load governance.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum PluginSourceKind {
    #[default]
    Registry,
    Core,
    Local,
}

/// Publisher signature metadata. PluginManager consumes an explicit verifier
/// outcome; real cryptographic verification is delegated to the injected
/// authority/verifier boundary.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginSignatureInfo {
    pub algorithm: String,
    pub value: String,
    pub signed_by: Option<String>,
    pub public_key_id: Option<String>,
}

/// Optional machine binding declared by server-owned entitlement/build output.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginMachineBinding {
    pub required: bool,
    pub machine_id: Option<String>,
}

/// A single capability entry in the manifest.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginCapability {
    /// Optional explicit capability id. When absent, activation derives one deterministically.
    #[serde(default)]
    pub id: Option<String>,

    /// Capability type (e.g. "effect-shader", "format-probe")
    #[serde(rename = "type")]
    pub capability_type: String,

    /// Entry point (relative path within the plugin package)
    pub entry: String,

    /// Human-readable capability name.
    #[serde(default)]
    pub name: Option<String>,

    /// Optional UI translation key for the capability name.
    #[serde(default)]
    pub name_key: Option<String>,

    /// Optional human-readable description.
    #[serde(default)]
    pub description: Option<String>,

    /// Optional UI category, e.g. "stylize", "audio", or "preprocess".
    #[serde(default)]
    pub category: Option<String>,

    /// Parameter definitions (for shaders and configurable capabilities)
    #[serde(default)]
    pub params: Vec<PluginParam>,
}

/// A parameter definition for configurable capabilities.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginParam {
    pub name: String,
    #[serde(rename = "type")]
    pub param_type: String,
    #[serde(default)]
    pub default: serde_json::Value,
    #[serde(default)]
    pub min: Option<f64>,
    #[serde(default)]
    pub max: Option<f64>,
    #[serde(default)]
    pub step: Option<f64>,
    #[serde(default)]
    pub unit: Option<String>,
    #[serde(default)]
    pub label_key: Option<String>,
    #[serde(default)]
    pub options: Vec<PluginParamOption>,
    #[serde(default)]
    pub animatable: bool,
}

/// Select-style parameter option for configurable plugin capabilities.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginParamOption {
    pub value: serde_json::Value,
    #[serde(default)]
    pub label: Option<String>,
    #[serde(default)]
    pub label_key: Option<String>,
}

/// Content integrity information.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IntegrityInfo {
    pub algorithm: String,
    pub value: String,
}
