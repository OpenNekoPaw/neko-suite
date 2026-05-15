//! Standard RenderGraph presets for the 3D scene renderer.

use crate::{
    RenderGraph, RenderGraphError, RenderPassDesc, RenderResourceDesc, RenderResourceId,
    RenderResourceKind, RenderSystemLabel,
};

pub const RESOURCE_SCENE_COLOR: &str = "scene.color.hdr";
pub const RESOURCE_SCENE_DEPTH: &str = "scene.depth";
pub const RESOURCE_HELPER_COLOR: &str = "scene.color.helpers";
pub const RESOURCE_BRUSH_PREVIEW_COLOR: &str = "scene.color.brush_preview";
pub const RESOURCE_TONEMAPPED_COLOR: &str = "scene.color.tonemapped";
pub const RESOURCE_ENCODER_INPUT: &str = "scene.encoder.input";
pub const RESOURCE_ENCODER_PACKET: &str = "scene.encoder.packet";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct StandardSceneRenderGraphOptions {
    pub helper_passes: bool,
    pub brush_preview: bool,
    pub post_process: bool,
    pub color_convert: bool,
    pub encoder_copy: bool,
}

impl Default for StandardSceneRenderGraphOptions {
    fn default() -> Self {
        Self {
            helper_passes: true,
            brush_preview: false,
            post_process: true,
            color_convert: true,
            encoder_copy: true,
        }
    }
}

pub fn build_standard_scene_render_graph(
    options: StandardSceneRenderGraphOptions,
) -> Result<(RenderGraph, RenderResourceId), RenderGraphError> {
    let mut graph = RenderGraph::default();
    add_standard_resources(&mut graph)?;

    graph.add_pass(
        RenderPassDesc::new(RenderSystemLabel::PbrForward.as_str())
            .write(RESOURCE_SCENE_COLOR)
            .write(RESOURCE_SCENE_DEPTH),
    )?;

    let mut current_color = RenderResourceId::from(RESOURCE_SCENE_COLOR);
    if options.helper_passes {
        graph.add_pass(
            RenderPassDesc::new(RenderSystemLabel::ViewportHelpers.as_str())
                .read(current_color.0.as_str())
                .write(RESOURCE_HELPER_COLOR),
        )?;
        current_color = RESOURCE_HELPER_COLOR.into();
    }

    if options.brush_preview {
        graph.add_pass(
            RenderPassDesc::new(RenderSystemLabel::BrushPreview.as_str())
                .read(current_color.0.as_str())
                .write(RESOURCE_BRUSH_PREVIEW_COLOR),
        )?;
        current_color = RESOURCE_BRUSH_PREVIEW_COLOR.into();
    }

    if options.post_process {
        graph.add_pass(
            RenderPassDesc::new(RenderSystemLabel::PostProcess.as_str())
                .read(current_color.0.as_str())
                .write(RESOURCE_TONEMAPPED_COLOR),
        )?;
        current_color = RESOURCE_TONEMAPPED_COLOR.into();
    }

    if options.color_convert {
        graph.add_pass(
            RenderPassDesc::new(RenderSystemLabel::ColorConvert.as_str())
                .read(current_color.0.as_str())
                .write(RESOURCE_ENCODER_INPUT),
        )?;
        current_color = RESOURCE_ENCODER_INPUT.into();
    }

    if options.encoder_copy {
        graph.add_pass(
            RenderPassDesc::new(RenderSystemLabel::EncoderCopy.as_str())
                .read(current_color.0.as_str())
                .write(RESOURCE_ENCODER_PACKET)
                .side_effect(),
        )?;
        current_color = RESOURCE_ENCODER_PACKET.into();
    }

    Ok((graph, current_color))
}

fn add_standard_resources(graph: &mut RenderGraph) -> Result<(), RenderGraphError> {
    for id in [
        RESOURCE_SCENE_COLOR,
        RESOURCE_SCENE_DEPTH,
        RESOURCE_HELPER_COLOR,
        RESOURCE_BRUSH_PREVIEW_COLOR,
        RESOURCE_TONEMAPPED_COLOR,
        RESOURCE_ENCODER_INPUT,
        RESOURCE_ENCODER_PACKET,
    ] {
        graph.add_resource(RenderResourceDesc {
            id: id.into(),
            kind: RenderResourceKind::Texture,
            transient: id != RESOURCE_ENCODER_PACKET,
        })?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn standard_scene_graph_orders_existing_render_path() {
        let (graph, output) =
            build_standard_scene_render_graph(StandardSceneRenderGraphOptions::default()).unwrap();
        let compiled = graph.compile(&[output]).unwrap();
        let ids: Vec<&str> = compiled
            .passes
            .iter()
            .map(|pass| pass.id.0.as_str())
            .collect();

        assert_eq!(
            ids,
            vec![
                "render.pbr_forward",
                "render.viewport_helpers",
                "render.post_process",
                "render.color_convert",
                "render.encoder_copy"
            ]
        );
    }

    #[test]
    fn standard_scene_graph_can_target_quality_capture_without_encoder_copy() {
        let (graph, output) = build_standard_scene_render_graph(StandardSceneRenderGraphOptions {
            helper_passes: false,
            brush_preview: false,
            post_process: true,
            color_convert: false,
            encoder_copy: false,
        })
        .unwrap();
        let compiled = graph.compile(&[output]).unwrap();
        let ids: Vec<&str> = compiled
            .passes
            .iter()
            .map(|pass| pass.id.0.as_str())
            .collect();

        assert_eq!(ids, vec!["render.pbr_forward", "render.post_process"]);
    }

    #[test]
    fn standard_scene_graph_enables_brush_preview_for_edit_free_work_mode() {
        let (graph, output) = build_standard_scene_render_graph(StandardSceneRenderGraphOptions {
            helper_passes: true,
            brush_preview: true,
            post_process: true,
            color_convert: false,
            encoder_copy: false,
        })
        .unwrap();
        let compiled = graph.compile(&[output]).unwrap();
        let ids: Vec<&str> = compiled
            .passes
            .iter()
            .map(|pass| pass.id.0.as_str())
            .collect();

        assert_eq!(
            ids,
            vec![
                "render.pbr_forward",
                "render.viewport_helpers",
                "render.brush_preview",
                "render.post_process"
            ]
        );
    }
}
