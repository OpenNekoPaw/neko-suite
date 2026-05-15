//! GPU asset cache for 3D scene rendering.
//!
//! Loads glTF mesh geometry and PBR materials into GPU buffers,
//! keyed by (uri, primitive_index) / (uri, material_index).
//!
//! This is derived runtime state. Authoring asset metadata belongs to
//! `neko_runtime_scene::asset_database::AssetDatabase`; exporters, inspectors,
//! and scene serialization must read that authoring layer instead of this cache.
//! `runtime-scene` stays zero-GPU-dependency, while engine-kernel consumes
//! descriptors and materializes them as `wgpu` resources here.

use super::vertex::{PbrVertex, SkinnedPbrVertex};
use neko_engine_gpu::GpuContext;
use neko_runtime_scene::asset_database::composite_primitive_id;
use neko_runtime_scene::MeshDirtyRegion;
use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;
use wgpu::util::DeviceExt;

/// GPU-ready mesh data (vertex + index buffers)
pub struct GpuMesh {
    pub vertex_buffer: wgpu::Buffer,
    pub index_buffer: wgpu::Buffer,
    pub index_count: u32,
    pub index_format: wgpu::IndexFormat,
    /// Whether this mesh uses skeletal skinning (has JOINTS_0 + WEIGHTS_0)
    pub is_skinned: bool,
}

/// PBR material uniform data (16-byte aligned for GPU)
#[repr(C)]
#[derive(Clone, Copy, Debug, bytemuck::Pod, bytemuck::Zeroable)]
pub struct MaterialUniforms {
    pub base_color_factor: [f32; 4], // 16 bytes
    pub metallic_factor: f32,        // 4
    pub roughness_factor: f32,       // 4
    pub occlusion_strength: f32,     // 4
    pub _pad0: f32,                  // 4 (align to 16)
    pub emissive_factor: [f32; 3],   // 12
    pub _pad1: f32,                  // 4 (align to 16)
}

/// GPU-ready PBR material
pub struct GpuMaterial {
    pub uniforms: MaterialUniforms,
    pub uniform_buffer: wgpu::Buffer,
    pub base_color_texture: Option<(wgpu::Texture, wgpu::TextureView)>,
    pub metallic_roughness_texture: Option<(wgpu::Texture, wgpu::TextureView)>,
    pub normal_texture: Option<(wgpu::Texture, wgpu::TextureView)>,
    pub emissive_texture: Option<(wgpu::Texture, wgpu::TextureView)>,
    pub occlusion_texture: Option<(wgpu::Texture, wgpu::TextureView)>,
    pub bind_group: wgpu::BindGroup,
}

/// Long-lived fallback texture used by material bind groups for missing slots.
struct PlaceholderTexture {
    view: wgpu::TextureView,
    _texture: wgpu::Texture,
}

/// Cache key: (file_uri, sub_index)
type MeshKey = (String, usize);
type MaterialKey = (String, usize);

/// GPU asset cache — loads glTF geometry/materials into GPU buffers
pub struct AssetCache {
    meshes: HashMap<MeshKey, GpuMesh>,
    materials: HashMap<MaterialKey, GpuMaterial>,
    ctx: Arc<GpuContext>,
    material_bind_group_layout: wgpu::BindGroupLayout,
    default_sampler: wgpu::Sampler,
    placeholder_texture: PlaceholderTexture,
}

impl AssetCache {
    /// Create a new empty asset cache
    pub fn new(ctx: Arc<GpuContext>, material_bind_group_layout: wgpu::BindGroupLayout) -> Self {
        let default_sampler = ctx.device().create_sampler(&wgpu::SamplerDescriptor {
            label: Some("pbr_default_sampler"),
            address_mode_u: wgpu::AddressMode::Repeat,
            address_mode_v: wgpu::AddressMode::Repeat,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            mipmap_filter: wgpu::FilterMode::Linear,
            ..Default::default()
        });
        let placeholder_texture = Self::create_placeholder_texture(ctx.as_ref());

        Self {
            meshes: HashMap::new(),
            materials: HashMap::new(),
            ctx,
            material_bind_group_layout,
            default_sampler,
            placeholder_texture,
        }
    }

    /// Load all meshes and materials from a glTF file into GPU buffers.
    /// Skips already-cached assets (keyed by URI).
    pub fn load_gltf(&mut self, path: &Path) -> Result<(), AssetCacheError> {
        let uri = path.to_string_lossy().to_string();

        let (document, buffers, images) =
            gltf::import(path).map_err(|e| AssetCacheError::GltfLoad(format!("{}: {}", uri, e)))?;

        // Load meshes
        for mesh in document.meshes() {
            for primitive in mesh.primitives() {
                let key = (
                    uri.clone(),
                    composite_primitive_id(mesh.index(), primitive.index()),
                );
                if self.meshes.contains_key(&key) {
                    continue;
                }
                match self.load_primitive(&primitive, &buffers) {
                    Ok(gpu_mesh) => {
                        self.meshes.insert(key, gpu_mesh);
                    }
                    Err(e) => {
                        tracing::warn!(
                            "Skip mesh {} primitive {}: {}",
                            mesh.index(),
                            primitive.index(),
                            e
                        );
                    }
                }
            }
        }

        // Load materials
        for material in document.materials() {
            let key = (uri.clone(), material.index().unwrap_or(0));
            if self.materials.contains_key(&key) {
                continue;
            }
            let gpu_mat = self.load_material(&material, &images);
            self.materials.insert(key, gpu_mat);
        }

        // Ensure default material exists for primitives without material
        let default_key = (uri.clone(), usize::MAX);
        if !self.materials.contains_key(&default_key) {
            let gpu_mat = self.create_default_material();
            self.materials.insert(default_key, gpu_mat);
        }

        tracing::info!(
            "AssetCache loaded {}: {} meshes, {} materials",
            uri,
            self.meshes.len(),
            self.materials.len()
        );

        Ok(())
    }

    /// Get a cached GPU mesh by (uri, primitive_index)
    pub fn get_mesh(&self, uri: &str, primitive_index: usize) -> Option<&GpuMesh> {
        self.meshes.get(&(uri.to_string(), primitive_index))
    }

    /// Get a cached GPU material by (uri, material_index)
    pub fn get_material(&self, uri: &str, material_index: usize) -> Option<&GpuMaterial> {
        self.materials.get(&(uri.to_string(), material_index))
    }

    /// Get default material for a given URI
    pub fn get_default_material(&self, uri: &str) -> Option<&GpuMaterial> {
        self.materials.get(&(uri.to_string(), usize::MAX))
    }

    /// Record that a modeling brush patch dirtied a mesh range.
    ///
    /// This method is intentionally cheap and non-blocking for the control
    /// path. Call `upload_pbr_vertex_dirty_region` after the CPU modeling
    /// solver has produced updated vertex data for the dirty range.
    pub fn record_mesh_dirty_region(&self, region: &MeshDirtyRegion) {
        tracing::trace!(
            mesh_id = region.mesh_id,
            start = region.start,
            count = region.count,
            sparse_count = region.sparse_indices.len(),
            payload_bytes = region.payload_byte_len,
            "Recorded mesh dirty region for partial GPU upload"
        );
    }

    /// Upload only the dirty PBR vertex range for a mesh.
    pub fn upload_pbr_vertex_dirty_region(
        &self,
        uri: &str,
        primitive_index: usize,
        region: &MeshDirtyRegion,
        updated_vertices: &[PbrVertex],
    ) -> Result<MeshDirtyUploadPlan, String> {
        let key = (uri.to_string(), primitive_index);
        let gpu_mesh = self
            .meshes
            .get(&key)
            .ok_or_else(|| format!("Mesh ({uri}, {primitive_index}) not found"))?;
        let plan = MeshDirtyUploadPlan::for_pbr_vertices(region, updated_vertices.len())?;
        self.ctx.queue().write_buffer(
            &gpu_mesh.vertex_buffer,
            plan.byte_offset,
            bytemuck::cast_slice(updated_vertices),
        );
        Ok(plan)
    }

    /// Update material uniform parameters at runtime.
    /// Only provided fields are changed; others keep their current values.
    #[allow(clippy::too_many_arguments)]
    pub fn update_material_uniforms(
        &self,
        uri: &str,
        material_index: usize,
        base_color: Option<[f32; 4]>,
        metallic: Option<f32>,
        roughness: Option<f32>,
        emissive: Option<[f32; 3]>,
        occlusion_strength: Option<f32>,
    ) -> Result<(), String> {
        let key = (uri.to_string(), material_index);
        let gpu_mat = self
            .materials
            .get(&key)
            .ok_or_else(|| format!("Material ({}, {}) not found", uri, material_index))?;

        let mut uniforms = gpu_mat.uniforms;
        if let Some(color) = base_color {
            uniforms.base_color_factor = color;
        }
        if let Some(m) = metallic {
            uniforms.metallic_factor = m;
        }
        if let Some(r) = roughness {
            uniforms.roughness_factor = r;
        }
        if let Some(e) = emissive {
            uniforms.emissive_factor = e;
        }
        if let Some(o) = occlusion_strength {
            uniforms.occlusion_strength = o;
        }

        self.ctx
            .queue()
            .write_buffer(&gpu_mat.uniform_buffer, 0, bytemuck::bytes_of(&uniforms));
        Ok(())
    }

    /// Register a programmatically-generated mesh into the GPU cache.
    ///
    /// Uses a synthetic URI (e.g. "procedural://shape_001") to avoid
    /// collisions with glTF-loaded assets. Also ensures a default material
    /// exists for the URI.
    pub fn register_procedural_mesh(
        &mut self,
        uri: &str,
        primitive_index: usize,
        mesh: &neko_runtime_scene::procedural_mesh::ProceduralMesh,
    ) -> Result<(), AssetCacheError> {
        let key = (uri.to_string(), primitive_index);
        if self.meshes.contains_key(&key) {
            return Ok(());
        }

        // Convert ProceduralVertex → PbrVertex (add default tangent)
        let vertices: Vec<PbrVertex> = mesh
            .vertices
            .iter()
            .map(|v| PbrVertex {
                position: v.position,
                normal: v.normal,
                uv: v.uv,
                tangent: [1.0, 0.0, 0.0, 1.0],
            })
            .collect();

        let vertex_buffer =
            self.ctx
                .device()
                .create_buffer_init(&wgpu::util::BufferInitDescriptor {
                    label: Some("procedural_vertex_buffer"),
                    contents: bytemuck::cast_slice(&vertices),
                    usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
                });

        let index_buffer =
            self.ctx
                .device()
                .create_buffer_init(&wgpu::util::BufferInitDescriptor {
                    label: Some("procedural_index_buffer"),
                    contents: bytemuck::cast_slice(&mesh.indices),
                    usage: wgpu::BufferUsages::INDEX,
                });

        self.meshes.insert(
            key,
            GpuMesh {
                vertex_buffer,
                index_buffer,
                index_count: mesh.indices.len() as u32,
                index_format: wgpu::IndexFormat::Uint32,
                is_skinned: false,
            },
        );

        // Ensure default material exists for this procedural URI
        let default_key = (uri.to_string(), usize::MAX);
        if !self.materials.contains_key(&default_key) {
            let gpu_mat = self.create_default_material();
            self.materials.insert(default_key, gpu_mat);
        }

        tracing::debug!(
            "AssetCache registered procedural mesh '{}' [{}]: {} verts, {} indices",
            uri,
            primitive_index,
            vertices.len(),
            mesh.indices.len(),
        );

        Ok(())
    }

    /// Load a single glTF primitive into GPU buffers
    fn load_primitive(
        &self,
        primitive: &gltf::Primitive<'_>,
        buffers: &[gltf::buffer::Data],
    ) -> Result<GpuMesh, AssetCacheError> {
        let reader = primitive.reader(|buffer| Some(&buffers[buffer.index()]));

        // Read positions (required)
        let positions: Vec<[f32; 3]> = reader
            .read_positions()
            .ok_or(AssetCacheError::MissingAttribute("POSITION"))?
            .collect();

        // Read normals (optional, generate flat normals if missing)
        let normals: Vec<[f32; 3]> = reader
            .read_normals()
            .map(|iter| iter.collect())
            .unwrap_or_else(|| vec![[0.0, 1.0, 0.0]; positions.len()]);

        // Read UVs (optional)
        let uvs: Vec<[f32; 2]> = reader
            .read_tex_coords(0)
            .map(|iter| iter.into_f32().collect())
            .unwrap_or_else(|| vec![[0.0, 0.0]; positions.len()]);

        // Read tangents (optional)
        let tangents: Vec<[f32; 4]> = reader
            .read_tangents()
            .map(|iter| iter.collect())
            .unwrap_or_else(|| vec![[1.0, 0.0, 0.0, 1.0]; positions.len()]);

        // Read joint indices and weights (optional — for skinned meshes)
        let joints: Option<Vec<[u16; 4]>> =
            reader.read_joints(0).map(|iter| iter.into_u16().collect());

        let weights: Option<Vec<[f32; 4]>> =
            reader.read_weights(0).map(|iter| iter.into_f32().collect());

        let is_skinned = joints.is_some() && weights.is_some();
        let vertex_count = positions.len();

        let vertex_buffer = if is_skinned {
            let joints = joints.unwrap();
            let weights = weights.unwrap();

            let mut vertices = Vec::with_capacity(vertex_count);
            for i in 0..vertex_count {
                let j = if i < joints.len() { joints[i] } else { [0; 4] };
                let w = if i < weights.len() {
                    weights[i]
                } else {
                    [0.0; 4]
                };
                vertices.push(SkinnedPbrVertex {
                    position: positions[i],
                    normal: normals[i],
                    uv: uvs[i],
                    tangent: tangents[i],
                    joint_indices: [j[0] as u32, j[1] as u32, j[2] as u32, j[3] as u32],
                    joint_weights: w,
                });
            }

            self.ctx
                .device()
                .create_buffer_init(&wgpu::util::BufferInitDescriptor {
                    label: Some("skinned_pbr_vertex_buffer"),
                    contents: bytemuck::cast_slice(&vertices),
                    usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
                })
        } else {
            let mut vertices = Vec::with_capacity(vertex_count);
            for i in 0..vertex_count {
                vertices.push(PbrVertex {
                    position: positions[i],
                    normal: normals[i],
                    uv: uvs[i],
                    tangent: tangents[i],
                });
            }

            self.ctx
                .device()
                .create_buffer_init(&wgpu::util::BufferInitDescriptor {
                    label: Some("pbr_vertex_buffer"),
                    contents: bytemuck::cast_slice(&vertices),
                    usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
                })
        };

        // Read indices
        let reader2 = primitive.reader(|buffer| Some(&buffers[buffer.index()]));
        let (index_buffer, index_count, index_format) =
            if let Some(indices) = reader2.read_indices() {
                let indices_u32: Vec<u32> = indices.into_u32().collect();
                let count = indices_u32.len() as u32;
                let buf = self
                    .ctx
                    .device()
                    .create_buffer_init(&wgpu::util::BufferInitDescriptor {
                        label: Some("pbr_index_buffer"),
                        contents: bytemuck::cast_slice(&indices_u32),
                        usage: wgpu::BufferUsages::INDEX,
                    });
                (buf, count, wgpu::IndexFormat::Uint32)
            } else {
                // No indices: generate sequential indices
                let indices: Vec<u32> = (0..vertex_count as u32).collect();
                let count = indices.len() as u32;
                let buf = self
                    .ctx
                    .device()
                    .create_buffer_init(&wgpu::util::BufferInitDescriptor {
                        label: Some("pbr_index_buffer"),
                        contents: bytemuck::cast_slice(&indices),
                        usage: wgpu::BufferUsages::INDEX,
                    });
                (buf, count, wgpu::IndexFormat::Uint32)
            };

        Ok(GpuMesh {
            vertex_buffer,
            index_buffer,
            index_count,
            index_format,
            is_skinned,
        })
    }

    /// Load a glTF material into GPU resources
    fn load_material(
        &self,
        material: &gltf::Material<'_>,
        images: &[gltf::image::Data],
    ) -> GpuMaterial {
        let pbr = material.pbr_metallic_roughness();

        let emissive = material.emissive_factor();
        let occlusion_strength = material
            .occlusion_texture()
            .map(|t| t.strength())
            .unwrap_or(1.0);

        let uniforms = MaterialUniforms {
            base_color_factor: pbr.base_color_factor(),
            metallic_factor: pbr.metallic_factor(),
            roughness_factor: pbr.roughness_factor(),
            occlusion_strength,
            _pad0: 0.0,
            emissive_factor: emissive,
            _pad1: 0.0,
        };

        let uniform_buffer =
            self.ctx
                .device()
                .create_buffer_init(&wgpu::util::BufferInitDescriptor {
                    label: Some("pbr_material_uniforms"),
                    contents: bytemuck::bytes_of(&uniforms),
                    usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
                });

        // Load textures
        let base_color_texture = pbr
            .base_color_texture()
            .and_then(|info| self.load_texture(info.texture(), images));

        let metallic_roughness_texture = pbr
            .metallic_roughness_texture()
            .and_then(|info| self.load_texture(info.texture(), images));

        let normal_texture = material
            .normal_texture()
            .and_then(|info| self.load_texture(info.texture(), images));

        let emissive_texture = material
            .emissive_texture()
            .and_then(|info| self.load_texture(info.texture(), images));

        let occlusion_texture = material
            .occlusion_texture()
            .and_then(|info| self.load_texture(info.texture(), images));

        // Create bind group
        let bind_group = self.create_material_bind_group(
            &uniform_buffer,
            base_color_texture.as_ref().map(|(_, v)| v),
            metallic_roughness_texture.as_ref().map(|(_, v)| v),
            normal_texture.as_ref().map(|(_, v)| v),
            emissive_texture.as_ref().map(|(_, v)| v),
            occlusion_texture.as_ref().map(|(_, v)| v),
        );

        GpuMaterial {
            uniforms,
            uniform_buffer,
            base_color_texture,
            metallic_roughness_texture,
            normal_texture,
            emissive_texture,
            occlusion_texture,
            bind_group,
        }
    }

    /// Create a default white material
    fn create_default_material(&self) -> GpuMaterial {
        let uniforms = MaterialUniforms {
            base_color_factor: [1.0, 1.0, 1.0, 1.0],
            metallic_factor: 0.0,
            roughness_factor: 0.5,
            occlusion_strength: 1.0,
            _pad0: 0.0,
            emissive_factor: [0.0, 0.0, 0.0],
            _pad1: 0.0,
        };

        let uniform_buffer =
            self.ctx
                .device()
                .create_buffer_init(&wgpu::util::BufferInitDescriptor {
                    label: Some("pbr_default_material"),
                    contents: bytemuck::bytes_of(&uniforms),
                    usage: wgpu::BufferUsages::UNIFORM,
                });

        let bind_group =
            self.create_material_bind_group(&uniform_buffer, None, None, None, None, None);

        GpuMaterial {
            uniforms,
            uniform_buffer,
            base_color_texture: None,
            metallic_roughness_texture: None,
            normal_texture: None,
            emissive_texture: None,
            occlusion_texture: None,
            bind_group,
        }
    }

    /// Load a glTF texture into a wgpu::Texture
    fn load_texture(
        &self,
        texture: gltf::Texture<'_>,
        images: &[gltf::image::Data],
    ) -> Option<(wgpu::Texture, wgpu::TextureView)> {
        let image_index = texture.source().index();
        let image_data = images.get(image_index)?;

        // Convert to RGBA8
        let (width, height) = (image_data.width, image_data.height);
        let rgba_data = match image_data.format {
            gltf::image::Format::R8G8B8A8 => image_data.pixels.clone(),
            gltf::image::Format::R8G8B8 => {
                // Expand RGB to RGBA
                let mut rgba = Vec::with_capacity(image_data.pixels.len() / 3 * 4);
                for chunk in image_data.pixels.chunks(3) {
                    rgba.extend_from_slice(chunk);
                    rgba.push(255);
                }
                rgba
            }
            gltf::image::Format::R8 => {
                // Grayscale to RGBA
                let mut rgba = Vec::with_capacity(image_data.pixels.len() * 4);
                for &v in &image_data.pixels {
                    rgba.extend_from_slice(&[v, v, v, 255]);
                }
                rgba
            }
            gltf::image::Format::R8G8 => {
                // RG to RGBA
                let mut rgba = Vec::with_capacity(image_data.pixels.len() * 2);
                for chunk in image_data.pixels.chunks(2) {
                    rgba.extend_from_slice(chunk);
                    rgba.extend_from_slice(&[0, 255]);
                }
                rgba
            }
            _ => {
                tracing::warn!("Unsupported image format: {:?}", image_data.format);
                return None;
            }
        };

        let size = wgpu::Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        };

        let gpu_texture = self.ctx.device().create_texture(&wgpu::TextureDescriptor {
            label: Some("pbr_texture"),
            size,
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8UnormSrgb,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });

        self.ctx.queue().write_texture(
            wgpu::ImageCopyTexture {
                texture: &gpu_texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            &rgba_data,
            wgpu::ImageDataLayout {
                offset: 0,
                bytes_per_row: Some(4 * width),
                rows_per_image: Some(height),
            },
            size,
        );

        let view = gpu_texture.create_view(&wgpu::TextureViewDescriptor::default());
        Some((gpu_texture, view))
    }

    /// Create a 1x1 white placeholder texture for missing material texture slots.
    fn create_placeholder_texture(ctx: &GpuContext) -> PlaceholderTexture {
        let tex = ctx.device().create_texture(&wgpu::TextureDescriptor {
            label: Some("pbr_placeholder_1x1"),
            size: wgpu::Extent3d {
                width: 1,
                height: 1,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8UnormSrgb,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });
        ctx.queue().write_texture(
            wgpu::ImageCopyTexture {
                texture: &tex,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            &[255u8, 255, 255, 255],
            wgpu::ImageDataLayout {
                offset: 0,
                bytes_per_row: Some(4),
                rows_per_image: Some(1),
            },
            wgpu::Extent3d {
                width: 1,
                height: 1,
                depth_or_array_layers: 1,
            },
        );
        let view = tex.create_view(&wgpu::TextureViewDescriptor::default());
        PlaceholderTexture {
            view,
            _texture: tex,
        }
    }

    /// Create material bind group with optional textures
    fn create_material_bind_group(
        &self,
        uniform_buffer: &wgpu::Buffer,
        base_color_view: Option<&wgpu::TextureView>,
        metallic_roughness_view: Option<&wgpu::TextureView>,
        normal_view: Option<&wgpu::TextureView>,
        emissive_view: Option<&wgpu::TextureView>,
        occlusion_view: Option<&wgpu::TextureView>,
    ) -> wgpu::BindGroup {
        let bc_view = base_color_view.unwrap_or(&self.placeholder_texture.view);
        let mr_view = metallic_roughness_view.unwrap_or(&self.placeholder_texture.view);
        let nm_view = normal_view.unwrap_or(&self.placeholder_texture.view);
        let em_view = emissive_view.unwrap_or(&self.placeholder_texture.view);
        let ao_view = occlusion_view.unwrap_or(&self.placeholder_texture.view);

        self.ctx
            .device()
            .create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("pbr_material_bind_group"),
                layout: &self.material_bind_group_layout,
                entries: &[
                    // binding 0: material uniforms
                    wgpu::BindGroupEntry {
                        binding: 0,
                        resource: uniform_buffer.as_entire_binding(),
                    },
                    // binding 1: base color texture
                    wgpu::BindGroupEntry {
                        binding: 1,
                        resource: wgpu::BindingResource::TextureView(bc_view),
                    },
                    // binding 2: metallic-roughness texture
                    wgpu::BindGroupEntry {
                        binding: 2,
                        resource: wgpu::BindingResource::TextureView(mr_view),
                    },
                    // binding 3: normal texture
                    wgpu::BindGroupEntry {
                        binding: 3,
                        resource: wgpu::BindingResource::TextureView(nm_view),
                    },
                    // binding 4: sampler
                    wgpu::BindGroupEntry {
                        binding: 4,
                        resource: wgpu::BindingResource::Sampler(&self.default_sampler),
                    },
                    // binding 5: emissive texture
                    wgpu::BindGroupEntry {
                        binding: 5,
                        resource: wgpu::BindingResource::TextureView(em_view),
                    },
                    // binding 6: occlusion/AO texture
                    wgpu::BindGroupEntry {
                        binding: 6,
                        resource: wgpu::BindingResource::TextureView(ao_view),
                    },
                ],
            })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MeshDirtyUploadPlan {
    pub byte_offset: u64,
    pub byte_len: u64,
    pub vertex_count: u32,
}

impl MeshDirtyUploadPlan {
    pub fn for_pbr_vertices(
        region: &MeshDirtyRegion,
        updated_vertex_count: usize,
    ) -> Result<Self, String> {
        if region.count as usize != updated_vertex_count {
            return Err(format!(
                "dirty region vertex count mismatch: region {}, data {}",
                region.count, updated_vertex_count
            ));
        }
        let stride = std::mem::size_of::<PbrVertex>() as u64;
        Ok(Self {
            byte_offset: u64::from(region.start) * stride,
            byte_len: u64::from(region.count) * stride,
            vertex_count: region.count,
        })
    }
}

/// Errors from asset loading
#[derive(Debug, thiserror::Error)]
pub enum AssetCacheError {
    #[error("glTF load failed: {0}")]
    GltfLoad(String),
    #[error("Missing vertex attribute: {0}")]
    MissingAttribute(&'static str),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dirty_upload_plan_targets_only_dirty_vertex_range() {
        let region = MeshDirtyRegion {
            mesh_id: "mesh-a".to_string(),
            start: 4,
            count: 3,
            sparse_indices: Vec::new(),
            payload_byte_len: 36,
        };

        let plan = MeshDirtyUploadPlan::for_pbr_vertices(&region, 3).unwrap();

        assert_eq!(
            plan.byte_offset,
            4 * std::mem::size_of::<PbrVertex>() as u64
        );
        assert_eq!(plan.byte_len, 3 * std::mem::size_of::<PbrVertex>() as u64);
        assert_eq!(plan.vertex_count, 3);
    }

    #[test]
    fn dirty_upload_plan_rejects_full_rebuild_sized_payload_mismatch() {
        let region = MeshDirtyRegion {
            mesh_id: "mesh-a".to_string(),
            start: 2,
            count: 2,
            sparse_indices: Vec::new(),
            payload_byte_len: 24,
        };

        assert!(MeshDirtyUploadPlan::for_pbr_vertices(&region, 8).is_err());
    }
}
