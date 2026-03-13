//! INP file loader — converts Inochi2D puppet files into ECS entities
//!
//! Manually parses the INP binary container format and extracts the embedded
//! JSON payload directly with serde_json. This is necessary because the
//! inox2d 0.3.0 crate keeps `puppet.nodes`, `puppet.node_comps`, and
//! `puppet.params` as `pub(crate)` — inaccessible from external crates.
//!
//! INP binary layout:
//!   [0..8]     magic: "TRNSRTS\0"
//!   [8..12]    u32-BE: JSON section byte length
//!   [12..N]    UTF-8 JSON: puppet definition (nodes, params, meta, …)
//!   [N..N+8]   "TEX_SECT": texture section header
//!   [N+8..N+12] u32-BE: texture count
//!   per texture: u32-BE length + u8 encoding + raw bytes
//!   (optional) "EXT_SECT" + extended vendor data

use crate::components::*;
use crate::hierarchy;
use bevy_ecs::prelude::*;
use glam::Vec2;
use serde_json::Value;
use thiserror::Error;

// ─── Public types ─────────────────────────────────────────────────────────────

/// Summary returned after successfully loading a puppet
#[derive(Debug)]
pub struct LoadResult {
    pub root_entity: Entity,
    pub entity_count: usize,
    pub parameter_count: usize,
}

/// Error type for puppet loading
#[derive(Error, Debug)]
pub enum LoadError {
    #[error("Failed to parse INP file: {0}")]
    ParseError(String),

    #[error("Invalid puppet data: {0}")]
    InvalidData(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Unsupported puppet version: {0}")]
    UnsupportedVersion(String),
}

// ─── INP binary extraction ────────────────────────────────────────────────────

const MAGIC: &[u8; 8] = b"TRNSRTS\0";

/// Extract the raw UTF-8 JSON bytes from an INP binary blob.
fn extract_json_bytes(data: &[u8]) -> Result<&[u8], LoadError> {
    if data.len() < 12 {
        return Err(LoadError::ParseError(
            "File too short to contain INP header".to_string(),
        ));
    }
    if &data[..8] != MAGIC {
        return Err(LoadError::ParseError(
            "Not a valid INP file (wrong magic bytes)".to_string(),
        ));
    }
    let json_len = u32::from_be_bytes([data[8], data[9], data[10], data[11]]) as usize;
    let json_end = 12 + json_len;
    if data.len() < json_end {
        return Err(LoadError::ParseError(
            "File truncated: JSON section incomplete".to_string(),
        ));
    }
    Ok(&data[12..json_end])
}

// ─── JSON extraction helpers ──────────────────────────────────────────────────

fn json_str<'a>(obj: &'a Value, key: &str) -> &'a str {
    obj.get(key).and_then(|v| v.as_str()).unwrap_or("")
}

fn json_f32(obj: &Value, key: &str) -> f32 {
    obj.get(key)
        .and_then(|v| v.as_f64())
        .map(|v| v as f32)
        .unwrap_or(0.0)
}

fn json_f32_at(arr: &Value, idx: usize) -> f32 {
    arr.get(idx)
        .and_then(|v| v.as_f64())
        .map(|v| v as f32)
        .unwrap_or(0.0)
}

fn json_bool(obj: &Value, key: &str) -> bool {
    obj.get(key).and_then(|v| v.as_bool()).unwrap_or(true)
}

/// Build a Transform2D from a node's JSON `"transform"` object.
fn extract_transform(node: &Value) -> Transform2D {
    let t = node.get("transform");

    let (tx, ty) = t
        .and_then(|t| t.get("trans"))
        .map(|trans| (json_f32_at(trans, 0), json_f32_at(trans, 1)))
        .unwrap_or((0.0, 0.0));

    let rz = t
        .and_then(|t| t.get("rot"))
        .map(|rot| json_f32_at(rot, 2))
        .unwrap_or(0.0);

    let (sx, sy) = t
        .and_then(|t| t.get("scale"))
        .map(|scale| {
            (
                json_f32_at(scale, 0).max(1e-6),
                json_f32_at(scale, 1).max(1e-6),
            )
        })
        .unwrap_or((1.0, 1.0));

    Transform2D {
        position: Vec2::new(tx, ty),
        rotation: rz,
        scale: Vec2::new(sx, sy),
    }
}

/// Map an Inochi2D node type string to our PuppetNodeType.
fn classify_node_type(ty: &str) -> PuppetNodeType {
    match ty {
        "Part" => PuppetNodeType::Part,
        "Composite" => PuppetNodeType::Composite,
        "MeshGroup" => PuppetNodeType::Deform,
        _ => PuppetNodeType::Group,
    }
}

/// Extract MeshData from a Part node's `"mesh"` JSON object.
///
/// Returns None if the node has no mesh or the mesh data is incomplete.
fn extract_mesh(node: &Value) -> Option<MeshData> {
    let mesh = node.get("mesh")?;

    let verts = mesh.get("verts")?.as_array()?;
    let uvs_raw = mesh.get("uvs")?.as_array()?;
    let indices_raw = mesh.get("indices")?.as_array()?;

    // verts and uvs are interleaved [x, y, x, y, ...] pairs
    let vertices: Vec<Vec2> = verts
        .chunks(2)
        .map(|c| {
            Vec2::new(
                c.first()
                    .and_then(|v| v.as_f64())
                    .map(|v| v as f32)
                    .unwrap_or(0.0),
                c.get(1)
                    .and_then(|v| v.as_f64())
                    .map(|v| v as f32)
                    .unwrap_or(0.0),
            )
        })
        .collect();

    let uvs: Vec<Vec2> = uvs_raw
        .chunks(2)
        .map(|c| {
            Vec2::new(
                c.first()
                    .and_then(|v| v.as_f64())
                    .map(|v| v as f32)
                    .unwrap_or(0.0),
                c.get(1)
                    .and_then(|v| v.as_f64())
                    .map(|v| v as f32)
                    .unwrap_or(0.0),
            )
        })
        .collect();

    let indices: Vec<u16> = indices_raw
        .iter()
        .filter_map(|v| v.as_u64().map(|n| n as u16))
        .collect();

    Some(MeshData {
        vertices,
        uvs,
        indices,
    })
}

// ─── Main loader ──────────────────────────────────────────────────────────────

/// Load an INP puppet file into the ECS world.
///
/// Parses the INP binary format, extracts the JSON payload, and creates
/// ECS entities for the puppet root, all child nodes, and puppet parameters.
pub fn load_inp(world: &mut World, data: &[u8]) -> Result<LoadResult, LoadError> {
    // 1. Extract JSON payload bytes from binary INP container
    let json_bytes = extract_json_bytes(data)?;
    let json_text = std::str::from_utf8(json_bytes)
        .map_err(|e| LoadError::ParseError(format!("INP JSON is not valid UTF-8: {}", e)))?;

    // 2. Parse JSON
    let root: Value = serde_json::from_str(json_text)
        .map_err(|e| LoadError::ParseError(format!("Failed to parse INP JSON: {}", e)))?;

    let puppet_json = root
        .get("puppet")
        .ok_or_else(|| LoadError::InvalidData("Missing 'puppet' key in INP JSON".to_string()))?;

    // 3. Extract parameter definitions from `puppet.param[]`
    let empty_arr: Vec<Value> = Vec::new();
    let params_arr = puppet_json
        .get("param")
        .and_then(|p| p.as_array())
        .unwrap_or(&empty_arr);

    let param_defs: Vec<ParameterDef> = params_arr
        .iter()
        .map(|p| {
            let name = json_str(p, "name").to_string();
            // min/max/defaults are Vec2 arrays; use the X component for scalar parameters
            let min = p
                .get("min")
                .map(|a| json_f32_at(a, 0))
                .unwrap_or(0.0);
            let max = p
                .get("max")
                .map(|a| json_f32_at(a, 0))
                .unwrap_or(1.0);
            let default = p
                .get("defaults")
                .map(|a| json_f32_at(a, 0))
                .unwrap_or(0.0);
            ParameterDef {
                name,
                min,
                max,
                default,
                current: default,
            }
        })
        .collect();
    let param_count = param_defs.len();

    // 4. Spawn the puppet root entity (represents the puppet as a whole)
    let puppet_name = puppet_json
        .get("meta")
        .and_then(|m| m.get("name"))
        .and_then(|n| n.as_str())
        .unwrap_or("Puppet")
        .to_string();

    let root_entity = world
        .spawn((
            PuppetRoot,
            PuppetNodeId("puppet_root".to_string()),
            NodeName(puppet_name),
            Transform2D::default(),
            GlobalTransform2D::default(),
            PuppetNodeType::Root,
            ZOrder(0.0),
            Opacity::default(),
            PuppetParameters { params: param_defs },
        ))
        .id();

    let mut entity_count = 1usize;

    // 5. BFS traversal of the node tree from `puppet.nodes`
    if let Some(nodes_root) = puppet_json.get("nodes") {
        let mut queue: std::collections::VecDeque<(&Value, Entity)> =
            std::collections::VecDeque::new();

        // Enqueue children of the INP root node (the root itself is our root_entity)
        if let Some(children) = nodes_root.get("children").and_then(|c| c.as_array()) {
            for child in children {
                queue.push_back((child, root_entity));
            }
        }

        while let Some((node_json, parent_entity)) = queue.pop_front() {
            let uuid = node_json
                .get("uuid")
                .and_then(|v| v.as_u64())
                .unwrap_or(entity_count as u64);
            let name = json_str(node_json, "name").to_string();
            let ty_str = json_str(node_json, "type");
            let node_type = classify_node_type(ty_str);
            let transform = extract_transform(node_json);
            let zsort = json_f32(node_json, "zsort");
            // Treat disabled nodes as fully transparent
            let opacity_val = if json_bool(node_json, "enabled") {
                1.0_f32
            } else {
                0.0_f32
            };

            let entity = world
                .spawn((
                    PuppetNodeId(format!("node_{}", uuid)),
                    NodeName(name),
                    transform,
                    GlobalTransform2D::default(),
                    node_type,
                    ZOrder(zsort),
                    Opacity(opacity_val),
                    BlendMode::default(),
                ))
                .id();
            entity_count += 1;

            // Attach mesh data for Part nodes
            if ty_str == "Part" {
                if let Some(mesh) = extract_mesh(node_json) {
                    world.entity_mut(entity).insert(mesh);
                }
                // Texture reference — first element of `textures` array
                let tex_index = node_json
                    .get("textures")
                    .and_then(|t| t.as_array())
                    .and_then(|arr| arr.first())
                    .and_then(|v| v.as_u64())
                    .map(|n| n as usize);
                if let Some(idx) = tex_index {
                    world
                        .entity_mut(entity)
                        .insert(TextureRef { texture_index: idx });
                }
            }

            // Establish parent-child hierarchy
            hierarchy::set_parent(world, entity, parent_entity);

            // Enqueue children
            if let Some(children) = node_json.get("children").and_then(|c| c.as_array()) {
                for child in children {
                    queue.push_back((child, entity));
                }
            }
        }
    }

    tracing::info!(
        "Loaded puppet: {} entities, {} parameters",
        entity_count,
        param_count
    );

    Ok(LoadResult {
        root_entity,
        entity_count,
        parameter_count: param_count,
    })
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_load_empty_data_returns_error() {
        let mut world = World::new();
        let result = load_inp(&mut world, &[]);
        assert!(result.is_err());
    }

    #[test]
    fn test_load_invalid_data_returns_error() {
        let mut world = World::new();
        let result = load_inp(&mut world, b"not a valid inp file");
        assert!(result.is_err());
    }

    #[test]
    fn test_extract_json_bytes_wrong_magic() {
        let data = b"WRONGMAG\x00\x00\x00\x04test";
        assert!(extract_json_bytes(data).is_err());
    }

    #[test]
    fn test_extract_json_bytes_correct_magic() {
        // Craft a minimal valid INP header with 4-byte JSON "null"
        let json = b"null";
        let mut data = Vec::new();
        data.extend_from_slice(MAGIC);
        data.extend_from_slice(&(json.len() as u32).to_be_bytes());
        data.extend_from_slice(json);
        let extracted = extract_json_bytes(&data).unwrap();
        assert_eq!(extracted, b"null");
    }

    #[test]
    fn test_load_minimal_inp() {
        // Craft a minimal INP with a puppet that has no nodes and no params
        let payload = serde_json::json!({
            "puppet": {
                "meta": { "name": "TestPuppet" },
                "nodes": {
                    "uuid": 0,
                    "name": "Root",
                    "type": "Node",
                    "enabled": true,
                    "zsort": 0.0,
                    "lockToRoot": false,
                    "transform": {
                        "trans": [0.0, 0.0, 0.0],
                        "rot": [0.0, 0.0, 0.0],
                        "scale": [1.0, 1.0],
                        "pixelsnap": false
                    },
                    "children": []
                },
                "param": []
            }
        });
        let json_bytes = payload.to_string().into_bytes();

        let mut data = Vec::new();
        data.extend_from_slice(MAGIC);
        data.extend_from_slice(&(json_bytes.len() as u32).to_be_bytes());
        data.extend_from_slice(&json_bytes);
        // Append minimal TEX_SECT (required by real INP; our loader doesn't need it)

        let mut world = World::new();
        let result = load_inp(&mut world, &data).unwrap();
        assert_eq!(result.entity_count, 1); // only root
        assert_eq!(result.parameter_count, 0);
    }

    #[test]
    fn test_classify_node_type() {
        assert!(matches!(classify_node_type("Part"), PuppetNodeType::Part));
        assert!(matches!(
            classify_node_type("Composite"),
            PuppetNodeType::Composite
        ));
        assert!(matches!(classify_node_type("Node"), PuppetNodeType::Group));
        assert!(matches!(
            classify_node_type("Unknown"),
            PuppetNodeType::Group
        ));
    }

    #[test]
    fn test_extract_transform_defaults() {
        let node = serde_json::json!({});
        let t = extract_transform(&node);
        assert_eq!(t.position, Vec2::ZERO);
        assert_eq!(t.rotation, 0.0);
        assert_eq!(t.scale, Vec2::ONE.max(Vec2::splat(1e-6)));
    }

    #[test]
    fn test_extract_mesh_none_without_mesh_key() {
        let node = serde_json::json!({ "type": "Node" });
        assert!(extract_mesh(&node).is_none());
    }
}
