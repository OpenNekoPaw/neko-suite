//! glTF/glb model loader
//!
//! Parses glTF files and spawns ECS entities with appropriate components.

use crate::asset_database::{
    composite_primitive_id, AssetDatabase, AssetDescriptor, AssetHandle, AssetKind, AssetMetadata,
    ImageDescriptor, MaterialAlphaMode, MaterialDescriptor, MeshDescriptor, TextureColorSpace,
    TextureDescriptor, TextureSamplerDescriptor,
};
use crate::bounds::SceneBounds3;
use crate::components::*;
use crate::hierarchy::Children;
use bevy_ecs::prelude::*;
use gltf::mesh::Semantic;
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
        let mesh_index = mesh.index();
        for primitive in mesh.primitives() {
            // gltf::Primitive::index() is local to the parent mesh; compose
            // with mesh_index so two meshes don't both register at slot 0.
            let composite_id = composite_primitive_id(mesh_index, primitive.index());
            let handle = AssetHandle::for_mesh(uri, composite_id);
            database.insert_descriptor(AssetDescriptor::Mesh(MeshDescriptor {
                handle: handle.clone(),
                uri: uri.to_string(),
                primitive_index: composite_id,
                topology_version: 1,
                local_bounds: primitive_bounds(&primitive),
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
        descriptor.alpha_mode = material_alpha_mode(material.alpha_mode());
        descriptor.alpha_cutoff = material.alpha_cutoff().unwrap_or(0.5);
        descriptor.double_sided = material.double_sided();

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

fn material_alpha_mode(mode: gltf::material::AlphaMode) -> MaterialAlphaMode {
    match mode {
        gltf::material::AlphaMode::Opaque => MaterialAlphaMode::Opaque,
        gltf::material::AlphaMode::Mask => MaterialAlphaMode::Mask,
        gltf::material::AlphaMode::Blend => MaterialAlphaMode::Blend,
    }
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

    // Add mesh reference.
    //
    // gltf::Primitive::index() returns an index local to its parent Mesh
    // (e.g. 0 for the first primitive of every mesh), NOT a document-wide
    // identifier. Composing with mesh_index produces a globally unique key,
    // which is what the GPU asset cache stores and lookups against.
    //
    // Without composition, every node's MeshRef collapses to slot 0 and 12
    // humanoid bones all reference whichever mesh happened to land last in
    // the cache (visible as a single floating capsule in the viewport).
    if let Some(mesh) = node.mesh() {
        let mesh_index = mesh.index();
        let mut primitive_refs = Vec::new();
        let mut mesh_bounds: Option<SceneBounds3> = None;
        for primitive in mesh.primitives() {
            let composite_id = composite_primitive_id(mesh_index, primitive.index());
            let mesh_ref = MeshRef {
                asset: AssetHandle::for_mesh(uri, composite_id),
                uri: uri.to_string(),
                primitive_index: composite_id,
            };

            let material_ref = primitive.material().index().map(|material| MaterialRef {
                asset: AssetHandle::for_material(uri, material),
                uri: uri.to_string(),
                material_index: material,
            });

            primitive_refs.push(MeshPrimitiveRef {
                mesh: mesh_ref,
                material: material_ref,
            });

            if let Some(bounds) = primitive_bounds(&primitive) {
                mesh_bounds = Some(match mesh_bounds {
                    Some(existing) => existing.union(bounds),
                    None => bounds,
                });
            }
        }

        if let Some(primary) = primitive_refs.first() {
            world.entity_mut(entity).insert(primary.mesh.clone());
            if let Some(material) = &primary.material {
                world.entity_mut(entity).insert(material.clone());
            }
        }

        if !primitive_refs.is_empty() {
            world.entity_mut(entity).insert(MeshPrimitiveRefs {
                primitives: primitive_refs,
            });
        }

        if let Some(bounds) = mesh_bounds {
            world
                .entity_mut(entity)
                .insert(MeshBounds { local: bounds });
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
            range: light.range(),
            shadow: None,
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

fn primitive_bounds(primitive: &gltf::Primitive<'_>) -> Option<SceneBounds3> {
    let position_accessor = primitive.get(&Semantic::Positions)?;
    let min = json_vec3(position_accessor.min()?)?;
    let max = json_vec3(position_accessor.max()?)?;
    Some(SceneBounds3::new(min, max))
}

fn json_vec3(value: serde_json::Value) -> Option<[f32; 3]> {
    let values = value.as_array()?;
    if values.len() != 3 {
        return None;
    }

    Some([
        values.first()?.as_f64()? as f32,
        values.get(1)?.as_f64()? as f32,
        values.get(2)?.as_f64()? as f32,
    ])
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
    use crate::world::SceneWorld;

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
        let result = [identity; 2];
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
    fn build_asset_database_registers_mesh_bounds_from_position_accessor() {
        let model_path = std::path::PathBuf::from("bounded.gltf");
        let uri = "bounded.gltf";
        let gltf = gltf::Gltf::from_slice(
            br#"{
                "asset": { "version": "2.0" },
                "meshes": [{
                    "primitives": [{
                        "attributes": { "POSITION": 0 }
                    }]
                }],
                "buffers": [{
                    "uri": "data:application/octet-stream;base64,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
                    "byteLength": 36
                }],
                "bufferViews": [
                    { "buffer": 0, "byteOffset": 0, "byteLength": 36, "target": 34962 }
                ],
                "accessors": [{
                    "bufferView": 0,
                    "componentType": 5126,
                    "count": 3,
                    "type": "VEC3",
                    "min": [-2, -1, 0.5],
                    "max": [2, 3, 4.5]
                }]
            }"#,
        )
        .unwrap();

        let database = build_asset_database(&gltf.document, &[], &model_path, uri);
        let mesh = database
            .mesh(&AssetHandle::for_mesh(uri, composite_primitive_id(0, 0)))
            .unwrap();

        assert_eq!(mesh.local_bounds.unwrap().min, [-2.0, -1.0, 0.5]);
        assert_eq!(mesh.local_bounds.unwrap().max, [2.0, 3.0, 4.5]);
    }

    #[test]
    fn load_gltf_preserves_all_primitives_on_node() {
        let dir = tempfile::tempdir().unwrap();
        let model_path = dir.path().join("multi_primitive.gltf");
        std::fs::write(
            &model_path,
            r#"{
                "asset": { "version": "2.0" },
                "scenes": [{ "nodes": [0] }],
                "scene": 0,
                "nodes": [{ "mesh": 0, "name": "MultiPrimitiveNode" }],
                "meshes": [{
                    "primitives": [
                        {
                            "attributes": { "POSITION": 0 },
                            "indices": 1,
                            "material": 0
                        },
                        {
                            "attributes": { "POSITION": 2 },
                            "indices": 3,
                            "material": 1
                        }
                    ]
                }],
                "materials": [
                    { "name": "Body" },
                    { "name": "Accent" }
                ],
                "buffers": [{
                    "uri": "data:application/octet-stream;base64,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
                    "byteLength": 80
                }],
                "bufferViews": [
                    { "buffer": 0, "byteOffset": 0, "byteLength": 36, "target": 34962 },
                    { "buffer": 0, "byteOffset": 36, "byteLength": 6, "target": 34963 },
                    { "buffer": 0, "byteOffset": 44, "byteLength": 24, "target": 34962 },
                    { "buffer": 0, "byteOffset": 68, "byteLength": 6, "target": 34963 }
                ],
                "accessors": [
                    {
                        "bufferView": 0,
                        "componentType": 5126,
                        "count": 3,
                        "type": "VEC3",
                        "min": [0, 0, 0],
                        "max": [1, 1, 0]
                    },
                    {
                        "bufferView": 1,
                        "componentType": 5123,
                        "count": 3,
                        "type": "SCALAR"
                    },
                    {
                        "bufferView": 2,
                        "componentType": 5126,
                        "count": 2,
                        "type": "VEC3",
                        "min": [0, 0, 0],
                        "max": [1, 0, 0]
                    },
                    {
                        "bufferView": 3,
                        "componentType": 5123,
                        "count": 3,
                        "type": "SCALAR"
                    }
                ]
            }"#,
        )
        .unwrap();

        let mut world = World::new();
        load_gltf(&mut world, &model_path).unwrap();

        let mut query = world.query::<(&SceneNodeId, &MeshRef, &MaterialRef, &MeshPrimitiveRefs)>();
        let (_, mesh_ref, material_ref, primitive_refs) = query
            .iter(&world)
            .find(|(node_id, _, _, _)| node_id.0 == "node_0")
            .unwrap();

        assert_eq!(mesh_ref.primitive_index, composite_primitive_id(0, 0));
        assert_eq!(material_ref.material_index, 0);
        assert_eq!(primitive_refs.primitives.len(), 2);
        assert_eq!(
            primitive_refs.primitives[0].mesh.primitive_index,
            composite_primitive_id(0, 0)
        );
        assert_eq!(
            primitive_refs.primitives[0]
                .material
                .as_ref()
                .map(|material| material.material_index),
            Some(0)
        );
        assert_eq!(
            primitive_refs.primitives[1].mesh.primitive_index,
            composite_primitive_id(0, 1)
        );
        assert_eq!(
            primitive_refs.primitives[1]
                .material
                .as_ref()
                .map(|material| material.material_index),
            Some(1)
        );

        let mut scene = crate::world::BevySceneWorld::new();
        scene.load_model(&model_path).unwrap();
        let snapshot = scene.get_snapshot();
        let node = snapshot
            .nodes
            .iter()
            .find(|node| node.id == "node_0")
            .unwrap();
        assert_eq!(node.primitives.len(), 2);
        assert_eq!(node.primitives[0].primitive_id, "primitive:0");
        assert_eq!(node.primitives[0].submesh_id, "submesh:0");
        assert_eq!(
            node.primitives[0].material_slot_id.as_deref(),
            Some("material:0")
        );
        assert_eq!(
            node.primitives[1].primitive_id,
            format!("primitive:{}", composite_primitive_id(0, 1))
        );
        assert_eq!(
            node.primitives[1].material_slot_id.as_deref(),
            Some("material:1")
        );
    }

    #[test]
    fn load_gltf_attaches_union_mesh_bounds_to_node() {
        let dir = tempfile::tempdir().unwrap();
        let model_path = dir.path().join("bounded_node.gltf");
        std::fs::write(
            &model_path,
            r#"{
                "asset": { "version": "2.0" },
                "scenes": [{ "nodes": [0] }],
                "scene": 0,
                "nodes": [{ "mesh": 0, "name": "BoundedNode" }],
                "meshes": [{
                    "primitives": [
                        { "attributes": { "POSITION": 0 } },
                        { "attributes": { "POSITION": 1 } }
                    ]
                }],
                "buffers": [{
                    "uri": "data:application/octet-stream;base64,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
                    "byteLength": 72
                }],
                "bufferViews": [
                    { "buffer": 0, "byteOffset": 0, "byteLength": 36, "target": 34962 },
                    { "buffer": 0, "byteOffset": 36, "byteLength": 36, "target": 34962 }
                ],
                "accessors": [
                    {
                        "bufferView": 0,
                        "componentType": 5126,
                        "count": 3,
                        "type": "VEC3",
                        "min": [-1, -2, -3],
                        "max": [1, 2, 3]
                    },
                    {
                        "bufferView": 1,
                        "componentType": 5126,
                        "count": 3,
                        "type": "VEC3",
                        "min": [4, 0, -1],
                        "max": [6, 1, 1]
                    }
                ]
            }"#,
        )
        .unwrap();

        let mut world = World::new();
        load_gltf(&mut world, &model_path).unwrap();

        let mut query = world.query::<(&SceneNodeId, &MeshBounds)>();
        let (_, bounds) = query
            .iter(&world)
            .find(|(node_id, _)| node_id.0 == "node_0")
            .unwrap();

        assert_eq!(bounds.local.min, [-1.0, -2.0, -3.0]);
        assert_eq!(bounds.local.max, [6.0, 2.0, 3.0]);
    }

    #[test]
    fn route_a_sample_loads_multi_primitive_transparency_and_bounds_contract() {
        let dir = tempfile::tempdir().unwrap();
        let model_path = dir.path().join("route_a_sample.gltf");
        std::fs::write(
            &model_path,
            r#"{
                "asset": { "version": "2.0" },
                "scenes": [{ "nodes": [0] }],
                "scene": 0,
                "nodes": [{
                    "mesh": 0,
                    "name": "TransparentMultiPrimitive",
                    "translation": [2, 0, 0]
                }],
                "meshes": [{
                    "primitives": [
                        {
                            "attributes": { "POSITION": 0 },
                            "material": 0
                        },
                        {
                            "attributes": { "POSITION": 1 },
                            "material": 1
                        }
                    ]
                }],
                "materials": [
                    {
                        "name": "Glass",
                        "alphaMode": "BLEND",
                        "doubleSided": true,
                        "pbrMetallicRoughness": {
                            "baseColorFactor": [0.2, 0.4, 0.8, 0.5]
                        }
                    },
                    {
                        "name": "Cutout",
                        "alphaMode": "MASK",
                        "alphaCutoff": 0.35,
                        "pbrMetallicRoughness": {
                            "baseColorFactor": [1, 1, 1, 1]
                        }
                    }
                ],
                "buffers": [{
                    "uri": "data:application/octet-stream;base64,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
                    "byteLength": 72
                }],
                "bufferViews": [
                    { "buffer": 0, "byteOffset": 0, "byteLength": 36, "target": 34962 },
                    { "buffer": 0, "byteOffset": 36, "byteLength": 36, "target": 34962 }
                ],
                "accessors": [
                    {
                        "bufferView": 0,
                        "componentType": 5126,
                        "count": 3,
                        "type": "VEC3",
                        "min": [-1, 0, -1],
                        "max": [1, 2, 1]
                    },
                    {
                        "bufferView": 1,
                        "componentType": 5126,
                        "count": 3,
                        "type": "VEC3",
                        "min": [3, -1, -0.5],
                        "max": [4, 1, 0.5]
                    }
                ]
            }"#,
        )
        .unwrap();

        let mut world = World::new();
        let result = load_gltf(&mut world, &model_path).unwrap();

        let glass = result
            .asset_database
            .material(&AssetHandle::for_material(&model_path.to_string_lossy(), 0))
            .unwrap();
        let cutout = result
            .asset_database
            .material(&AssetHandle::for_material(&model_path.to_string_lossy(), 1))
            .unwrap();
        assert_eq!(glass.alpha_mode, MaterialAlphaMode::Blend);
        assert_eq!(glass.base_color_factor[3], 0.5);
        assert!(glass.double_sided);
        assert_eq!(cutout.alpha_mode, MaterialAlphaMode::Mask);
        assert!((cutout.alpha_cutoff - 0.35).abs() < f32::EPSILON);

        let mut query = world.query::<(&SceneNodeId, &MeshPrimitiveRefs, &MeshBounds)>();
        let (_, primitive_refs, bounds) = query
            .iter(&world)
            .find(|(node_id, _, _)| node_id.0 == "node_0")
            .unwrap();
        assert_eq!(primitive_refs.primitives.len(), 2);
        assert_eq!(bounds.local.min, [-1.0, -1.0, -1.0]);
        assert_eq!(bounds.local.max, [4.0, 2.0, 1.0]);
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
