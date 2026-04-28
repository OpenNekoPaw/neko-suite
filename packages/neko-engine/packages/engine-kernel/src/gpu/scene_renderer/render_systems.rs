//! Render-side system labels for the 3D scene renderer.
//!
//! These labels are the boundary between runtime-scene simulation data and
//! engine-kernel render-only work. They do not execute scheduling by
//! themselves; later Render World and RenderGraph code uses them as stable
//! attachment points.

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum RenderSystemLabel {
    ExtractScene,
    PrepareAssets,
    BuildDrawList,
    PbrForward,
    ViewportHelpers,
    BrushPreview,
    PostProcess,
    ColorConvert,
    EncoderCopy,
}

impl RenderSystemLabel {
    pub const fn as_str(self) -> &'static str {
        match self {
            RenderSystemLabel::ExtractScene => "render.extract_scene",
            RenderSystemLabel::PrepareAssets => "render.prepare_assets",
            RenderSystemLabel::BuildDrawList => "render.build_draw_list",
            RenderSystemLabel::PbrForward => "render.pbr_forward",
            RenderSystemLabel::ViewportHelpers => "render.viewport_helpers",
            RenderSystemLabel::BrushPreview => "render.brush_preview",
            RenderSystemLabel::PostProcess => "render.post_process",
            RenderSystemLabel::ColorConvert => "render.color_convert",
            RenderSystemLabel::EncoderCopy => "render.encoder_copy",
        }
    }
}

pub const RENDER_SYSTEM_ORDER: &[RenderSystemLabel] = &[
    RenderSystemLabel::ExtractScene,
    RenderSystemLabel::PrepareAssets,
    RenderSystemLabel::BuildDrawList,
    RenderSystemLabel::PbrForward,
    RenderSystemLabel::ViewportHelpers,
    RenderSystemLabel::BrushPreview,
    RenderSystemLabel::PostProcess,
    RenderSystemLabel::ColorConvert,
    RenderSystemLabel::EncoderCopy,
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn render_system_labels_define_stable_boundary_order() {
        assert_eq!(
            RENDER_SYSTEM_ORDER,
            &[
                RenderSystemLabel::ExtractScene,
                RenderSystemLabel::PrepareAssets,
                RenderSystemLabel::BuildDrawList,
                RenderSystemLabel::PbrForward,
                RenderSystemLabel::ViewportHelpers,
                RenderSystemLabel::BrushPreview,
                RenderSystemLabel::PostProcess,
                RenderSystemLabel::ColorConvert,
                RenderSystemLabel::EncoderCopy,
            ]
        );
        assert_eq!(
            RenderSystemLabel::ExtractScene.as_str(),
            "render.extract_scene"
        );
    }
}
