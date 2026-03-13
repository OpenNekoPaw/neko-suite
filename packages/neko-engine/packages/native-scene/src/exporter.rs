//! glTF/GLB exporter — converts ECS scene data to glTF 2.0 binary format.
//!
//! Builds glTF JSON + binary buffer from scene snapshots and procedural meshes,
//! then packs them into GLB container format.

use crate::procedural_mesh::ProceduralMesh;
use crate::world::SceneNodeSnapshot;
use std::collections::HashMap;

/// Errors that can occur during glTF export.
#[derive(Debug, thiserror::Error)]
pub enum ExportError {
    #[error("JSON serialization failed: {0}")]
    JsonError(#[from] serde_json::Error),
    #[error("No exportable mesh data in scene")]
    EmptyScene,
}

/// Node info enriched with mesh URI for export.
pub struct ExportNode {
    pub snapshot: SceneNodeSnapshot,
    pub mesh_uri: Option<String>,
}

/// Export scene to GLB binary format.
///
/// `nodes` — scene node snapshots enriched with mesh URIs
/// `procedural_meshes` — CPU-side mesh data keyed by URI
pub fn export_glb(
    nodes: &[ExportNode],
    procedural_meshes: &HashMap<String, ProceduralMesh>,
) -> Result<Vec<u8>, ExportError> {
    let (json_string, bin_data) = build_gltf_json_and_bin(nodes, procedural_meshes)?;

    let json_bytes = json_string.as_bytes();
    let json_padded_len = align_to_4(json_bytes.len());
    let bin_padded_len = align_to_4(bin_data.len());

    // GLB = 12-byte header + JSON chunk (8 + data) + BIN chunk (8 + data)
    let total_len = 12
        + 8
        + json_padded_len
        + if bin_data.is_empty() {
            0
        } else {
            8 + bin_padded_len
        };
    let mut glb = Vec::with_capacity(total_len);

    // Header: magic + version + total length
    glb.extend_from_slice(b"glTF");
    glb.extend_from_slice(&2u32.to_le_bytes());
    glb.extend_from_slice(&(total_len as u32).to_le_bytes());

    // JSON chunk: length + type + data + padding
    glb.extend_from_slice(&(json_padded_len as u32).to_le_bytes());
    glb.extend_from_slice(&0x4E4F534Au32.to_le_bytes()); // "JSON"
    glb.extend_from_slice(json_bytes);
    for _ in 0..(json_padded_len - json_bytes.len()) {
        glb.push(0x20); // pad with spaces
    }

    // BIN chunk: length + type + data + padding
    if !bin_data.is_empty() {
        glb.extend_from_slice(&(bin_padded_len as u32).to_le_bytes());
        glb.extend_from_slice(&0x004E4942u32.to_le_bytes()); // "BIN\0"
        glb.extend_from_slice(&bin_data);
        for _ in 0..(bin_padded_len - bin_data.len()) {
            glb.push(0x00);
        }
    }

    Ok(glb)
}

/// Build glTF JSON descriptor and binary buffer from scene nodes.
fn build_gltf_json_and_bin(
    nodes: &[ExportNode],
    procedural_meshes: &HashMap<String, ProceduralMesh>,
) -> Result<(String, Vec<u8>), ExportError> {
    let mut bin = Vec::new();
    let mut json_nodes: Vec<serde_json::Value> = Vec::new();
    let mut json_meshes: Vec<serde_json::Value> = Vec::new();
    let mut json_accessors: Vec<serde_json::Value> = Vec::new();
    let mut json_buffer_views: Vec<serde_json::Value> = Vec::new();

    // Map node IDs to output indices for parent-child resolution
    let node_id_to_index: HashMap<&str, usize> = nodes
        .iter()
        .enumerate()
        .map(|(i, n)| (n.snapshot.id.as_str(), i))
        .collect();

    // Collect children per node
    let mut children_map: HashMap<usize, Vec<usize>> = HashMap::new();
    let mut root_nodes: Vec<usize> = Vec::new();

    for (i, node) in nodes.iter().enumerate() {
        if let Some(ref pid) = node.snapshot.parent_id {
            if let Some(&parent_idx) = node_id_to_index.get(pid.as_str()) {
                children_map.entry(parent_idx).or_default().push(i);
            } else {
                root_nodes.push(i);
            }
        } else {
            root_nodes.push(i);
        }
    }

    // Process each node
    for (i, node) in nodes.iter().enumerate() {
        let snap = &node.snapshot;

        // Write mesh data if available
        let mesh_index = node.mesh_uri.as_ref().and_then(|uri| {
            let mesh = procedural_meshes.get(uri)?;
            if mesh.is_empty() {
                return None;
            }

            let mesh_idx = json_meshes.len();
            let pos_accessor = json_accessors.len();

            // Write position, normal, UV, and index data into binary buffer
            write_mesh_to_buffer(
                mesh,
                &mut bin,
                &mut json_accessors,
                &mut json_buffer_views,
            );

            // Mesh primitive referencing the 4 accessors just created
            json_meshes.push(serde_json::json!({
                "primitives": [{
                    "attributes": {
                        "POSITION": pos_accessor,
                        "NORMAL": pos_accessor + 1,
                        "TEXCOORD_0": pos_accessor + 2
                    },
                    "indices": pos_accessor + 3,
                    "material": 0
                }]
            }));

            Some(mesh_idx)
        });

        // Build glTF node JSON
        let mut gltf_node = serde_json::json!({
            "name": snap.name,
            "translation": snap.position,
            "rotation": snap.rotation,
            "scale": snap.scale
        });

        if let Some(idx) = mesh_index {
            gltf_node["mesh"] = serde_json::json!(idx);
        }

        if let Some(children) = children_map.get(&i) {
            gltf_node["children"] = serde_json::json!(children);
        }

        json_nodes.push(gltf_node);
    }

    // Default PBR material
    let materials = vec![serde_json::json!({
        "name": "Default",
        "pbrMetallicRoughness": {
            "baseColorFactor": [0.8, 0.8, 0.8, 1.0],
            "metallicFactor": 0.0,
            "roughnessFactor": 0.5
        }
    })];

    let buffer_byte_length = bin.len();

    let mut root = serde_json::json!({
        "asset": { "version": "2.0", "generator": "neko-model" },
        "scene": 0,
        "scenes": [{ "name": "Scene", "nodes": root_nodes }],
        "nodes": json_nodes
    });

    // Only include mesh-related fields if there are meshes
    if !json_meshes.is_empty() {
        root["meshes"] = serde_json::json!(json_meshes);
        root["accessors"] = serde_json::json!(json_accessors);
        root["bufferViews"] = serde_json::json!(json_buffer_views);
        root["buffers"] = serde_json::json!([{ "byteLength": buffer_byte_length }]);
        root["materials"] = serde_json::json!(materials);
    }

    let json_string = serde_json::to_string(&root)?;
    Ok((json_string, bin))
}

/// Write a ProceduralMesh's vertex attributes and indices into the binary buffer,
/// creating corresponding glTF accessors and buffer views.
///
/// Creates 4 accessors: POSITION (VEC3), NORMAL (VEC3), TEXCOORD_0 (VEC2), indices (SCALAR).
fn write_mesh_to_buffer(
    mesh: &ProceduralMesh,
    bin: &mut Vec<u8>,
    accessors: &mut Vec<serde_json::Value>,
    buffer_views: &mut Vec<serde_json::Value>,
) {
    let vertex_count = mesh.vertices.len();

    // Compute AABB for POSITION accessor (required by glTF spec)
    let mut min_pos = [f32::MAX; 3];
    let mut max_pos = [f32::MIN; 3];
    for v in &mesh.vertices {
        for c in 0..3 {
            min_pos[c] = min_pos[c].min(v.position[c]);
            max_pos[c] = max_pos[c].max(v.position[c]);
        }
    }

    // --- Position data (VEC3, FLOAT) ---
    let pos_view_idx = buffer_views.len();
    let pos_offset = bin.len();
    for v in &mesh.vertices {
        for &val in &v.position {
            bin.extend_from_slice(&val.to_le_bytes());
        }
    }
    let pos_byte_length = bin.len() - pos_offset;
    buffer_views.push(serde_json::json!({
        "buffer": 0,
        "byteOffset": pos_offset,
        "byteLength": pos_byte_length,
        "target": 34962  // ARRAY_BUFFER
    }));
    accessors.push(serde_json::json!({
        "bufferView": pos_view_idx,
        "componentType": 5126,  // FLOAT
        "count": vertex_count,
        "type": "VEC3",
        "min": min_pos,
        "max": max_pos
    }));

    // --- Normal data (VEC3, FLOAT) ---
    let norm_view_idx = buffer_views.len();
    let norm_offset = bin.len();
    for v in &mesh.vertices {
        for &val in &v.normal {
            bin.extend_from_slice(&val.to_le_bytes());
        }
    }
    let norm_byte_length = bin.len() - norm_offset;
    buffer_views.push(serde_json::json!({
        "buffer": 0,
        "byteOffset": norm_offset,
        "byteLength": norm_byte_length,
        "target": 34962
    }));
    accessors.push(serde_json::json!({
        "bufferView": norm_view_idx,
        "componentType": 5126,
        "count": vertex_count,
        "type": "VEC3"
    }));

    // --- UV data (VEC2, FLOAT) ---
    let uv_view_idx = buffer_views.len();
    let uv_offset = bin.len();
    for v in &mesh.vertices {
        for &val in &v.uv {
            bin.extend_from_slice(&val.to_le_bytes());
        }
    }
    let uv_byte_length = bin.len() - uv_offset;
    buffer_views.push(serde_json::json!({
        "buffer": 0,
        "byteOffset": uv_offset,
        "byteLength": uv_byte_length,
        "target": 34962
    }));
    accessors.push(serde_json::json!({
        "bufferView": uv_view_idx,
        "componentType": 5126,
        "count": vertex_count,
        "type": "VEC2"
    }));

    // --- Index data (SCALAR, UNSIGNED_INT) ---
    let idx_view_idx = buffer_views.len();
    let idx_offset = bin.len();
    for &idx in &mesh.indices {
        bin.extend_from_slice(&idx.to_le_bytes());
    }
    let idx_byte_length = bin.len() - idx_offset;
    buffer_views.push(serde_json::json!({
        "buffer": 0,
        "byteOffset": idx_offset,
        "byteLength": idx_byte_length,
        "target": 34963  // ELEMENT_ARRAY_BUFFER
    }));
    accessors.push(serde_json::json!({
        "bufferView": idx_view_idx,
        "componentType": 5125,  // UNSIGNED_INT
        "count": mesh.indices.len(),
        "type": "SCALAR"
    }));
}

/// Align byte count up to a multiple of 4 (required by GLB spec).
fn align_to_4(n: usize) -> usize {
    (n + 3) & !3
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::procedural_mesh::ProceduralVertex;

    fn triangle_mesh() -> ProceduralMesh {
        ProceduralMesh {
            vertices: vec![
                ProceduralVertex {
                    position: [0.0, 0.0, 0.0],
                    normal: [0.0, 0.0, 1.0],
                    uv: [0.0, 0.0],
                },
                ProceduralVertex {
                    position: [1.0, 0.0, 0.0],
                    normal: [0.0, 0.0, 1.0],
                    uv: [1.0, 0.0],
                },
                ProceduralVertex {
                    position: [0.0, 1.0, 0.0],
                    normal: [0.0, 0.0, 1.0],
                    uv: [0.0, 1.0],
                },
            ],
            indices: vec![0, 1, 2],
        }
    }

    #[test]
    fn export_empty_scene_produces_valid_glb() {
        let nodes = vec![ExportNode {
            snapshot: SceneNodeSnapshot {
                id: "root".into(),
                name: "Root".into(),
                position: [0.0; 3],
                rotation: [0.0, 0.0, 0.0, 1.0],
                scale: [1.0; 3],
                parent_id: None,
                has_mesh: false,
                has_light: false,
                has_camera: false,
                has_skeleton: false,
            },
            mesh_uri: None,
        }];
        let meshes = HashMap::new();
        let glb = export_glb(&nodes, &meshes).unwrap();

        // Check GLB magic
        assert_eq!(&glb[0..4], b"glTF");
        // Check version
        assert_eq!(u32::from_le_bytes([glb[4], glb[5], glb[6], glb[7]]), 2);
    }

    #[test]
    fn export_with_mesh_produces_bin_chunk() {
        let mesh_uri = "procedural://cube_test".to_string();
        let nodes = vec![ExportNode {
            snapshot: SceneNodeSnapshot {
                id: "mesh_node".into(),
                name: "Cube".into(),
                position: [0.0; 3],
                rotation: [0.0, 0.0, 0.0, 1.0],
                scale: [1.0; 3],
                parent_id: None,
                has_mesh: true,
                has_light: false,
                has_camera: false,
                has_skeleton: false,
            },
            mesh_uri: Some(mesh_uri.clone()),
        }];

        let mut meshes = HashMap::new();
        meshes.insert(mesh_uri, triangle_mesh());

        let glb = export_glb(&nodes, &meshes).unwrap();

        // GLB should have both JSON and BIN chunks
        assert!(glb.len() > 20);
        // Verify total length matches header
        let total = u32::from_le_bytes([glb[8], glb[9], glb[10], glb[11]]) as usize;
        assert_eq!(total, glb.len());
    }

    #[test]
    fn glb_length_alignment() {
        assert_eq!(align_to_4(0), 0);
        assert_eq!(align_to_4(1), 4);
        assert_eq!(align_to_4(4), 4);
        assert_eq!(align_to_4(5), 8);
    }
}
