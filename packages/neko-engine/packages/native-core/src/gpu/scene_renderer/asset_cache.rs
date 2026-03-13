//! GPU asset cache for 3D scene rendering
//!
//! Loads glTF mesh geometry and PBR materials into GPU buffers,
//! keyed by (uri, primitive_index) / (uri, material_index).
//! Independent of native-scene (preserves its zero-GPU-dependency).

use crate::gpu::GpuContext;
use super::vertex::PbrVertex;
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
}

/// PBR material uniform data (16-byte aligned for GPU)
#[repr(C)]
#[derive(Clone, Copy, Debug, bytemuck::Pod, bytemuck::Zeroable)]
pub struct MaterialUniforms {
    pub base_color_factor: [f32; 4],
    pub metallic_factor: f32,
    pub roughness_factor: f32,
    pub _padding: [f32; 2],
}

/// GPU-ready PBR material
pub struct GpuMaterial {
    pub uniforms: MaterialUniforms,
    pub uniform_buffer: wgpu::Buffer,
    pub base_color_texture: Option<(wgpu::Texture, wgpu::TextureView)>,
    pub metallic_roughness_texture: Option<(wgpu::Texture, wgpu::TextureView)>,
    pub normal_texture: Option<(wgpu::Texture, wgpu::TextureView)>,
    pub bind_group: wgpu::BindGroup,
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

        Self {
            meshes: HashMap::new(),
            materials: HashMap::new(),
            ctx,
            material_bind_group_layout,
            default_sampler,
        }
    }

    /// Load all meshes and materials from a glTF file into GPU buffers.
    /// Skips already-cached assets (keyed by URI).
    pub fn load_gltf(&mut self, path: &Path) -> Result<(), AssetCacheError> {
        let uri = path.to_string_lossy().to_string();

        let (document, buffers, images) = gltf::import(path)
            .map_err(|e| AssetCacheError::GltfLoad(format!("{}: {}", uri, e)))?;

        // Load meshes
        for mesh in document.meshes() {
            for primitive in mesh.primitives() {
                let key = (uri.clone(), primitive.index());
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

    /// Register a programmatically-generated mesh into the GPU cache.
    ///
    /// Uses a synthetic URI (e.g. "procedural://shape_001") to avoid
    /// collisions with glTF-loaded assets. Also ensures a default material
    /// exists for the URI.
    pub fn register_procedural_mesh(
        &mut self,
        uri: &str,
        primitive_index: usize,
        mesh: &neko_native_scene::procedural_mesh::ProceduralMesh,
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
                    usage: wgpu::BufferUsages::VERTEX,
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

        // Build PbrVertex array
        let vertex_count = positions.len();
        let mut vertices = Vec::with_capacity(vertex_count);
        for i in 0..vertex_count {
            vertices.push(PbrVertex {
                position: positions[i],
                normal: normals[i],
                uv: uvs[i],
                tangent: tangents[i],
            });
        }

        let vertex_buffer =
            self.ctx
                .device()
                .create_buffer_init(&wgpu::util::BufferInitDescriptor {
                    label: Some("pbr_vertex_buffer"),
                    contents: bytemuck::cast_slice(&vertices),
                    usage: wgpu::BufferUsages::VERTEX,
                });

        // Read indices
        let (index_buffer, index_count, index_format) = if let Some(indices) = reader.read_indices()
        {
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
        })
    }

    /// Load a glTF material into GPU resources
    fn load_material(
        &self,
        material: &gltf::Material<'_>,
        images: &[gltf::image::Data],
    ) -> GpuMaterial {
        let pbr = material.pbr_metallic_roughness();

        let uniforms = MaterialUniforms {
            base_color_factor: pbr.base_color_factor(),
            metallic_factor: pbr.metallic_factor(),
            roughness_factor: pbr.roughness_factor(),
            _padding: [0.0; 2],
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

        // Create bind group
        let bind_group = self.create_material_bind_group(
            &uniform_buffer,
            base_color_texture.as_ref().map(|(_, v)| v),
            metallic_roughness_texture.as_ref().map(|(_, v)| v),
            normal_texture.as_ref().map(|(_, v)| v),
        );

        GpuMaterial {
            uniforms,
            uniform_buffer,
            base_color_texture,
            metallic_roughness_texture,
            normal_texture,
            bind_group,
        }
    }

    /// Create a default white material
    fn create_default_material(&self) -> GpuMaterial {
        let uniforms = MaterialUniforms {
            base_color_factor: [1.0, 1.0, 1.0, 1.0],
            metallic_factor: 0.0,
            roughness_factor: 0.5,
            _padding: [0.0; 2],
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
            self.create_material_bind_group(&uniform_buffer, None, None, None);

        GpuMaterial {
            uniforms,
            uniform_buffer,
            base_color_texture: None,
            metallic_roughness_texture: None,
            normal_texture: None,
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

    /// Create a 1x1 white placeholder texture (for missing texture slots)
    fn placeholder_texture_view(&self) -> wgpu::TextureView {
        let tex = self.ctx.device().create_texture(&wgpu::TextureDescriptor {
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
        self.ctx.queue().write_texture(
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
        tex.create_view(&wgpu::TextureViewDescriptor::default())
    }

    /// Create material bind group with optional textures
    fn create_material_bind_group(
        &self,
        uniform_buffer: &wgpu::Buffer,
        base_color_view: Option<&wgpu::TextureView>,
        metallic_roughness_view: Option<&wgpu::TextureView>,
        normal_view: Option<&wgpu::TextureView>,
    ) -> wgpu::BindGroup {
        let placeholder = self.placeholder_texture_view();
        let bc_view = base_color_view.unwrap_or(&placeholder);
        let mr_view = metallic_roughness_view.unwrap_or(&placeholder);
        let nm_view = normal_view.unwrap_or(&placeholder);

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
                ],
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
