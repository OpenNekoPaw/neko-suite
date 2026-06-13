//! Live compositor DTOs.
//!
//! These types mirror the L0 TypeScript contracts in
//! `@neko/shared/types/live-compositor` and intentionally contain no renderer,
//! device, Webview, or editor implementation logic.

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Current live compositor contract version.
pub const LIVE_COMPOSITOR_CONTRACT_VERSION: u16 = 1;

/// 2D vector used by live compositor scene DTOs.
pub type LiveCompositorVec2 = [f64; 2];

/// Rectangle encoded as x, y, width, height.
pub type LiveCompositorRect = [f64; 4];

/// 2D affine matrix encoded as a, b, c, d, e, f.
pub type LiveCompositorAffine2d = [f64; 6];

/// Live source kind before it is adapted into a generic compositor layer.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum LiveCompositorSourceKind {
    Solid,
    Media,
    Camera,
    Puppet,
    Model,
    Scene,
    Overlay,
    TrackingOverlay,
}

/// Semantic layer role for routing, UI, and diagnostics.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum LiveCompositorLayerRole {
    Background,
    Camera,
    Avatar,
    Prop,
    Overlay,
    Diagnostic,
}

/// Blend mode requested by a live layer.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum LiveCompositorBlendMode {
    Normal,
    Multiply,
    Screen,
    Overlay,
    Add,
    Subtract,
    Alpha,
}

/// Policy for unsupported or temporarily unavailable layer sources.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum LiveCompositorSourceUnavailablePolicy {
    Exclude,
    Substitute,
    HoldLastFrame,
    DiagnosticOverlay,
}

/// Tracking overlay visualization mode.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum LiveTrackingOverlayMode {
    Off,
    Landmarks,
    Skeleton,
    Bounds,
    Vectors,
}

/// Tracking overlay behavior when tracking input is stale.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum LiveTrackingOverlayStalePolicy {
    Hide,
    Dim,
    HoldLastFrame,
}

/// Live output route kind.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum LiveOutputRouteKind {
    Monitor,
    Recording,
    ObsVirtualCamera,
    Rtmp,
}

/// Capability and lifecycle status for a live output route.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum LiveOutputRouteStatus {
    Disabled,
    Available,
    Active,
    Unavailable,
    Unsupported,
    PermissionRequired,
}

/// Diagnostic severity for live compositor state.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum LiveCompositorDiagnosticSeverity {
    Info,
    Warning,
    Error,
}

/// Stable diagnostic codes for routing, output, latency, and fallback state.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum LiveCompositorDiagnosticCode {
    UnsupportedSource,
    UnsupportedOutputRoute,
    UnavailableOutputRoute,
    PermissionRequired,
    StaleRevision,
    LatencyBudgetExceeded,
    LatencyUnavailable,
    PreviewNonAuthoritative,
}

/// Latency sample kind for live compositor smoke tests and parity gates.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum LiveCompositorLatencyKind {
    CommandToFrame,
    TrackingToFrame,
    Encode,
    Decode,
    Presentation,
    EndToEnd,
}

/// Live compositor output dimensions and timing.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveCompositorCanvas {
    pub width: f64,
    pub height: f64,
    pub fps: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pixel_ratio: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color_space: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub background: Option<String>,
}

/// Live layer transform data.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveCompositorTransform {
    pub position: LiveCompositorVec2,
    pub scale: LiveCompositorVec2,
    pub rotation_deg: f64,
    pub anchor: LiveCompositorVec2,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub size: Option<LiveCompositorVec2>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub crop: Option<LiveCompositorRect>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub matrix: Option<LiveCompositorAffine2d>,
}

/// Stable source reference. Runtime handles stay outside this DTO.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveCompositorSourceRef {
    pub source_id: String,
    pub kind: LiveCompositorSourceKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub media_ref: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub device_session_ref: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stream_ref: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub entity_ref: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scene_ref: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<Value>,
}

/// Live compositor layer descriptor.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveCompositorLayer {
    pub id: String,
    pub role: LiveCompositorLayerRole,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    pub source: LiveCompositorSourceRef,
    pub transform: LiveCompositorTransform,
    pub opacity: f64,
    pub blend_mode: LiveCompositorBlendMode,
    pub visible: bool,
    pub z_index: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub locked: Option<bool>,
    pub source_unavailable_policy: LiveCompositorSourceUnavailablePolicy,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<Value>,
}

/// Partial live layer mutation payload.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveCompositorLayerPatch {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub role: Option<LiveCompositorLayerRole>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<LiveCompositorSourceRef>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub transform: Option<LiveCompositorTransform>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub opacity: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub blend_mode: Option<LiveCompositorBlendMode>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub visible: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub z_index: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub locked: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_unavailable_policy: Option<LiveCompositorSourceUnavailablePolicy>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<Value>,
}

/// Tracking overlay settings.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveTrackingOverlayConfig {
    pub id: String,
    pub enabled: bool,
    pub visible: bool,
    pub mode: LiveTrackingOverlayMode,
    pub source_ids: Vec<String>,
    pub opacity: f64,
    pub z_index: f64,
    pub stale_policy: LiveTrackingOverlayStalePolicy,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<Value>,
}

/// Named preset of live layers and output routes.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveCompositorPreset {
    pub id: String,
    pub label: String,
    pub order: f64,
    pub layer_ids: Vec<String>,
    pub output_route_ids: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tracking_overlay: Option<LiveTrackingOverlayConfig>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<Value>,
}

/// Engine-owned live output route descriptor.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveOutputRoute {
    pub id: String,
    pub kind: LiveOutputRouteKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    pub enabled: bool,
    pub status: LiveOutputRouteStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target_ref: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub diagnostics: Option<Vec<LiveCompositorDiagnostic>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<Value>,
}

/// Live compositor diagnostic DTO.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveCompositorDiagnostic {
    pub id: String,
    pub code: LiveCompositorDiagnosticCode,
    pub severity: LiveCompositorDiagnosticSeverity,
    pub message: String,
    pub timestamp: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub layer_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_kind: Option<LiveCompositorSourceKind>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub route_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub retryable: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub details: Option<Value>,
}

/// Live compositor latency sample.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveCompositorLatencySample {
    pub id: String,
    pub kind: LiveCompositorLatencyKind,
    pub timestamp: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub value_ms: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub budget_ms: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub within_budget: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub frame_id: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub seq: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unavailable_reason: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<Value>,
}

/// Full live compositor scene state.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveCompositorScene {
    pub contract_version: u16,
    pub scene_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub viewport_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub revision: u64,
    pub canvas: LiveCompositorCanvas,
    pub sources: Vec<LiveCompositorSourceRef>,
    pub layers: Vec<LiveCompositorLayer>,
    pub presets: Vec<LiveCompositorPreset>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub active_preset_id: Option<String>,
    pub tracking_overlay: LiveTrackingOverlayConfig,
    pub output_routes: Vec<LiveOutputRoute>,
    pub diagnostics: Vec<LiveCompositorDiagnostic>,
    pub latency_samples: Vec<LiveCompositorLatencySample>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<Value>,
    pub updated_at: f64,
}

impl LiveCompositorScene {
    /// Returns true when the scene can be handled by this contract version.
    pub fn has_supported_contract_version(&self) -> bool {
        self.contract_version == LIVE_COMPOSITOR_CONTRACT_VERSION
    }
}

/// `scene:live:set-preset` payload.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveCompositorSetPresetPayload {
    pub preset_id: String,
}

/// `scene:live:update-layer` payload.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveCompositorUpdateLayerPayload {
    pub layer_id: String,
    pub patch: LiveCompositorLayerPatch,
}

/// `scene:live:reorder-layer` payload.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveCompositorReorderLayerPayload {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub layer_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub before_layer_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub after_layer_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub z_index: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ordered_layer_ids: Option<Vec<String>>,
}

/// `scene:live:set-tracking-overlay` payload.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveCompositorSetTrackingOverlayPayload {
    pub tracking_overlay: LiveTrackingOverlayConfig,
}

/// `scene:live:set-output-route` payload.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveCompositorSetOutputRoutePayload {
    pub route_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub route: Option<LiveOutputRoute>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct LiveCompositorFixture {
        scene: LiveCompositorScene,
        commands: LiveCompositorCommandFixtures,
    }

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct LiveCompositorCommandFixtures {
        set_preset: LiveCompositorSetPresetPayload,
        update_layer: LiveCompositorUpdateLayerPayload,
        reorder_layer: LiveCompositorReorderLayerPayload,
        set_tracking_overlay: LiveCompositorSetTrackingOverlayPayload,
        set_output_route: LiveCompositorSetOutputRoutePayload,
    }

    fn fixture() -> LiveCompositorFixture {
        let fixture = include_str!(
            "../../../../neko-types/src/types/__fixtures__/live-compositor-scene-v1.json"
        );
        serde_json::from_str(fixture).expect("live compositor fixture should deserialize")
    }

    #[test]
    fn live_compositor_fixture_roundtrips_scene_and_command_payloads() {
        let fixture = fixture();
        let scene = fixture.scene;

        assert_eq!(scene.contract_version, LIVE_COMPOSITOR_CONTRACT_VERSION);
        assert!(scene.has_supported_contract_version());
        assert_eq!(scene.scene_id, "live-scene-main");
        assert_eq!(scene.viewport_id.as_deref(), Some("viewport-live-main"));
        assert_eq!(scene.revision, 12);
        assert_eq!(scene.layers.len(), 4);
        assert_eq!(
            scene.layers[2].source.kind,
            LiveCompositorSourceKind::Puppet
        );
        assert_eq!(
            scene.tracking_overlay.mode,
            LiveTrackingOverlayMode::Skeleton
        );
        assert_eq!(
            scene.output_routes[1].status,
            LiveOutputRouteStatus::Unsupported
        );
        assert_eq!(
            scene.diagnostics[0].code,
            LiveCompositorDiagnosticCode::UnsupportedSource
        );
        assert_eq!(
            scene.latency_samples[0].kind,
            LiveCompositorLatencyKind::CommandToFrame
        );

        assert_eq!(fixture.commands.set_preset.preset_id, "preset-closeup");
        assert_eq!(fixture.commands.update_layer.layer_id, "layer-puppet");
        assert_eq!(
            fixture.commands.reorder_layer.after_layer_id.as_deref(),
            Some("layer-puppet")
        );
        assert_eq!(
            fixture.commands.set_tracking_overlay.tracking_overlay.mode,
            LiveTrackingOverlayMode::Landmarks
        );
        assert_eq!(fixture.commands.set_output_route.route_id, "route-monitor");

        let encoded = serde_json::to_string(&scene).unwrap();
        let round_tripped: LiveCompositorScene = serde_json::from_str(&encoded).unwrap();
        assert_eq!(round_tripped, scene);
    }

    #[test]
    fn live_compositor_rejects_unsupported_contract_version_by_contract() {
        let mut scene = fixture().scene;
        scene.contract_version = 2;

        assert!(!scene.has_supported_contract_version());
    }
}
