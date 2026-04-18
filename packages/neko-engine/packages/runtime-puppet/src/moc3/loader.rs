//! MOC3 → ECS loader
//!
//! Based on OpenL2D MOC3 Spec v1.0, not derived from Cubism SDK.
//! Converts parsed MOC3 data into format-agnostic ECS components,
//! producing the same LoadResult as the INP loader.

use crate::animation::AnimationClip;
use crate::components::*;
use crate::hierarchy;
use crate::loader::{LoadError, LoadResult};
use crate::moc3::parser::{self, Moc3Data};
use bevy_ecs::prelude::*;
use glam::Vec2;

/// Load a MOC3 binary blob into the ECS world.
///
/// Creates a puppet root entity, part groups, and drawable mesh entities
/// with the same component layout as the INP loader. Art mesh key forms
/// are stored as `MultiKeyDeformation` components for runtime interpolation.
pub fn load_moc3(world: &mut World, data: &[u8]) -> Result<LoadResult, LoadError> {
    let moc3 = parser::parse_moc3(data)?;

    // Create puppet root
    let root_entity = world
        .spawn((
            PuppetNodeId("puppet_root".to_string()),
            NodeName("Puppet Root".to_string()),
            PuppetNodeType::Root,
            PuppetFormat::Moc3,
            Transform2D::default(),
            GlobalTransform2D::default(),
            ZOrder(0.0),
            Opacity::default(),
            BlendMode::default(),
            PuppetRoot,
        ))
        .id();

    // Build parameters
    let params: Vec<ParameterDef> = moc3
        .parameters
        .iter()
        .map(|p| ParameterDef {
            name: p.id.clone(),
            min: p.min_value,
            max: p.max_value,
            default: p.default_value,
            current: p.default_value,
        })
        .collect();
    let parameter_count = params.len();
    world
        .entity_mut(root_entity)
        .insert(PuppetParameters { params });

    // Create part entities (visibility groups)
    let part_entities: Vec<Entity> = moc3
        .parts
        .iter()
        .map(|part| {
            let entity = world
                .spawn((
                    PuppetNodeId(part.id.clone()),
                    NodeName(part.id.clone()),
                    PuppetNodeType::Group,
                    Transform2D::default(),
                    GlobalTransform2D::default(),
                    ZOrder(0.0),
                    Opacity(if part.is_visible { 1.0 } else { 0.0 }),
                    BlendMode::default(),
                    PartVisibility {
                        is_visible: part.is_visible,
                        is_enabled: part.is_enabled,
                    },
                ))
                .id();

            // Parent to root or to parent part
            if part.parent_part_index >= 0 {
                // Will be reparented after all parts are created
            } else {
                hierarchy::set_parent(world, entity, root_entity);
            }

            entity
        })
        .collect();

    // Reparent parts with parent parts
    for (i, part) in moc3.parts.iter().enumerate() {
        if part.parent_part_index >= 0 {
            let parent_idx = part.parent_part_index as usize;
            if parent_idx < part_entities.len() {
                hierarchy::set_parent(world, part_entities[i], part_entities[parent_idx]);
            } else {
                hierarchy::set_parent(world, part_entities[i], root_entity);
            }
        }
    }

    // Create deformer entities
    let deformer_entities: Vec<Entity> =
        create_deformer_entities(world, &moc3, root_entity, &part_entities);
    let mut entity_count = 1 + part_entities.len() + deformer_entities.len();

    // Create art mesh entities (drawables)
    for (mesh_idx, art_mesh) in moc3.art_meshes.iter().enumerate() {
        let vc = art_mesh.vertex_count as usize;

        // Extract UVs for this mesh
        let uv_begin = art_mesh.uv_sources_begin as usize;
        let uvs: Vec<Vec2> = if uv_begin + vc <= moc3.uvs.len() {
            moc3.uvs[uv_begin..uv_begin + vc].to_vec()
        } else {
            vec![Vec2::ZERO; vc]
        };

        // Extract triangle indices for this mesh
        let idx_begin = art_mesh.position_index_sources_begin as usize;
        let idx_count = art_mesh.position_index_sources_count as usize;
        let indices: Vec<u16> = if idx_begin + idx_count <= moc3.position_indices.len() {
            moc3.position_indices[idx_begin..idx_begin + idx_count].to_vec()
        } else {
            Vec::new()
        };

        // Build key forms for this art mesh from keyform positions
        let key_forms = build_art_mesh_key_forms(&moc3, mesh_idx, vc);

        // Default vertices: use first key form or zeros
        let default_vertices = if let Some(first_kf) = key_forms.first() {
            first_kf.vertices.clone()
        } else {
            vec![Vec2::ZERO; vc]
        };

        let mesh_entity = world
            .spawn((
                PuppetNodeId(art_mesh.id.clone()),
                NodeName(art_mesh.id.clone()),
                PuppetNodeType::Part,
                Transform2D::default(),
                GlobalTransform2D::default(),
                ZOrder(mesh_idx as f32),
                Opacity(if art_mesh.is_visible { 1.0 } else { 0.0 }),
                parser::blend_mode_from_flags(art_mesh.drawable_flags),
                MeshData {
                    vertices: default_vertices,
                    uvs,
                    indices,
                },
                TextureRef {
                    texture_index: art_mesh.texture_index as usize,
                },
            ))
            .id();

        // Add MultiKeyDeformation if key forms exist
        if !key_forms.is_empty() {
            // Find the parameter name driving this mesh's key forms
            let param_name = find_binding_parameter(&moc3, art_mesh.keyform_binding_sources_index);
            if let Some(param_name) = param_name {
                world.entity_mut(mesh_entity).insert(MultiKeyDeformation {
                    param_name,
                    key_forms,
                });
            }
        }

        // Parent hierarchy: deformer > part > root
        if art_mesh.parent_deformer_index >= 0 {
            let deformer_idx = art_mesh.parent_deformer_index as usize;
            if deformer_idx < deformer_entities.len() {
                world
                    .entity_mut(mesh_entity)
                    .insert(ParentDeformerRef(deformer_entities[deformer_idx]));
                hierarchy::set_parent(world, mesh_entity, deformer_entities[deformer_idx]);
            } else if art_mesh.parent_part_index >= 0 {
                let part_idx = art_mesh.parent_part_index as usize;
                if part_idx < part_entities.len() {
                    hierarchy::set_parent(world, mesh_entity, part_entities[part_idx]);
                } else {
                    hierarchy::set_parent(world, mesh_entity, root_entity);
                }
            } else {
                hierarchy::set_parent(world, mesh_entity, root_entity);
            }
        } else if art_mesh.parent_part_index >= 0 {
            let part_idx = art_mesh.parent_part_index as usize;
            if part_idx < part_entities.len() {
                hierarchy::set_parent(world, mesh_entity, part_entities[part_idx]);
            } else {
                hierarchy::set_parent(world, mesh_entity, root_entity);
            }
        } else {
            hierarchy::set_parent(world, mesh_entity, root_entity);
        }
        entity_count += 1;
    }

    Ok(LoadResult {
        root_entity,
        entity_count,
        parameter_count,
        animations: Vec::<AnimationClip>::new(),
    })
}

/// Create deformer entities (warp + rotation) from parsed MOC3 data.
///
/// Returns a Vec indexed by the MOC3 deformer index.
fn create_deformer_entities(
    world: &mut World,
    moc3: &Moc3Data,
    root_entity: Entity,
    part_entities: &[Entity],
) -> Vec<Entity> {
    let mut deformer_entities = Vec::with_capacity(moc3.deformers.len());

    for deformer in &moc3.deformers {
        let entity = world
            .spawn((
                PuppetNodeId(deformer.id.clone()),
                NodeName(deformer.id.clone()),
                PuppetNodeType::Deform,
                Transform2D::default(),
                GlobalTransform2D::default(),
                ZOrder(0.0),
                Opacity::default(),
                BlendMode::default(),
            ))
            .id();

        let specific_idx = deformer.specific_index as usize;

        match deformer.deformer_type {
            parser::DeformerType::Warp => {
                if specific_idx < moc3.warp_deformers.len() {
                    let wd = &moc3.warp_deformers[specific_idx];
                    let vc = wd.vertex_count as usize;
                    let key_forms = build_deformer_key_forms(
                        moc3,
                        wd.keyform_sources_begin,
                        wd.keyform_sources_count,
                        vc,
                        wd.keyform_binding_sources_index,
                    );
                    let param_name = find_binding_parameter(moc3, wd.keyform_binding_sources_index)
                        .unwrap_or_default();
                    world.entity_mut(entity).insert(WarpDeformer {
                        rows: wd.rows,
                        columns: wd.columns,
                        key_forms,
                        param_name,
                    });
                }
            }
            parser::DeformerType::Rotation => {
                if specific_idx < moc3.rotation_deformers.len() {
                    let rd = &moc3.rotation_deformers[specific_idx];
                    // Rotation key forms store angle as a single value
                    let key_forms = build_deformer_key_forms(
                        moc3,
                        rd.keyform_sources_begin,
                        rd.keyform_sources_count,
                        1, // 1 value per key form (angle)
                        rd.keyform_binding_sources_index,
                    );
                    let param_name = find_binding_parameter(moc3, rd.keyform_binding_sources_index)
                        .unwrap_or_default();
                    world.entity_mut(entity).insert(RotationDeformer {
                        base_angle: rd.base_angle,
                        key_forms,
                        param_name,
                    });
                }
            }
        }

        hierarchy::set_parent(world, entity, root_entity);
        deformer_entities.push(entity);
    }

    // Reparent deformers: parent_deformer > parent_part > root (already set)
    for (i, deformer) in moc3.deformers.iter().enumerate() {
        if deformer.parent_deformer_index >= 0 {
            let parent_idx = deformer.parent_deformer_index as usize;
            if parent_idx < deformer_entities.len() {
                hierarchy::set_parent(world, deformer_entities[i], deformer_entities[parent_idx]);
            }
        } else if deformer.parent_part_index >= 0 {
            let part_idx = deformer.parent_part_index as usize;
            if part_idx < part_entities.len() {
                hierarchy::set_parent(world, deformer_entities[i], part_entities[part_idx]);
            }
        }
    }

    deformer_entities
}

/// Build key forms for a deformer using its keyform position data.
fn build_deformer_key_forms(
    moc3: &Moc3Data,
    kf_begin: i32,
    kf_count: i32,
    vertex_count: usize,
    binding_index: i32,
) -> Vec<KeyFormData> {
    if kf_begin < 0 || kf_count <= 0 || vertex_count == 0 {
        return Vec::new();
    }

    let kf_begin = kf_begin as usize;
    let kf_count = kf_count as usize;
    let binding_key_values = get_binding_key_values(moc3, binding_index);

    let mut key_forms = Vec::with_capacity(kf_count);
    for kf_idx in 0..kf_count {
        let pos_start = (kf_begin + kf_idx) * vertex_count;
        let pos_end = pos_start + vertex_count;

        let vertices: Vec<Vec2> = if pos_end <= moc3.keyform_positions.len() {
            moc3.keyform_positions[pos_start..pos_end].to_vec()
        } else {
            vec![Vec2::ZERO; vertex_count]
        };

        let param_value = binding_key_values
            .get(kf_idx)
            .copied()
            .unwrap_or(kf_idx as f32);

        key_forms.push(KeyFormData {
            param_value,
            vertices,
        });
    }

    key_forms.sort_by(|a, b| {
        a.param_value
            .partial_cmp(&b.param_value)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    key_forms
}

/// Build key forms for an art mesh by extracting vertex positions from
/// the flat keyform_positions array.
fn build_art_mesh_key_forms(
    moc3: &Moc3Data,
    mesh_idx: usize,
    vertex_count: usize,
) -> Vec<KeyFormData> {
    let art_mesh = &moc3.art_meshes[mesh_idx];
    let kf_begin = art_mesh.keyform_sources_begin;
    let kf_count = art_mesh.keyform_sources_count;

    if kf_begin < 0 || kf_count <= 0 || vertex_count == 0 {
        return Vec::new();
    }

    let kf_begin = kf_begin as usize;
    let kf_count = kf_count as usize;

    // Get the key values for this art mesh's binding
    let binding_key_values = get_binding_key_values(moc3, art_mesh.keyform_binding_sources_index);

    let mut key_forms = Vec::with_capacity(kf_count);
    for kf_idx in 0..kf_count {
        // Each key form has `vertex_count` positions in the flat array
        let pos_start = (kf_begin + kf_idx) * vertex_count;
        let pos_end = pos_start + vertex_count;

        let vertices: Vec<Vec2> = if pos_end <= moc3.keyform_positions.len() {
            moc3.keyform_positions[pos_start..pos_end].to_vec()
        } else {
            vec![Vec2::ZERO; vertex_count]
        };

        // Map key form index to parameter value
        let param_value = binding_key_values
            .get(kf_idx)
            .copied()
            .unwrap_or(kf_idx as f32);

        key_forms.push(KeyFormData {
            param_value,
            vertices,
        });
    }

    // Ensure sorted by param_value
    key_forms.sort_by(|a, b| {
        a.param_value
            .partial_cmp(&b.param_value)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    key_forms
}

/// Find the parameter name associated with a keyform binding index
fn find_binding_parameter(moc3: &Moc3Data, binding_index: i32) -> Option<String> {
    if binding_index < 0 {
        return None;
    }
    // The binding_index points into the parameter_bindings array.
    // We need to find which parameter owns this binding by checking
    // each parameter's binding_sources_begin..begin+count range.
    let binding_idx = binding_index as usize;
    for param in &moc3.parameters {
        if param.binding_sources_begin < 0 || param.binding_sources_count <= 0 {
            continue;
        }
        let begin = param.binding_sources_begin as usize;
        let end = begin + param.binding_sources_count as usize;
        if binding_idx >= begin && binding_idx < end {
            return Some(param.id.clone());
        }
    }
    None
}

/// Get the key values for a binding (the discrete parameter values at which key forms exist)
fn get_binding_key_values(moc3: &Moc3Data, binding_index: i32) -> Vec<f32> {
    if binding_index < 0 {
        return Vec::new();
    }
    let idx = binding_index as usize;
    if idx >= moc3.parameter_bindings.len() {
        return Vec::new();
    }
    let binding = &moc3.parameter_bindings[idx];
    if binding.keys_sources_begin < 0 || binding.keys_sources_count <= 0 {
        return Vec::new();
    }
    let begin = binding.keys_sources_begin as usize;
    let count = binding.keys_sources_count as usize;
    if begin + count <= moc3.key_values.len() {
        moc3.key_values[begin..begin + count].to_vec()
    } else {
        Vec::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_find_binding_parameter_negative_index() {
        let moc3 = Moc3Data {
            version: 3,
            counts: parser::ElementCounts {
                parts: 0,
                deformers: 0,
                warp_deformers: 0,
                rotation_deformers: 0,
                art_meshes: 0,
                parameters: 0,
                part_keyforms: 0,
                warp_deformer_keyforms: 0,
                rotation_deformer_keyforms: 0,
                art_mesh_keyforms: 0,
                keyform_positions: 0,
                parameter_binding_indices: 0,
                keyform_bindings: 0,
                parameter_bindings: 0,
                keys: 0,
                uvs: 0,
                position_indices: 0,
                drawable_masks: 0,
                draw_order_groups: 0,
                draw_order_group_objects: 0,
            },
            parameters: Vec::new(),
            parts: Vec::new(),
            deformers: Vec::new(),
            warp_deformers: Vec::new(),
            rotation_deformers: Vec::new(),
            art_meshes: Vec::new(),
            parameter_bindings: Vec::new(),
            key_values: Vec::new(),
            uvs: Vec::new(),
            position_indices: Vec::new(),
            keyform_positions: Vec::new(),
        };
        assert!(find_binding_parameter(&moc3, -1).is_none());
    }

    #[test]
    fn test_find_binding_parameter_found() {
        let moc3 = Moc3Data {
            version: 3,
            counts: parser::ElementCounts {
                parts: 0,
                deformers: 0,
                warp_deformers: 0,
                rotation_deformers: 0,
                art_meshes: 0,
                parameters: 1,
                part_keyforms: 0,
                warp_deformer_keyforms: 0,
                rotation_deformer_keyforms: 0,
                art_mesh_keyforms: 0,
                keyform_positions: 0,
                parameter_binding_indices: 0,
                keyform_bindings: 0,
                parameter_bindings: 1,
                keys: 0,
                uvs: 0,
                position_indices: 0,
                drawable_masks: 0,
                draw_order_groups: 0,
                draw_order_group_objects: 0,
            },
            parameters: vec![parser::Moc3Parameter {
                id: "ParamAngleX".to_string(),
                min_value: -30.0,
                max_value: 30.0,
                default_value: 0.0,
                is_repeat: false,
                binding_sources_begin: 0,
                binding_sources_count: 2,
            }],
            parts: Vec::new(),
            deformers: Vec::new(),
            warp_deformers: Vec::new(),
            rotation_deformers: Vec::new(),
            art_meshes: Vec::new(),
            parameter_bindings: vec![parser::Moc3ParameterBinding {
                keys_sources_begin: 0,
                keys_sources_count: 3,
            }],
            key_values: vec![-30.0, 0.0, 30.0],
            uvs: Vec::new(),
            position_indices: Vec::new(),
            keyform_positions: Vec::new(),
        };
        assert_eq!(
            find_binding_parameter(&moc3, 0),
            Some("ParamAngleX".to_string())
        );
    }

    #[test]
    fn test_get_binding_key_values() {
        let moc3 = Moc3Data {
            version: 3,
            counts: parser::ElementCounts {
                parts: 0,
                deformers: 0,
                warp_deformers: 0,
                rotation_deformers: 0,
                art_meshes: 0,
                parameters: 0,
                part_keyforms: 0,
                warp_deformer_keyforms: 0,
                rotation_deformer_keyforms: 0,
                art_mesh_keyforms: 0,
                keyform_positions: 0,
                parameter_binding_indices: 0,
                keyform_bindings: 0,
                parameter_bindings: 1,
                keys: 3,
                uvs: 0,
                position_indices: 0,
                drawable_masks: 0,
                draw_order_groups: 0,
                draw_order_group_objects: 0,
            },
            parameters: Vec::new(),
            parts: Vec::new(),
            deformers: Vec::new(),
            warp_deformers: Vec::new(),
            rotation_deformers: Vec::new(),
            art_meshes: Vec::new(),
            parameter_bindings: vec![parser::Moc3ParameterBinding {
                keys_sources_begin: 0,
                keys_sources_count: 3,
            }],
            key_values: vec![-30.0, 0.0, 30.0],
            uvs: Vec::new(),
            position_indices: Vec::new(),
            keyform_positions: Vec::new(),
        };
        let values = get_binding_key_values(&moc3, 0);
        assert_eq!(values, vec![-30.0, 0.0, 30.0]);
    }
}
