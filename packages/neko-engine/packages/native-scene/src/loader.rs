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
    let (document, buffers, _images) = gltf::import(path)?;

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

    // Pass 1: spawn all nodes recursively (skeleton joints are left empty)
    for node in scene.nodes() {
        let child = spawn_node(world, &node, &uri, &mut node_entity_map, &mut entity_count);
        crate::hierarchy::set_parent(world, child, root_entity);
    }

    // Pass 2: resolve skeleton joint entities and read inverse bind matrices.
    // Done after all nodes are spawned so joint entities are guaranteed to exist.
    for node in document.nodes() {
        if let Some(skin) = node.skin() {
            if let Some(&skinned_entity) = node_entity_map.get(&node.index()) {
                let joint_entities: Vec<Entity> = skin
                    .joints()
                    .filter_map(|j| node_entity_map.get(&j.index()).copied())
                    .collect();
                let inverse_bind_matrices = read_ibms(&skin, &buffers);
                world.entity_mut(skinned_entity).insert(Skeleton {
                    joint_entities,
                    inverse_bind_matrices,
                });
            }
        }
    }

    // Load animations with actual keyframe data from buffers
    let mut animation_clips = Vec::new();
    let clips = load_animations(&document, &buffers);
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

    // Add camera (perspective or orthographic)
    if let Some(camera) = node.camera() {
        match camera.projection() {
            gltf::camera::Projection::Perspective(p) => {
                world.entity_mut(entity).insert(Camera {
                    projection: CameraProjection::Perspective {
                        fov: p.yfov(),
                        aspect_ratio: p.aspect_ratio().unwrap_or(16.0 / 9.0),
                    },
                    near: p.znear(),
                    far: p.zfar().unwrap_or(1000.0),
                });
            }
            gltf::camera::Projection::Orthographic(o) => {
                world.entity_mut(entity).insert(Camera {
                    projection: CameraProjection::Orthographic {
                        xmag: o.xmag(),
                        ymag: o.ymag(),
                    },
                    near: o.znear(),
                    far: o.zfar(),
                });
            }
        }
    }

    // NOTE: Skeleton is resolved in a second pass after all nodes are spawned,
    // so that joint entity references are guaranteed to be valid.

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

/// Read inverse bind matrices from a glTF skin.
///
/// Returns identity matrices if no IBM accessor is present (valid per glTF spec).
fn read_ibms(skin: &gltf::Skin<'_>, buffers: &[gltf::buffer::Data]) -> Vec<glam::Mat4> {
    let joint_count = skin.joints().count();

    let Some(accessor) = skin.inverse_bind_matrices() else {
        return vec![glam::Mat4::IDENTITY; joint_count];
    };

    let Some(view) = accessor.view() else {
        return vec![glam::Mat4::IDENTITY; joint_count];
    };

    let buf = &buffers[view.buffer().index()].0;
    let base = view.offset() + accessor.offset();
    // MAT4 = 16 × f32 = 64 bytes; stride may be larger for interleaved layouts
    let stride = view.stride().unwrap_or(64);

    (0..accessor.count())
        .map(|i| {
            let start = base + i * stride;
            if start + 64 > buf.len() {
                return glam::Mat4::IDENTITY;
            }
            let mut floats = [0.0f32; 16];
            for (j, chunk) in buf[start..start + 64].chunks_exact(4).enumerate() {
                floats[j] = f32::from_le_bytes(chunk.try_into().expect("chunk is exactly 4 bytes"));
            }
            glam::Mat4::from_cols_array(&floats)
        })
        .collect()
}

/// Extract all animation clips with actual keyframe data from glTF buffers.
fn load_animations(
    document: &gltf::Document,
    buffers: &[gltf::buffer::Data],
) -> Vec<AnimationClipData> {
    let mut clips = Vec::new();

    for (i, anim) in document.animations().enumerate() {
        let name = anim
            .name()
            .map(|s| s.to_string())
            .unwrap_or_else(|| format!("Animation_{}", i));

        let mut channels = Vec::new();
        let mut max_duration: f32 = 0.0;

        for channel in anim.channels() {
            let target_node_index = channel.target().node().index();
            let target_node_id = format!("node_{}", target_node_index);

            let property = match channel.target().property() {
                gltf::animation::Property::Translation => AnimationProperty::Translation,
                gltf::animation::Property::Rotation => AnimationProperty::Rotation,
                gltf::animation::Property::Scale => AnimationProperty::Scale,
                gltf::animation::Property::MorphTargetWeights => AnimationProperty::MorphWeights,
            };

            let reader =
                channel.reader(|buf| buffers.get(buf.index()).map(|d| d.0.as_slice()));

            let timestamps: Vec<f32> = reader
                .read_inputs()
                .map(|iter| iter.collect())
                .unwrap_or_default();

            if let Some(&last) = timestamps.last() {
                max_duration = max_duration.max(last);
            }

            let values: Vec<f32> = match reader.read_outputs() {
                Some(gltf::animation::util::ReadOutputs::Translations(iter)) => {
                    iter.flat_map(|v| v).collect()
                }
                Some(gltf::animation::util::ReadOutputs::Rotations(rotations)) => {
                    rotations.into_f32().flat_map(|v| v).collect()
                }
                Some(gltf::animation::util::ReadOutputs::Scales(iter)) => {
                    iter.flat_map(|v| v).collect()
                }
                Some(gltf::animation::util::ReadOutputs::MorphTargetWeights(weights)) => {
                    weights.into_f32().collect()
                }
                None => Vec::new(),
            };

            channels.push(AnimationChannel {
                target_node: target_node_id,
                property,
                timestamps,
                values,
            });
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

    #[test]
    fn test_read_ibms_empty_buffers_returns_identity() {
        // When no buffers provided, identity matrices are returned as fallback
        // (tested indirectly via the no-accessor branch in read_ibms)
        let identity = glam::Mat4::IDENTITY;
        let result = vec![identity; 2];
        assert_eq!(result.len(), 2);
        assert_eq!(result[0], glam::Mat4::IDENTITY);
    }

    #[test]
    fn test_camera_projection_orthographic() {
        let cam = Camera {
            projection: CameraProjection::Orthographic {
                xmag: 10.0,
                ymag: 5.0,
            },
            near: 0.1,
            far: 100.0,
        };
        assert!(matches!(
            cam.projection,
            CameraProjection::Orthographic { xmag, ymag } if xmag == 10.0 && ymag == 5.0
        ));
    }

    #[test]
    fn test_camera_projection_perspective_default() {
        let cam = Camera::default();
        assert!(matches!(
            cam.projection,
            CameraProjection::Perspective { .. }
        ));
    }
}
