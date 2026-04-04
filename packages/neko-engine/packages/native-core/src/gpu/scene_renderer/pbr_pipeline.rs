//! PBR forward rendering pipeline
//!
//! Renders a bevy_ecs World's visible meshes using metallic-roughness PBR.
//! Outputs to Rgba16Float texture (matching TextureCompositor format).

use crate::gpu::scene_renderer::asset_cache::{AssetCache, GpuMaterial, GpuMesh};
use crate::gpu::scene_renderer::{CameraParams, SceneRenderOutput};
use crate::gpu::GpuContext;
use bevy_ecs::prelude::*;
use bytemuck::{Pod, Zeroable};
use glam::{Mat4, Vec3};
use neko_native_scene::components::*;
use std::sync::Arc;
use wgpu::util::DeviceExt;

/// Maximum lights supported per scene
const MAX_LIGHTS: usize = 16;

/// Maximum joints per skeleton for GPU skinning
const MAX_JOINTS: usize = 256;

/// PBR forward renderer
pub struct PbrRenderer {
    render_pipeline: wgpu::RenderPipeline,
    skinned_render_pipeline: wgpu::RenderPipeline,
    camera_bind_group_layout: wgpu::BindGroupLayout,
    model_bind_group_layout: wgpu::BindGroupLayout,
    light_bind_group_layout: wgpu::BindGroupLayout,
    joint_bind_group_layout: wgpu::BindGroupLayout,
    ctx: Arc<GpuContext>,
}

// ── GPU uniform structs (16-byte aligned) ───────────────────

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct CameraUniformsGpu {
    view: [[f32; 4]; 4],
    projection: [[f32; 4]; 4],
    camera_position: [f32; 3],
    _padding: f32,
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct ModelUniformsGpu {
    model: [[f32; 4]; 4],
    normal_matrix_0: [f32; 4],
    normal_matrix_1: [f32; 4],
    normal_matrix_2: [f32; 4],
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct LightGpu {
    position: [f32; 3],
    kind: u32, // 0=directional, 1=point, 2=spot
    direction: [f32; 3],
    intensity: f32,
    color: [f32; 3],
    range: f32,
    inner_cone: f32,
    outer_cone: f32,
    _padding: [f32; 2],
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct LightUniformsGpu {
    lights: [LightGpu; MAX_LIGHTS],
    count: u32,
    _padding: [u32; 3],
}

impl PbrRenderer {
    /// Create a new PBR renderer.
    ///
    /// Returns the renderer and the material bind group layout
    /// (needed by AssetCache to create material bind groups).
    pub fn new(ctx: Arc<GpuContext>) -> (Self, wgpu::BindGroupLayout) {
        let device = ctx.device();

        // Bind group layouts
        let camera_bgl = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("pbr_camera_bgl"),
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::VERTEX | wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            }],
        });

        let model_bgl = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("pbr_model_bgl"),
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::VERTEX,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            }],
        });

        let material_bgl = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("pbr_material_bgl"),
            entries: &[
                // binding 0: material uniforms
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                // binding 1: base color texture
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        multisampled: false,
                        view_dimension: wgpu::TextureViewDimension::D2,
                        sample_type: wgpu::TextureSampleType::Float { filterable: true },
                    },
                    count: None,
                },
                // binding 2: metallic-roughness texture
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        multisampled: false,
                        view_dimension: wgpu::TextureViewDimension::D2,
                        sample_type: wgpu::TextureSampleType::Float { filterable: true },
                    },
                    count: None,
                },
                // binding 3: normal texture
                wgpu::BindGroupLayoutEntry {
                    binding: 3,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        multisampled: false,
                        view_dimension: wgpu::TextureViewDimension::D2,
                        sample_type: wgpu::TextureSampleType::Float { filterable: true },
                    },
                    count: None,
                },
                // binding 4: sampler
                wgpu::BindGroupLayoutEntry {
                    binding: 4,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                    count: None,
                },
            ],
        });

        let light_bgl = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("pbr_light_bgl"),
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            }],
        });

        // Joint matrices bind group layout for skinned meshes
        let joint_bgl = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("pbr_joint_bgl"),
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::VERTEX,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Storage { read_only: true },
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            }],
        });

        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("pbr_pipeline_layout"),
            bind_group_layouts: &[&camera_bgl, &model_bgl, &material_bgl, &light_bgl],
            push_constant_ranges: &[],
        });

        let skinned_pipeline_layout =
            device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                label: Some("pbr_skinned_pipeline_layout"),
                bind_group_layouts: &[
                    &camera_bgl,
                    &model_bgl,
                    &material_bgl,
                    &light_bgl,
                    &joint_bgl,
                ],
                push_constant_ranges: &[],
            });

        let shader_src = include_str!("../../../shaders/pbr_forward.wgsl");
        let shader_module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("pbr_forward_shader"),
            source: wgpu::ShaderSource::Wgsl(shader_src.into()),
        });

        let skinned_shader_src = include_str!("../../../shaders/pbr_forward_skinned.wgsl");
        let skinned_shader_module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("pbr_forward_skinned_shader"),
            source: wgpu::ShaderSource::Wgsl(skinned_shader_src.into()),
        });

        let depth_stencil = wgpu::DepthStencilState {
            format: wgpu::TextureFormat::Depth32Float,
            depth_write_enabled: true,
            depth_compare: wgpu::CompareFunction::Less,
            stencil: wgpu::StencilState::default(),
            bias: wgpu::DepthBiasState::default(),
        };

        let primitive = wgpu::PrimitiveState {
            topology: wgpu::PrimitiveTopology::TriangleList,
            strip_index_format: None,
            front_face: wgpu::FrontFace::Ccw,
            cull_mode: Some(wgpu::Face::Back),
            polygon_mode: wgpu::PolygonMode::Fill,
            unclipped_depth: false,
            conservative: false,
        };

        let fragment_targets = [Some(wgpu::ColorTargetState {
            format: wgpu::TextureFormat::Rgba16Float,
            blend: Some(wgpu::BlendState::ALPHA_BLENDING),
            write_mask: wgpu::ColorWrites::ALL,
        })];

        let render_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("pbr_render_pipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader_module,
                entry_point: "vs_main",
                buffers: &[super::vertex::PbrVertex::buffer_layout()],
            },
            fragment: Some(wgpu::FragmentState {
                module: &shader_module,
                entry_point: "fs_main",
                targets: &fragment_targets,
            }),
            primitive,
            depth_stencil: Some(depth_stencil.clone()),
            multisample: wgpu::MultisampleState::default(),
            multiview: None,
        });

        let skinned_render_pipeline =
            device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
                label: Some("pbr_skinned_render_pipeline"),
                layout: Some(&skinned_pipeline_layout),
                vertex: wgpu::VertexState {
                    module: &skinned_shader_module,
                    entry_point: "vs_main",
                    buffers: &[super::vertex::SkinnedPbrVertex::buffer_layout()],
                },
                fragment: Some(wgpu::FragmentState {
                    module: &skinned_shader_module,
                    entry_point: "fs_main",
                    targets: &fragment_targets,
                }),
                primitive,
                depth_stencil: Some(depth_stencil),
                multisample: wgpu::MultisampleState::default(),
                multiview: None,
            });

        let material_bgl_clone = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("pbr_material_bgl_for_cache"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        multisampled: false,
                        view_dimension: wgpu::TextureViewDimension::D2,
                        sample_type: wgpu::TextureSampleType::Float { filterable: true },
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        multisampled: false,
                        view_dimension: wgpu::TextureViewDimension::D2,
                        sample_type: wgpu::TextureSampleType::Float { filterable: true },
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 3,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        multisampled: false,
                        view_dimension: wgpu::TextureViewDimension::D2,
                        sample_type: wgpu::TextureSampleType::Float { filterable: true },
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 4,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                    count: None,
                },
            ],
        });

        (
            Self {
                render_pipeline,
                skinned_render_pipeline,
                camera_bind_group_layout: camera_bgl,
                model_bind_group_layout: model_bgl,
                light_bind_group_layout: light_bgl,
                joint_bind_group_layout: joint_bgl,
                ctx,
            },
            material_bgl_clone,
        )
    }

    /// Render a scene to a texture.
    ///
    /// Queries the ECS World for cameras, lights, and renderable meshes,
    /// then issues draw calls using the PBR pipeline.
    pub fn render(
        &self,
        world: &mut bevy_ecs::world::World,
        asset_cache: &AssetCache,
        camera_params: &CameraParams,
        output_size: (u32, u32),
        background_color: Option<[f32; 4]>,
    ) -> Result<SceneRenderOutput, PbrRenderError> {
        let (width, height) = output_size;
        let device = self.ctx.device();
        let queue = self.ctx.queue();

        // Create render targets
        let color_texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("pbr_color_target"),
            size: wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba16Float,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        });
        let color_view = color_texture.create_view(&wgpu::TextureViewDescriptor::default());

        let depth_texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("pbr_depth_target"),
            size: wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Depth32Float,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        });
        let depth_view = depth_texture.create_view(&wgpu::TextureViewDescriptor::default());

        // Camera uniforms
        let aspect = width as f32 / height as f32;
        let camera_uniforms = CameraUniformsGpu {
            view: camera_params.view_matrix().to_cols_array_2d(),
            projection: camera_params.projection_matrix(aspect).to_cols_array_2d(),
            camera_position: camera_params.position.to_array(),
            _padding: 0.0,
        };
        let camera_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("pbr_camera_buffer"),
            contents: bytemuck::bytes_of(&camera_uniforms),
            usage: wgpu::BufferUsages::UNIFORM,
        });
        let camera_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("pbr_camera_bg"),
            layout: &self.camera_bind_group_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: camera_buffer.as_entire_binding(),
            }],
        });

        // Collect lights from ECS
        let light_uniforms = self.collect_lights(world);
        let light_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("pbr_light_buffer"),
            contents: bytemuck::bytes_of(&light_uniforms),
            usage: wgpu::BufferUsages::UNIFORM,
        });
        let light_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("pbr_light_bg"),
            layout: &self.light_bind_group_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: light_buffer.as_entire_binding(),
            }],
        });

        // Pre-collect draw data (buffers + bind groups must outlive render pass)
        let draw_calls = self.collect_draw_calls(world, asset_cache, device);

        // Begin render pass
        let bg = background_color.unwrap_or([0.0, 0.0, 0.0, 0.0]);
        let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("pbr_render_encoder"),
        });

        {
            let mut render_pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("pbr_render_pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &color_view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color {
                            r: bg[0] as f64,
                            g: bg[1] as f64,
                            b: bg[2] as f64,
                            a: bg[3] as f64,
                        }),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                    view: &depth_view,
                    depth_ops: Some(wgpu::Operations {
                        load: wgpu::LoadOp::Clear(1.0),
                        store: wgpu::StoreOp::Store,
                    }),
                    stencil_ops: None,
                }),
                timestamp_writes: None,
                occlusion_query_set: None,
            });

            render_pass.set_bind_group(0, &camera_bind_group, &[]);
            render_pass.set_bind_group(3, &light_bind_group, &[]);

            // Issue draw calls, switching pipeline for skinned vs non-skinned meshes
            let mut current_skinned = false;
            render_pass.set_pipeline(&self.render_pipeline);

            for call in &draw_calls {
                if call.is_skinned != current_skinned {
                    if call.is_skinned {
                        render_pass.set_pipeline(&self.skinned_render_pipeline);
                    } else {
                        render_pass.set_pipeline(&self.render_pipeline);
                    }
                    current_skinned = call.is_skinned;
                    // Re-bind shared groups after pipeline switch
                    render_pass.set_bind_group(0, &camera_bind_group, &[]);
                    render_pass.set_bind_group(3, &light_bind_group, &[]);
                }

                render_pass.set_bind_group(1, &call.model_bind_group, &[]);
                render_pass.set_bind_group(2, &call.material_bind_group, &[]);

                if call.is_skinned {
                    if let Some(ref jbg) = call.joint_bind_group {
                        render_pass.set_bind_group(4, jbg, &[]);
                    }
                }

                render_pass.set_vertex_buffer(0, call.vertex_buffer.slice(..));
                render_pass.set_index_buffer(call.index_buffer.slice(..), call.index_format);
                render_pass.draw_indexed(0..call.index_count, 0, 0..1);
            }
        }

        queue.submit(std::iter::once(encoder.finish()));

        Ok(SceneRenderOutput {
            color_texture,
            color_view,
            depth_texture,
            width,
            height,
        })
    }

    /// Collect light data from ECS world into GPU uniform struct
    fn collect_lights(&self, world: &mut bevy_ecs::world::World) -> LightUniformsGpu {
        let mut uniforms = LightUniformsGpu {
            lights: [LightGpu::zeroed(); MAX_LIGHTS],
            count: 0,
            _padding: [0; 3],
        };

        let mut query = world.query::<(&Light, &GlobalTransform, &Transform)>();
        let mut idx = 0usize;
        for (light, global_transform, transform) in query.iter(world) {
            if idx >= MAX_LIGHTS {
                break;
            }

            let world_pos = global_transform.0.col(3).truncate();
            let world_dir = global_transform
                .0
                .transform_vector3(Vec3::new(0.0, 0.0, -1.0))
                .normalize_or_zero();

            uniforms.lights[idx] = LightGpu {
                position: world_pos.to_array(),
                kind: match light.kind {
                    LightKind::Directional => 0,
                    LightKind::Point => 1,
                    LightKind::Spot { .. } => 2,
                },
                direction: world_dir.to_array(),
                intensity: light.intensity,
                color: light.color.to_array(),
                range: 0.0, // glTF doesn't always set range
                inner_cone: match &light.kind {
                    LightKind::Spot { inner_cone, .. } => *inner_cone,
                    _ => 0.0,
                },
                outer_cone: match &light.kind {
                    LightKind::Spot { outer_cone, .. } => *outer_cone,
                    _ => 0.0,
                },
                _padding: [0.0; 2],
            };
            idx += 1;
        }

        // Add a default directional light if scene has no lights
        if idx == 0 {
            uniforms.lights[0] = LightGpu {
                position: [0.0; 3],
                kind: 0, // directional
                direction: [0.3, -1.0, 0.4],
                intensity: 1.0,
                color: [1.0, 1.0, 1.0],
                range: 0.0,
                inner_cone: 0.0,
                outer_cone: 0.0,
                _padding: [0.0; 2],
            };
            idx = 1;
        }

        uniforms.count = idx as u32;
        uniforms
    }

    /// Pre-collect all draw call data so buffers outlive the render pass
    fn collect_draw_calls<'a>(
        &self,
        world: &mut bevy_ecs::world::World,
        asset_cache: &'a AssetCache,
        device: &wgpu::Device,
    ) -> Vec<DrawCall<'a>> {
        // Pre-collect skeleton data for joint matrix computation
        let skeleton_data: Vec<(Entity, Vec<Entity>, Vec<Mat4>)> = {
            let mut sq = world.query::<(Entity, &Skeleton)>();
            sq.iter(world)
                .map(|(e, s)| (e, s.joint_entities.clone(), s.inverse_bind_matrices.clone()))
                .collect()
        };

        let mut calls = Vec::new();
        let mut query =
            world.query::<(Entity, &GlobalTransform, &MeshRef, Option<&MaterialRef>)>();

        let draw_data: Vec<(Entity, Mat4, String, usize, Option<(String, usize)>)> = query
            .iter(world)
            .map(|(entity, gt, mesh_ref, mat_ref)| {
                (
                    entity,
                    gt.0,
                    mesh_ref.uri.clone(),
                    mesh_ref.primitive_index,
                    mat_ref.map(|m| (m.uri.clone(), m.material_index)),
                )
            })
            .collect();

        for (entity, model_matrix, mesh_uri, prim_idx, mat_info) in &draw_data {
            let gpu_mesh = match asset_cache.get_mesh(mesh_uri, *prim_idx) {
                Some(m) => m,
                None => continue,
            };

            let gpu_material = if let Some((mat_uri, mat_idx)) = mat_info {
                asset_cache
                    .get_material(mat_uri, *mat_idx)
                    .or_else(|| asset_cache.get_default_material(mesh_uri))
            } else {
                asset_cache.get_default_material(mesh_uri)
            };

            let gpu_material = match gpu_material {
                Some(m) => m,
                None => continue,
            };

            // Model uniforms
            let normal_matrix = model_matrix.inverse().transpose();
            let model_uniforms = ModelUniformsGpu {
                model: model_matrix.to_cols_array_2d(),
                normal_matrix_0: normal_matrix.col(0).to_array(),
                normal_matrix_1: normal_matrix.col(1).to_array(),
                normal_matrix_2: normal_matrix.col(2).to_array(),
            };

            let model_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some("pbr_model_buffer"),
                contents: bytemuck::bytes_of(&model_uniforms),
                usage: wgpu::BufferUsages::UNIFORM,
            });

            let model_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("pbr_model_bg"),
                layout: &self.model_bind_group_layout,
                entries: &[wgpu::BindGroupEntry {
                    binding: 0,
                    resource: model_buffer.as_entire_binding(),
                }],
            });

            // Compute joint matrices for skinned meshes
            let (joint_bind_group, joint_buffer) = if gpu_mesh.is_skinned {
                // Find skeleton for this entity (or its ancestors)
                let skel = skeleton_data
                    .iter()
                    .find(|(e, _, _)| *e == *entity)
                    .or_else(|| skeleton_data.first());

                if let Some((_, joint_entities, ibms)) = skel {
                    let mut joint_matrices =
                        vec![Mat4::IDENTITY; MAX_JOINTS];

                    for (i, joint_entity) in
                        joint_entities.iter().enumerate().take(MAX_JOINTS)
                    {
                        let joint_global = world
                            .get::<GlobalTransform>(*joint_entity)
                            .map(|gt| gt.0)
                            .unwrap_or(Mat4::IDENTITY);
                        let ibm = ibms.get(i).copied().unwrap_or(Mat4::IDENTITY);
                        joint_matrices[i] = joint_global * ibm;
                    }

                    // Flatten to f32 array
                    let flat: Vec<f32> = joint_matrices
                        .iter()
                        .flat_map(|m| m.to_cols_array())
                        .collect();

                    let jbuf = device.create_buffer_init(
                        &wgpu::util::BufferInitDescriptor {
                            label: Some("joint_matrices_buffer"),
                            contents: bytemuck::cast_slice(&flat),
                            usage: wgpu::BufferUsages::STORAGE,
                        },
                    );

                    let jbg = device.create_bind_group(&wgpu::BindGroupDescriptor {
                        label: Some("joint_matrices_bg"),
                        layout: &self.joint_bind_group_layout,
                        entries: &[wgpu::BindGroupEntry {
                            binding: 0,
                            resource: jbuf.as_entire_binding(),
                        }],
                    });

                    (Some(jbg), Some(jbuf))
                } else {
                    (None, None)
                }
            } else {
                (None, None)
            };

            calls.push(DrawCall {
                model_buffer,
                model_bind_group,
                material_bind_group: &gpu_material.bind_group,
                vertex_buffer: &gpu_mesh.vertex_buffer,
                index_buffer: &gpu_mesh.index_buffer,
                index_count: gpu_mesh.index_count,
                index_format: gpu_mesh.index_format,
                is_skinned: gpu_mesh.is_skinned && joint_bind_group.is_some(),
                joint_bind_group,
                _joint_buffer: joint_buffer,
            });
        }

        calls
    }
}

/// Pre-collected draw call data (owns model buffers, borrows mesh/material from cache)
struct DrawCall<'a> {
    model_buffer: wgpu::Buffer,
    model_bind_group: wgpu::BindGroup,
    material_bind_group: &'a wgpu::BindGroup,
    vertex_buffer: &'a wgpu::Buffer,
    index_buffer: &'a wgpu::Buffer,
    index_count: u32,
    index_format: wgpu::IndexFormat,
    is_skinned: bool,
    joint_bind_group: Option<wgpu::BindGroup>,
    /// Owned buffer for joint matrices (must outlive render pass)
    _joint_buffer: Option<wgpu::Buffer>,
}

/// PBR rendering errors
#[derive(Debug, thiserror::Error)]
pub enum PbrRenderError {
    #[error("No camera found in scene")]
    NoCamera,
    #[error("Render failed: {0}")]
    RenderFailed(String),
}
