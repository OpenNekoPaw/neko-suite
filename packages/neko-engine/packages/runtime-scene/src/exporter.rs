//! glTF/GLB exporter — converts ECS scene data to glTF 2.0 binary format.
//!
//! Builds glTF JSON + binary buffer from scene snapshots and procedural meshes,
//! then packs them into GLB container format.

use crate::components::{AnimationClipData, AnimationProperty};
use crate::procedural_mesh::ProceduralMesh;
use crate::world::SceneNodeSnapshot;
use neko_engine_types::easing::EasingType;
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
/// `animation_clips` — optional animation clips to include in the glTF
/// `face_params` — optional VRM face parameter presets for VRMC_vrm extension
pub fn export_glb(
    nodes: &[ExportNode],
    procedural_meshes: &HashMap<String, ProceduralMesh>,
    animation_clips: Option<&[AnimationClipData]>,
    face_params: Option<&HashMap<String, f32>>,
) -> Result<Vec<u8>, ExportError> {
    let (json_string, bin_data) =
        build_gltf_json_and_bin(nodes, procedural_meshes, animation_clips, face_params)?;

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
    glb.extend(std::iter::repeat_n(
        0x20,
        json_padded_len - json_bytes.len(),
    ));

    // BIN chunk: length + type + data + padding
    if !bin_data.is_empty() {
        glb.extend_from_slice(&(bin_padded_len as u32).to_le_bytes());
        glb.extend_from_slice(&0x004E4942u32.to_le_bytes()); // "BIN\0"
        glb.extend_from_slice(&bin_data);
        glb.extend(std::iter::repeat_n(0x00, bin_padded_len - bin_data.len()));
    }

    Ok(glb)
}

/// Build glTF JSON descriptor and binary buffer from scene nodes.
fn build_gltf_json_and_bin(
    nodes: &[ExportNode],
    procedural_meshes: &HashMap<String, ProceduralMesh>,
    animation_clips: Option<&[AnimationClipData]>,
    face_params: Option<&HashMap<String, f32>>,
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
            write_mesh_to_buffer(mesh, &mut bin, &mut json_accessors, &mut json_buffer_views);

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

    // --- Animation channels ---
    let mut json_animations: Vec<serde_json::Value> = Vec::new();

    if let Some(clips) = animation_clips {
        for clip in clips {
            let mut json_samplers: Vec<serde_json::Value> = Vec::new();
            let mut json_channels: Vec<serde_json::Value> = Vec::new();

            for channel in &clip.channels {
                // Resolve target node index by ID
                let node_index = match node_id_to_index.get(channel.target_node.as_str()) {
                    Some(&idx) => idx,
                    None => continue,
                };

                if channel.keyframes.is_empty() {
                    continue;
                }

                let sampler_index = json_samplers.len();

                // Input accessor: timestamps (SCALAR float)
                let timestamps: Vec<f32> =
                    channel.keyframes.iter().map(|k| k.timestamp).collect();
                let input_idx = write_float_accessor(
                    &timestamps, 1, "SCALAR", true,
                    &mut bin, &mut json_accessors, &mut json_buffer_views,
                );

                // Output accessor: values (VEC3/VEC4/SCALAR depending on property)
                let values: Vec<f32> = channel
                    .keyframes
                    .iter()
                    .flat_map(|k| k.values.iter().copied())
                    .collect();
                let (accessor_type, component_count) = match channel.property {
                    AnimationProperty::Translation | AnimationProperty::Scale => ("VEC3", 3),
                    AnimationProperty::Rotation => ("VEC4", 4),
                    AnimationProperty::MorphWeights => ("SCALAR", 1),
                };
                let output_idx = write_float_accessor(
                    &values, component_count, accessor_type, false,
                    &mut bin, &mut json_accessors, &mut json_buffer_views,
                );

                // glTF interpolation (approximate non-linear as LINEAR)
                let interpolation = match channel.keyframes[0].easing {
                    EasingType::Linear => "LINEAR",
                    _ => "LINEAR",
                };

                json_samplers.push(serde_json::json!({
                    "input": input_idx,
                    "output": output_idx,
                    "interpolation": interpolation
                }));

                let gltf_path = match channel.property {
                    AnimationProperty::Translation => "translation",
                    AnimationProperty::Rotation => "rotation",
                    AnimationProperty::Scale => "scale",
                    AnimationProperty::MorphWeights => "weights",
                };

                json_channels.push(serde_json::json!({
                    "sampler": sampler_index,
                    "target": {
                        "node": node_index,
                        "path": gltf_path
                    }
                }));
            }

            if !json_channels.is_empty() {
                json_animations.push(serde_json::json!({
                    "name": clip.name,
                    "channels": json_channels,
                    "samplers": json_samplers
                }));
            }
        }
    }

    // buffer_byte_length must be computed AFTER all data (meshes + animations) is written
    let buffer_byte_length = bin.len();

    let mut root = serde_json::json!({
        "asset": { "version": "2.0", "generator": "neko-model" },
        "scene": 0,
        "scenes": [{ "name": "Scene", "nodes": root_nodes }],
        "nodes": json_nodes
    });

    // Include mesh-related fields if there are meshes
    if !json_meshes.is_empty() || !json_accessors.is_empty() {
        root["meshes"] = serde_json::json!(json_meshes);
        root["accessors"] = serde_json::json!(json_accessors);
        root["bufferViews"] = serde_json::json!(json_buffer_views);
        root["buffers"] = serde_json::json!([{ "byteLength": buffer_byte_length }]);
        root["materials"] = serde_json::json!(materials);
    }

    // Include animations if present
    if !json_animations.is_empty() {
        root["animations"] = serde_json::json!(json_animations);
        // Ensure accessors/buffers are present even if no meshes
        if json_meshes.is_empty() && !json_accessors.is_empty() {
            root["accessors"] = serde_json::json!(json_accessors);
            root["bufferViews"] = serde_json::json!(json_buffer_views);
            root["buffers"] = serde_json::json!([{ "byteLength": buffer_byte_length }]);
        }
    }

    // VRM BlendShape preset write-back (VRMC_vrm 1.0 extension)
    if let Some(fp) = face_params {
        if !fp.is_empty() {
            root["extensions"] = build_vrm_extensions(fp);
            root["extensionsUsed"] = serde_json::json!(["VRMC_vrm"]);
        }
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

/// Write a contiguous f32 array to the binary buffer and create a glTF accessor + bufferView.
/// Returns the accessor index.
fn write_float_accessor(
    data: &[f32],
    component_count: usize,
    accessor_type: &str,
    include_min_max: bool,
    bin: &mut Vec<u8>,
    accessors: &mut Vec<serde_json::Value>,
    buffer_views: &mut Vec<serde_json::Value>,
) -> usize {
    let accessor_idx = accessors.len();
    let view_idx = buffer_views.len();
    let offset = bin.len();

    for &val in data {
        bin.extend_from_slice(&val.to_le_bytes());
    }

    let byte_length = bin.len() - offset;
    let element_count = if component_count > 0 {
        data.len() / component_count
    } else {
        data.len()
    };

    buffer_views.push(serde_json::json!({
        "buffer": 0,
        "byteOffset": offset,
        "byteLength": byte_length
    }));

    let mut accessor = serde_json::json!({
        "bufferView": view_idx,
        "componentType": 5126_u32,
        "count": element_count,
        "type": accessor_type
    });

    if include_min_max && !data.is_empty() {
        let min_val = data.iter().copied().fold(f32::MAX, f32::min);
        let max_val = data.iter().copied().fold(f32::MIN, f32::max);
        accessor["min"] = serde_json::json!([min_val]);
        accessor["max"] = serde_json::json!([max_val]);
    }

    accessors.push(accessor);
    accessor_idx
}

/// Build VRMC_vrm 1.0 extension JSON from face parameter presets.
///
/// Standard VRM preset names (happy, sad, blink, etc.) go into `expressions.preset`,
/// all others go into `expressions.custom`. Each entry stores the default weight in extras.
///
/// **Known limitation**: `morphTargetBinds` is always empty because the loader does not
/// currently store morph target names per mesh. Downstream VRM consumers will see the
/// expression names and default weights but cannot drive actual morph target deformation
/// until the loader is extended to preserve morph target name → index mappings.
fn build_vrm_extensions(face_params: &HashMap<String, f32>) -> serde_json::Value {
    const PRESET_NAMES: &[&str] = &[
        "happy", "angry", "sad", "relaxed", "surprised",
        "aa", "ih", "ou", "ee", "oh",
        "blink", "blinkLeft", "blinkRight",
        "lookUp", "lookDown", "lookLeft", "lookRight",
        "neutral",
    ];

    let mut preset_map = serde_json::Map::new();
    let mut custom_map = serde_json::Map::new();

    for (name, weight) in face_params {
        let entry = serde_json::json!({
            "morphTargetBinds": [],
            "isBinary": false,
            "overrideBlink": "none",
            "overrideLookAt": "none",
            "overrideMouth": "none",
            "extras": { "defaultWeight": weight }
        });

        if PRESET_NAMES.contains(&name.as_str()) {
            preset_map.insert(name.clone(), entry);
        } else {
            custom_map.insert(name.clone(), entry);
        }
    }

    serde_json::json!({
        "VRMC_vrm": {
            "specVersion": "1.0",
            "expressions": {
                "preset": preset_map,
                "custom": custom_map
            }
        }
    })
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
                visible: true,
                has_mesh: false,
                has_light: false,
                has_camera: false,
                has_skeleton: false,
            },
            mesh_uri: None,
        }];
        let meshes = HashMap::new();
        let glb = export_glb(&nodes, &meshes, None, None).unwrap();

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
                visible: true,
                has_mesh: true,
                has_light: false,
                has_camera: false,
                has_skeleton: false,
            },
            mesh_uri: Some(mesh_uri.clone()),
        }];

        let mut meshes = HashMap::new();
        meshes.insert(mesh_uri, triangle_mesh());

        let glb = export_glb(&nodes, &meshes, None, None).unwrap();

        // GLB should have both JSON and BIN chunks
        assert!(glb.len() > 20);
        // Verify total length matches header
        let total = u32::from_le_bytes([glb[8], glb[9], glb[10], glb[11]]) as usize;
        assert_eq!(total, glb.len());
    }

    fn parse_glb_json(glb: &[u8]) -> serde_json::Value {
        let json_len = u32::from_le_bytes([glb[12], glb[13], glb[14], glb[15]]) as usize;
        let json_str = std::str::from_utf8(&glb[20..20 + json_len])
            .unwrap()
            .trim();
        serde_json::from_str(json_str).unwrap()
    }

    fn make_node(id: &str, name: &str) -> ExportNode {
        ExportNode {
            snapshot: SceneNodeSnapshot {
                id: id.into(),
                name: name.into(),
                position: [0.0; 3],
                rotation: [0.0, 0.0, 0.0, 1.0],
                scale: [1.0; 3],
                parent_id: None,
                visible: true,
                has_mesh: false,
                has_light: false,
                has_camera: false,
                has_skeleton: false,
            },
            mesh_uri: None,
        }
    }

    #[test]
    fn export_with_animation_includes_animations() {
        use crate::components::{
            AnimationChannel, AnimationClipData, AnimationProperty, SceneKeyframe,
        };
        let nodes = vec![make_node("node0", "Bone")];
        let meshes = HashMap::new();

        let clip = AnimationClipData {
            name: "Walk".to_string(),
            duration: 2.0,
            channels: vec![AnimationChannel {
                target_node: "node0".to_string(),
                property: AnimationProperty::Translation,
                keyframes: vec![
                    SceneKeyframe::new(0.0, vec![0.0, 0.0, 0.0]),
                    SceneKeyframe::new(1.0, vec![1.0, 0.0, 0.0]),
                    SceneKeyframe::new(2.0, vec![0.0, 0.0, 0.0]),
                ],
            }],
        };

        let glb = export_glb(&nodes, &meshes, Some(&[clip]), None).unwrap();
        let root = parse_glb_json(&glb);

        let anims = root["animations"].as_array().expect("animations array");
        assert_eq!(anims.len(), 1);
        assert_eq!(anims[0]["name"], "Walk");

        let channels = anims[0]["channels"].as_array().unwrap();
        assert_eq!(channels.len(), 1);
        assert_eq!(channels[0]["target"]["node"], 0);
        assert_eq!(channels[0]["target"]["path"], "translation");
    }

    #[test]
    fn export_with_rotation_animation() {
        use crate::components::{
            AnimationChannel, AnimationClipData, AnimationProperty, SceneKeyframe,
        };
        let nodes = vec![make_node("bone", "Bone")];
        let meshes = HashMap::new();
        let clip = AnimationClipData {
            name: "Spin".to_string(),
            duration: 1.0,
            channels: vec![AnimationChannel {
                target_node: "bone".to_string(),
                property: AnimationProperty::Rotation,
                keyframes: vec![
                    SceneKeyframe::new(0.0, vec![0.0, 0.0, 0.0, 1.0]),
                    SceneKeyframe::new(1.0, vec![0.0, 0.707, 0.0, 0.707]),
                ],
            }],
        };
        let glb = export_glb(&nodes, &meshes, Some(&[clip]), None).unwrap();
        let root = parse_glb_json(&glb);
        let ch = &root["animations"][0]["channels"][0];
        assert_eq!(ch["target"]["path"], "rotation");
    }

    #[test]
    fn export_with_scale_animation() {
        use crate::components::{
            AnimationChannel, AnimationClipData, AnimationProperty, SceneKeyframe,
        };
        let nodes = vec![make_node("obj", "Object")];
        let meshes = HashMap::new();
        let clip = AnimationClipData {
            name: "Grow".to_string(),
            duration: 1.0,
            channels: vec![AnimationChannel {
                target_node: "obj".to_string(),
                property: AnimationProperty::Scale,
                keyframes: vec![
                    SceneKeyframe::new(0.0, vec![1.0, 1.0, 1.0]),
                    SceneKeyframe::new(1.0, vec![2.0, 2.0, 2.0]),
                ],
            }],
        };
        let glb = export_glb(&nodes, &meshes, Some(&[clip]), None).unwrap();
        let root = parse_glb_json(&glb);
        let ch = &root["animations"][0]["channels"][0];
        assert_eq!(ch["target"]["path"], "scale");
    }

    #[test]
    fn export_with_morph_weights_animation() {
        use crate::components::{
            AnimationChannel, AnimationClipData, AnimationProperty, SceneKeyframe,
        };
        let nodes = vec![make_node("face", "Face")];
        let meshes = HashMap::new();
        let clip = AnimationClipData {
            name: "Blink".to_string(),
            duration: 0.5,
            channels: vec![AnimationChannel {
                target_node: "face".to_string(),
                property: AnimationProperty::MorphWeights,
                keyframes: vec![
                    SceneKeyframe::new(0.0, vec![0.0, 0.0]),
                    SceneKeyframe::new(0.25, vec![1.0, 0.5]),
                    SceneKeyframe::new(0.5, vec![0.0, 0.0]),
                ],
            }],
        };
        let glb = export_glb(&nodes, &meshes, Some(&[clip]), None).unwrap();
        let root = parse_glb_json(&glb);
        let ch = &root["animations"][0]["channels"][0];
        assert_eq!(ch["target"]["path"], "weights");
    }

    #[test]
    fn export_without_animation_no_animations_field() {
        let nodes = vec![make_node("root", "Root")];
        let meshes = HashMap::new();
        let glb = export_glb(&nodes, &meshes, None, None).unwrap();
        let root = parse_glb_json(&glb);
        assert!(root.get("animations").is_none());
    }

    #[test]
    fn export_with_face_params_includes_vrm_extension() {
        let nodes = vec![make_node("root", "Root")];
        let meshes = HashMap::new();
        let mut fp = HashMap::new();
        fp.insert("happy".to_string(), 0.8);
        fp.insert("myCustomExpr".to_string(), 0.5);

        let glb = export_glb(&nodes, &meshes, None, Some(&fp)).unwrap();
        let root = parse_glb_json(&glb);

        let ext = &root["extensions"]["VRMC_vrm"];
        assert_eq!(ext["specVersion"], "1.0");
        assert!(ext["expressions"]["preset"]["happy"].is_object());
        assert!(ext["expressions"]["custom"]["myCustomExpr"].is_object());

        let used = root["extensionsUsed"].as_array().unwrap();
        assert!(used.iter().any(|v| v == "VRMC_vrm"));
    }

    #[test]
    fn export_without_face_params_no_extensions() {
        let nodes = vec![make_node("root", "Root")];
        let meshes = HashMap::new();
        let glb = export_glb(&nodes, &meshes, None, None).unwrap();
        let root = parse_glb_json(&glb);
        assert!(root.get("extensions").is_none());
    }

    #[test]
    fn test_build_vrm_extensions_preset_classification() {
        let mut fp = HashMap::new();
        fp.insert("happy".to_string(), 1.0);
        fp.insert("blink".to_string(), 0.5);
        fp.insert("customWink".to_string(), 0.3);

        let ext = build_vrm_extensions(&fp);
        let preset = &ext["VRMC_vrm"]["expressions"]["preset"];
        let custom = &ext["VRMC_vrm"]["expressions"]["custom"];

        assert!(preset["happy"].is_object());
        assert!(preset["blink"].is_object());
        assert!(custom["customWink"].is_object());
        // Ensure custom didn't leak into preset
        assert!(preset.get("customWink").is_none());
    }

    #[test]
    fn glb_length_alignment() {
        assert_eq!(align_to_4(0), 0);
        assert_eq!(align_to_4(1), 4);
        assert_eq!(align_to_4(4), 4);
        assert_eq!(align_to_4(5), 8);
    }
}
