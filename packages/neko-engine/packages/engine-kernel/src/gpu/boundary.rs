//! GPU extraction boundary metadata.
//!
//! This module mirrors the intended first `engine-gpu` crate shape while the
//! implementation still lives inside `engine-kernel`. It is deliberately data
//! only: architecture tests use it as the allowlist for extraction-ready files.

/// A future extraction group for a GPU module.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GpuExtractionGroup {
    /// Device/context management, resource pools, platform interop, and
    /// zero-copy import/export helpers.
    CoreResourceHal,
    /// Texture-to-texture processors, compositors, rasterizers, and shader
    /// support that can move with the GPU pipeline layer.
    PipelineEffects,
    /// Frame-time scheduling and queue pressure policy. Extraction-ready, but
    /// expected to remain a separately re-exported scheduling surface.
    Budget,
    /// Domain-specific renderers that remain kernel-owned until companion
    /// renderer crates are introduced.
    RendererCompanion,
}

/// Classification for one current `engine-kernel/src/gpu` module path.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct GpuModuleBoundary {
    /// Path relative to `engine-kernel/src/gpu`.
    pub path: &'static str,
    /// Future extraction group.
    pub group: GpuExtractionGroup,
    /// Whether the first `engine-gpu` extraction should include this module.
    pub extraction_ready: bool,
    /// Short rationale for renderer/budget/shader decisions.
    pub rationale: &'static str,
}

/// Core/resource/HAL modules intended to become `engine-gpu` re-exports.
pub const CORE_RESOURCE_HAL_MODULES: &[GpuModuleBoundary] = &[
    core("context.rs"),
    core("buffer_pool.rs"),
    core("texture.rs"),
    core("readback_target.rs"),
    core("encoder_bridge.rs"),
    core("hal_import.rs"),
    core("nv12_import.rs"),
    core("nv12_renderer.rs"),
    core("rgba_to_nv12.rs"),
    core("rgba_to_nv12_texture.rs"),
    core("macos_import.rs"),
    core("macos_export.rs"),
    core("linux_import.rs"),
    core("linux_export.rs"),
    core("windows_import.rs"),
    core("windows_export.rs"),
    core("ml_gpu_bridge.rs"),
];

/// Pipeline/effect modules intended to become `engine-gpu` re-exports.
pub const PIPELINE_EFFECT_MODULES: &[GpuModuleBoundary] = &[
    pipeline("effect_trait.rs"),
    pipeline("compositor.rs"),
    pipeline("texture_compositor.rs"),
    pipeline("gpu_layer.rs"),
    pipeline("blur_processor.rs"),
    pipeline("style_processor.rs"),
    pipeline("custom_shader_processor.rs"),
    pipeline("transition_processor.rs"),
    pipeline("texture_transition_processor.rs"),
    pipeline("mask_rasterizer.rs"),
    pipeline("shape_rasterizer.rs"),
    pipeline("text_renderer.rs"),
    pipeline("lut3d.rs"),
    pipeline("shaders/mod.rs"),
];

/// Budget module decision: extraction-ready, but tracked independently from
/// core/resource/HAL because kernel scheduling policy still uses it directly.
pub const BUDGET_MODULES: &[GpuModuleBoundary] = &[GpuModuleBoundary {
    path: "budget.rs",
    group: GpuExtractionGroup::Budget,
    extraction_ready: true,
    rationale: "frame-time scheduling API is GPU-facing and can move behind a stable re-export",
}];

/// Renderer companion modules excluded from the first GPU core extraction.
pub const RENDERER_COMPANION_MODULES: &[GpuModuleBoundary] = &[
    companion("scene_renderer"),
    companion("puppet_renderer"),
    companion("panoramic_renderer.rs"),
];

/// All extraction-ready module classifications.
pub fn extraction_ready_modules() -> impl Iterator<Item = &'static GpuModuleBoundary> {
    CORE_RESOURCE_HAL_MODULES
        .iter()
        .chain(PIPELINE_EFFECT_MODULES)
        .chain(BUDGET_MODULES)
}

/// All renderer companion exceptions.
pub fn renderer_companion_modules() -> impl Iterator<Item = &'static GpuModuleBoundary> {
    RENDERER_COMPANION_MODULES.iter()
}

const fn core(path: &'static str) -> GpuModuleBoundary {
    GpuModuleBoundary {
        path,
        group: GpuExtractionGroup::CoreResourceHal,
        extraction_ready: true,
        rationale: "GPU resource/HAL module with no renderer companion ownership",
    }
}

const fn pipeline(path: &'static str) -> GpuModuleBoundary {
    GpuModuleBoundary {
        path,
        group: GpuExtractionGroup::PipelineEffects,
        extraction_ready: true,
        rationale: "texture pipeline/effect module; shaders move with this group",
    }
}

const fn companion(path: &'static str) -> GpuModuleBoundary {
    GpuModuleBoundary {
        path,
        group: GpuExtractionGroup::RendererCompanion,
        extraction_ready: false,
        rationale: "domain-specific renderer companion excluded from first GPU core extraction",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renderer_companions_are_not_extraction_ready() {
        for module in renderer_companion_modules() {
            assert!(
                !module.extraction_ready,
                "{} must stay kernel-owned",
                module.path
            );
            assert_eq!(module.group, GpuExtractionGroup::RendererCompanion);
        }
    }

    #[test]
    fn budget_and_shaders_have_explicit_decisions() {
        assert_eq!(BUDGET_MODULES[0].group, GpuExtractionGroup::Budget);
        assert!(BUDGET_MODULES[0].extraction_ready);
        assert!(PIPELINE_EFFECT_MODULES
            .iter()
            .any(|module| module.path == "shaders/mod.rs" && module.extraction_ready));
    }
}
