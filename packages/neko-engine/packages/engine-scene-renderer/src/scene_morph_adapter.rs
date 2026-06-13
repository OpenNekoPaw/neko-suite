//! Scene renderer adapter boundary for shared Morph/BlendShape compute.

use neko_engine_gpu::error::{Error, Result};

/// Explicit diagnostic for scene morph layouts that are not wired to GPU compute yet.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SceneMorphComputeDiagnostic {
    pub mesh_id: String,
    pub message: String,
}

/// Report that scene GPU morph rendering must use `engine-gpu::morph_compute`
/// once scene morph buffer layout extraction is available.
pub fn unsupported_scene_morph_compute(mesh_id: impl Into<String>) -> SceneMorphComputeDiagnostic {
    let mesh_id = mesh_id.into();
    SceneMorphComputeDiagnostic {
        mesh_id: mesh_id.clone(),
        message: format!(
            "Scene mesh '{mesh_id}' has no GPU morph layout adapter yet; future scene morph rendering must use engine-gpu::morph_compute instead of a renderer-local shader"
        ),
    }
}

/// Placeholder adapter entry point used by callers that need an explicit fallback.
pub fn require_scene_morph_compute_adapter(mesh_id: impl Into<String>) -> Result<()> {
    let diagnostic = unsupported_scene_morph_compute(mesh_id);
    Err(Error::UnsupportedCapability(diagnostic.message))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scene_morph_unsupported_diagnostic_points_to_shared_primitive() {
        let diagnostic = unsupported_scene_morph_compute("mesh-smile");

        assert_eq!(diagnostic.mesh_id, "mesh-smile");
        assert!(diagnostic.message.contains("engine-gpu::morph_compute"));
        assert!(diagnostic.message.contains("renderer-local shader"));
    }

    #[test]
    fn scene_morph_adapter_fails_explicitly_until_layout_exists() {
        let err = require_scene_morph_compute_adapter("mesh-smile").unwrap_err();

        assert!(err.to_string().contains("Unsupported capability"));
        assert!(err.to_string().contains("engine-gpu::morph_compute"));
    }
}
