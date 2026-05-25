//! Unified viewport protocol DTOs.
//!
//! These types mirror the L0 TypeScript contracts in
//! `@neko/shared/types/viewport-protocol` and intentionally contain no UI or
//! editor-domain implementation logic.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

/// Current viewport protocol version.
pub const VIEWPORT_PROTOCOL_VERSION: u16 = 1;

/// Viewport command domain.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ViewportDomain {
    /// Shared viewport operations such as selection, marquee, transform, and camera.
    Viewport,
    /// Domain scene operations such as scene:puppet:* or scene:model:* writes.
    Scene,
}

/// Command source for permission, diagnostics, and replay policies.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ViewportCommandSource {
    User,
    Agent,
    Script,
    System,
    Replay,
}

/// Viewport event status.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ViewportEventStatus {
    Ack,
    Error,
    Event,
    Resync,
}

/// Stable protocol error payload.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewportProtocolError {
    pub code: String,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub retryable: Option<bool>,
}

/// Engine-mediated viewport or scene command envelope.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewportCommand {
    pub protocol_version: u16,
    pub domain: ViewportDomain,
    pub action: String,
    pub scene_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub viewport_id: Option<String>,
    pub seq: u64,
    pub correlation_id: String,
    pub timestamp: f64,
    pub source: ViewportCommandSource,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub base_revision: Option<u64>,
    #[serde(default = "default_payload")]
    pub payload: Value,
}

impl ViewportCommand {
    /// Returns true when the envelope can be handled by this protocol version.
    pub fn has_supported_protocol_version(&self) -> bool {
        self.protocol_version == VIEWPORT_PROTOCOL_VERSION
    }

    /// Returns true when the action prefix matches the declared domain.
    pub fn has_domain_aligned_action(&self) -> bool {
        match self.domain {
            ViewportDomain::Viewport => self.action.starts_with("viewport:"),
            ViewportDomain::Scene => self.action.starts_with("scene:"),
        }
    }
}

/// Viewport command acknowledgement, error, or scene event envelope.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewportEvent {
    pub protocol_version: u16,
    pub domain: ViewportDomain,
    pub event: String,
    pub scene_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub viewport_id: Option<String>,
    pub ack_seq: u64,
    pub revision: u64,
    pub timestamp: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<ViewportEventStatus>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub applied_seq: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<ViewportProtocolError>,
    #[serde(default = "default_payload")]
    pub payload: Value,
}

impl ViewportEvent {
    /// Returns true when the envelope can be handled by this protocol version.
    pub fn has_supported_protocol_version(&self) -> bool {
        self.protocol_version == VIEWPORT_PROTOCOL_VERSION
    }
}

/// Sideband frame metadata used to align overlays with engine-rendered frames.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewportFrameMeta {
    pub protocol_version: u16,
    pub stream_id: String,
    pub scene_id: String,
    pub viewport_id: String,
    pub frame_id: u64,
    pub pts_us: u64,
    pub duration_us: u64,
    pub frame_timestamp: f64,
    pub revision: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scene_revision: Option<u64>,
    pub applied_seq: u64,
    pub view_transform: [f64; 6],
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub projection: Option<Value>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub diagnostics: BTreeMap<String, Value>,
}

impl ViewportFrameMeta {
    /// Returns true when the frame metadata can be handled by this protocol version.
    pub fn has_supported_protocol_version(&self) -> bool {
        self.protocol_version == VIEWPORT_PROTOCOL_VERSION
    }
}

/// Scene-control metadata event used by the P1 metadata migration path.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewportMetadataEvent {
    pub protocol_version: u16,
    #[serde(rename = "type")]
    pub message_type: String,
    pub scene_id: String,
    pub viewport_id: String,
    pub revision: u64,
    pub applied_seq: u64,
    pub timestamp: f64,
    pub transport: ViewportMetadataTransport,
    pub cadence: ViewportMetadataCadence,
    pub meta: ViewportFrameMeta,
}

/// Metadata event transport. P0 keeps video sideband; P1 mirrors through scene-control.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ViewportMetadataTransport {
    SceneControl,
}

/// Emission cadence for scene-control metadata events.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ViewportMetadataCadence {
    AckCorrelated,
    Periodic,
    OnDemand,
}

impl ViewportMetadataEvent {
    /// Returns true when the metadata event can be handled by this protocol version.
    pub fn has_supported_protocol_version(&self) -> bool {
        self.protocol_version == VIEWPORT_PROTOCOL_VERSION
    }
}

fn default_payload() -> Value {
    Value::Object(Default::default())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct ViewportProtocolFixture {
        command: ViewportCommand,
        scene_command: ViewportCommand,
        ack_event: ViewportEvent,
        error_event: ViewportEvent,
        frame_meta: ViewportFrameMeta,
        metadata_event: ViewportMetadataEvent,
    }

    fn fixture() -> ViewportProtocolFixture {
        let fixture =
            include_str!("../../../../neko-types/src/types/__fixtures__/viewport-protocol-v1.json");
        serde_json::from_str(fixture).expect("viewport protocol fixture should deserialize")
    }

    #[test]
    fn viewport_protocol_fixture_roundtrips_command_event_and_frame_meta() {
        let fixture = fixture();

        assert_eq!(fixture.command.protocol_version, VIEWPORT_PROTOCOL_VERSION);
        assert_eq!(fixture.command.domain, ViewportDomain::Viewport);
        assert_eq!(fixture.command.action, "viewport:select");
        assert!(fixture.command.has_supported_protocol_version());
        assert!(fixture.command.has_domain_aligned_action());

        assert_eq!(fixture.scene_command.domain, ViewportDomain::Scene);
        assert_eq!(fixture.scene_command.base_revision, Some(10));
        assert!(fixture.scene_command.has_domain_aligned_action());

        assert_eq!(fixture.ack_event.ack_seq, 42);
        assert_eq!(fixture.ack_event.status, Some(ViewportEventStatus::Ack));
        assert_eq!(fixture.ack_event.applied_seq, Some(42));

        assert_eq!(
            fixture.error_event.error.as_ref().map(|error| error.code.as_str()),
            Some("revisionConflict")
        );

        assert_eq!(fixture.frame_meta.stream_id, "stream-main");
        assert_eq!(fixture.frame_meta.viewport_id, "viewport-main");
        assert_eq!(fixture.frame_meta.revision, 11);
        assert_eq!(fixture.frame_meta.scene_revision, Some(11));
        assert_eq!(fixture.frame_meta.applied_seq, 42);
        assert_eq!(fixture.frame_meta.view_transform, [1.0, 0.0, 0.0, 1.0, 0.0, 0.0]);
        assert_eq!(fixture.metadata_event.message_type, "viewportMetadata");
        assert_eq!(fixture.metadata_event.transport, ViewportMetadataTransport::SceneControl);
        assert_eq!(fixture.metadata_event.cadence, ViewportMetadataCadence::AckCorrelated);
        assert_eq!(fixture.metadata_event.revision, 11);
        assert_eq!(fixture.metadata_event.applied_seq, 42);
        assert_eq!(fixture.metadata_event.meta, fixture.frame_meta);
        assert!(fixture.metadata_event.has_supported_protocol_version());

        let encoded = serde_json::to_string(&fixture.frame_meta).unwrap();
        let round_tripped: ViewportFrameMeta = serde_json::from_str(&encoded).unwrap();
        assert_eq!(round_tripped, fixture.frame_meta);

        let encoded = serde_json::to_string(&fixture.metadata_event).unwrap();
        let round_tripped: ViewportMetadataEvent = serde_json::from_str(&encoded).unwrap();
        assert_eq!(round_tripped, fixture.metadata_event);
    }

    #[test]
    fn viewport_protocol_rejects_unsupported_version_by_contract() {
        let mut command = fixture().command;
        command.protocol_version = 2;

        assert!(!command.has_supported_protocol_version());
    }
}
