//! Viewport descriptor planning for scene render graph variants.

use crate::{
    build_standard_scene_render_graph, RenderGraph, RenderGraphError, RenderResourceId,
    StandardSceneRenderGraphOptions,
};
use glam::Vec3;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ViewportRenderMode {
    Pbr,
    Clay,
    Wireframe,
    Unlit,
    Normal,
    Depth,
    LightComplexity,
    ShadowAtlas,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ViewportDebugView {
    Albedo,
    Roughness,
    Metallic,
    Ao,
    Uv,
    Overdraw,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SceneToneMapping {
    Aces,
    Reinhard,
    None,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum SceneColorSpace {
    Srgb,
    Rec709,
    P3,
}

impl SceneColorSpace {
    pub const fn nv12_matrix_id(self) -> u32 {
        match self {
            Self::Srgb | Self::Rec709 | Self::P3 => 1,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ViewportWorkMode {
    EditParametric,
    EditFree,
    Pose,
    RenderPreview,
    Lookdev,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct ViewportPostProcess {
    pub bloom: bool,
    pub ssao: bool,
    pub taa: bool,
}

impl ViewportPostProcess {
    pub const fn any_enabled(self) -> bool {
        self.bloom || self.ssao || self.taa
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ViewportMaterialOverrideKind {
    None,
    Clay,
    Matcap,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ViewportMaterialOverride {
    pub kind: ViewportMaterialOverrideKind,
    pub color: Option<Vec3>,
    pub roughness: Option<f32>,
    pub metallic: Option<f32>,
    pub preserve_alpha: Option<bool>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ViewportLookDevSettings {
    pub render_mode: ViewportRenderMode,
    pub debug_view: Option<ViewportDebugView>,
    pub material_override: Option<ViewportMaterialOverride>,
    pub helper_passes_enabled: Option<bool>,
    pub show_grid: Option<bool>,
    pub show_skeleton: Option<bool>,
    pub show_normals: Option<bool>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ViewportDescriptor {
    pub viewport_id: String,
    pub scene_id: String,
    pub render_mode: ViewportRenderMode,
    pub debug_view: Option<ViewportDebugView>,
    pub fps: u32,
    pub color_space: SceneColorSpace,
    pub tone_mapping: SceneToneMapping,
    pub post_process: ViewportPostProcess,
    pub layer_mask: Option<u32>,
    pub work_mode: ViewportWorkMode,
    pub helper_passes: bool,
    pub lookdev: Option<ViewportLookDevSettings>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ViewportRenderGraphOutput {
    RealtimeStream,
    QualityCapture,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ViewportRenderGraphVariant {
    StandardPbr,
    Clay,
    Debug,
    Wireframe,
    Unlit,
}

#[derive(Debug)]
pub struct ViewportRenderGraphPlan {
    pub graph: RenderGraph,
    pub live_output: RenderResourceId,
    pub variant: ViewportRenderGraphVariant,
    pub helper_passes: bool,
    pub brush_preview: bool,
    pub post_process: bool,
    pub color_convert: bool,
    pub encoder_copy: bool,
}

pub fn build_viewport_render_graph(
    descriptor: &ViewportDescriptor,
    output: ViewportRenderGraphOutput,
) -> Result<ViewportRenderGraphPlan, RenderGraphError> {
    let variant = select_variant(descriptor);
    let helper_passes =
        descriptor.helper_passes && output == ViewportRenderGraphOutput::RealtimeStream;
    let post_process = matches!(
        variant,
        ViewportRenderGraphVariant::StandardPbr | ViewportRenderGraphVariant::Clay
    )
        && (descriptor.tone_mapping != SceneToneMapping::None
            || descriptor.post_process.any_enabled());
    // Realtime stream frames now hand the final RenderGraph color target
    // directly to the RGBA->NV12 IOSurface bridge. Keeping the old RGBA8
    // conversion/copy passes here adds latency and extra texture churn.
    let color_convert = false;
    let encoder_copy = false;
    let brush_preview = descriptor.work_mode == ViewportWorkMode::EditFree;

    let (graph, live_output) =
        build_standard_scene_render_graph(StandardSceneRenderGraphOptions {
            helper_passes,
            brush_preview,
            post_process,
            color_convert,
            encoder_copy,
        })?;

    Ok(ViewportRenderGraphPlan {
        graph,
        live_output,
        variant,
        helper_passes,
        brush_preview,
        post_process,
        color_convert,
        encoder_copy,
    })
}

fn select_variant(descriptor: &ViewportDescriptor) -> ViewportRenderGraphVariant {
    if descriptor.debug_view.is_some()
        || matches!(
            descriptor.render_mode,
            ViewportRenderMode::Normal
                | ViewportRenderMode::Depth
                | ViewportRenderMode::LightComplexity
                | ViewportRenderMode::ShadowAtlas
        )
    {
        return ViewportRenderGraphVariant::Debug;
    }

    match descriptor.render_mode {
        ViewportRenderMode::Pbr => ViewportRenderGraphVariant::StandardPbr,
        ViewportRenderMode::Clay => ViewportRenderGraphVariant::Clay,
        ViewportRenderMode::Wireframe => ViewportRenderGraphVariant::Wireframe,
        ViewportRenderMode::Unlit => ViewportRenderGraphVariant::Unlit,
        ViewportRenderMode::Normal
        | ViewportRenderMode::Depth
        | ViewportRenderMode::LightComplexity
        | ViewportRenderMode::ShadowAtlas => ViewportRenderGraphVariant::Debug,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn descriptor() -> ViewportDescriptor {
        ViewportDescriptor {
            viewport_id: "main".to_string(),
            scene_id: "scene".to_string(),
            render_mode: ViewportRenderMode::Pbr,
            debug_view: None,
            fps: 60,
            color_space: SceneColorSpace::Srgb,
            tone_mapping: SceneToneMapping::Aces,
            post_process: ViewportPostProcess::default(),
            layer_mask: None,
            work_mode: ViewportWorkMode::EditParametric,
            helper_passes: true,
            lookdev: None,
        }
    }

    #[test]
    fn viewport_descriptor_selects_realtime_stream_graph_variant() {
        let plan =
            build_viewport_render_graph(&descriptor(), ViewportRenderGraphOutput::RealtimeStream)
                .unwrap();
        let compiled = plan.graph.compile(&[plan.live_output]).unwrap();
        let ids: Vec<&str> = compiled
            .passes
            .iter()
            .map(|pass| pass.id.0.as_str())
            .collect();

        assert_eq!(plan.variant, ViewportRenderGraphVariant::StandardPbr);
        assert!(plan.helper_passes);
        assert!(!plan.brush_preview);
        assert!(plan.post_process);
        assert!(!plan.color_convert);
        assert!(!plan.encoder_copy);
        assert_eq!(
            ids,
            vec![
                "render.pbr_forward",
                "render.viewport_helpers",
                "render.post_process"
            ]
        );
    }

    #[test]
    fn viewport_descriptor_disables_post_process_for_debug_capture() {
        let mut descriptor = descriptor();
        descriptor.debug_view = Some(ViewportDebugView::Albedo);
        descriptor.tone_mapping = SceneToneMapping::None;

        let plan =
            build_viewport_render_graph(&descriptor, ViewportRenderGraphOutput::QualityCapture)
                .unwrap();
        let compiled = plan.graph.compile(&[plan.live_output]).unwrap();
        let ids: Vec<&str> = compiled
            .passes
            .iter()
            .map(|pass| pass.id.0.as_str())
            .collect();

        assert_eq!(plan.variant, ViewportRenderGraphVariant::Debug);
        assert!(!plan.helper_passes);
        assert!(!plan.brush_preview);
        assert!(!plan.post_process);
        assert!(!plan.color_convert);
        assert!(!plan.encoder_copy);
        assert_eq!(ids, vec!["render.pbr_forward"]);
    }

    #[test]
    fn viewport_render_modes_report_debug_variant_for_helper_passes() {
        for mode in [
            ViewportRenderMode::Normal,
            ViewportRenderMode::Depth,
            ViewportRenderMode::LightComplexity,
            ViewportRenderMode::ShadowAtlas,
        ] {
            let mut descriptor = descriptor();
            descriptor.render_mode = mode;
            descriptor.tone_mapping = SceneToneMapping::None;

            let plan =
                build_viewport_render_graph(&descriptor, ViewportRenderGraphOutput::QualityCapture)
                    .unwrap();

            assert_eq!(plan.variant, ViewportRenderGraphVariant::Debug);
            assert!(!plan.post_process);
        }
    }

    #[test]
    fn viewport_descriptor_recompiles_variants_for_modes_and_output_kind() {
        let mut wireframe = descriptor();
        wireframe.render_mode = ViewportRenderMode::Wireframe;
        wireframe.tone_mapping = SceneToneMapping::None;
        let wireframe_plan =
            build_viewport_render_graph(&wireframe, ViewportRenderGraphOutput::QualityCapture)
                .unwrap();
        assert_eq!(
            wireframe_plan.variant,
            ViewportRenderGraphVariant::Wireframe
        );
        assert!(!wireframe_plan.helper_passes);
        assert!(!wireframe_plan.brush_preview);
        assert!(!wireframe_plan.post_process);
        assert!(!wireframe_plan.color_convert);
        assert!(!wireframe_plan.encoder_copy);

        let mut unlit_stream = descriptor();
        unlit_stream.render_mode = ViewportRenderMode::Unlit;
        unlit_stream.post_process = ViewportPostProcess::default();
        unlit_stream.tone_mapping = SceneToneMapping::None;
        let unlit_plan =
            build_viewport_render_graph(&unlit_stream, ViewportRenderGraphOutput::RealtimeStream)
                .unwrap();
        let compiled = unlit_plan.graph.compile(&[unlit_plan.live_output]).unwrap();
        let ids: Vec<&str> = compiled
            .passes
            .iter()
            .map(|pass| pass.id.0.as_str())
            .collect();

        assert_eq!(unlit_plan.variant, ViewportRenderGraphVariant::Unlit);
        assert!(unlit_plan.helper_passes);
        assert!(!unlit_plan.brush_preview);
        assert!(!unlit_plan.post_process);
        assert!(!unlit_plan.color_convert);
        assert!(!unlit_plan.encoder_copy);
        assert_eq!(ids, vec!["render.pbr_forward", "render.viewport_helpers"]);
    }

    #[test]
    fn viewport_descriptor_selects_clay_as_distinct_lookdev_variant() {
        let mut clay = descriptor();
        clay.render_mode = ViewportRenderMode::Clay;
        clay.lookdev = Some(ViewportLookDevSettings {
            render_mode: ViewportRenderMode::Clay,
            debug_view: None,
            material_override: Some(ViewportMaterialOverride {
                kind: ViewportMaterialOverrideKind::Clay,
                color: Some(Vec3::new(0.78, 0.76, 0.72)),
                roughness: Some(0.9),
                metallic: Some(0.0),
                preserve_alpha: Some(true),
            }),
            helper_passes_enabled: Some(true),
            show_grid: Some(false),
            show_skeleton: Some(false),
            show_normals: Some(false),
        });

        let plan =
            build_viewport_render_graph(&clay, ViewportRenderGraphOutput::RealtimeStream)
                .unwrap();

        assert_eq!(plan.variant, ViewportRenderGraphVariant::Clay);
        assert!(plan.post_process);
    }

    #[test]
    fn viewport_descriptor_enables_brush_preview_for_edit_free() {
        let mut sculpt = descriptor();
        sculpt.work_mode = ViewportWorkMode::EditFree;
        let plan = build_viewport_render_graph(&sculpt, ViewportRenderGraphOutput::RealtimeStream)
            .unwrap();
        let compiled = plan.graph.compile(&[plan.live_output]).unwrap();
        let ids: Vec<&str> = compiled
            .passes
            .iter()
            .map(|pass| pass.id.0.as_str())
            .collect();

        assert!(plan.brush_preview);
        assert!(ids.contains(&"render.brush_preview"));
    }
}
