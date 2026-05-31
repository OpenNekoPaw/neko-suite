//! glTF/GLB exporter — converts ECS scene data to glTF 2.0 binary format.
//!
//! Builds glTF JSON + binary buffer from scene snapshots and procedural meshes,
//! then packs them into GLB container format.

use crate::asset_database::{
    AssetDatabase, AssetHandle, ImageDescriptor, MaterialAlphaMode, MaterialDescriptor,
    TextureDescriptor, TextureSamplerDescriptor,
};
use crate::character_authoring::NkcCharacterFile;
use crate::character_baking::{
    CharacterBakeError, CharacterBakeRequest, CharacterBakingSystem, CharacterExportFormat,
    CharacterTopologyExportState, EngineCharacterPose,
};
use crate::components::{
    AnimationClipData, AnimationProperty, Camera, CameraProjection, Light, LightKind,
};
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
    pub material_handle: Option<AssetHandle>,
    pub light: Option<Light>,
    pub camera: Option<Camera>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VisibilityExportMode {
    Prune,
    ExtrasFlag,
    PreserveAll,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ExportOptions {
    pub visibility: VisibilityExportMode,
}

impl Default for ExportOptions {
    fn default() -> Self {
        Self {
            visibility: VisibilityExportMode::Prune,
        }
    }
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
    asset_database: &AssetDatabase,
    animation_clips: Option<&[AnimationClipData]>,
    face_params: Option<&HashMap<String, f32>>,
) -> Result<Vec<u8>, ExportError> {
    export_glb_with_options(
        nodes,
        procedural_meshes,
        asset_database,
        ExportOptions::default(),
        animation_clips,
        face_params,
    )
}

pub fn export_glb_with_options(
    nodes: &[ExportNode],
    procedural_meshes: &HashMap<String, ProceduralMesh>,
    asset_database: &AssetDatabase,
    options: ExportOptions,
    animation_clips: Option<&[AnimationClipData]>,
    face_params: Option<&HashMap<String, f32>>,
) -> Result<Vec<u8>, ExportError> {
    let (json_string, bin_data) = build_gltf_json_and_bin(
        nodes,
        procedural_meshes,
        asset_database,
        options,
        animation_clips,
        face_params,
    )?;

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

pub fn export_character_glb(
    character_file: &NkcCharacterFile,
    asset_database: &AssetDatabase,
    engine_pose: Option<&EngineCharacterPose>,
    topology_state: &CharacterTopologyExportState,
    options: ExportOptions,
) -> Result<Vec<u8>, CharacterBakeError> {
    CharacterBakingSystem.export_baked(CharacterBakeRequest {
        character_file,
        asset_database,
        engine_pose,
        topology_state,
        export_options: options,
        format: CharacterExportFormat::Glb,
    })
}

pub fn export_character_vrm(
    character_file: &NkcCharacterFile,
    asset_database: &AssetDatabase,
    engine_pose: Option<&EngineCharacterPose>,
    topology_state: &CharacterTopologyExportState,
    options: ExportOptions,
) -> Result<Vec<u8>, CharacterBakeError> {
    CharacterBakingSystem.export_baked(CharacterBakeRequest {
        character_file,
        asset_database,
        engine_pose,
        topology_state,
        export_options: options,
        format: CharacterExportFormat::Vrm,
    })
}

pub fn export_character_fbx(
    character_file: &NkcCharacterFile,
    asset_database: &AssetDatabase,
    engine_pose: Option<&EngineCharacterPose>,
    topology_state: &CharacterTopologyExportState,
    options: ExportOptions,
) -> Result<Vec<u8>, CharacterBakeError> {
    CharacterBakingSystem.export_baked(CharacterBakeRequest {
        character_file,
        asset_database,
        engine_pose,
        topology_state,
        export_options: options,
        format: CharacterExportFormat::Fbx,
    })
}

/// Build glTF JSON descriptor and binary buffer from scene nodes.
fn build_gltf_json_and_bin(
    nodes: &[ExportNode],
    procedural_meshes: &HashMap<String, ProceduralMesh>,
    asset_database: &AssetDatabase,
    options: ExportOptions,
    animation_clips: Option<&[AnimationClipData]>,
    face_params: Option<&HashMap<String, f32>>,
) -> Result<(String, Vec<u8>), ExportError> {
    let mut bin = Vec::new();
    let mut json_nodes: Vec<serde_json::Value> = Vec::new();
    let mut json_meshes: Vec<serde_json::Value> = Vec::new();
    let mut json_accessors: Vec<serde_json::Value> = Vec::new();
    let mut json_buffer_views: Vec<serde_json::Value> = Vec::new();
    let mut json_lights: Vec<serde_json::Value> = Vec::new();
    let mut json_cameras: Vec<serde_json::Value> = Vec::new();

    let export_entries = select_export_nodes(nodes, options.visibility);

    // Map exported node IDs to output indices for parent-child and animation resolution
    let node_id_to_index: HashMap<&str, usize> = export_entries
        .iter()
        .enumerate()
        .map(|(i, entry)| (entry.node.snapshot.id.as_str(), i))
        .collect();

    // Collect children per node
    let mut children_map: HashMap<usize, Vec<usize>> = HashMap::new();
    let mut root_nodes: Vec<usize> = Vec::new();

    for (i, entry) in export_entries.iter().enumerate() {
        let node = entry.node;
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

    let referenced_materials: Vec<AssetHandle> = export_entries
        .iter()
        .map(|entry| entry.node)
        .filter(|node| node_has_exportable_mesh(node, procedural_meshes))
        .filter_map(|node| node.material_handle.clone())
        .collect();
    let needs_default_material = export_entries.iter().map(|entry| entry.node).any(|node| {
        node_has_exportable_mesh(node, procedural_meshes)
            && node
                .material_handle
                .as_ref()
                .and_then(|handle| asset_database.material(handle))
                .is_none()
    });
    let asset_exports = build_asset_exports(
        asset_database,
        &referenced_materials,
        needs_default_material,
        &mut bin,
        &mut json_buffer_views,
    );

    // Process each node
    for (i, entry) in export_entries.iter().enumerate() {
        let node = entry.node;
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
            let material_index = node
                .material_handle
                .as_ref()
                .and_then(|handle| asset_exports.material_indices.get(handle).copied())
                .or(asset_exports.default_material_index)
                .unwrap_or(0);

            json_meshes.push(serde_json::json!({
                "primitives": [{
                    "attributes": {
                        "POSITION": pos_accessor,
                        "NORMAL": pos_accessor + 1,
                        "TEXCOORD_0": pos_accessor + 2
                    },
                    "indices": pos_accessor + 3,
                    "material": material_index
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

        if let Some(light) = &node.light {
            let light_index = json_lights.len();
            json_lights.push(light_json(light));
            gltf_node["extensions"] = serde_json::json!({
                "KHR_lights_punctual": {
                    "light": light_index
                }
            });
        }

        if let Some(camera) = &node.camera {
            let camera_index = json_cameras.len();
            json_cameras.push(camera_json(camera));
            gltf_node["camera"] = serde_json::json!(camera_index);
        }

        if options.visibility == VisibilityExportMode::ExtrasFlag && !snap.visible {
            gltf_node["extras"] = serde_json::json!({
                "visible": false
            });
        }

        if let Some(children) = children_map.get(&i) {
            gltf_node["children"] = serde_json::json!(children);
        }

        json_nodes.push(gltf_node);
    }

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
                let timestamps: Vec<f32> = channel.keyframes.iter().map(|k| k.timestamp).collect();
                let input_idx = write_float_accessor(
                    &timestamps,
                    1,
                    "SCALAR",
                    true,
                    &mut bin,
                    &mut json_accessors,
                    &mut json_buffer_views,
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
                    &values,
                    component_count,
                    accessor_type,
                    false,
                    &mut bin,
                    &mut json_accessors,
                    &mut json_buffer_views,
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
        if !asset_exports.materials.is_empty() {
            root["materials"] = serde_json::json!(asset_exports.materials);
        }
        if !asset_exports.images.is_empty() {
            root["images"] = serde_json::json!(asset_exports.images);
        }
        if !asset_exports.textures.is_empty() {
            root["textures"] = serde_json::json!(asset_exports.textures);
        }
        if !asset_exports.samplers.is_empty() {
            root["samplers"] = serde_json::json!(asset_exports.samplers);
        }
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

    if !json_cameras.is_empty() {
        root["cameras"] = serde_json::json!(json_cameras);
    }

    let mut root_extensions = serde_json::Map::new();
    let mut extensions_used: Vec<&str> = Vec::new();

    if !json_lights.is_empty() {
        root_extensions.insert(
            "KHR_lights_punctual".to_string(),
            serde_json::json!({ "lights": json_lights }),
        );
        extensions_used.push("KHR_lights_punctual");
    }

    if let Some(fp) = face_params {
        if !fp.is_empty() {
            if let Some(vrm_extensions) = build_vrm_extensions(fp).as_object() {
                for (key, value) in vrm_extensions {
                    root_extensions.insert(key.clone(), value.clone());
                }
            }
            extensions_used.push("VRMC_vrm");
        }
    }

    if !root_extensions.is_empty() {
        root["extensions"] = serde_json::Value::Object(root_extensions);
        root["extensionsUsed"] = serde_json::json!(extensions_used);
    }

    let json_string = serde_json::to_string(&root)?;
    Ok((json_string, bin))
}

fn light_json(light: &Light) -> serde_json::Value {
    let mut value = serde_json::Map::new();
    let gltf_type = match &light.kind {
        LightKind::Directional => "directional",
        LightKind::Point => "point",
        LightKind::Spot { .. } => "spot",
    };
    value.insert("type".to_string(), serde_json::json!(gltf_type));
    value.insert(
        "color".to_string(),
        serde_json::json!(light.color.to_array()),
    );
    value.insert("intensity".to_string(), serde_json::json!(light.intensity));
    if let Some(range) = light.range {
        value.insert("range".to_string(), serde_json::json!(range));
    }

    if let LightKind::Spot {
        inner_cone,
        outer_cone,
    } = &light.kind
    {
        value.insert(
            "spot".to_string(),
            serde_json::json!({
                "innerConeAngle": inner_cone,
                "outerConeAngle": outer_cone
            }),
        );
    }

    serde_json::Value::Object(value)
}

fn camera_json(camera: &Camera) -> serde_json::Value {
    match &camera.projection {
        CameraProjection::Perspective { fov, aspect_ratio } => {
            serde_json::json!({
                "type": "perspective",
                "perspective": {
                    "yfov": fov,
                    "aspectRatio": aspect_ratio,
                    "znear": camera.near,
                    "zfar": camera.far
                }
            })
        }
        CameraProjection::Orthographic { xmag, ymag } => {
            serde_json::json!({
                "type": "orthographic",
                "orthographic": {
                    "xmag": xmag,
                    "ymag": ymag,
                    "znear": camera.near,
                    "zfar": camera.far
                }
            })
        }
    }
}

struct AssetExportTables {
    materials: Vec<serde_json::Value>,
    textures: Vec<serde_json::Value>,
    images: Vec<serde_json::Value>,
    samplers: Vec<serde_json::Value>,
    material_indices: HashMap<AssetHandle, usize>,
    texture_indices: HashMap<AssetHandle, usize>,
    image_indices: HashMap<AssetHandle, usize>,
    default_material_index: Option<usize>,
}

impl AssetExportTables {
    fn new() -> Self {
        Self {
            materials: Vec::new(),
            textures: Vec::new(),
            images: Vec::new(),
            samplers: Vec::new(),
            material_indices: HashMap::new(),
            texture_indices: HashMap::new(),
            image_indices: HashMap::new(),
            default_material_index: None,
        }
    }
}

struct ExportNodeEntry<'a> {
    node: &'a ExportNode,
}

fn select_export_nodes(
    nodes: &[ExportNode],
    visibility: VisibilityExportMode,
) -> Vec<ExportNodeEntry<'_>> {
    let source_index_by_id: HashMap<&str, usize> = nodes
        .iter()
        .enumerate()
        .map(|(index, node)| (node.snapshot.id.as_str(), index))
        .collect();
    let mut memo = HashMap::new();

    nodes
        .iter()
        .enumerate()
        .filter_map(|(index, node)| {
            should_export_node(index, nodes, &source_index_by_id, visibility, &mut memo)
                .then_some(ExportNodeEntry { node })
        })
        .collect()
}

fn should_export_node(
    index: usize,
    nodes: &[ExportNode],
    source_index_by_id: &HashMap<&str, usize>,
    visibility: VisibilityExportMode,
    memo: &mut HashMap<usize, bool>,
) -> bool {
    if visibility != VisibilityExportMode::Prune {
        return true;
    }
    if let Some(&value) = memo.get(&index) {
        return value;
    }

    let node = &nodes[index];
    let visible = node.snapshot.visible
        && node
            .snapshot
            .parent_id
            .as_deref()
            .and_then(|parent_id| source_index_by_id.get(parent_id).copied())
            .is_none_or(|parent_index| {
                should_export_node(parent_index, nodes, source_index_by_id, visibility, memo)
            });
    memo.insert(index, visible);
    visible
}

fn build_asset_exports(
    asset_database: &AssetDatabase,
    referenced_materials: &[AssetHandle],
    needs_default_material: bool,
    bin: &mut Vec<u8>,
    buffer_views: &mut Vec<serde_json::Value>,
) -> AssetExportTables {
    let mut tables = AssetExportTables::new();

    for handle in referenced_materials {
        if tables.material_indices.contains_key(handle) {
            continue;
        }
        let Some(material) = asset_database.material(handle) else {
            continue;
        };
        push_material(material, asset_database, bin, buffer_views, &mut tables);
    }

    if needs_default_material {
        let index = tables.materials.len();
        tables.materials.push(default_material_json());
        tables.default_material_index = Some(index);
    }

    tables
}

fn node_has_exportable_mesh(
    node: &ExportNode,
    procedural_meshes: &HashMap<String, ProceduralMesh>,
) -> bool {
    node.mesh_uri
        .as_ref()
        .and_then(|uri| procedural_meshes.get(uri))
        .is_some_and(|mesh| !mesh.is_empty())
}

fn push_material(
    material: &MaterialDescriptor,
    asset_database: &AssetDatabase,
    bin: &mut Vec<u8>,
    buffer_views: &mut Vec<serde_json::Value>,
    tables: &mut AssetExportTables,
) -> usize {
    let material_index = tables.materials.len();
    tables
        .material_indices
        .insert(material.handle.clone(), material_index);

    let mut pbr = serde_json::Map::new();
    pbr.insert(
        "baseColorFactor".to_string(),
        serde_json::json!(material.base_color_factor),
    );
    pbr.insert(
        "metallicFactor".to_string(),
        serde_json::json!(material.metallic_factor),
    );
    pbr.insert(
        "roughnessFactor".to_string(),
        serde_json::json!(material.roughness_factor),
    );

    if let Some(texture) = material
        .base_color_texture
        .as_ref()
        .and_then(|handle| ensure_texture(handle, asset_database, bin, buffer_views, tables))
    {
        pbr.insert("baseColorTexture".to_string(), texture_ref_json(texture));
    }

    if let Some(texture) = material
        .metallic_roughness_texture
        .as_ref()
        .and_then(|handle| ensure_texture(handle, asset_database, bin, buffer_views, tables))
    {
        pbr.insert(
            "metallicRoughnessTexture".to_string(),
            texture_ref_json(texture),
        );
    }

    let mut material_json = serde_json::Map::new();
    material_json.insert(
        "name".to_string(),
        serde_json::json!(material
            .name
            .clone()
            .unwrap_or_else(|| material.handle.guid.clone())),
    );
    material_json.insert(
        "pbrMetallicRoughness".to_string(),
        serde_json::Value::Object(pbr),
    );
    material_json.insert(
        "emissiveFactor".to_string(),
        serde_json::json!(material.emissive_factor),
    );
    if material.alpha_mode != MaterialAlphaMode::Opaque {
        material_json.insert(
            "alphaMode".to_string(),
            serde_json::json!(match material.alpha_mode {
                MaterialAlphaMode::Opaque => "OPAQUE",
                MaterialAlphaMode::Mask => "MASK",
                MaterialAlphaMode::Blend => "BLEND",
            }),
        );
    }
    if material.alpha_mode == MaterialAlphaMode::Mask {
        material_json.insert(
            "alphaCutoff".to_string(),
            serde_json::json!(material.alpha_cutoff),
        );
    }
    if material.double_sided {
        material_json.insert("doubleSided".to_string(), serde_json::json!(true));
    }

    if let Some(texture) = material
        .normal_texture
        .as_ref()
        .and_then(|handle| ensure_texture(handle, asset_database, bin, buffer_views, tables))
    {
        material_json.insert(
            "normalTexture".to_string(),
            serde_json::json!({
                "index": texture,
                "scale": material.normal_scale
            }),
        );
    }

    if let Some(texture) = material
        .occlusion_texture
        .as_ref()
        .and_then(|handle| ensure_texture(handle, asset_database, bin, buffer_views, tables))
    {
        material_json.insert(
            "occlusionTexture".to_string(),
            serde_json::json!({
                "index": texture,
                "strength": material.occlusion_strength
            }),
        );
    }

    if let Some(texture) = material
        .emissive_texture
        .as_ref()
        .and_then(|handle| ensure_texture(handle, asset_database, bin, buffer_views, tables))
    {
        material_json.insert("emissiveTexture".to_string(), texture_ref_json(texture));
    }

    tables
        .materials
        .push(serde_json::Value::Object(material_json));
    material_index
}

fn ensure_texture(
    handle: &AssetHandle,
    asset_database: &AssetDatabase,
    bin: &mut Vec<u8>,
    buffer_views: &mut Vec<serde_json::Value>,
    tables: &mut AssetExportTables,
) -> Option<usize> {
    if let Some(&index) = tables.texture_indices.get(handle) {
        return Some(index);
    }

    let descriptor = asset_database.texture(handle)?;
    let source = descriptor
        .source_image
        .as_ref()
        .and_then(|image_handle| {
            ensure_image(image_handle, asset_database, bin, buffer_views, tables)
        })
        .or_else(|| push_uri_image(descriptor, tables))?;

    let sampler = descriptor
        .sampler
        .as_ref()
        .map(|sampler| push_sampler(sampler, tables));
    let index = tables.textures.len();
    let mut texture_json = serde_json::Map::new();
    texture_json.insert("source".to_string(), serde_json::json!(source));
    if let Some(sampler) = sampler {
        texture_json.insert("sampler".to_string(), serde_json::json!(sampler));
    }
    tables
        .textures
        .push(serde_json::Value::Object(texture_json));
    tables.texture_indices.insert(handle.clone(), index);
    Some(index)
}

fn ensure_image(
    handle: &AssetHandle,
    asset_database: &AssetDatabase,
    bin: &mut Vec<u8>,
    buffer_views: &mut Vec<serde_json::Value>,
    tables: &mut AssetExportTables,
) -> Option<usize> {
    if let Some(&index) = tables.image_indices.get(handle) {
        return Some(index);
    }

    let descriptor = asset_database.image(handle)?;
    let image = image_json(descriptor, bin, buffer_views)?;
    let index = tables.images.len();
    tables.images.push(image);
    tables.image_indices.insert(handle.clone(), index);
    Some(index)
}

fn image_json(
    descriptor: &ImageDescriptor,
    bin: &mut Vec<u8>,
    buffer_views: &mut Vec<serde_json::Value>,
) -> Option<serde_json::Value> {
    if let Some(data) = descriptor.data.as_ref().filter(|data| !data.is_empty()) {
        pad_bin_to_4(bin);
        let offset = bin.len();
        bin.extend_from_slice(data);
        let byte_length = bin.len() - offset;
        let view_index = buffer_views.len();
        buffer_views.push(serde_json::json!({
            "buffer": 0,
            "byteOffset": offset,
            "byteLength": byte_length
        }));
        return Some(serde_json::json!({
            "bufferView": view_index,
            "mimeType": descriptor
                .mime_type
                .clone()
                .unwrap_or_else(|| "image/png".to_string())
        }));
    }

    descriptor
        .uri
        .as_ref()
        .map(|uri| serde_json::json!({ "uri": uri }))
}

fn push_uri_image(descriptor: &TextureDescriptor, tables: &mut AssetExportTables) -> Option<usize> {
    if descriptor.uri.is_empty() {
        return None;
    }

    let index = tables.images.len();
    tables
        .images
        .push(serde_json::json!({ "uri": descriptor.uri }));
    Some(index)
}

fn push_sampler(sampler: &TextureSamplerDescriptor, tables: &mut AssetExportTables) -> usize {
    let index = tables.samplers.len();
    let mut sampler_json = serde_json::Map::new();
    if let Some(mag_filter) = sampler.mag_filter {
        sampler_json.insert("magFilter".to_string(), serde_json::json!(mag_filter));
    }
    if let Some(min_filter) = sampler.min_filter {
        sampler_json.insert("minFilter".to_string(), serde_json::json!(min_filter));
    }
    sampler_json.insert("wrapS".to_string(), serde_json::json!(sampler.wrap_s));
    sampler_json.insert("wrapT".to_string(), serde_json::json!(sampler.wrap_t));
    tables
        .samplers
        .push(serde_json::Value::Object(sampler_json));
    index
}

fn texture_ref_json(index: usize) -> serde_json::Value {
    serde_json::json!({ "index": index })
}

fn default_material_json() -> serde_json::Value {
    serde_json::json!({
        "name": "Default",
        "pbrMetallicRoughness": {
            "baseColorFactor": [0.8, 0.8, 0.8, 1.0],
            "metallicFactor": 0.0,
            "roughnessFactor": 0.5
        }
    })
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
    pad_bin_to_4(bin);
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
    pad_bin_to_4(bin);
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
    pad_bin_to_4(bin);
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
    pad_bin_to_4(bin);
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
    pad_bin_to_4(bin);
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
        "happy",
        "angry",
        "sad",
        "relaxed",
        "surprised",
        "aa",
        "ih",
        "ou",
        "ee",
        "oh",
        "blink",
        "blinkLeft",
        "blinkRight",
        "lookUp",
        "lookDown",
        "lookLeft",
        "lookRight",
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

fn pad_bin_to_4(bin: &mut Vec<u8>) {
    let padded = align_to_4(bin.len());
    bin.extend(std::iter::repeat_n(0x00, padded - bin.len()));
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::asset_database::{
        AssetDescriptor, ImageDescriptor, MaterialDescriptor, TextureColorSpace, TextureDescriptor,
        TextureSamplerDescriptor,
    };
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
                bounds: None,
                world_bounds: None,
                primitives: Vec::new(),
                character_id: None,
                region_descriptors: None,
                light: None,
            },
            mesh_uri: None,
            material_handle: None,
            light: None,
            camera: None,
        }];
        let meshes = HashMap::new();
        let glb = export_glb(&nodes, &meshes, &AssetDatabase::default(), None, None).unwrap();

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
                bounds: None,
                world_bounds: None,
                primitives: Vec::new(),
                character_id: None,
                region_descriptors: None,
                light: None,
            },
            mesh_uri: Some(mesh_uri.clone()),
            material_handle: None,
            light: None,
            camera: None,
        }];

        let mut meshes = HashMap::new();
        meshes.insert(mesh_uri, triangle_mesh());

        let glb = export_glb(&nodes, &meshes, &AssetDatabase::default(), None, None).unwrap();

        // GLB should have both JSON and BIN chunks
        assert!(glb.len() > 20);
        // Verify total length matches header
        let total = u32::from_le_bytes([glb[8], glb[9], glb[10], glb[11]]) as usize;
        assert_eq!(total, glb.len());
    }

    #[test]
    fn export_succeeds_without_render_world_or_gpu_cache() {
        let mesh_uri = "procedural://authoring_only".to_string();
        let material_handle = AssetHandle::for_material(&mesh_uri, 0);
        let nodes = vec![ExportNode {
            snapshot: SceneNodeSnapshot {
                id: "mesh_node".into(),
                name: "AuthoringOnlyMesh".into(),
                position: [0.0; 3],
                rotation: [0.0, 0.0, 0.0, 1.0],
                scale: [1.0; 3],
                parent_id: None,
                visible: true,
                has_mesh: true,
                has_light: false,
                has_camera: false,
                has_skeleton: false,
                bounds: None,
                world_bounds: None,
                primitives: Vec::new(),
                character_id: None,
                region_descriptors: None,
                light: None,
            },
            mesh_uri: Some(mesh_uri.clone()),
            material_handle: Some(material_handle.clone()),
            light: None,
            camera: None,
        }];

        let mut meshes = HashMap::new();
        meshes.insert(mesh_uri, triangle_mesh());
        let mut database = AssetDatabase::default();
        let mut material = MaterialDescriptor::new(material_handle);
        material.base_color_factor = [0.1, 0.2, 0.3, 1.0];
        database.insert_descriptor(AssetDescriptor::Material(material));

        let glb = export_glb(&nodes, &meshes, &database, None, None).unwrap();

        assert_eq!(&glb[0..4], b"glTF");
        assert!(glb.len() > 20);
    }

    #[test]
    fn export_material_textures_from_asset_database() {
        let mesh_uri = "procedural://textured_triangle".to_string();
        let material_handle = AssetHandle::for_material("model.glb", 0);
        let nodes = vec![ExportNode {
            snapshot: SceneNodeSnapshot {
                id: "mesh_node".into(),
                name: "Textured".into(),
                position: [0.0; 3],
                rotation: [0.0, 0.0, 0.0, 1.0],
                scale: [1.0; 3],
                parent_id: None,
                visible: true,
                has_mesh: true,
                has_light: false,
                has_camera: false,
                has_skeleton: false,
                bounds: None,
                world_bounds: None,
                primitives: Vec::new(),
                character_id: None,
                region_descriptors: None,
                light: None,
            },
            mesh_uri: Some(mesh_uri.clone()),
            material_handle: Some(material_handle.clone()),
            light: None,
            camera: None,
        }];

        let mut meshes = HashMap::new();
        meshes.insert(mesh_uri, triangle_mesh());

        let mut database = AssetDatabase::default();
        let texture_handles: Vec<AssetHandle> = (0..5)
            .map(|index| AssetHandle::for_texture("model.glb", index))
            .collect();
        for (index, texture_handle) in texture_handles.iter().enumerate() {
            let image_handle = AssetHandle::for_image("model.glb", index);
            database.insert_descriptor(AssetDescriptor::Image(ImageDescriptor {
                handle: image_handle.clone(),
                uri: Some(format!("texture_{}.png", index)),
                mime_type: Some("image/png".to_string()),
                data: Some(b"\x89PNG\r\n\x1a\nfake".to_vec()),
            }));
            database.insert_descriptor(AssetDescriptor::Texture(TextureDescriptor {
                handle: texture_handle.clone(),
                uri: format!("texture_{}.png", index),
                texture_index: index,
                color_space: if index == 0 || index == 4 {
                    TextureColorSpace::Srgb
                } else {
                    TextureColorSpace::Linear
                },
                source_image: Some(image_handle),
                sampler: Some(TextureSamplerDescriptor::default()),
            }));
        }

        let mut material = MaterialDescriptor::new(material_handle.clone());
        material.name = Some("AuthoredMaterial".to_string());
        material.base_color_factor = [0.2, 0.3, 0.4, 0.9];
        material.metallic_factor = 0.7;
        material.roughness_factor = 0.25;
        material.emissive_factor = [0.1, 0.2, 0.3];
        material.normal_scale = 0.5;
        material.occlusion_strength = 0.6;
        material.base_color_texture = Some(texture_handles[0].clone());
        material.metallic_roughness_texture = Some(texture_handles[1].clone());
        material.normal_texture = Some(texture_handles[2].clone());
        material.occlusion_texture = Some(texture_handles[3].clone());
        material.emissive_texture = Some(texture_handles[4].clone());
        database.insert_descriptor(AssetDescriptor::Material(material));

        let glb = export_glb(&nodes, &meshes, &database, None, None).unwrap();
        let root = parse_glb_json(&glb);
        let material = &root["materials"][0];

        assert_eq!(root["meshes"][0]["primitives"][0]["material"], 0);
        assert_eq!(material["name"], "AuthoredMaterial");
        assert_json_array_approx(
            &material["pbrMetallicRoughness"]["baseColorFactor"],
            &[0.2, 0.3, 0.4, 0.9],
        );
        assert_json_number_approx(&material["pbrMetallicRoughness"]["metallicFactor"], 0.7);
        assert_json_number_approx(&material["pbrMetallicRoughness"]["roughnessFactor"], 0.25);
        assert_eq!(
            material["pbrMetallicRoughness"]["baseColorTexture"]["index"],
            0
        );
        assert_eq!(
            material["pbrMetallicRoughness"]["metallicRoughnessTexture"]["index"],
            1
        );
        assert_eq!(material["normalTexture"]["index"], 2);
        assert_json_number_approx(&material["normalTexture"]["scale"], 0.5);
        assert_eq!(material["occlusionTexture"]["index"], 3);
        assert_json_number_approx(&material["occlusionTexture"]["strength"], 0.6);
        assert_eq!(material["emissiveTexture"]["index"], 4);
        assert_eq!(root["images"].as_array().unwrap().len(), 5);
        assert_eq!(root["textures"].as_array().unwrap().len(), 5);
    }

    #[test]
    fn export_lights_and_cameras() {
        let nodes = vec![ExportNode {
            snapshot: SceneNodeSnapshot {
                id: "camera_light".into(),
                name: "Camera Light".into(),
                position: [1.0, 2.0, 3.0],
                rotation: [0.0, 0.0, 0.0, 1.0],
                scale: [1.0; 3],
                parent_id: None,
                visible: true,
                has_mesh: false,
                has_light: true,
                has_camera: true,
                has_skeleton: false,
                bounds: None,
                world_bounds: None,
                primitives: Vec::new(),
                character_id: None,
                region_descriptors: None,
                light: None,
            },
            mesh_uri: None,
            material_handle: None,
            light: Some(Light {
                kind: LightKind::Spot {
                    inner_cone: 0.2,
                    outer_cone: 0.8,
                },
                color: glam::Vec3::new(0.9, 0.8, 0.7),
                intensity: 42.0,
                range: Some(12.0),
                shadow: None,
            }),
            camera: Some(Camera {
                projection: CameraProjection::Perspective {
                    fov: 1.0,
                    aspect_ratio: 1.6,
                },
                near: 0.1,
                far: 500.0,
            }),
        }];
        let meshes = HashMap::new();
        let glb = export_glb(&nodes, &meshes, &AssetDatabase::default(), None, None).unwrap();
        let root = parse_glb_json(&glb);

        let extensions_used = root["extensionsUsed"].as_array().unwrap();
        assert!(extensions_used
            .iter()
            .any(|value| value == "KHR_lights_punctual"));
        assert_eq!(
            root["nodes"][0]["extensions"]["KHR_lights_punctual"]["light"],
            0
        );
        let light = &root["extensions"]["KHR_lights_punctual"]["lights"][0];
        assert_eq!(light["type"], "spot");
        assert_json_array_approx(&light["color"], &[0.9, 0.8, 0.7]);
        assert_json_number_approx(&light["intensity"], 42.0);
        assert_json_number_approx(&light["spot"]["innerConeAngle"], 0.2);
        assert_json_number_approx(&light["spot"]["outerConeAngle"], 0.8);

        assert_eq!(root["nodes"][0]["camera"], 0);
        let camera = &root["cameras"][0];
        assert_eq!(camera["type"], "perspective");
        assert_json_number_approx(&camera["perspective"]["yfov"], 1.0);
        assert_json_number_approx(&camera["perspective"]["aspectRatio"], 1.6);
        assert_json_number_approx(&camera["perspective"]["znear"], 0.1);
        assert_json_number_approx(&camera["perspective"]["zfar"], 500.0);
    }

    #[test]
    fn export_visibility_modes() {
        let nodes = visibility_nodes();
        let meshes = HashMap::new();
        let database = AssetDatabase::default();

        let pruned = parse_glb_json(
            &export_glb(&nodes, &meshes, &database, None, None).expect("default prune export"),
        );
        assert_eq!(pruned["nodes"].as_array().unwrap().len(), 1);
        assert_eq!(pruned["nodes"][0]["name"], "Visible Root");
        assert_eq!(pruned["scenes"][0]["nodes"], serde_json::json!([0]));

        let extras = parse_glb_json(
            &export_glb_with_options(
                &nodes,
                &meshes,
                &database,
                ExportOptions {
                    visibility: VisibilityExportMode::ExtrasFlag,
                },
                None,
                None,
            )
            .unwrap(),
        );
        assert_eq!(extras["nodes"].as_array().unwrap().len(), 3);
        assert_eq!(extras["nodes"][0]["extras"]["visible"], false);
        assert_eq!(extras["nodes"][0]["children"], serde_json::json!([1]));

        let preserve = parse_glb_json(
            &export_glb_with_options(
                &nodes,
                &meshes,
                &database,
                ExportOptions {
                    visibility: VisibilityExportMode::PreserveAll,
                },
                None,
                None,
            )
            .unwrap(),
        );
        assert_eq!(preserve["nodes"].as_array().unwrap().len(), 3);
        assert!(preserve["nodes"][0].get("extras").is_none());
    }

    #[test]
    fn export_uses_engine_evaluated_animation_pose() {
        use crate::access::RawWorldAccess;
        use crate::components::{
            AnimationChannel, AnimationClipData, AnimationProperty, AnimationTarget,
            GlobalTransform, NodeName, SceneNodeId, SceneRoot, Transform,
        };
        use crate::world::{BevySceneWorld, SceneWorld};

        let mut scene = BevySceneWorld::new();
        {
            let ecs = scene.ecs_world_mut_raw();
            ecs.spawn((
                SceneNodeId("node_0".to_string()),
                NodeName("Animated Node".to_string()),
                Transform::default(),
                GlobalTransform::identity(),
            ));
            let clip = AnimationClipData {
                name: "Move".to_string(),
                duration: 1.0,
                channels: vec![AnimationChannel::from_flat(
                    "node_0".to_string(),
                    AnimationProperty::Translation,
                    &[0.0, 1.0],
                    &[0.0, 0.0, 0.0, 1.0, 0.0, 0.0],
                )],
            };
            ecs.spawn((SceneRoot, AnimationTarget { clips: vec![clip] }));
        }

        scene.tick("Move", 0.25);
        let snapshot = scene.get_snapshot();
        let nodes: Vec<ExportNode> = snapshot
            .nodes
            .iter()
            .map(|node| ExportNode {
                snapshot: node.clone(),
                mesh_uri: None,
                material_handle: None,
                light: None,
                camera: None,
            })
            .collect();

        let meshes = HashMap::new();
        let glb = export_glb(&nodes, &meshes, &AssetDatabase::default(), None, None).unwrap();
        let root = parse_glb_json(&glb);
        assert_json_array_approx(&root["nodes"][0]["translation"], &[0.25, 0.0, 0.0]);
    }

    fn parse_glb_json(glb: &[u8]) -> serde_json::Value {
        let json_len = u32::from_le_bytes([glb[12], glb[13], glb[14], glb[15]]) as usize;
        let json_str = std::str::from_utf8(&glb[20..20 + json_len]).unwrap().trim();
        serde_json::from_str(json_str).unwrap()
    }

    fn assert_json_array_approx(value: &serde_json::Value, expected: &[f64]) {
        let array = value.as_array().expect("json array");
        assert_eq!(array.len(), expected.len());
        for (actual, expected) in array.iter().zip(expected) {
            assert_json_number_approx(actual, *expected);
        }
    }

    fn assert_json_number_approx(value: &serde_json::Value, expected: f64) {
        let actual = value.as_f64().expect("json number");
        assert!(
            (actual - expected).abs() < 1e-5,
            "expected {expected}, got {actual}"
        );
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
                bounds: None,
                world_bounds: None,
                primitives: Vec::new(),
                character_id: None,
                region_descriptors: None,
                light: None,
            },
            mesh_uri: None,
            material_handle: None,
            light: None,
            camera: None,
        }
    }

    fn visibility_nodes() -> Vec<ExportNode> {
        vec![
            visibility_node("hidden_parent", "Hidden Parent", None, false),
            visibility_node(
                "hidden_child",
                "Hidden Child Through Parent",
                Some("hidden_parent"),
                true,
            ),
            visibility_node("visible_root", "Visible Root", None, true),
        ]
    }

    fn visibility_node(id: &str, name: &str, parent_id: Option<&str>, visible: bool) -> ExportNode {
        ExportNode {
            snapshot: SceneNodeSnapshot {
                id: id.into(),
                name: name.into(),
                position: [0.0; 3],
                rotation: [0.0, 0.0, 0.0, 1.0],
                scale: [1.0; 3],
                parent_id: parent_id.map(str::to_string),
                visible,
                has_mesh: false,
                has_light: false,
                has_camera: false,
                has_skeleton: false,
                bounds: None,
                world_bounds: None,
                primitives: Vec::new(),
                character_id: None,
                region_descriptors: None,
                light: None,
            },
            mesh_uri: None,
            material_handle: None,
            light: None,
            camera: None,
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

        let glb = export_glb(
            &nodes,
            &meshes,
            &AssetDatabase::default(),
            Some(&[clip]),
            None,
        )
        .unwrap();
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
        let glb = export_glb(
            &nodes,
            &meshes,
            &AssetDatabase::default(),
            Some(&[clip]),
            None,
        )
        .unwrap();
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
        let glb = export_glb(
            &nodes,
            &meshes,
            &AssetDatabase::default(),
            Some(&[clip]),
            None,
        )
        .unwrap();
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
        let glb = export_glb(
            &nodes,
            &meshes,
            &AssetDatabase::default(),
            Some(&[clip]),
            None,
        )
        .unwrap();
        let root = parse_glb_json(&glb);
        let ch = &root["animations"][0]["channels"][0];
        assert_eq!(ch["target"]["path"], "weights");
    }

    #[test]
    fn export_without_animation_no_animations_field() {
        let nodes = vec![make_node("root", "Root")];
        let meshes = HashMap::new();
        let glb = export_glb(&nodes, &meshes, &AssetDatabase::default(), None, None).unwrap();
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

        let glb = export_glb(&nodes, &meshes, &AssetDatabase::default(), None, Some(&fp)).unwrap();
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
        let glb = export_glb(&nodes, &meshes, &AssetDatabase::default(), None, None).unwrap();
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
