//! Plugin manifest types — the contract for plugin packages.
//!
//! Every plugin must ship a `plugin.json` manifest that conforms to
//! `EnginePluginManifest`. The PluginManager validates manifests at
//! scan time and rejects incompatible plugins.

use serde::{Deserialize, Serialize};

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

    /// Content integrity (hash for verification)
    pub integrity: Option<IntegrityInfo>,

    /// Optional description
    pub description: Option<String>,

    /// Optional author
    pub author: Option<String>,

    /// Optional license identifier (SPDX)
    pub license: Option<String>,
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

/// A single capability entry in the manifest.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginCapability {
    /// Capability type (e.g. "effect-shader", "format-probe")
    #[serde(rename = "type")]
    pub capability_type: String,

    /// Entry point (relative path within the plugin package)
    pub entry: String,

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
    pub min: Option<f64>,
    pub max: Option<f64>,
}

/// Content integrity information.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IntegrityInfo {
    pub algorithm: String,
    pub value: String,
}
