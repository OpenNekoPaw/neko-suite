//! PBR forward rendering pipeline
//!
//! Renders a bevy_ecs World's visible meshes using metallic-roughness PBR.
//! Outputs to Rgba16Float texture (matching TextureCompositor format).

use crate::gpu::scene_renderer::asset_cache::AssetCache;
use crate::gpu::scene_renderer::{
    build_viewport_render_graph, extract_render_world, CameraParams, CompiledRenderPass,
    PostProcessChain, PostProcessSettings, RenderGraphError, RenderGraphExecutor, RenderLightKind,
    RenderSystemLabel, RenderWorld, SceneRenderGraphExecution, SceneRenderOutput, SceneToneMapping,
    ToneMapping, ViewportDescriptor, ViewportPostProcess, ViewportRenderGraphOutput,
    ViewportRenderGraphVariant, ViewportRenderMode, ViewportWorkMode,
};
use crate::gpu::GpuContext;
use bytemuck::{Pod, Zeroable};
use glam::{Mat4, Vec3};
use neko_runtime_scene::asset_database::AssetDatabase;
use std::sync::Arc;
use wgpu::util::DeviceExt;

/// Maximum lights supported per scene
const MAX_LIGHTS: usize = 16;

/// Maximum joints per skeleton for GPU skinning
const MAX_JOINTS: usize = 256;

const SCENE_COLOR_CONVERT_SHADER: &str = r#"
struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
    var out: VertexOutput;
    var pos: vec2<f32>;
    var uv: vec2<f32>;
    switch vertex_index {
        case 0u: {
            pos = vec2<f32>(-1.0, -1.0);
            uv = vec2<f32>(0.0, 1.0);
        }
        case 1u: {
            pos = vec2<f32>(3.0, -1.0);
            uv = vec2<f32>(2.0, 1.0);
        }
        default: {
            pos = vec2<f32>(-1.0, 3.0);
            uv = vec2<f32>(0.0, -1.0);
        }
    }
    out.position = vec4<f32>(pos, 0.0, 1.0);
    out.uv = uv;
    return out;
}

@group(0) @binding(0) var input_texture: texture_2d<f32>;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let size = textureDimensions(input_texture);
    let size_f = vec2<f32>(f32(size.x), f32(size.y));
    let max_coord = vec2<i32>(i32(size.x) - 1, i32(size.y) - 1);
    let coord = clamp(
        vec2<i32>(in.uv * size_f),
        vec2<i32>(0, 0),
        max_coord,
    );
    let color = textureLoad(input_texture, coord, 0);
    let rgb = pow(clamp(color.rgb, vec3<f32>(0.0), vec3<f32>(1.0)), vec3<f32>(1.0 / 2.2));
    return vec4<f32>(rgb, clamp(color.a, 0.0, 1.0));
}
"#;

/// PBR forward renderer
pub struct PbrRenderer {
    render_pipeline: wgpu::RenderPipeline,
    skinned_render_pipeline: wgpu::RenderPipeline,
    camera_bind_group_layout: wgpu::BindGroupLayout,
    model_bind_group_layout: wgpu::BindGroupLayout,
    light_bind_group_layout: wgpu::BindGroupLayout,
    joint_bind_group_layout: wgpu::BindGroupLayout,
    color_convert_bind_group_layout: wgpu::BindGroupLayout,
    color_convert_pipeline: wgpu::RenderPipeline,
    post_process_chain: PostProcessChain,
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
                // binding 5: emissive texture
                wgpu::BindGroupLayoutEntry {
                    binding: 5,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        multisampled: false,
                        view_dimension: wgpu::TextureViewDimension::D2,
                        sample_type: wgpu::TextureSampleType::Float { filterable: true },
                    },
                    count: None,
                },
                // binding 6: occlusion/AO texture
                wgpu::BindGroupLayoutEntry {
                    binding: 6,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        multisampled: false,
                        view_dimension: wgpu::TextureViewDimension::D2,
                        sample_type: wgpu::TextureSampleType::Float { filterable: true },
                    },
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

        let color_convert_bgl = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("scene_color_convert_bgl"),
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Texture {
                    multisampled: false,
                    view_dimension: wgpu::TextureViewDimension::D2,
                    sample_type: wgpu::TextureSampleType::Float { filterable: false },
                },
                count: None,
            }],
        });
        let color_convert_pipeline_layout =
            device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                label: Some("scene_color_convert_pipeline_layout"),
                bind_group_layouts: &[&color_convert_bgl],
                push_constant_ranges: &[],
            });
        let color_convert_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("scene_color_convert_shader"),
            source: wgpu::ShaderSource::Wgsl(SCENE_COLOR_CONVERT_SHADER.into()),
        });
        let color_convert_pipeline =
            device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
                label: Some("scene_color_convert_pipeline"),
                layout: Some(&color_convert_pipeline_layout),
                vertex: wgpu::VertexState {
                    module: &color_convert_shader,
                    entry_point: "vs_main",
                    buffers: &[],
                },
                fragment: Some(wgpu::FragmentState {
                    module: &color_convert_shader,
                    entry_point: "fs_main",
                    targets: &[Some(wgpu::ColorTargetState {
                        format: wgpu::TextureFormat::Rgba8Unorm,
                        blend: None,
                        write_mask: wgpu::ColorWrites::ALL,
                    })],
                }),
                primitive: wgpu::PrimitiveState::default(),
                depth_stencil: None,
                multisample: wgpu::MultisampleState::default(),
                multiview: None,
            });

        (
            Self {
                render_pipeline,
                skinned_render_pipeline,
                camera_bind_group_layout: camera_bgl,
                model_bind_group_layout: model_bgl,
                light_bind_group_layout: light_bgl,
                joint_bind_group_layout: joint_bgl,
                color_convert_bind_group_layout: color_convert_bgl,
                color_convert_pipeline,
                post_process_chain: PostProcessChain::new(Arc::clone(&ctx)),
                ctx,
            },
            material_bgl,
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
        let mut render_world = RenderWorld::default();
        let asset_database = AssetDatabase::default();
        extract_render_world(world, &asset_database, camera_params, &mut render_world);
        self.render_from_render_world(
            &render_world,
            asset_cache,
            camera_params,
            output_size,
            background_color,
        )
    }

    /// Render an already-extracted Render World with the default quality-capture viewport.
    pub fn render_from_render_world(
        &self,
        render_world: &RenderWorld,
        asset_cache: &AssetCache,
        camera_params: &CameraParams,
        output_size: (u32, u32),
        background_color: Option<[f32; 4]>,
    ) -> Result<SceneRenderOutput, PbrRenderError> {
        let descriptor = default_pbr_viewport_descriptor();
        self.render_viewport_from_render_world(
            render_world,
            asset_cache,
            camera_params,
            output_size,
            background_color,
            &descriptor,
            ViewportRenderGraphOutput::QualityCapture,
        )
    }

    /// Render a viewport through the compiled RenderGraph selected by its descriptor.
    pub fn render_viewport(
        &self,
        world: &mut bevy_ecs::world::World,
        asset_cache: &AssetCache,
        camera_params: &CameraParams,
        output_size: (u32, u32),
        background_color: Option<[f32; 4]>,
        descriptor: &ViewportDescriptor,
        graph_output: ViewportRenderGraphOutput,
    ) -> Result<SceneRenderOutput, PbrRenderError> {
        let mut render_world = RenderWorld::default();
        let asset_database = AssetDatabase::default();
        extract_render_world(world, &asset_database, camera_params, &mut render_world);
        self.render_viewport_from_render_world(
            &render_world,
            asset_cache,
            camera_params,
            output_size,
            background_color,
            descriptor,
            graph_output,
        )
    }

    /// Render an already-extracted Render World through the viewport RenderGraph.
    pub fn render_viewport_from_render_world(
        &self,
        render_world: &RenderWorld,
        asset_cache: &AssetCache,
        camera_params: &CameraParams,
        output_size: (u32, u32),
        background_color: Option<[f32; 4]>,
        descriptor: &ViewportDescriptor,
        graph_output: ViewportRenderGraphOutput,
    ) -> Result<SceneRenderOutput, PbrRenderError> {
        let plan = build_viewport_render_graph(descriptor, graph_output)?;
        let compiled = plan
            .graph
            .compile(std::slice::from_ref(&plan.live_output))?;
        let pass_ids: Vec<String> = compiled
            .passes
            .iter()
            .map(|pass| pass.id.0.clone())
            .collect();
        let graph_execution = SceneRenderGraphExecution {
            variant: plan.variant,
            pass_ids,
            helper_passes: plan.helper_passes,
            post_process: plan.post_process,
            color_convert: plan.color_convert,
            encoder_copy: plan.encoder_copy,
        };

        let mut encoder =
            self.ctx
                .device()
                .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                    label: Some("pbr_render_graph_encoder"),
                });
        let mut executor = PbrRenderGraphPassExecutor {
            renderer: self,
            render_world,
            asset_cache,
            camera_params,
            output_size,
            background_color,
            post_process_settings: post_process_settings_for_descriptor(descriptor),
            output: None,
            intermediate_textures: Vec::new(),
            intermediate_views: Vec::new(),
        };

        plan.graph.execute(&compiled, &mut encoder, &mut executor)?;
        self.ctx.queue().submit(std::iter::once(encoder.finish()));

        let mut output = executor.output.ok_or_else(|| {
            PbrRenderError::RenderFailed("RenderGraph produced no color output".into())
        })?;
        output.graph_execution = graph_execution;
        Ok(output)
    }

    fn record_pbr_forward_pass(
        &self,
        render_world: &RenderWorld,
        asset_cache: &AssetCache,
        camera_params: &CameraParams,
        output_size: (u32, u32),
        background_color: Option<[f32; 4]>,
        encoder: &mut wgpu::CommandEncoder,
    ) -> Result<SceneRenderOutput, PbrRenderError> {
        let (width, height) = output_size;
        let device = self.ctx.device();

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
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT
                | wgpu::TextureUsages::TEXTURE_BINDING
                | wgpu::TextureUsages::COPY_SRC,
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

        // Collect lights from the revision-stable Render World.
        let light_uniforms = self.collect_lights(render_world);
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
        let draw_calls = self.collect_draw_calls(render_world, asset_cache, device);

        // Begin render pass
        let bg = background_color.unwrap_or([0.0, 0.0, 0.0, 0.0]);
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
                render_pass.set_bind_group(2, call.material_bind_group, &[]);

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

        Ok(SceneRenderOutput {
            color_texture,
            color_view,
            depth_texture,
            width,
            height,
            graph_execution: empty_graph_execution(),
        })
    }

    /// Collect light data from Render World into GPU uniform struct.
    fn collect_lights(&self, render_world: &RenderWorld) -> LightUniformsGpu {
        let mut uniforms = LightUniformsGpu {
            lights: [LightGpu::zeroed(); MAX_LIGHTS],
            count: 0,
            _padding: [0; 3],
        };

        let mut idx = 0usize;
        for light in &render_world.lights {
            if idx >= MAX_LIGHTS {
                break;
            }

            let world_pos = light.world_transform.col(3).truncate();
            let world_dir = light
                .world_transform
                .transform_vector3(Vec3::new(0.0, 0.0, -1.0))
                .normalize_or_zero();

            uniforms.lights[idx] = LightGpu {
                position: world_pos.to_array(),
                kind: match light.kind {
                    RenderLightKind::Directional => 0,
                    RenderLightKind::Point => 1,
                    RenderLightKind::Spot => 2,
                },
                direction: world_dir.to_array(),
                intensity: light.intensity,
                color: light.color.to_array(),
                range: light.range.unwrap_or(0.0),
                inner_cone: light.inner_cone.unwrap_or(0.0),
                outer_cone: light.outer_cone.unwrap_or(0.0),
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
        render_world: &RenderWorld,
        asset_cache: &'a AssetCache,
        device: &wgpu::Device,
    ) -> Vec<DrawCall<'a>> {
        let mut calls = Vec::new();
        let mut draw_items = render_world.draw_list.clone();
        draw_items.sort_by_key(|item| item.sort_key);

        for item in draw_items {
            let Some(instance) = render_world.instances.get(item.instance_index) else {
                continue;
            };
            if !instance.visible {
                continue;
            }

            let gpu_mesh =
                match asset_cache.get_mesh(&instance.mesh.uri, instance.mesh.primitive_index) {
                    Some(m) => m,
                    None => continue,
                };

            let gpu_material = if let Some(material) = &instance.material {
                asset_cache
                    .get_material(&material.uri, material.material_index)
                    .or_else(|| asset_cache.get_default_material(&instance.mesh.uri))
            } else {
                asset_cache.get_default_material(&instance.mesh.uri)
            };

            let gpu_material = match gpu_material {
                Some(m) => m,
                None => continue,
            };

            // Model uniforms
            let normal_matrix = instance.world_transform.inverse().transpose();
            let model_uniforms = ModelUniformsGpu {
                model: instance.world_transform.to_cols_array_2d(),
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
                if let Some(extracted_joint_matrices) = &instance.joint_matrices {
                    let mut joint_matrices = vec![Mat4::IDENTITY; MAX_JOINTS];
                    for (index, matrix) in
                        extracted_joint_matrices.iter().take(MAX_JOINTS).enumerate()
                    {
                        joint_matrices[index] = *matrix;
                    }

                    // Flatten to f32 array
                    let flat: Vec<f32> = joint_matrices
                        .iter()
                        .flat_map(|m| m.to_cols_array())
                        .collect();

                    let jbuf = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                        label: Some("joint_matrices_buffer"),
                        contents: bytemuck::cast_slice(&flat),
                        usage: wgpu::BufferUsages::STORAGE,
                    });

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

struct PbrRenderGraphPassExecutor<'a> {
    renderer: &'a PbrRenderer,
    render_world: &'a RenderWorld,
    asset_cache: &'a AssetCache,
    camera_params: &'a CameraParams,
    output_size: (u32, u32),
    background_color: Option<[f32; 4]>,
    post_process_settings: PostProcessSettings,
    output: Option<SceneRenderOutput>,
    intermediate_textures: Vec<wgpu::Texture>,
    intermediate_views: Vec<wgpu::TextureView>,
}

impl RenderGraphExecutor for PbrRenderGraphPassExecutor<'_> {
    fn execute_pass(
        &mut self,
        pass: &CompiledRenderPass,
        encoder: &mut wgpu::CommandEncoder,
    ) -> Result<(), RenderGraphError> {
        let pass_id = pass.id.0.as_str();
        if pass_id == RenderSystemLabel::PbrForward.as_str() {
            let output = self
                .renderer
                .record_pbr_forward_pass(
                    self.render_world,
                    self.asset_cache,
                    self.camera_params,
                    self.output_size,
                    self.background_color,
                    encoder,
                )
                .map_err(|error| RenderGraphError::Execution {
                    pass: pass.id.0.clone(),
                    error: error.to_string(),
                })?;
            self.output = Some(output);
            return Ok(());
        }

        if pass_id == RenderSystemLabel::PostProcess.as_str() {
            return self.record_post_process(pass, encoder);
        }

        if pass_id == RenderSystemLabel::ViewportHelpers.as_str() {
            return self.record_viewport_helpers(pass, encoder);
        }

        if pass_id == RenderSystemLabel::ColorConvert.as_str() {
            return self.record_color_convert(pass, encoder);
        }

        if pass_id == RenderSystemLabel::EncoderCopy.as_str() {
            return self.record_texture_copy(pass, encoder);
        }

        Err(RenderGraphError::Execution {
            pass: pass.id.0.clone(),
            error: "no executor registered for render pass".to_string(),
        })
    }
}

impl PbrRenderGraphPassExecutor<'_> {
    fn record_viewport_helpers(
        &mut self,
        pass: &CompiledRenderPass,
        encoder: &mut wgpu::CommandEncoder,
    ) -> Result<(), RenderGraphError> {
        let current = self.take_output(pass)?;
        let helper_texture =
            self.create_graph_color_texture(&pass.id.0, &current, current.color_texture.format());
        encoder.copy_texture_to_texture(
            wgpu::ImageCopyTexture {
                texture: &current.color_texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            wgpu::ImageCopyTexture {
                texture: &helper_texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            wgpu::Extent3d {
                width: current.width,
                height: current.height,
                depth_or_array_layers: 1,
            },
        );
        let helper_view = helper_texture.create_view(&wgpu::TextureViewDescriptor::default());

        self.intermediate_textures.push(current.color_texture);
        self.intermediate_views.push(current.color_view);
        self.output = Some(SceneRenderOutput {
            color_texture: helper_texture,
            color_view: helper_view,
            depth_texture: current.depth_texture,
            width: current.width,
            height: current.height,
            graph_execution: empty_graph_execution(),
        });
        Ok(())
    }

    fn record_post_process(
        &mut self,
        pass: &CompiledRenderPass,
        encoder: &mut wgpu::CommandEncoder,
    ) -> Result<(), RenderGraphError> {
        let current = self.take_output(pass)?;
        let processed_texture = self.create_graph_color_texture(
            "pbr_post_process_target",
            &current,
            wgpu::TextureFormat::Rgba16Float,
        );
        let processed_view = processed_texture.create_view(&wgpu::TextureViewDescriptor::default());

        self.renderer.post_process_chain.record_process(
            &current.color_view,
            &processed_view,
            current.width,
            current.height,
            &self.post_process_settings,
            encoder,
        );

        self.intermediate_textures.push(current.color_texture);
        self.intermediate_views.push(current.color_view);
        self.output = Some(SceneRenderOutput {
            color_texture: processed_texture,
            color_view: processed_view,
            depth_texture: current.depth_texture,
            width: current.width,
            height: current.height,
            graph_execution: empty_graph_execution(),
        });
        Ok(())
    }

    fn record_color_convert(
        &mut self,
        pass: &CompiledRenderPass,
        encoder: &mut wgpu::CommandEncoder,
    ) -> Result<(), RenderGraphError> {
        let current = self.take_output(pass)?;
        let converted_texture = self.create_graph_color_texture(
            "pbr_color_convert_rgba8_target",
            &current,
            wgpu::TextureFormat::Rgba8Unorm,
        );
        let converted_view = converted_texture.create_view(&wgpu::TextureViewDescriptor::default());
        let bind_group = self
            .renderer
            .ctx
            .device()
            .create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("scene_color_convert_bg"),
                layout: &self.renderer.color_convert_bind_group_layout,
                entries: &[wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(&current.color_view),
                }],
            });

        {
            let mut render_pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("scene_color_convert_pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &converted_view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color::BLACK),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });
            render_pass.set_pipeline(&self.renderer.color_convert_pipeline);
            render_pass.set_bind_group(0, &bind_group, &[]);
            render_pass.draw(0..3, 0..1);
        }

        self.intermediate_textures.push(current.color_texture);
        self.intermediate_views.push(current.color_view);
        self.output = Some(SceneRenderOutput {
            color_texture: converted_texture,
            color_view: converted_view,
            depth_texture: current.depth_texture,
            width: current.width,
            height: current.height,
            graph_execution: empty_graph_execution(),
        });
        Ok(())
    }

    fn record_texture_copy(
        &mut self,
        pass: &CompiledRenderPass,
        encoder: &mut wgpu::CommandEncoder,
    ) -> Result<(), RenderGraphError> {
        let current = self.take_output(pass)?;
        let copied_texture =
            self.create_graph_color_texture(&pass.id.0, &current, current.color_texture.format());
        encoder.copy_texture_to_texture(
            wgpu::ImageCopyTexture {
                texture: &current.color_texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            wgpu::ImageCopyTexture {
                texture: &copied_texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            wgpu::Extent3d {
                width: current.width,
                height: current.height,
                depth_or_array_layers: 1,
            },
        );
        let copied_view = copied_texture.create_view(&wgpu::TextureViewDescriptor::default());

        self.intermediate_textures.push(current.color_texture);
        self.intermediate_views.push(current.color_view);
        self.output = Some(SceneRenderOutput {
            color_texture: copied_texture,
            color_view: copied_view,
            depth_texture: current.depth_texture,
            width: current.width,
            height: current.height,
            graph_execution: empty_graph_execution(),
        });
        Ok(())
    }

    fn take_output(
        &mut self,
        pass: &CompiledRenderPass,
    ) -> Result<SceneRenderOutput, RenderGraphError> {
        self.output
            .take()
            .ok_or_else(|| RenderGraphError::Execution {
                pass: pass.id.0.clone(),
                error: "pass requires PBR color output".to_string(),
            })
    }

    fn create_graph_color_texture(
        &self,
        label: &str,
        current: &SceneRenderOutput,
        format: wgpu::TextureFormat,
    ) -> wgpu::Texture {
        self.renderer
            .ctx
            .device()
            .create_texture(&wgpu::TextureDescriptor {
                label: Some(label),
                size: wgpu::Extent3d {
                    width: current.width,
                    height: current.height,
                    depth_or_array_layers: 1,
                },
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format,
                usage: wgpu::TextureUsages::RENDER_ATTACHMENT
                    | wgpu::TextureUsages::TEXTURE_BINDING
                    | wgpu::TextureUsages::COPY_SRC
                    | wgpu::TextureUsages::COPY_DST,
                view_formats: &[],
            })
    }
}

fn default_pbr_viewport_descriptor() -> ViewportDescriptor {
    ViewportDescriptor {
        viewport_id: "main".to_string(),
        scene_id: "default".to_string(),
        render_mode: ViewportRenderMode::Pbr,
        debug_view: None,
        fps: 60,
        tone_mapping: SceneToneMapping::Aces,
        post_process: ViewportPostProcess::default(),
        layer_mask: None,
        work_mode: ViewportWorkMode::EditParametric,
        helper_passes: true,
    }
}

fn post_process_settings_for_descriptor(descriptor: &ViewportDescriptor) -> PostProcessSettings {
    PostProcessSettings {
        tone_mapping: match descriptor.tone_mapping {
            SceneToneMapping::Aces => ToneMapping::AcesFilmic,
            SceneToneMapping::Reinhard => ToneMapping::Reinhard,
            SceneToneMapping::None => ToneMapping::None,
        },
        bloom_intensity: if descriptor.post_process.bloom {
            0.35
        } else {
            0.0
        },
        ..PostProcessSettings::default()
    }
}

fn empty_graph_execution() -> SceneRenderGraphExecution {
    SceneRenderGraphExecution {
        variant: ViewportRenderGraphVariant::StandardPbr,
        pass_ids: Vec::new(),
        helper_passes: false,
        post_process: false,
        color_convert: false,
        encoder_copy: false,
    }
}

/// Pre-collected draw call data (owns model buffers, borrows mesh/material from cache)
struct DrawCall<'a> {
    #[allow(dead_code)]
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
    #[error("RenderGraph failed: {0}")]
    RenderGraph(#[from] RenderGraphError),
    #[error("Render failed: {0}")]
    RenderFailed(String),
}
