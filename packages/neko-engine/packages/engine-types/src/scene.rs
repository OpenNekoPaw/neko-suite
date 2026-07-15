//! Scene runtime/profile DTOs.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

/// Durable .nkm Scene profile id.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum NkmSceneProfileId {
    #[serde(rename = "2d")]
    TwoD,
    #[serde(rename = "3d")]
    ThreeD,
    Live,
}

/// Scene profile availability classification.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SceneRuntimeProfileStatus {
    Available,
    Degraded,
    Unavailable,
}

/// Stable machine-readable Scene runtime diagnostic code.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SceneRuntimeProfileDiagnosticCode {
    SceneProfileDegraded,
    SceneProfileUnavailable,
}

/// Scene runtime profile diagnostic.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneRuntimeProfileDiagnostic {
    pub code: SceneRuntimeProfileDiagnosticCode,
    pub severity: String,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub context: Option<BTreeMap<String, Value>>,
}

/// SDK/runtime-neutral descriptor for an .nkm Scene profile.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneRuntimeProfileDescriptor {
    pub id: NkmSceneProfileId,
    pub owner: String,
    pub status: SceneRuntimeProfileStatus,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub diagnostics: Vec<SceneRuntimeProfileDiagnostic>,
}
