//! glTF/glb model loader
//!
//! Parses glTF files and spawns ECS entities with appropriate components.

use crate::components::*;
use crate::hierarchy::Children;
use bevy_ecs::prelude::*;
use std::collections::HashMap;
use std::path::Path;

/// Errors from scene loading
#[derive(Debug, thiserror::Error)]
pub enum LoadError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("glTF parse error: {0}")]
    Gltf(#[from] gltf::Error),
    #[error("No default scene found")]
    NoDefaultScene,
}

/// Result of loading a glTF file
pub struct LoadResult {
    pub root_entity: Entity,
    pub entity_count: usize,
    pub animation_clips: Vec<String>,
}

/// Load a glTF/glb file into the ECS world
pub fn load_gltf(world: &mut World, path: &Path) -> Result<LoadResult, LoadError> {
    let (document, _buffers, _images) = gltf::import(path)?;

    let scene = document
        .default_scene()
        .or_else(|| document.scenes().next())
        .ok_or(LoadError::NoDefaultScene)?;

    let uri = path.to_string_lossy().to_string();
    let mut node_entity_map: HashMap<usize, Entity> = HashMap::new();
    let mut entity_count = 0;

    // Spawn scene root
    let root_entity = world
        .spawn((
            SceneRoot,
            NodeName(scene.name().unwrap_or("Scene").to_string()),
            SceneNodeId(format!("scene_{}", scene.index())),
            Transform::default(),
            GlobalTransform::identity(),
            Children::default(),
        ))
        .id();
    entity_count += 1;

    // Spawn nodes recursively
    for node in scene.nodes() {
        let child = spawn_node(world, &node, &uri, &mut node_entity_map, &mut entity_count);
        crate::hierarchy::set_parent(world, child, root_entity);
    }

    // Load animations
    let mut animation_clips = Vec::new();
    let clips = load_animations(&document);
    for clip in &clips {
        animation_clips.push(clip.name.clone());
    }

    // Attach animations to root
    if !clips.is_empty() {
        world.entity_mut(root_entity).insert(AnimationTarget { clips });
    }

    Ok(LoadResult {
        root_entity,
        entity_count,
        animation_clips,
    })
}

fn spawn_node(
    world: &mut World,
    node: &gltf::Node<'_>,
    uri: &str,
    node_map: &mut HashMap<usize, Entity>,
    count: &mut usize,
) -> Entity {
    let transform = decompose_gltf_transform(node.transform());
    let name = node
        .name()
        .unwrap_or(&format!("Node_{}", node.index()))
        .to_string();

    let entity = world
        .spawn((
            SceneNodeId(format!("node_{}", node.index())),
            NodeName(name),
            transform,
            GlobalTransform::identity(),
        ))
        .id();
    *count += 1;

    node_map.insert(node.index(), entity);

    // Add mesh reference
    if let Some(mesh) = node.mesh() {
        for (i, primitive) in mesh.primitives().enumerate() {
            world.entity_mut(entity).insert(MeshRef {
                uri: uri.to_string(),
                primitive_index: i,
            });

            if let Some(material) = primitive.material().index() {
                world.entity_mut(entity).insert(MaterialRef {
                    uri: uri.to_string(),
                    material_index: material,
                });
            }
        }
    }

    // Add light
    if let Some(light) = node.light() {
        let kind = match light.kind() {
            gltf::khr_lights_punctual::Kind::Directional => LightKind::Directional,
            gltf::khr_lights_punctual::Kind::Point => LightKind::Point,
            gltf::khr_lights_punctual::Kind::Spot {
                inner_cone_angle,
                outer_cone_angle,
            } => LightKind::Spot {
                inner_cone: inner_cone_angle,
                outer_cone: outer_cone_angle,
            },
        };
        let color = light.color();
        world.entity_mut(entity).insert(Light {
            kind,
            color: glam::Vec3::new(color[0], color[1], color[2]),
            intensity: light.intensity(),
        });
    }

    // Add camera
    if let Some(camera) = node.camera() {
        match camera.projection() {
            gltf::camera::Projection::Perspective(p) => {
                world.entity_mut(entity).insert(Camera {
                    fov: p.yfov(),
                    near: p.znear(),
                    far: p.zfar().unwrap_or(1000.0),
                    aspect_ratio: p.aspect_ratio().unwrap_or(16.0 / 9.0),
                });
            }
            gltf::camera::Projection::Orthographic(_) => {
                // TODO(P2): implement orthographic camera
            }
        }
    }

    // Add skeleton
    if let Some(skin) = node.skin() {
        let joint_indices: Vec<usize> = skin.joints().map(|j| j.index()).collect();
        let ibm_count = joint_indices.len();
        world.entity_mut(entity).insert(Skeleton {
            joint_entities: Vec::new(), // Resolved later
            inverse_bind_matrices: vec![glam::Mat4::IDENTITY; ibm_count],
        });
    }

    // Recurse children
    let child_entities: Vec<Entity> = node
        .children()
        .map(|child_node| spawn_node(world, &child_node, uri, node_map, count))
        .collect();

    for &child in &child_entities {
        crate::hierarchy::set_parent(world, child, entity);
    }

    entity
}

fn decompose_gltf_transform(transform: gltf::scene::Transform) -> Transform {
    let (translation, rotation, scale) = transform.decomposed();
    Transform {
        position: glam::Vec3::from(translation),
        rotation: glam::Quat::from_array(rotation),
        scale: glam::Vec3::from(scale),
    }
}

fn load_animations(document: &gltf::Document) -> Vec<AnimationClipData> {
    let mut clips = Vec::new();

    for (i, anim) in document.animations().enumerate() {
        let name = anim
            .name()
            .unwrap_or(&format!("Animation_{}", i))
            .to_string();

        let mut channels = Vec::new();
        let max_duration: f32 = 0.0;

        for channel in anim.channels() {
            let target_node_index = channel.target().node().index();
            let target_node_id = format!("node_{}", target_node_index);

            let property = match channel.target().property() {
                gltf::animation::Property::Translation => AnimationProperty::Translation,
                gltf::animation::Property::Rotation => AnimationProperty::Rotation,
                gltf::animation::Property::Scale => AnimationProperty::Scale,
                gltf::animation::Property::MorphTargetWeights => AnimationProperty::MorphWeights,
            };

            // Note: actual keyframe data requires buffer access
            // For now, create empty channels as placeholders
            let anim_channel = AnimationChannel {
                target_node: target_node_id,
                property,
                timestamps: Vec::new(),
                values: Vec::new(),
            };

            channels.push(anim_channel);
        }

        clips.push(AnimationClipData {
            name,
            duration: max_duration,
            channels,
        });
    }

    clips
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_decompose_identity_transform() {
        let transform = decompose_gltf_transform(gltf::scene::Transform::Matrix {
            matrix: [
                [1.0, 0.0, 0.0, 0.0],
                [0.0, 1.0, 0.0, 0.0],
                [0.0, 0.0, 1.0, 0.0],
                [0.0, 0.0, 0.0, 1.0],
            ],
        });
        assert!((transform.position - glam::Vec3::ZERO).length() < f32::EPSILON);
        assert!((transform.scale - glam::Vec3::ONE).length() < f32::EPSILON);
    }

    #[test]
    fn test_decompose_translation_transform() {
        let transform = decompose_gltf_transform(gltf::scene::Transform::Decomposed {
            translation: [1.0, 2.0, 3.0],
            rotation: [0.0, 0.0, 0.0, 1.0],
            scale: [1.0, 1.0, 1.0],
        });
        assert!((transform.position.x - 1.0).abs() < f32::EPSILON);
        assert!((transform.position.y - 2.0).abs() < f32::EPSILON);
        assert!((transform.position.z - 3.0).abs() < f32::EPSILON);
    }
}
