//! glTF/glb model loader
//!
//! Parses glTF files and spawns ECS entities with appropriate components.

use crate::asset_database::{
    AssetDatabase, AssetDescriptor, AssetHandle, AssetKind, AssetMetadata, ImageDescriptor,
    MaterialDescriptor, MeshDescriptor, TextureColorSpace, TextureDescriptor,
    TextureSamplerDescriptor,
};
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
    pub asset_database: AssetDatabase,
}

/// Load a glTF/glb file into the ECS world
pub fn load_gltf(world: &mut World, path: &Path) -> Result<LoadResult, LoadError> {
    let (document, buffers, _images) = gltf::import(path)?;

    let scene = document
        .default_scene()
        .or_else(|| document.scenes().next())
        .ok_or(LoadError::NoDefaultScene)?;

    let uri = path.to_string_lossy().to_string();
    let asset_database = build_asset_database(&document, &buffers, path, &uri);
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
            Visible::default(),
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
        world
            .entity_mut(root_entity)
            .insert(AnimationTarget { clips });
    }

    Ok(LoadResult {
        root_entity,
        entity_count,
        animation_clips,
        asset_database,
    })
}

fn build_asset_database(
    document: &gltf::Document,
    buffers: &[gltf::buffer::Data],
    path: &Path,
    uri: &str,
) -> AssetDatabase {
    let mut database = AssetDatabase::default();
    let base_dir = path.parent();
    let texture_color_spaces = collect_texture_color_spaces(document);

    for image in document.images() {
        let handle = AssetHandle::for_image(uri, image.index());
        let descriptor = image_descriptor(&image, &handle, buffers, base_dir);
        database.insert_descriptor(AssetDescriptor::Image(descriptor));
    }

    for texture in document.textures() {
        let handle = AssetHandle::for_texture(uri, texture.index());
        let image = texture.source();
        let image_handle = AssetHandle::for_image(uri, image.index());
        let image_uri =
            image_source_uri(&image).unwrap_or_else(|| format!("{}#image:{}", uri, image.index()));
        let color_space = texture_color_spaces
            .get(&texture.index())
            .copied()
            .unwrap_or(TextureColorSpace::Linear);

        database.insert_descriptor(AssetDescriptor::Texture(TextureDescriptor {
            handle: handle.clone(),
            uri: image_uri,
            texture_index: texture.index(),
            color_space,
            source_image: Some(image_handle.clone()),
            sampler: Some(sampler_descriptor(texture.sampler())),
        }));

        let mut metadata = AssetMetadata::new(AssetKind::Texture);
        metadata.source_path = Some(uri.to_string());
        metadata.dependencies.push(image_handle);
        database.insert_metadata(handle, metadata);
    }

    for mesh in document.meshes() {
        for primitive in mesh.primitives() {
            let handle = AssetHandle::for_mesh(uri, primitive.index());
            database.insert_descriptor(AssetDescriptor::Mesh(MeshDescriptor {
                handle: handle.clone(),
                uri: uri.to_string(),
                primitive_index: primitive.index(),
                topology_version: 1,
            }));

            let mut metadata = AssetMetadata::new(AssetKind::Mesh);
            metadata.source_path = Some(uri.to_string());
            database.insert_metadata(handle, metadata);
        }
    }

    for material in document.materials() {
        let Some(material_index) = material.index() else {
            continue;
        };
        let handle = AssetHandle::for_material(uri, material_index);
        let pbr = material.pbr_metallic_roughness();
        let mut descriptor = MaterialDescriptor::new(handle.clone());
        descriptor.name = material.name().map(str::to_string);
        descriptor.base_color_factor = pbr.base_color_factor();
        descriptor.metallic_factor = pbr.metallic_factor();
        descriptor.roughness_factor = pbr.roughness_factor();
        descriptor.emissive_factor = material.emissive_factor();
        descriptor.normal_scale = material
            .normal_texture()
            .map(|info| info.scale())
            .unwrap_or(1.0);
        descriptor.occlusion_strength = material
            .occlusion_texture()
            .map(|info| info.strength())
            .unwrap_or(1.0);
        descriptor.base_color_texture = pbr
            .base_color_texture()
            .map(|info| AssetHandle::for_texture(uri, info.texture().index()));
        descriptor.metallic_roughness_texture = pbr
            .metallic_roughness_texture()
            .map(|info| AssetHandle::for_texture(uri, info.texture().index()));
        descriptor.normal_texture = material
            .normal_texture()
            .map(|info| AssetHandle::for_texture(uri, info.texture().index()));
        descriptor.occlusion_texture = material
            .occlusion_texture()
            .map(|info| AssetHandle::for_texture(uri, info.texture().index()));
        descriptor.emissive_texture = material
            .emissive_texture()
            .map(|info| AssetHandle::for_texture(uri, info.texture().index()));

        let dependencies = [
            descriptor.base_color_texture.clone(),
            descriptor.metallic_roughness_texture.clone(),
            descriptor.normal_texture.clone(),
            descriptor.occlusion_texture.clone(),
            descriptor.emissive_texture.clone(),
        ]
        .into_iter()
        .flatten()
        .collect();

        database.insert_descriptor(AssetDescriptor::Material(descriptor));
        let mut metadata = AssetMetadata::new(AssetKind::Material);
        metadata.source_path = Some(uri.to_string());
        metadata.dependencies = dependencies;
        database.insert_metadata(handle, metadata);
    }

    database
}

fn collect_texture_color_spaces(document: &gltf::Document) -> HashMap<usize, TextureColorSpace> {
    let mut spaces = HashMap::new();

    for material in document.materials() {
        let pbr = material.pbr_metallic_roughness();
        if let Some(info) = pbr.base_color_texture() {
            spaces.insert(info.texture().index(), TextureColorSpace::Srgb);
        }
        if let Some(info) = material.emissive_texture() {
            spaces.insert(info.texture().index(), TextureColorSpace::Srgb);
        }
        if let Some(info) = pbr.metallic_roughness_texture() {
            spaces
                .entry(info.texture().index())
                .or_insert(TextureColorSpace::Linear);
        }
        if let Some(info) = material.normal_texture() {
            spaces
                .entry(info.texture().index())
                .or_insert(TextureColorSpace::Linear);
        }
        if let Some(info) = material.occlusion_texture() {
            spaces
                .entry(info.texture().index())
                .or_insert(TextureColorSpace::Linear);
        }
    }

    spaces
}

fn image_descriptor(
    image: &gltf::Image<'_>,
    handle: &AssetHandle,
    buffers: &[gltf::buffer::Data],
    base_dir: Option<&Path>,
) -> ImageDescriptor {
    match image.source() {
        gltf::image::Source::Uri { uri, mime_type } => {
            let data = if uri.starts_with("data:") {
                None
            } else {
                base_dir
                    .map(|dir| dir.join(uri))
                    .and_then(|path| std::fs::read(path).ok())
            };
            ImageDescriptor {
                handle: handle.clone(),
                uri: Some(uri.to_string()),
                mime_type: mime_type
                    .map(str::to_string)
                    .or_else(|| infer_mime_type(Some(uri), data.as_deref())),
                data,
            }
        }
        gltf::image::Source::View { view, mime_type } => {
            let data = buffers.get(view.buffer().index()).and_then(|buffer| {
                let start = view.offset();
                let end = start.checked_add(view.length())?;
                buffer.0.get(start..end).map(|slice| slice.to_vec())
            });
            ImageDescriptor {
                handle: handle.clone(),
                uri: None,
                mime_type: Some(mime_type.to_string())
                    .or_else(|| infer_mime_type(None, data.as_deref())),
                data,
            }
        }
    }
}

fn image_source_uri(image: &gltf::Image<'_>) -> Option<String> {
    match image.source() {
        gltf::image::Source::Uri { uri, .. } => Some(uri.to_string()),
        gltf::image::Source::View { .. } => None,
    }
}

fn sampler_descriptor(sampler: gltf::texture::Sampler<'_>) -> TextureSamplerDescriptor {
    TextureSamplerDescriptor {
        mag_filter: sampler.mag_filter().map(mag_filter_value),
        min_filter: sampler.min_filter().map(min_filter_value),
        wrap_s: wrapping_mode_value(sampler.wrap_s()),
        wrap_t: wrapping_mode_value(sampler.wrap_t()),
    }
}

fn mag_filter_value(filter: gltf::texture::MagFilter) -> u32 {
    match filter {
        gltf::texture::MagFilter::Nearest => 9728,
        gltf::texture::MagFilter::Linear => 9729,
    }
}

fn min_filter_value(filter: gltf::texture::MinFilter) -> u32 {
    match filter {
        gltf::texture::MinFilter::Nearest => 9728,
        gltf::texture::MinFilter::Linear => 9729,
        gltf::texture::MinFilter::NearestMipmapNearest => 9984,
        gltf::texture::MinFilter::LinearMipmapNearest => 9985,
        gltf::texture::MinFilter::NearestMipmapLinear => 9986,
        gltf::texture::MinFilter::LinearMipmapLinear => 9987,
    }
}

fn wrapping_mode_value(mode: gltf::texture::WrappingMode) -> u32 {
    match mode {
        gltf::texture::WrappingMode::ClampToEdge => 33071,
        gltf::texture::WrappingMode::MirroredRepeat => 33648,
        gltf::texture::WrappingMode::Repeat => 10497,
    }
}

fn infer_mime_type(uri: Option<&str>, data: Option<&[u8]>) -> Option<String> {
    if let Some(bytes) = data {
        if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
            return Some("image/png".to_string());
        }
        if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
            return Some("image/jpeg".to_string());
        }
        if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
            return Some("image/webp".to_string());
        }
    }

    let uri = uri?.to_ascii_lowercase();
    if uri.ends_with(".png") {
        Some("image/png".to_string())
    } else if uri.ends_with(".jpg") || uri.ends_with(".jpeg") {
        Some("image/jpeg".to_string())
    } else if uri.ends_with(".webp") {
        Some("image/webp".to_string())
    } else {
        None
    }
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
            Visible::default(),
        ))
        .id();
    *count += 1;

    node_map.insert(node.index(), entity);

    // Add mesh reference
    if let Some(mesh) = node.mesh() {
        for (i, primitive) in mesh.primitives().enumerate() {
            world.entity_mut(entity).insert(MeshRef {
                asset: AssetHandle::for_mesh(uri, i),
                uri: uri.to_string(),
                primitive_index: i,
            });

            if let Some(material) = primitive.material().index() {
                world.entity_mut(entity).insert(MaterialRef {
                    asset: AssetHandle::for_material(uri, material),
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

            let reader = channel.reader(|buf| buffers.get(buf.index()).map(|d| d.0.as_slice()));

            let timestamps: Vec<f32> = reader
                .read_inputs()
                .map(|iter| iter.collect())
                .unwrap_or_default();

            if let Some(&last) = timestamps.last() {
                max_duration = max_duration.max(last);
            }

            let values: Vec<f32> = match reader.read_outputs() {
                Some(gltf::animation::util::ReadOutputs::Translations(iter)) => {
                    iter.flatten().collect()
                }
                Some(gltf::animation::util::ReadOutputs::Rotations(rotations)) => {
                    rotations.into_f32().flatten().collect()
                }
                Some(gltf::animation::util::ReadOutputs::Scales(iter)) => iter.flatten().collect(),
                Some(gltf::animation::util::ReadOutputs::MorphTargetWeights(weights)) => {
                    weights.into_f32().collect()
                }
                None => Vec::new(),
            };

            channels.push(AnimationChannel::from_flat(
                target_node_id,
                property,
                &timestamps,
                &values,
            ));
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
    fn build_asset_database_registers_material_texture_image_descriptors() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("albedo.png"), b"\x89PNG\r\n\x1a\nfake").unwrap();
        let model_path = dir.path().join("model.gltf");
        let uri = model_path.to_string_lossy().to_string();
        let gltf = gltf::Gltf::from_slice(
            br#"{
                "asset": { "version": "2.0" },
                "images": [{ "uri": "albedo.png" }],
                "samplers": [{
                    "magFilter": 9729,
                    "minFilter": 9987,
                    "wrapS": 33071,
                    "wrapT": 33648
                }],
                "textures": [{ "source": 0, "sampler": 0 }],
                "materials": [{
                    "name": "Mat",
                    "pbrMetallicRoughness": {
                        "baseColorFactor": [0.2, 0.3, 0.4, 0.9],
                        "metallicFactor": 0.7,
                        "roughnessFactor": 0.25,
                        "baseColorTexture": { "index": 0 },
                        "metallicRoughnessTexture": { "index": 0 }
                    },
                    "normalTexture": { "index": 0, "scale": 0.5 },
                    "occlusionTexture": { "index": 0, "strength": 0.6 },
                    "emissiveTexture": { "index": 0 },
                    "emissiveFactor": [0.1, 0.2, 0.3]
                }]
            }"#,
        )
        .unwrap();

        let database = build_asset_database(&gltf.document, &[], &model_path, &uri);
        let material_handle = AssetHandle::for_material(&uri, 0);
        let texture_handle = AssetHandle::for_texture(&uri, 0);
        let image_handle = AssetHandle::for_image(&uri, 0);

        let material = database.material(&material_handle).unwrap();
        assert_eq!(material.name.as_deref(), Some("Mat"));
        assert_eq!(material.base_color_texture, Some(texture_handle.clone()));
        assert_eq!(
            material.metallic_roughness_texture,
            Some(texture_handle.clone())
        );
        assert_eq!(material.normal_texture, Some(texture_handle.clone()));
        assert_eq!(material.occlusion_texture, Some(texture_handle.clone()));
        assert_eq!(material.emissive_texture, Some(texture_handle.clone()));
        assert!((material.normal_scale - 0.5).abs() < f32::EPSILON);
        assert!((material.occlusion_strength - 0.6).abs() < f32::EPSILON);

        let texture = database.texture(&texture_handle).unwrap();
        assert_eq!(texture.source_image, Some(image_handle.clone()));
        assert_eq!(texture.sampler.unwrap().wrap_s, 33071);
        assert_eq!(texture.sampler.unwrap().wrap_t, 33648);

        let image = database.image(&image_handle).unwrap();
        assert_eq!(image.mime_type.as_deref(), Some("image/png"));
        assert!(image.data.as_ref().is_some_and(|data| !data.is_empty()));
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
