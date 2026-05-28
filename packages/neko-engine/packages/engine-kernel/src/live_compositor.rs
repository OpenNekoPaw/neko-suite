//! Live compositor layer planning.
//!
//! This module adapts live-domain layer DTOs into generic compositor inputs.
//! Domain-specific source resolution happens before this boundary; GPU
//! compositor code remains unaware of live scene, device, puppet, or model
//! concepts.

use neko_engine_gpu::{BlendMode, Transform2D};
use neko_engine_types::{
    LiveCompositorBlendMode, LiveCompositorDiagnostic, LiveCompositorDiagnosticCode,
    LiveCompositorDiagnosticSeverity, LiveCompositorFallbackPolicy, LiveCompositorLayer,
    LiveCompositorLayerRole, LiveCompositorScene, LiveCompositorSourceKind,
    LiveCompositorSourceRef,
};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};

/// Supported adapter decision for one live source layer.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LiveCompositorAdapterStatus {
    Ready,
    DiagnosticOverlay,
    Unsupported,
}

/// Adapter context supplied by host/device/session layers.
#[derive(Debug, Clone, Default)]
pub struct LiveCompositorAdapterContext {
    pub timestamp: f64,
    pub authorized_device_sessions: HashSet<String>,
    pub supported_media_refs: HashSet<String>,
    pub supported_stream_refs: HashSet<String>,
    pub supported_entity_refs: HashSet<String>,
    pub supported_scene_refs: HashSet<String>,
}

impl LiveCompositorAdapterContext {
    /// Build a synthetic adapter context from trusted scene metadata.
    pub fn from_scene_metadata(scene: &LiveCompositorScene) -> Self {
        let mut context = Self {
            timestamp: scene.updated_at,
            ..Self::default()
        };

        for source in &scene.sources {
            if metadata_authorized(source) {
                if let Some(device_session_ref) = &source.device_session_ref {
                    context
                        .authorized_device_sessions
                        .insert(device_session_ref.clone());
                }
            }
            if let Some(media_ref) = &source.media_ref {
                context.supported_media_refs.insert(media_ref.clone());
            }
            if let Some(stream_ref) = &source.stream_ref {
                context.supported_stream_refs.insert(stream_ref.clone());
            }
            if let Some(entity_ref) = &source.entity_ref {
                context.supported_entity_refs.insert(entity_ref.clone());
            }
            if let Some(scene_ref) = &source.scene_ref {
                context.supported_scene_refs.insert(scene_ref.clone());
            }
        }

        context
    }
}

/// Generic compositor layer plan derived from a live compositor layer.
#[derive(Debug, Clone)]
pub struct LiveCompositorLayerPlan {
    pub layer_id: String,
    pub source_id: String,
    pub source_kind: LiveCompositorSourceKind,
    pub role: LiveCompositorLayerRole,
    pub transform: Transform2D,
    pub opacity: f32,
    pub blend_mode: BlendMode,
    pub z_index: i32,
    pub visible: bool,
    pub adapter_status: LiveCompositorAdapterStatus,
    pub diagnostic_overlay: bool,
    pub tracking_source_ids: Vec<String>,
}

/// Full live compositor scene plan and adapter diagnostics.
#[derive(Debug, Clone)]
pub struct LiveCompositorScenePlan {
    pub layers: Vec<LiveCompositorLayerPlan>,
    pub diagnostics: Vec<LiveCompositorDiagnostic>,
}

/// Convert visible live layers into generic compositor layer plans.
pub fn plan_live_compositor_layers(layers: &[LiveCompositorLayer]) -> Vec<LiveCompositorLayerPlan> {
    let mut planned: Vec<LiveCompositorLayerPlan> = layers
        .iter()
        .filter(|layer| layer.visible)
        .map(plan_live_compositor_layer)
        .collect();
    planned.sort_by_key(|layer| layer.z_index);
    planned
}

/// Convert a live scene into generic compositor layer plans and diagnostics.
pub fn plan_live_compositor_scene(
    scene: &LiveCompositorScene,
    context: &LiveCompositorAdapterContext,
) -> LiveCompositorScenePlan {
    let sources_by_id: HashMap<&str, &LiveCompositorSourceRef> = scene
        .sources
        .iter()
        .map(|source| (source.source_id.as_str(), source))
        .collect();
    let mut layers = Vec::new();
    let mut diagnostics = Vec::new();

    for layer in scene.layers.iter().filter(|layer| layer.visible) {
        let source = sources_by_id
            .get(layer.source.source_id.as_str())
            .copied()
            .unwrap_or(&layer.source);
        let adaptation = adapt_live_compositor_source(layer, source, context);
        diagnostics.extend(adaptation.diagnostics);

        let mut plan = plan_live_compositor_layer(layer);
        plan.source_kind = source.kind;
        plan.adapter_status = adaptation.status;
        plan.diagnostic_overlay = adaptation.diagnostic_overlay;
        if source.kind == LiveCompositorSourceKind::TrackingOverlay {
            plan.tracking_source_ids = scene.tracking_overlay.source_ids.clone();
        }
        layers.push(plan);
    }

    if scene.tracking_overlay.enabled
        && scene.tracking_overlay.visible
        && !layers
            .iter()
            .any(|layer| layer.source_kind == LiveCompositorSourceKind::TrackingOverlay)
    {
        layers.push(synthetic_tracking_overlay_plan(scene));
    }

    layers.sort_by_key(|layer| layer.z_index);
    LiveCompositorScenePlan {
        layers,
        diagnostics,
    }
}

/// Convert one live layer into a generic compositor layer plan.
pub fn plan_live_compositor_layer(layer: &LiveCompositorLayer) -> LiveCompositorLayerPlan {
    LiveCompositorLayerPlan {
        layer_id: layer.id.clone(),
        source_id: layer.source.source_id.clone(),
        source_kind: layer.source.kind,
        role: layer.role,
        transform: Transform2D {
            x: layer.transform.position[0] as f32,
            y: layer.transform.position[1] as f32,
            scale_x: layer.transform.scale[0] as f32,
            scale_y: layer.transform.scale[1] as f32,
            rotation: layer.transform.rotation_deg as f32,
            anchor_x: layer.transform.anchor[0] as f32,
            anchor_y: layer.transform.anchor[1] as f32,
            _padding: 0.0,
        },
        opacity: (layer.opacity as f32).clamp(0.0, 1.0),
        blend_mode: live_blend_mode_to_gpu(layer.blend_mode),
        z_index: normalized_z_index(layer.z_index),
        visible: layer.visible,
        adapter_status: LiveCompositorAdapterStatus::Ready,
        diagnostic_overlay: layer.source.kind == LiveCompositorSourceKind::TrackingOverlay,
        tracking_source_ids: Vec::new(),
    }
}

struct SourceAdaptation {
    status: LiveCompositorAdapterStatus,
    diagnostic_overlay: bool,
    diagnostics: Vec<LiveCompositorDiagnostic>,
}

fn adapt_live_compositor_source(
    layer: &LiveCompositorLayer,
    source: &LiveCompositorSourceRef,
    context: &LiveCompositorAdapterContext,
) -> SourceAdaptation {
    match source.kind {
        LiveCompositorSourceKind::Solid => {
            if source.color.is_some() {
                ready_adaptation(false)
            } else {
                unsupported_adaptation(
                    layer,
                    source,
                    context,
                    LiveCompositorDiagnosticCode::UnsupportedSource,
                    "solid background source requires a color",
                    false,
                )
            }
        }
        LiveCompositorSourceKind::Media => {
            if ref_supported(source.media_ref.as_ref(), &context.supported_media_refs)
                || ref_supported(source.stream_ref.as_ref(), &context.supported_stream_refs)
            {
                ready_adaptation(false)
            } else {
                unsupported_adaptation(
                    layer,
                    source,
                    context,
                    LiveCompositorDiagnosticCode::UnsupportedSource,
                    "media source is not registered as a compositor input",
                    true,
                )
            }
        }
        LiveCompositorSourceKind::Camera => {
            if ref_supported(source.stream_ref.as_ref(), &context.supported_stream_refs)
                || ref_supported(
                    source.device_session_ref.as_ref(),
                    &context.authorized_device_sessions,
                )
            {
                ready_adaptation(false)
            } else {
                unsupported_adaptation(
                    layer,
                    source,
                    context,
                    LiveCompositorDiagnosticCode::PermissionRequired,
                    "camera source requires an authorized device session",
                    true,
                )
            }
        }
        LiveCompositorSourceKind::Puppet => {
            if ref_supported(source.stream_ref.as_ref(), &context.supported_stream_refs)
                || ref_supported(source.entity_ref.as_ref(), &context.supported_entity_refs)
            {
                ready_adaptation(false)
            } else {
                unsupported_adaptation(
                    layer,
                    source,
                    context,
                    LiveCompositorDiagnosticCode::UnsupportedSource,
                    "puppet source cannot be adapted into a compositor layer yet",
                    true,
                )
            }
        }
        LiveCompositorSourceKind::Model => {
            if ref_supported(source.stream_ref.as_ref(), &context.supported_stream_refs)
                || ref_supported(source.entity_ref.as_ref(), &context.supported_entity_refs)
            {
                ready_adaptation(false)
            } else {
                unsupported_adaptation(
                    layer,
                    source,
                    context,
                    LiveCompositorDiagnosticCode::UnsupportedSource,
                    "model source cannot be adapted into a compositor layer yet",
                    true,
                )
            }
        }
        LiveCompositorSourceKind::Scene => {
            if ref_supported(source.stream_ref.as_ref(), &context.supported_stream_refs)
                || ref_supported(source.scene_ref.as_ref(), &context.supported_scene_refs)
            {
                ready_adaptation(false)
            } else {
                unsupported_adaptation(
                    layer,
                    source,
                    context,
                    LiveCompositorDiagnosticCode::UnsupportedSource,
                    "scene source cannot be adapted into a compositor layer yet",
                    true,
                )
            }
        }
        LiveCompositorSourceKind::Overlay | LiveCompositorSourceKind::TrackingOverlay => {
            ready_adaptation(true)
        }
    }
}

fn ready_adaptation(diagnostic_overlay: bool) -> SourceAdaptation {
    SourceAdaptation {
        status: LiveCompositorAdapterStatus::Ready,
        diagnostic_overlay,
        diagnostics: Vec::new(),
    }
}

fn unsupported_adaptation(
    layer: &LiveCompositorLayer,
    source: &LiveCompositorSourceRef,
    context: &LiveCompositorAdapterContext,
    code: LiveCompositorDiagnosticCode,
    message: &str,
    retryable: bool,
) -> SourceAdaptation {
    SourceAdaptation {
        status: fallback_status(layer.fallback_policy),
        diagnostic_overlay: layer.fallback_policy
            == LiveCompositorFallbackPolicy::DiagnosticOverlay,
        diagnostics: vec![LiveCompositorDiagnostic {
            id: format!("diag-adapter-{}-{}", layer.id, source.source_id),
            code,
            severity: LiveCompositorDiagnosticSeverity::Warning,
            message: message.to_string(),
            timestamp: context.timestamp,
            layer_id: Some(layer.id.clone()),
            source_id: Some(source.source_id.clone()),
            source_kind: Some(source.kind),
            route_id: None,
            retryable: Some(retryable),
            details: Some(json!({
                "fallbackPolicy": layer.fallback_policy,
                "adapterStatus": fallback_status_name(fallback_status(layer.fallback_policy))
            })),
        }],
    }
}

fn fallback_status(fallback_policy: LiveCompositorFallbackPolicy) -> LiveCompositorAdapterStatus {
    match fallback_policy {
        LiveCompositorFallbackPolicy::DiagnosticOverlay
        | LiveCompositorFallbackPolicy::Substitute => {
            LiveCompositorAdapterStatus::DiagnosticOverlay
        }
        LiveCompositorFallbackPolicy::Exclude | LiveCompositorFallbackPolicy::HoldLastFrame => {
            LiveCompositorAdapterStatus::Unsupported
        }
    }
}

fn fallback_status_name(status: LiveCompositorAdapterStatus) -> &'static str {
    match status {
        LiveCompositorAdapterStatus::Ready => "ready",
        LiveCompositorAdapterStatus::DiagnosticOverlay => "diagnostic-overlay",
        LiveCompositorAdapterStatus::Unsupported => "unsupported",
    }
}

fn ref_supported(reference: Option<&String>, supported_refs: &HashSet<String>) -> bool {
    reference.is_some_and(|value| supported_refs.contains(value))
}

fn metadata_authorized(source: &LiveCompositorSourceRef) -> bool {
    source
        .metadata
        .as_ref()
        .and_then(Value::as_object)
        .and_then(|metadata| metadata.get("authorized"))
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

fn synthetic_tracking_overlay_plan(scene: &LiveCompositorScene) -> LiveCompositorLayerPlan {
    LiveCompositorLayerPlan {
        layer_id: scene.tracking_overlay.id.clone(),
        source_id: scene.tracking_overlay.id.clone(),
        source_kind: LiveCompositorSourceKind::TrackingOverlay,
        role: LiveCompositorLayerRole::Diagnostic,
        transform: Transform2D {
            x: (scene.canvas.width * 0.5) as f32,
            y: (scene.canvas.height * 0.5) as f32,
            scale_x: 1.0,
            scale_y: 1.0,
            rotation: 0.0,
            anchor_x: 0.5,
            anchor_y: 0.5,
            _padding: 0.0,
        },
        opacity: (scene.tracking_overlay.opacity as f32).clamp(0.0, 1.0),
        blend_mode: BlendMode::Normal,
        z_index: normalized_z_index(scene.tracking_overlay.z_index),
        visible: scene.tracking_overlay.visible,
        adapter_status: LiveCompositorAdapterStatus::Ready,
        diagnostic_overlay: true,
        tracking_source_ids: scene.tracking_overlay.source_ids.clone(),
    }
}

fn live_blend_mode_to_gpu(blend_mode: LiveCompositorBlendMode) -> BlendMode {
    match blend_mode {
        LiveCompositorBlendMode::Normal => BlendMode::Normal,
        LiveCompositorBlendMode::Multiply => BlendMode::Multiply,
        LiveCompositorBlendMode::Screen => BlendMode::Screen,
        LiveCompositorBlendMode::Overlay => BlendMode::Overlay,
        LiveCompositorBlendMode::Add => BlendMode::LinearDodge,
        LiveCompositorBlendMode::Subtract => BlendMode::Subtract,
        LiveCompositorBlendMode::Alpha => BlendMode::Normal,
    }
}

fn normalized_z_index(z_index: f64) -> i32 {
    if !z_index.is_finite() {
        return 0;
    }
    z_index.round().clamp(i32::MIN as f64, i32::MAX as f64) as i32
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    fn fixture_scene() -> LiveCompositorScene {
        let fixture = include_str!(
            "../../../../neko-types/src/types/__fixtures__/live-compositor-scene-v1.json"
        );
        let value: Value = serde_json::from_str(fixture).unwrap();
        serde_json::from_value(value["scene"].clone()).unwrap()
    }

    fn fixture_layers() -> Vec<LiveCompositorLayer> {
        let fixture = include_str!(
            "../../../../neko-types/src/types/__fixtures__/live-compositor-scene-v1.json"
        );
        let value: Value = serde_json::from_str(fixture).unwrap();
        serde_json::from_value(value["scene"]["layers"].clone()).unwrap()
    }

    #[test]
    fn live_layers_plan_into_generic_compositor_primitives() {
        let plans = plan_live_compositor_layers(&fixture_layers());

        assert_eq!(plans.len(), 4);
        assert_eq!(plans[0].layer_id, "layer-bg");
        assert_eq!(plans[0].source_kind, LiveCompositorSourceKind::Solid);
        assert_eq!(plans[0].blend_mode, BlendMode::Normal);
        assert_eq!(plans[0].z_index, 0);

        let puppet = plans
            .iter()
            .find(|layer| layer.layer_id == "layer-puppet")
            .unwrap();
        assert_eq!(puppet.source_kind, LiveCompositorSourceKind::Puppet);
        assert_eq!(puppet.role, LiveCompositorLayerRole::Avatar);
        assert_eq!(puppet.transform.x, 960.0);
        assert_eq!(puppet.transform.anchor_x, 0.5);
    }

    #[test]
    fn live_layer_planning_filters_hidden_layers_and_clamps_opacity() {
        let mut layers = fixture_layers();
        layers[0].visible = false;
        layers[1].opacity = 2.0;

        let plans = plan_live_compositor_layers(&layers);

        assert!(!plans
            .iter()
            .any(|layer| layer.layer_id == "layer-background"));
        assert_eq!(plans[0].opacity, 1.0);
    }

    #[test]
    fn live_scene_adapter_accepts_authorized_camera_puppet_and_tracking_overlay() {
        let scene = fixture_scene();
        let context = LiveCompositorAdapterContext::from_scene_metadata(&scene);

        let plan = plan_live_compositor_scene(&scene, &context);

        assert_eq!(plan.layers.len(), 4);
        assert!(plan.diagnostics.is_empty());
        let camera = plan
            .layers
            .iter()
            .find(|layer| layer.layer_id == "layer-camera")
            .unwrap();
        assert_eq!(camera.adapter_status, LiveCompositorAdapterStatus::Ready);

        let puppet = plan
            .layers
            .iter()
            .find(|layer| layer.layer_id == "layer-puppet")
            .unwrap();
        assert_eq!(puppet.adapter_status, LiveCompositorAdapterStatus::Ready);

        let overlay = plan
            .layers
            .iter()
            .find(|layer| layer.layer_id == "layer-tracking-overlay")
            .unwrap();
        assert!(overlay.diagnostic_overlay);
        assert_eq!(
            overlay.tracking_source_ids,
            scene.tracking_overlay.source_ids
        );
    }

    #[test]
    fn live_scene_adapter_reports_unauthorized_camera_without_device_url_fallback() {
        let mut scene = fixture_scene();
        let source = scene
            .sources
            .iter_mut()
            .find(|source| source.source_id == "source-camera-a")
            .unwrap();
        source.metadata = None;
        let layer = scene
            .layers
            .iter_mut()
            .find(|layer| layer.id == "layer-camera")
            .unwrap();
        layer.source.metadata = None;
        let context = LiveCompositorAdapterContext::from_scene_metadata(&scene);

        let plan = plan_live_compositor_scene(&scene, &context);

        let camera = plan
            .layers
            .iter()
            .find(|layer| layer.layer_id == "layer-camera")
            .unwrap();
        assert_eq!(
            camera.adapter_status,
            LiveCompositorAdapterStatus::DiagnosticOverlay
        );
        assert_eq!(plan.diagnostics.len(), 1);
        assert_eq!(
            plan.diagnostics[0].code,
            LiveCompositorDiagnosticCode::PermissionRequired
        );
        assert_eq!(
            plan.diagnostics[0].source_kind,
            Some(LiveCompositorSourceKind::Camera)
        );
    }

    #[test]
    fn live_scene_adapter_reports_unsupported_puppet_model_and_scene_sources() {
        let mut scene = fixture_scene();
        let source = scene
            .sources
            .iter_mut()
            .find(|source| source.source_id == "source-puppet-main")
            .unwrap();
        source.entity_ref = None;
        let layer = scene
            .layers
            .iter_mut()
            .find(|layer| layer.id == "layer-puppet")
            .unwrap();
        layer.source.entity_ref = None;
        let template_layer = layer.clone();

        let mut model_layer = template_layer.clone();
        model_layer.id = "layer-model".to_string();
        model_layer.source.source_id = "source-model".to_string();
        model_layer.source.kind = LiveCompositorSourceKind::Model;
        model_layer.source.entity_ref = None;
        model_layer.fallback_policy = LiveCompositorFallbackPolicy::DiagnosticOverlay;
        scene.layers.push(model_layer);
        scene.sources.push(LiveCompositorSourceRef {
            source_id: "source-model".to_string(),
            kind: LiveCompositorSourceKind::Model,
            label: Some("Model".to_string()),
            media_ref: None,
            device_session_ref: None,
            stream_ref: None,
            entity_ref: None,
            scene_ref: None,
            color: None,
            metadata: None,
        });
        let mut scene_layer = template_layer;
        scene_layer.id = "layer-scene".to_string();
        scene_layer.source.source_id = "source-scene".to_string();
        scene_layer.source.kind = LiveCompositorSourceKind::Scene;
        scene_layer.source.entity_ref = None;
        scene_layer.source.scene_ref = None;
        scene_layer.fallback_policy = LiveCompositorFallbackPolicy::DiagnosticOverlay;
        scene.layers.push(scene_layer);
        scene.sources.push(LiveCompositorSourceRef {
            source_id: "source-scene".to_string(),
            kind: LiveCompositorSourceKind::Scene,
            label: Some("Scene".to_string()),
            media_ref: None,
            device_session_ref: None,
            stream_ref: None,
            entity_ref: None,
            scene_ref: None,
            color: None,
            metadata: None,
        });
        let context = LiveCompositorAdapterContext::from_scene_metadata(&scene);

        let plan = plan_live_compositor_scene(&scene, &context);

        assert!(plan.diagnostics.iter().any(|diagnostic| {
            diagnostic.source_kind == Some(LiveCompositorSourceKind::Puppet)
                && diagnostic.code == LiveCompositorDiagnosticCode::UnsupportedSource
        }));
        assert!(plan.diagnostics.iter().any(|diagnostic| {
            diagnostic.source_kind == Some(LiveCompositorSourceKind::Model)
                && diagnostic.code == LiveCompositorDiagnosticCode::UnsupportedSource
        }));
        assert!(plan.diagnostics.iter().any(|diagnostic| {
            diagnostic.source_kind == Some(LiveCompositorSourceKind::Scene)
                && diagnostic.code == LiveCompositorDiagnosticCode::UnsupportedSource
        }));
        let model = plan
            .layers
            .iter()
            .find(|layer| layer.layer_id == "layer-model")
            .unwrap();
        assert_eq!(
            model.adapter_status,
            LiveCompositorAdapterStatus::DiagnosticOverlay
        );
        let scene_layer = plan
            .layers
            .iter()
            .find(|layer| layer.layer_id == "layer-scene")
            .unwrap();
        assert_eq!(
            scene_layer.adapter_status,
            LiveCompositorAdapterStatus::DiagnosticOverlay
        );
    }
}
