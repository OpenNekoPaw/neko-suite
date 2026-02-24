//! EditOperation types for incremental timeline updates
//!
//! Defines a subset of TypeScript EditOperation types that the Rust engine
//! can apply incrementally to a stored Timeline, avoiding full JSON parse + JVI conversion.
//!
//! Currently supported: element.update, track.toggle, element.toggle
//! Unsupported operations fall back to full `streams:update` via Extension.

use serde::Deserialize;
use serde_json::Value;

/// Envelope matching TypeScript EditOperation JSON shape.
/// Only `type` and `payload` are needed; `meta` and `before` are ignored.
#[derive(Debug, Deserialize)]
pub struct EditOperationEnvelope {
    #[serde(rename = "type")]
    pub op_type: String,
    #[serde(default)]
    pub payload: Value,
}

/// Result of attempting to apply an operation incrementally
pub enum ApplyResult {
    /// Operation applied successfully to the timeline
    Applied,
    /// Operation type not supported for incremental apply;
    /// caller should fall back to full `streams:update`
    Unsupported,
}

/// Payload for `element.update` — covers drag, resize, trim operations
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementUpdatePayload {
    pub track_id: String,
    pub element_id: String,
    pub updates: ElementUpdates,
}

/// Subset of Element fields that can be incrementally patched.
/// Fields not present here are ignored (handled by full update fallback on next save).
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementUpdates {
    #[serde(default)]
    pub start_time: Option<f64>,
    #[serde(default)]
    pub duration: Option<f64>,
    #[serde(default)]
    pub trim_start: Option<f64>,
    #[serde(default)]
    pub trim_end: Option<f64>,
    #[serde(default)]
    pub opacity: Option<f64>,
    #[serde(default)]
    pub muted: Option<bool>,
    #[serde(default)]
    pub hidden: Option<bool>,
    #[serde(default)]
    pub locked: Option<bool>,
    #[serde(default)]
    pub name: Option<String>,
}

/// Payload for `track.toggle` — mute/lock/hide a track
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackTogglePayload {
    pub track_id: String,
    /// One of: "muted", "locked", "hidden"
    pub field: String,
}

/// Payload for `element.toggle` — mute/hide/lock an element
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementTogglePayload {
    pub track_id: String,
    pub element_id: String,
    /// One of: "muted", "hidden", "locked"
    pub field: String,
}
