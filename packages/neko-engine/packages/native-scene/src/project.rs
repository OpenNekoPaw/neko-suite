//! .nkm project format — save/load neko-model project state.
//!
//! Stores scene snapshot, procedural mesh data, source model references,
//! and opaque editor state in a JSON file.

use crate::procedural_mesh::ProceduralMesh;
use crate::world::SceneSnapshot;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

/// Errors that can occur during project save/load.
#[derive(Debug, thiserror::Error)]
pub enum ProjectError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("Unsupported project version: {0}")]
    UnsupportedVersion(u32),
}

/// Current project format version.
const CURRENT_VERSION: u32 = 1;

/// On-disk representation of a neko-model project (.nkm).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NkmProject {
    /// Format version for forward compatibility.
    pub version: u32,
    /// Paths to original model files (glTF/GLB/VRM) loaded during the session.
    pub source_models: Vec<String>,
    /// CPU-side procedural mesh data, keyed by procedural URI.
    pub procedural_meshes: HashMap<String, ProceduralMesh>,
    /// Full scene graph snapshot (nodes + animations).
    pub scene_snapshot: SceneSnapshot,
    /// Opaque frontend editor state (selected node, camera position, active panel, etc.).
    pub editor_state: serde_json::Value,
}

impl NkmProject {
    /// Save project to a .nkm file (pretty-printed JSON).
    pub fn save(&self, path: &Path) -> Result<(), ProjectError> {
        let json = serde_json::to_string_pretty(self)?;
        std::fs::write(path, json)?;
        Ok(())
    }

    /// Load project from a .nkm file.
    pub fn load(path: &Path) -> Result<Self, ProjectError> {
        let data = std::fs::read_to_string(path)?;
        let project: NkmProject = serde_json::from_str(&data)?;

        if project.version > CURRENT_VERSION {
            return Err(ProjectError::UnsupportedVersion(project.version));
        }

        Ok(project)
    }

    /// Create a new project from current scene state.
    pub fn from_scene(
        source_models: Vec<String>,
        procedural_meshes: HashMap<String, ProceduralMesh>,
        scene_snapshot: SceneSnapshot,
        editor_state: serde_json::Value,
    ) -> Self {
        Self {
            version: CURRENT_VERSION,
            source_models,
            procedural_meshes,
            scene_snapshot,
            editor_state,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::procedural_mesh::ProceduralVertex;
    use crate::world::{AnimationClipInfo, SceneNodeSnapshot};
    use std::io::Write;
    use tempfile::NamedTempFile;

    fn sample_project() -> NkmProject {
        let mut meshes = HashMap::new();
        meshes.insert(
            "procedural://cube_1".to_string(),
            ProceduralMesh {
                vertices: vec![ProceduralVertex {
                    position: [0.0, 0.0, 0.0],
                    normal: [0.0, 1.0, 0.0],
                    uv: [0.0, 0.0],
                }],
                indices: vec![0],
            },
        );

        NkmProject::from_scene(
            vec!["model.glb".into()],
            meshes,
            SceneSnapshot {
                nodes: vec![SceneNodeSnapshot {
                    id: "node_0".into(),
                    name: "Cube".into(),
                    position: [0.0, 1.0, 0.0],
                    rotation: [0.0, 0.0, 0.0, 1.0],
                    scale: [1.0, 1.0, 1.0],
                    parent_id: None,
                    has_mesh: true,
                    has_light: false,
                    has_camera: false,
                    has_skeleton: false,
                }],
                animations: vec![],
            },
            serde_json::json!({ "selectedNode": "node_0" }),
        )
    }

    #[test]
    fn round_trip_save_load() {
        let project = sample_project();
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("test.nkm");

        project.save(&path).unwrap();
        let loaded = NkmProject::load(&path).unwrap();

        assert_eq!(loaded.version, 1);
        assert_eq!(loaded.source_models, vec!["model.glb"]);
        assert_eq!(loaded.scene_snapshot.nodes.len(), 1);
        assert_eq!(loaded.scene_snapshot.nodes[0].name, "Cube");
        assert!(loaded.procedural_meshes.contains_key("procedural://cube_1"));
    }

    #[test]
    fn unsupported_version_rejected() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("future.nkm");
        std::fs::write(
            &path,
            r#"{"version":999,"source_models":[],"procedural_meshes":{},"scene_snapshot":{"nodes":[],"animations":[]},"editor_state":null}"#,
        )
        .unwrap();

        let result = NkmProject::load(&path);
        assert!(matches!(result, Err(ProjectError::UnsupportedVersion(999))));
    }
}
