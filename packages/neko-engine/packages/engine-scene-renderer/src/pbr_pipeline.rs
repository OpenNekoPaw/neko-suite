//! PBR forward rendering pipeline
//!
//! Renders a bevy_ecs World's visible meshes using metallic-roughness PBR.
//! Outputs to Rgba16Float texture (matching TextureCompositor format).

use crate::asset_cache::{AssetCache, GpuAlphaMode, MaterialUniforms};
use crate::{
    build_viewport_render_graph, extract_render_world, CameraParams, CompiledRenderPass,
    PostProcessChain, PostProcessSettings, RenderGraphError, RenderGraphExecutor, RenderLightKind,
    RenderSystemLabel, RenderTargetLease, RenderTargetPool, RenderTargetPoolSnapshot, RenderWorld,
    SceneColorSpace, SceneRenderGraphExecution, SceneRenderOutput, SceneToneMapping, ToneMapping,
    ViewportDescriptor, ViewportMaterialOverrideKind, ViewportPostProcess,
    ViewportRenderGraphOutput, ViewportRenderGraphVariant, ViewportRenderMode, ViewportWorkMode,
};
use bytemuck::{Pod, Zeroable};
use glam::{Mat4, Vec3};
use neko_engine_gpu::GpuContext;
use neko_runtime_scene::asset_database::AssetDatabase;
use std::sync::Arc;
use wgpu::util::DeviceExt;

/// Maximum lights supported per scene
const MAX_LIGHTS: usize = 16;

/// Maximum joints per skeleton for GPU skinning
const MAX_JOINTS: usize = 256;
const VIEWPORT_GRID_EXTENT: f32 = 5.0;
const VIEWPORT_GRID_STEP: f32 = 0.1;
const VIEWPORT_GRID_HALF_STEPS: u32 = 50;
const VIEWPORT_GRID_COORD_COUNT: u32 = VIEWPORT_GRID_HALF_STEPS * 2 + 1;
const VIEWPORT_GRID_VERTEX_COUNT: u32 = VIEWPORT_GRID_COORD_COUNT * 2 * 2 * 3;
const DEFAULT_KEY_LIGHT_INTENSITY: f32 = 3.5;
const DEFAULT_FILL_LIGHT_INTENSITY: f32 = 1.0;
const DEFAULT_RIM_LIGHT_INTENSITY: f32 = 1.4;
const CLAY_BASE_COLOR: [f32; 4] = [0.78, 0.76, 0.72, 1.0];
const CLAY_ROUGHNESS: f32 = 0.86;
const CLAY_METALLIC: f32 = 0.0;
const REALTIME_STREAM_SSAA_SCALE: f32 = 1.5;
const REALTIME_STREAM_SSAA_MAX_OUTPUT_PIXELS: u64 = 1_920 * 1_080;

const ENVIRONMENT_BACKGROUND_SHADER: &str = r#"
struct EnvironmentBackgroundUniforms {
    inv_view_projection: mat4x4<f32>,
    camera_position: vec3<f32>,
    rotation_rad: f32,
    intensity: f32,
    exposure: f32,
    _padding: vec2<f32>,
}

@group(0) @binding(0) var<uniform> environment: EnvironmentBackgroundUniforms;
@group(0) @binding(1) var environment_texture: texture_2d<f32>;
@group(0) @binding(2) var environment_sampler: sampler;

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

fn rotate_y(v: vec3<f32>, angle: f32) -> vec3<f32> {
    let c = cos(angle);
    let s = sin(angle);
    return vec3<f32>(v.x * c + v.z * s, v.y, -v.x * s + v.z * c);
}

fn equirect_uv(dir: vec3<f32>) -> vec2<f32> {
    let d = normalize(dir);
    let lon = atan2(d.x, -d.z);
    let lat = asin(clamp(d.y, -1.0, 1.0));
    let u = lon / (2.0 * 3.14159265359) + 0.5;
    let v = 0.5 - lat / 3.14159265359;
    return vec2<f32>(fract(u), clamp(v, 0.0, 1.0));
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let ndc = vec2<f32>(in.uv.x * 2.0 - 1.0, 1.0 - in.uv.y * 2.0);
    let world = environment.inv_view_projection * vec4<f32>(ndc, 1.0, 1.0);
    let world_position = world.xyz / world.w;
    let sample_dir = rotate_y(
        normalize(world_position - environment.camera_position),
        environment.rotation_rad,
    );
    let color = textureSample(environment_texture, environment_sampler, equirect_uv(sample_dir));
    let exposure_scale = exp2(environment.exposure);
    return vec4<f32>(color.rgb * environment.intensity * exposure_scale, 1.0);
}
"#;

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

const VIEWPORT_GRID_SHADER: &str = r#"
struct ViewportGridUniforms {
    view_projection: mat4x4<f32>,
    inv_view_projection: mat4x4<f32>,
    camera_position: vec3<f32>,
    extent: f32,
    viewport_size: vec2<f32>,
    step: f32,
    _padding: f32,
}

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
}

@group(0) @binding(0) var<uniform> grid: ViewportGridUniforms;

const GRID_MAJOR_EVERY: u32 = 5u;

@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
    let half_steps = u32(grid.extent / grid.step + 0.5);
    let coord_count = half_steps * 2u + 1u;
    let line_vertex = vertex_index % 2u;
    let line_index = vertex_index / 2u;
    let plane_line_count = coord_count * 2u;
    let plane = line_index / plane_line_count;
    let local_line = line_index % plane_line_count;
    let direction = local_line / coord_count;
    let coord_index = local_line % coord_count;
    let offset = (f32(coord_index) - f32(half_steps)) * grid.step;
    let world = plane_point(plane, direction, offset, line_vertex);

    var out: VertexOutput;
    out.position = grid.view_projection * vec4<f32>(world, 1.0);
    out.color = line_color(plane, direction, coord_index, half_steps);
    return out;
}

fn plane_point(plane: u32, direction: u32, offset: f32, endpoint: u32) -> vec3<f32> {
    let span = select(-grid.extent, grid.extent, endpoint == 1u);
    if (plane == 0u) {
        if (direction == 0u) {
            return vec3<f32>(span, 0.0, offset);
        }
        return vec3<f32>(offset, 0.0, span);
    }
    if (plane == 1u) {
        if (direction == 0u) {
            return vec3<f32>(span, offset, 0.0);
        }
        return vec3<f32>(offset, span, 0.0);
    }
    if (direction == 0u) {
        return vec3<f32>(0.0, offset, span);
    }
    return vec3<f32>(0.0, span, offset);
}

fn plane_normal(plane: u32) -> vec3<f32> {
    if (plane == 0u) {
        return vec3<f32>(0.0, 1.0, 0.0);
    }
    if (plane == 1u) {
        return vec3<f32>(0.0, 0.0, 1.0);
    }
    return vec3<f32>(1.0, 0.0, 0.0);
}

fn plane_visibility(plane: u32) -> f32 {
    let camera_to_grid = -grid.camera_position;
    let view_dir = camera_to_grid / max(length(camera_to_grid), 0.00001);
    let incidence = abs(dot(view_dir, plane_normal(plane)));
    return smoothstep(0.04, 0.18, incidence);
}

fn is_x_axis(plane: u32, direction: u32) -> bool {
    return (plane == 0u && direction == 0u) || (plane == 1u && direction == 0u);
}

fn is_y_axis(plane: u32, direction: u32) -> bool {
    return (plane == 1u && direction == 1u) || (plane == 2u && direction == 1u);
}

fn is_z_axis(plane: u32, direction: u32) -> bool {
    return (plane == 0u && direction == 1u) || (plane == 2u && direction == 0u);
}

fn line_color(plane: u32, direction: u32, coord_index: u32, half_steps: u32) -> vec4<f32> {
    let on_axis = coord_index == half_steps;
    let major = (coord_index % GRID_MAJOR_EVERY) == 0u;
    var color = vec3<f32>(0.34, 0.38, 0.42);
    var alpha = 0.10;

    if (major) {
        color = vec3<f32>(0.42, 0.47, 0.52);
        alpha = 0.18;
    }
    if (on_axis && is_x_axis(plane, direction)) {
        color = vec3<f32>(0.72, 0.24, 0.22);
        alpha = 0.42;
    }
    if (on_axis && is_y_axis(plane, direction)) {
        color = vec3<f32>(0.25, 0.72, 0.32);
        alpha = 0.42;
    }
    if (on_axis && is_z_axis(plane, direction)) {
        color = vec3<f32>(0.24, 0.48, 0.88);
        alpha = 0.42;
    }

    return vec4<f32>(color, alpha * plane_visibility(plane));
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    return in.color;
}
"#;

/// PBR forward renderer
pub struct PbrRenderer {
    render_pipelines: PbrPipelineSet,
    skinned_render_pipelines: PbrPipelineSet,
    camera_bind_group_layout: wgpu::BindGroupLayout,
    model_bind_group_layout: wgpu::BindGroupLayout,
    light_bind_group_layout: wgpu::BindGroupLayout,
    joint_bind_group_layout: wgpu::BindGroupLayout,
    environment_background_bind_group_layout: wgpu::BindGroupLayout,
    environment_background_pipeline: wgpu::RenderPipeline,
    color_convert_bind_group_layout: wgpu::BindGroupLayout,
    color_convert_pipeline: wgpu::RenderPipeline,
    viewport_grid_pipeline: wgpu::RenderPipeline,
    post_process_chain: PostProcessChain,
    render_target_pool: RenderTargetPool,
    ctx: Arc<GpuContext>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct EnvironmentBackgroundSettings {
    pub rotation_deg: f32,
    pub intensity: f32,
    pub exposure: f32,
}

impl Default for EnvironmentBackgroundSettings {
    fn default() -> Self {
        Self {
            rotation_deg: 0.0,
            intensity: 1.0,
            exposure: 0.0,
        }
    }
}

pub struct EnvironmentBackground {
    _texture: wgpu::Texture,
    view: wgpu::TextureView,
    sampler: wgpu::Sampler,
    width: u32,
    height: u32,
    settings: EnvironmentBackgroundSettings,
}

impl EnvironmentBackground {
    pub fn width(&self) -> u32 {
        self.width
    }

    pub fn height(&self) -> u32 {
        self.height
    }

    pub fn settings(&self) -> EnvironmentBackgroundSettings {
        self.settings
    }
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
struct ViewportGridUniformsGpu {
    view_projection: [[f32; 4]; 4],
    inv_view_projection: [[f32; 4]; 4],
    camera_position: [f32; 3],
    extent: f32,
    viewport_size: [f32; 2],
    step: f32,
    _padding: f32,
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct EnvironmentBackgroundUniformsGpu {
    inv_view_projection: [[f32; 4]; 4],
    camera_position: [f32; 3],
    rotation_rad: f32,
    intensity: f32,
    exposure: f32,
    _padding: [f32; 2],
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
    // WGSL uniform layout aligns vec3<u32> on a 16-byte boundary, so the
    // shader-side `_padding: vec3<u32>` does NOT pack tightly after `count`.
    // It lives at offset 1040 (count + 12 bytes), occupies 12 bytes, and the
    // struct rounds up to a 16-byte multiple — total 1056 bytes.
    //
    // The Rust struct must mirror that exact size or wgpu reports
    // LateMinBufferBindingSizeMismatch (shader_size 1056, bound_size 1040)
    // and the encoder is invalidated mid-pass. We use 7 u32s of trailing
    // padding (28 bytes after `count`) so 16*64 + 4 + 28 = 1056.
    _padding: [u32; 7],
}

// Compile-time guards: keep the Rust uniform layouts in lockstep with the
// WGSL struct sizes the shaders bind to. WGSL uniform layout aligns vec3 on
// 16-byte boundaries and rounds the outer struct to a 16-byte multiple, so
// these numbers are NOT just `sizeof(field) summed`.
const _: () = {
    // Camera: mat4 (64) + mat4 (64) + vec3 padded to vec4 (16) = 144
    assert!(std::mem::size_of::<CameraUniformsGpu>() == 144);
    // Viewport grid: 2 mat4 (128) + vec3+f32 (16) + vec2+f32+f32 (16) = 160
    assert!(std::mem::size_of::<ViewportGridUniformsGpu>() == 160);
    // Environment background: mat4 (64) + vec3+f32 (16) + 4 scalars (16) = 96
    assert!(std::mem::size_of::<EnvironmentBackgroundUniformsGpu>() == 96);
    // Model: mat4 (64) + 3 vec4 (48) = 112
    assert!(std::mem::size_of::<ModelUniformsGpu>() == 112);
    // Light: vec3+u32 + vec3+f32 + vec3+f32 + 3*f32 + vec2 = 4*16 = 64
    assert!(std::mem::size_of::<LightGpu>() == 64);
    // LightUniforms: 16 lights (1024) + count (4) + vec3 alignment+padding (28) = 1056
    assert!(std::mem::size_of::<LightUniformsGpu>() == 1056);
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct DrawPipelineKey {
    skinned: bool,
    alpha_mode: GpuAlphaMode,
    double_sided: bool,
}

struct PbrPipelineSet {
    opaque_single_sided: wgpu::RenderPipeline,
    opaque_double_sided: wgpu::RenderPipeline,
    mask_single_sided: wgpu::RenderPipeline,
    mask_double_sided: wgpu::RenderPipeline,
    blend_single_sided: wgpu::RenderPipeline,
    blend_double_sided: wgpu::RenderPipeline,
}

impl PbrPipelineSet {
    fn get(&self, alpha_mode: GpuAlphaMode, double_sided: bool) -> &wgpu::RenderPipeline {
        match (alpha_mode, double_sided) {
            (GpuAlphaMode::Opaque, false) => &self.opaque_single_sided,
            (GpuAlphaMode::Opaque, true) => &self.opaque_double_sided,
            (GpuAlphaMode::Mask, false) => &self.mask_single_sided,
            (GpuAlphaMode::Mask, true) => &self.mask_double_sided,
            (GpuAlphaMode::Blend, false) => &self.blend_single_sided,
            (GpuAlphaMode::Blend, true) => &self.blend_double_sided,
        }
    }
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

        let shader_src = include_str!("../shaders/pbr_forward.wgsl");
        let shader_module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("pbr_forward_shader"),
            source: wgpu::ShaderSource::Wgsl(shader_src.into()),
        });

        let skinned_shader_src = include_str!("../shaders/pbr_forward_skinned.wgsl");
        let skinned_shader_module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("pbr_forward_skinned_shader"),
            source: wgpu::ShaderSource::Wgsl(skinned_shader_src.into()),
        });

        let render_pipelines = create_pbr_pipeline_set(
            device,
            &pipeline_layout,
            &shader_module,
            &[super::vertex::PbrVertex::buffer_layout()],
            "pbr",
        );

        let skinned_render_pipelines = create_pbr_pipeline_set(
            device,
            &skinned_pipeline_layout,
            &skinned_shader_module,
            &[super::vertex::SkinnedPbrVertex::buffer_layout()],
            "pbr_skinned",
        );

        let environment_background_bgl =
            device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("environment_background_bgl"),
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
                        ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                        count: None,
                    },
                ],
            });
        let environment_background_pipeline_layout =
            device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                label: Some("environment_background_pipeline_layout"),
                bind_group_layouts: &[&environment_background_bgl],
                push_constant_ranges: &[],
            });
        let environment_background_shader =
            device.create_shader_module(wgpu::ShaderModuleDescriptor {
                label: Some("environment_background_shader"),
                source: wgpu::ShaderSource::Wgsl(ENVIRONMENT_BACKGROUND_SHADER.into()),
            });
        let environment_background_pipeline =
            device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
                label: Some("environment_background_pipeline"),
                layout: Some(&environment_background_pipeline_layout),
                vertex: wgpu::VertexState {
                    module: &environment_background_shader,
                    entry_point: "vs_main",
                    buffers: &[],
                },
                fragment: Some(wgpu::FragmentState {
                    module: &environment_background_shader,
                    entry_point: "fs_main",
                    targets: &[Some(wgpu::ColorTargetState {
                        format: wgpu::TextureFormat::Rgba16Float,
                        blend: None,
                        write_mask: wgpu::ColorWrites::ALL,
                    })],
                }),
                primitive: wgpu::PrimitiveState::default(),
                depth_stencil: None,
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

        let viewport_grid_pipeline_layout =
            device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                label: Some("viewport_grid_pipeline_layout"),
                bind_group_layouts: &[&camera_bgl],
                push_constant_ranges: &[],
            });
        let viewport_grid_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("viewport_grid_shader"),
            source: wgpu::ShaderSource::Wgsl(VIEWPORT_GRID_SHADER.into()),
        });
        let viewport_grid_pipeline =
            device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
                label: Some("viewport_grid_pipeline"),
                layout: Some(&viewport_grid_pipeline_layout),
                vertex: wgpu::VertexState {
                    module: &viewport_grid_shader,
                    entry_point: "vs_main",
                    buffers: &[],
                },
                fragment: Some(wgpu::FragmentState {
                    module: &viewport_grid_shader,
                    entry_point: "fs_main",
                    targets: &[Some(wgpu::ColorTargetState {
                        format: wgpu::TextureFormat::Rgba16Float,
                        blend: Some(wgpu::BlendState::ALPHA_BLENDING),
                        write_mask: wgpu::ColorWrites::ALL,
                    })],
                }),
                primitive: wgpu::PrimitiveState {
                    topology: wgpu::PrimitiveTopology::LineList,
                    strip_index_format: None,
                    front_face: wgpu::FrontFace::Ccw,
                    cull_mode: None,
                    polygon_mode: wgpu::PolygonMode::Fill,
                    unclipped_depth: false,
                    conservative: false,
                },
                depth_stencil: Some(wgpu::DepthStencilState {
                    format: wgpu::TextureFormat::Depth32Float,
                    depth_write_enabled: false,
                    depth_compare: wgpu::CompareFunction::Less,
                    stencil: wgpu::StencilState::default(),
                    bias: wgpu::DepthBiasState {
                        constant: 0,
                        slope_scale: 0.0,
                        clamp: 0.0,
                    },
                }),
                multisample: wgpu::MultisampleState::default(),
                multiview: None,
            });

        (
            Self {
                render_pipelines,
                skinned_render_pipelines,
                camera_bind_group_layout: camera_bgl,
                model_bind_group_layout: model_bgl,
                light_bind_group_layout: light_bgl,
                joint_bind_group_layout: joint_bgl,
                environment_background_bind_group_layout: environment_background_bgl,
                environment_background_pipeline,
                color_convert_bind_group_layout: color_convert_bgl,
                color_convert_pipeline,
                viewport_grid_pipeline,
                post_process_chain: PostProcessChain::new(Arc::clone(&ctx)),
                render_target_pool: RenderTargetPool::default(),
                ctx,
            },
            material_bgl,
        )
    }

    pub fn render_target_pool_snapshot(&self) -> RenderTargetPoolSnapshot {
        self.render_target_pool.snapshot()
    }

    pub fn create_environment_background(
        &self,
        width: u32,
        height: u32,
        rgba_data: &[u8],
        settings: EnvironmentBackgroundSettings,
    ) -> Result<EnvironmentBackground, PbrRenderError> {
        if width == 0 || height == 0 {
            return Err(PbrRenderError::RenderFailed(
                "environment background dimensions must be non-zero".to_string(),
            ));
        }
        let expected_len = (width as usize)
            .saturating_mul(height as usize)
            .saturating_mul(4);
        if rgba_data.len() != expected_len {
            return Err(PbrRenderError::RenderFailed(format!(
                "environment background RGBA data length mismatch: expected {expected_len}, got {}",
                rgba_data.len()
            )));
        }

        let device = self.ctx.device();
        let size = wgpu::Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        };
        let texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("environment_background_texture"),
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
                texture: &texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            rgba_data,
            wgpu::ImageDataLayout {
                offset: 0,
                bytes_per_row: Some(4 * width),
                rows_per_image: Some(height),
            },
            size,
        );
        let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
        let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("environment_background_sampler"),
            address_mode_u: wgpu::AddressMode::Repeat,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            address_mode_w: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            mipmap_filter: wgpu::FilterMode::Nearest,
            ..Default::default()
        });
        Ok(EnvironmentBackground {
            _texture: texture,
            view,
            sampler,
            width,
            height,
            settings,
        })
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
        self.render_from_render_world_with_environment(
            render_world,
            asset_cache,
            camera_params,
            output_size,
            background_color,
            None,
        )
    }

    /// Render an already-extracted Render World with optional environment background.
    pub fn render_from_render_world_with_environment(
        &self,
        render_world: &RenderWorld,
        asset_cache: &AssetCache,
        camera_params: &CameraParams,
        output_size: (u32, u32),
        background_color: Option<[f32; 4]>,
        environment_background: Option<&EnvironmentBackground>,
    ) -> Result<SceneRenderOutput, PbrRenderError> {
        let descriptor = default_pbr_viewport_descriptor();
        self.render_viewport_from_render_world(
            render_world,
            asset_cache,
            camera_params,
            output_size,
            background_color,
            environment_background,
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
            None,
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
        environment_background: Option<&EnvironmentBackground>,
        descriptor: &ViewportDescriptor,
        graph_output: ViewportRenderGraphOutput,
    ) -> Result<SceneRenderOutput, PbrRenderError> {
        let plan = build_viewport_render_graph(descriptor, graph_output)?;
        let render_scale =
            render_scale_for_viewport(descriptor, graph_output, plan.post_process, output_size);
        let scaled_output_size = scaled_render_output_size(output_size, render_scale);
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
            viewport: descriptor,
            output_size,
            scaled_output_size,
            background_color,
            environment_background,
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
        descriptor: &ViewportDescriptor,
        encoder: &mut wgpu::CommandEncoder,
        environment_background: Option<&EnvironmentBackground>,
    ) -> Result<SceneRenderOutput, PbrRenderError> {
        let (width, height) = output_size;
        let device = self.ctx.device();

        // Create render targets
        let color_texture = self.acquire_color_target(
            "pbr_color_target",
            width,
            height,
            wgpu::TextureFormat::Rgba16Float,
        );
        let color_view = color_texture.create_view(&wgpu::TextureViewDescriptor::default());

        let depth_texture = self.acquire_depth_target("pbr_depth_target", width, height);
        let depth_view = depth_texture.create_view(&wgpu::TextureViewDescriptor::default());

        // Pre-collect draw data (buffers + bind groups must outlive render pass).
        // We do this before allocating camera/light buffers so the empty case
        // can skip those uploads entirely.
        let draw_calls = self.collect_draw_calls(render_world, asset_cache, device, descriptor);

        // Camera + light uniforms only matter when at least one draw call will
        // actually consume them. The clear-only fast path below skips this work.
        let aspect = width as f32 / height as f32;
        let bindings = if draw_calls.is_empty() {
            None
        } else {
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

            let light_uniforms = Self::collect_lights(render_world);
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
            // Buffers must outlive the render pass; bind groups borrow them.
            Some((
                camera_buffer,
                camera_bind_group,
                light_buffer,
                light_bind_group,
            ))
        };
        let environment_background_binding = environment_background.map(|environment_background| {
            self.create_environment_background_binding(
                camera_params,
                output_size,
                environment_background,
            )
        });

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

            if let Some(environment_background_binding) = &environment_background_binding {
                render_pass.set_pipeline(&self.environment_background_pipeline);
                render_pass.set_bind_group(0, &environment_background_binding.bind_group, &[]);
                render_pass.draw(0..3, 0..1);
            }

            // Clear-only fast path. When there is nothing to draw (empty scene,
            // or a scene whose meshes have not finished uploading to the asset
            // cache yet), do NOT bind a pipeline or any bind groups: wgpu
            // performs pipeline-vs-bind-group layout validation lazily, and on
            // the Metal backend any partially-bound state without a draw call
            // marks the encoder as invalid, cascading into copy_texture_to_texture
            // and finish() failures. Letting the LoadOp::Clear settle on its own
            // is sufficient and produces a valid (background-colored) frame.
            if let Some((_camera_buffer, camera_bind_group, _light_buffer, light_bind_group)) =
                &bindings
            {
                render_pass.set_bind_group(0, camera_bind_group, &[]);
                render_pass.set_bind_group(3, light_bind_group, &[]);

                // Draw opaque/masked geometry first; blended surfaces render
                // after depth has been established and do not write depth.
                let mut current_pipeline: Option<DrawPipelineKey> = None;

                for call in &draw_calls {
                    if current_pipeline != Some(call.pipeline_key) {
                        render_pass.set_pipeline(self.pipeline_for(call.pipeline_key));
                        current_pipeline = Some(call.pipeline_key);
                        // Re-bind shared groups after pipeline switch
                        render_pass.set_bind_group(0, camera_bind_group, &[]);
                        render_pass.set_bind_group(3, light_bind_group, &[]);
                    }

                    render_pass.set_bind_group(1, &call.model_bind_group, &[]);
                    render_pass.set_bind_group(2, call.material_binding.bind_group(), &[]);

                    if call.pipeline_key.skinned {
                        if let Some(ref jbg) = call.joint_bind_group {
                            render_pass.set_bind_group(4, jbg, &[]);
                        }
                    }

                    render_pass.set_vertex_buffer(0, call.vertex_buffer.slice(..));
                    render_pass.set_index_buffer(call.index_buffer.slice(..), call.index_format);
                    render_pass.draw_indexed(0..call.index_count, 0, 0..1);
                }
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

    fn create_environment_background_binding(
        &self,
        camera_params: &CameraParams,
        output_size: (u32, u32),
        environment_background: &EnvironmentBackground,
    ) -> EnvironmentBackgroundBinding {
        let (width, height) = output_size;
        let aspect = width as f32 / height.max(1) as f32;
        let view_projection = camera_params.projection_matrix(aspect) * camera_params.view_matrix();
        let uniforms = EnvironmentBackgroundUniformsGpu {
            inv_view_projection: view_projection.inverse().to_cols_array_2d(),
            camera_position: camera_params.position.to_array(),
            rotation_rad: environment_background.settings.rotation_deg.to_radians(),
            intensity: environment_background.settings.intensity.max(0.0),
            exposure: environment_background.settings.exposure.clamp(-16.0, 16.0),
            _padding: [0.0; 2],
        };
        let uniform_buffer =
            self.ctx
                .device()
                .create_buffer_init(&wgpu::util::BufferInitDescriptor {
                    label: Some("environment_background_uniforms"),
                    contents: bytemuck::bytes_of(&uniforms),
                    usage: wgpu::BufferUsages::UNIFORM,
                });
        let bind_group = self
            .ctx
            .device()
            .create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("environment_background_bg"),
                layout: &self.environment_background_bind_group_layout,
                entries: &[
                    wgpu::BindGroupEntry {
                        binding: 0,
                        resource: uniform_buffer.as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: 1,
                        resource: wgpu::BindingResource::TextureView(&environment_background.view),
                    },
                    wgpu::BindGroupEntry {
                        binding: 2,
                        resource: wgpu::BindingResource::Sampler(&environment_background.sampler),
                    },
                ],
            });
        EnvironmentBackgroundBinding {
            _uniform_buffer: uniform_buffer,
            bind_group,
        }
    }

    fn acquire_color_target(
        &self,
        label: &str,
        width: u32,
        height: u32,
        format: wgpu::TextureFormat,
    ) -> RenderTargetLease {
        self.render_target_pool.acquire(
            self.ctx.device(),
            label,
            width,
            height,
            format,
            wgpu::TextureUsages::RENDER_ATTACHMENT
                | wgpu::TextureUsages::TEXTURE_BINDING
                | wgpu::TextureUsages::COPY_SRC
                | wgpu::TextureUsages::COPY_DST,
        )
    }

    fn acquire_depth_target(&self, label: &str, width: u32, height: u32) -> RenderTargetLease {
        self.render_target_pool.acquire(
            self.ctx.device(),
            label,
            width,
            height,
            wgpu::TextureFormat::Depth32Float,
            wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
        )
    }

    /// Collect light data from Render World into GPU uniform struct.
    fn collect_lights(render_world: &RenderWorld) -> LightUniformsGpu {
        let mut uniforms = LightUniformsGpu {
            lights: [LightGpu::zeroed(); MAX_LIGHTS],
            count: 0,
            _padding: [0; 7],
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

        // Add a neutral editor light rig when the asset has no authored lights.
        if idx == 0 {
            uniforms.lights[0] = LightGpu {
                position: [0.0; 3],
                kind: 0, // directional
                direction: [0.35, -1.0, 0.45],
                intensity: DEFAULT_KEY_LIGHT_INTENSITY,
                color: [1.0, 1.0, 1.0],
                range: 0.0,
                inner_cone: 0.0,
                outer_cone: 0.0,
                _padding: [0.0; 2],
            };
            uniforms.lights[1] = LightGpu {
                position: [0.0; 3],
                kind: 0, // directional
                direction: [-0.8, -0.45, -0.2],
                intensity: DEFAULT_FILL_LIGHT_INTENSITY,
                color: [0.82, 0.9, 1.0],
                range: 0.0,
                inner_cone: 0.0,
                outer_cone: 0.0,
                _padding: [0.0; 2],
            };
            uniforms.lights[2] = LightGpu {
                position: [0.0; 3],
                kind: 0, // directional
                direction: [0.15, -0.25, -1.0],
                intensity: DEFAULT_RIM_LIGHT_INTENSITY,
                color: [1.0, 0.92, 0.86],
                range: 0.0,
                inner_cone: 0.0,
                outer_cone: 0.0,
                _padding: [0.0; 2],
            };
            idx = 3;
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
        descriptor: &ViewportDescriptor,
    ) -> Vec<DrawCall<'a>> {
        let mut calls = Vec::new();
        let mut draw_items = render_world.draw_list.clone();
        draw_items.sort_by_key(|item| item.sort_key);
        let clay_material_override = clay_material_uniforms_for_descriptor(descriptor);

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
            let material_uniforms = clay_material_override.unwrap_or(gpu_material.uniforms);
            let material_buffer = clay_material_override.map(|uniforms| {
                device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                    label: Some("pbr_clay_material_uniforms"),
                    contents: bytemuck::bytes_of(&uniforms),
                    usage: wgpu::BufferUsages::UNIFORM,
                })
            });
            let material_bind_group = material_buffer.as_ref().map(|buffer| {
                asset_cache.create_override_material_bind_group(
                    buffer,
                    gpu_material.normal_texture.as_ref().map(|(_, view)| view),
                    gpu_material
                        .occlusion_texture
                        .as_ref()
                        .map(|(_, view)| view),
                )
            });

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
                material_binding: match material_bind_group {
                    Some(bind_group) => DrawMaterialBinding::Owned(bind_group),
                    None => DrawMaterialBinding::Borrowed(&gpu_material.bind_group),
                },
                vertex_buffer: &gpu_mesh.vertex_buffer,
                index_buffer: &gpu_mesh.index_buffer,
                index_count: gpu_mesh.index_count,
                index_format: gpu_mesh.index_format,
                pipeline_key: DrawPipelineKey {
                    skinned: gpu_mesh.is_skinned && joint_bind_group.is_some(),
                    alpha_mode: material_alpha_mode(material_uniforms),
                    double_sided: gpu_material.pipeline_state.double_sided,
                },
                _material_buffer: material_buffer,
                joint_bind_group,
                _joint_buffer: joint_buffer,
            });
        }

        calls.sort_by_key(|call| call.sort_key());
        calls
    }

    fn pipeline_for(&self, key: DrawPipelineKey) -> &wgpu::RenderPipeline {
        if key.skinned {
            self.skinned_render_pipelines
                .get(key.alpha_mode, key.double_sided)
        } else {
            self.render_pipelines.get(key.alpha_mode, key.double_sided)
        }
    }

    fn record_viewport_grid_pass(
        &self,
        current: &SceneRenderOutput,
        camera_params: &CameraParams,
        helper_view: &wgpu::TextureView,
        encoder: &mut wgpu::CommandEncoder,
    ) {
        let device = self.ctx.device();
        let aspect = current.width as f32 / current.height.max(1) as f32;
        let view_projection = camera_params.projection_matrix(aspect) * camera_params.view_matrix();
        let grid_uniforms = ViewportGridUniformsGpu {
            view_projection: view_projection.to_cols_array_2d(),
            inv_view_projection: view_projection.inverse().to_cols_array_2d(),
            camera_position: camera_params.position.to_array(),
            extent: VIEWPORT_GRID_EXTENT,
            viewport_size: [current.width as f32, current.height as f32],
            step: VIEWPORT_GRID_STEP,
            _padding: 0.0,
        };
        let grid_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("viewport_grid_uniform_buffer"),
            contents: bytemuck::bytes_of(&grid_uniforms),
            usage: wgpu::BufferUsages::UNIFORM,
        });
        let grid_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("viewport_grid_bg"),
            layout: &self.camera_bind_group_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: grid_buffer.as_entire_binding(),
            }],
        });

        let depth_view = current
            .depth_texture
            .create_view(&wgpu::TextureViewDescriptor::default());
        let mut render_pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("viewport_grid_pass"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: helper_view,
                resolve_target: None,
                ops: wgpu::Operations {
                    load: wgpu::LoadOp::Load,
                    store: wgpu::StoreOp::Store,
                },
            })],
            depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                view: &depth_view,
                depth_ops: Some(wgpu::Operations {
                    load: wgpu::LoadOp::Load,
                    store: wgpu::StoreOp::Store,
                }),
                stencil_ops: None,
            }),
            timestamp_writes: None,
            occlusion_query_set: None,
        });
        render_pass.set_pipeline(&self.viewport_grid_pipeline);
        render_pass.set_bind_group(0, &grid_bind_group, &[]);
        render_pass.draw(0..VIEWPORT_GRID_VERTEX_COUNT, 0..1);
    }
}

fn create_pbr_pipeline_set(
    device: &wgpu::Device,
    layout: &wgpu::PipelineLayout,
    shader_module: &wgpu::ShaderModule,
    vertex_buffers: &[wgpu::VertexBufferLayout<'_>],
    label_prefix: &str,
) -> PbrPipelineSet {
    PbrPipelineSet {
        opaque_single_sided: create_pbr_pipeline(
            device,
            layout,
            shader_module,
            vertex_buffers,
            &format!("{label_prefix}_opaque_single_sided"),
            GpuAlphaMode::Opaque,
            false,
        ),
        opaque_double_sided: create_pbr_pipeline(
            device,
            layout,
            shader_module,
            vertex_buffers,
            &format!("{label_prefix}_opaque_double_sided"),
            GpuAlphaMode::Opaque,
            true,
        ),
        mask_single_sided: create_pbr_pipeline(
            device,
            layout,
            shader_module,
            vertex_buffers,
            &format!("{label_prefix}_mask_single_sided"),
            GpuAlphaMode::Mask,
            false,
        ),
        mask_double_sided: create_pbr_pipeline(
            device,
            layout,
            shader_module,
            vertex_buffers,
            &format!("{label_prefix}_mask_double_sided"),
            GpuAlphaMode::Mask,
            true,
        ),
        blend_single_sided: create_pbr_pipeline(
            device,
            layout,
            shader_module,
            vertex_buffers,
            &format!("{label_prefix}_blend_single_sided"),
            GpuAlphaMode::Blend,
            false,
        ),
        blend_double_sided: create_pbr_pipeline(
            device,
            layout,
            shader_module,
            vertex_buffers,
            &format!("{label_prefix}_blend_double_sided"),
            GpuAlphaMode::Blend,
            true,
        ),
    }
}

fn create_pbr_pipeline(
    device: &wgpu::Device,
    layout: &wgpu::PipelineLayout,
    shader_module: &wgpu::ShaderModule,
    vertex_buffers: &[wgpu::VertexBufferLayout<'_>],
    label: &str,
    alpha_mode: GpuAlphaMode,
    double_sided: bool,
) -> wgpu::RenderPipeline {
    let depth_stencil = wgpu::DepthStencilState {
        format: wgpu::TextureFormat::Depth32Float,
        depth_write_enabled: alpha_mode != GpuAlphaMode::Blend,
        depth_compare: wgpu::CompareFunction::Less,
        stencil: wgpu::StencilState::default(),
        bias: wgpu::DepthBiasState::default(),
    };

    let primitive = wgpu::PrimitiveState {
        topology: wgpu::PrimitiveTopology::TriangleList,
        strip_index_format: None,
        front_face: wgpu::FrontFace::Ccw,
        cull_mode: (!double_sided).then_some(wgpu::Face::Back),
        polygon_mode: wgpu::PolygonMode::Fill,
        unclipped_depth: false,
        conservative: false,
    };

    let fragment_targets = [Some(wgpu::ColorTargetState {
        format: wgpu::TextureFormat::Rgba16Float,
        blend: (alpha_mode == GpuAlphaMode::Blend).then_some(wgpu::BlendState::ALPHA_BLENDING),
        write_mask: wgpu::ColorWrites::ALL,
    })];

    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some(label),
        layout: Some(layout),
        vertex: wgpu::VertexState {
            module: shader_module,
            entry_point: "vs_main",
            buffers: vertex_buffers,
        },
        fragment: Some(wgpu::FragmentState {
            module: shader_module,
            entry_point: "fs_main",
            targets: &fragment_targets,
        }),
        primitive,
        depth_stencil: Some(depth_stencil),
        multisample: wgpu::MultisampleState::default(),
        multiview: None,
    })
}

struct PbrRenderGraphPassExecutor<'a> {
    renderer: &'a PbrRenderer,
    render_world: &'a RenderWorld,
    asset_cache: &'a AssetCache,
    camera_params: &'a CameraParams,
    viewport: &'a ViewportDescriptor,
    output_size: (u32, u32),
    scaled_output_size: (u32, u32),
    background_color: Option<[f32; 4]>,
    environment_background: Option<&'a EnvironmentBackground>,
    post_process_settings: PostProcessSettings,
    output: Option<SceneRenderOutput>,
    intermediate_textures: Vec<RenderTargetLease>,
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
                    self.scaled_output_size,
                    self.background_color,
                    self.viewport,
                    encoder,
                    self.environment_background,
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
        self.renderer.record_viewport_grid_pass(
            &current,
            self.camera_params,
            &helper_view,
            encoder,
        );

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
        let processed_texture = self.create_graph_color_texture_with_size(
            "pbr_post_process_target",
            self.output_size,
            wgpu::TextureFormat::Rgba16Float,
        );
        let processed_view = processed_texture.create_view(&wgpu::TextureViewDescriptor::default());

        self.renderer.post_process_chain.record_process(
            &current.color_view,
            &processed_view,
            self.output_size.0,
            self.output_size.1,
            &self.post_process_settings,
            encoder,
        );

        self.intermediate_textures.push(current.color_texture);
        self.intermediate_views.push(current.color_view);
        self.output = Some(SceneRenderOutput {
            color_texture: processed_texture,
            color_view: processed_view,
            depth_texture: current.depth_texture,
            width: self.output_size.0,
            height: self.output_size.1,
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
    ) -> RenderTargetLease {
        self.create_graph_color_texture_with_size(label, (current.width, current.height), format)
    }

    fn create_graph_color_texture_with_size(
        &self,
        label: &str,
        size: (u32, u32),
        format: wgpu::TextureFormat,
    ) -> RenderTargetLease {
        self.renderer
            .acquire_color_target(label, size.0, size.1, format)
    }
}

fn default_pbr_viewport_descriptor() -> ViewportDescriptor {
    ViewportDescriptor {
        viewport_id: "main".to_string(),
        scene_id: "default".to_string(),
        render_mode: ViewportRenderMode::Pbr,
        debug_view: None,
        fps: 60,
        color_space: SceneColorSpace::Srgb,
        tone_mapping: SceneToneMapping::Aces,
        post_process: ViewportPostProcess::default(),
        layer_mask: None,
        work_mode: ViewportWorkMode::EditParametric,
        helper_passes: true,
        lookdev: None,
        h264: None,
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
        anti_aliasing_strength: if descriptor.post_process.taa {
            0.65
        } else {
            0.0
        },
        ..PostProcessSettings::default()
    }
}

fn render_scale_for_viewport(
    descriptor: &ViewportDescriptor,
    graph_output: ViewportRenderGraphOutput,
    post_process_enabled: bool,
    output_size: (u32, u32),
) -> f32 {
    if graph_output != ViewportRenderGraphOutput::RealtimeStream || !post_process_enabled {
        return 1.0;
    }
    if u64::from(output_size.0) * u64::from(output_size.1) > REALTIME_STREAM_SSAA_MAX_OUTPUT_PIXELS
    {
        return 1.0;
    }
    if descriptor.post_process.taa
        && matches!(
            descriptor.render_mode,
            ViewportRenderMode::Pbr | ViewportRenderMode::Clay
        )
    {
        REALTIME_STREAM_SSAA_SCALE
    } else {
        1.0
    }
}

fn scaled_render_output_size(output_size: (u32, u32), scale: f32) -> (u32, u32) {
    if scale <= 1.0 {
        return output_size;
    }
    (
        scaled_even_dimension(output_size.0, scale),
        scaled_even_dimension(output_size.1, scale),
    )
}

fn scaled_even_dimension(value: u32, scale: f32) -> u32 {
    let scaled = ((value as f32) * scale).round().max(value as f32) as u32;
    if scaled % 2 == 0 {
        scaled
    } else {
        scaled + 1
    }
}

fn clay_material_uniforms_for_descriptor(
    descriptor: &ViewportDescriptor,
) -> Option<MaterialUniforms> {
    if descriptor.render_mode != ViewportRenderMode::Clay
        && !matches!(
            descriptor.lookdev.as_ref().and_then(|settings| settings.material_override.as_ref()),
            Some(material_override) if material_override.kind == ViewportMaterialOverrideKind::Clay
        )
    {
        return None;
    }

    let material_override = descriptor
        .lookdev
        .as_ref()
        .and_then(|settings| settings.material_override.as_ref())
        .filter(|material_override| material_override.kind == ViewportMaterialOverrideKind::Clay);
    let color = material_override
        .and_then(|material_override| material_override.color)
        .map(|color| [color.x, color.y, color.z, 1.0])
        .unwrap_or(CLAY_BASE_COLOR);
    let roughness = material_override
        .and_then(|material_override| material_override.roughness)
        .unwrap_or(CLAY_ROUGHNESS)
        .clamp(0.04, 1.0);
    let metallic = material_override
        .and_then(|material_override| material_override.metallic)
        .unwrap_or(CLAY_METALLIC)
        .clamp(0.0, 1.0);
    let alpha = if material_override.and_then(|override_| override_.preserve_alpha) == Some(true) {
        color[3]
    } else {
        1.0
    };

    Some(MaterialUniforms {
        base_color_factor: [color[0], color[1], color[2], alpha],
        metallic_factor: metallic,
        roughness_factor: roughness,
        occlusion_strength: 1.0,
        alpha_cutoff: 0.0,
        alpha_mode: 0,
        _pad0: [0; 3],
        emissive_factor: [0.0, 0.0, 0.0],
        _pad1: 0.0,
    })
}

fn material_alpha_mode(uniforms: MaterialUniforms) -> GpuAlphaMode {
    match uniforms.alpha_mode {
        1 => GpuAlphaMode::Mask,
        2 => GpuAlphaMode::Blend,
        _ => GpuAlphaMode::Opaque,
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
    material_binding: DrawMaterialBinding<'a>,
    vertex_buffer: &'a wgpu::Buffer,
    index_buffer: &'a wgpu::Buffer,
    index_count: u32,
    index_format: wgpu::IndexFormat,
    pipeline_key: DrawPipelineKey,
    _material_buffer: Option<wgpu::Buffer>,
    joint_bind_group: Option<wgpu::BindGroup>,
    /// Owned buffer for joint matrices (must outlive render pass)
    _joint_buffer: Option<wgpu::Buffer>,
}

struct EnvironmentBackgroundBinding {
    _uniform_buffer: wgpu::Buffer,
    bind_group: wgpu::BindGroup,
}

enum DrawMaterialBinding<'a> {
    Borrowed(&'a wgpu::BindGroup),
    Owned(wgpu::BindGroup),
}

impl DrawMaterialBinding<'_> {
    fn bind_group(&self) -> &wgpu::BindGroup {
        match self {
            Self::Borrowed(bind_group) => bind_group,
            Self::Owned(bind_group) => bind_group,
        }
    }
}

impl DrawCall<'_> {
    fn sort_key(&self) -> u8 {
        match self.pipeline_key.alpha_mode {
            GpuAlphaMode::Opaque => 0,
            GpuAlphaMode::Mask => 1,
            GpuAlphaMode::Blend => 2,
        }
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_scene_uses_editor_light_rig() {
        let render_world = RenderWorld::default();
        let uniforms = PbrRenderer::collect_lights(&render_world);

        assert_eq!(uniforms.count, 3);
        assert_eq!(uniforms.lights[0].kind, 0);
        assert_eq!(uniforms.lights[1].kind, 0);
        assert_eq!(uniforms.lights[2].kind, 0);
        assert_eq!(uniforms.lights[0].intensity, DEFAULT_KEY_LIGHT_INTENSITY);
        assert_eq!(uniforms.lights[1].intensity, DEFAULT_FILL_LIGHT_INTENSITY);
        assert_eq!(uniforms.lights[2].intensity, DEFAULT_RIM_LIGHT_INTENSITY);
    }

    #[test]
    fn authored_lights_replace_editor_light_rig() {
        let mut render_world = RenderWorld::default();
        render_world.lights.push(crate::RenderLightData {
            node_id: "key_light".to_string(),
            kind: RenderLightKind::Point,
            world_transform: Mat4::from_translation(Vec3::new(1.0, 2.0, 3.0)),
            color: Vec3::new(1.0, 0.8, 0.6),
            intensity: 4.0,
            range: Some(12.0),
            inner_cone: None,
            outer_cone: None,
        });

        let uniforms = PbrRenderer::collect_lights(&render_world);

        assert_eq!(uniforms.count, 1);
        assert_eq!(uniforms.lights[0].kind, 1);
        assert_eq!(uniforms.lights[0].intensity, 4.0);
        assert_eq!(uniforms.lights[0].range, 12.0);
    }

    #[test]
    fn viewport_helper_grid_is_three_dimensional() {
        assert_eq!(VIEWPORT_GRID_STEP, 0.1);
        assert_eq!(VIEWPORT_GRID_EXTENT, 5.0);
        assert_eq!(VIEWPORT_GRID_VERTEX_COUNT, 1212);
        assert!(VIEWPORT_GRID_SHADER.contains("fn plane_point"));
        assert!(VIEWPORT_GRID_SHADER.contains("fn line_color"));
        assert!(VIEWPORT_GRID_SHADER.contains("fn plane_visibility"));
        assert!(VIEWPORT_GRID_SHADER.contains("plane == 0u"));
        assert!(VIEWPORT_GRID_SHADER.contains("plane == 1u"));
        assert!(VIEWPORT_GRID_SHADER.contains("return vec3<f32>(0.0, offset, span)"));
        assert!(VIEWPORT_GRID_SHADER.contains("return vec3<f32>(0.0, span, offset)"));
    }

    #[test]
    fn clay_material_override_is_render_only_and_keeps_shape_cues() {
        let mut descriptor = default_pbr_viewport_descriptor();
        descriptor.render_mode = ViewportRenderMode::Clay;
        descriptor.lookdev = Some(crate::ViewportLookDevSettings {
            render_mode: ViewportRenderMode::Clay,
            debug_view: None,
            material_override: Some(crate::ViewportMaterialOverride {
                kind: ViewportMaterialOverrideKind::Clay,
                color: Some(Vec3::new(0.7, 0.72, 0.74)),
                roughness: Some(0.92),
                metallic: Some(0.15),
                preserve_alpha: Some(false),
            }),
            helper_passes_enabled: None,
            show_grid: None,
            show_skeleton: None,
            show_normals: None,
        });

        let uniforms = clay_material_uniforms_for_descriptor(&descriptor).unwrap();

        assert_eq!(uniforms.base_color_factor, [0.7, 0.72, 0.74, 1.0]);
        assert_eq!(uniforms.roughness_factor, 0.92);
        assert_eq!(uniforms.metallic_factor, 0.15);
        assert_eq!(uniforms.occlusion_strength, 1.0);
        assert_eq!(uniforms.emissive_factor, [0.0, 0.0, 0.0]);
        assert_eq!(material_alpha_mode(uniforms), GpuAlphaMode::Opaque);
    }

    #[test]
    fn pbr_descriptor_does_not_create_material_override() {
        let descriptor = default_pbr_viewport_descriptor();

        assert!(clay_material_uniforms_for_descriptor(&descriptor).is_none());
    }

    #[test]
    fn realtime_stream_uses_ssaa_for_pbr_and_clay_taa_post_process() {
        let mut descriptor = default_pbr_viewport_descriptor();
        descriptor.post_process.taa = true;

        assert_eq!(
            render_scale_for_viewport(
                &descriptor,
                ViewportRenderGraphOutput::RealtimeStream,
                true,
                (1_920, 1_080)
            ),
            REALTIME_STREAM_SSAA_SCALE
        );

        descriptor.render_mode = ViewportRenderMode::Clay;
        assert_eq!(
            render_scale_for_viewport(
                &descriptor,
                ViewportRenderGraphOutput::RealtimeStream,
                true,
                (1_920, 1_080)
            ),
            REALTIME_STREAM_SSAA_SCALE
        );
    }

    #[test]
    fn ssaa_policy_keeps_non_realtime_or_non_post_process_paths_at_native_size() {
        let mut descriptor = default_pbr_viewport_descriptor();
        descriptor.post_process.taa = true;

        assert_eq!(
            render_scale_for_viewport(
                &descriptor,
                ViewportRenderGraphOutput::QualityCapture,
                true,
                (1_920, 1_080)
            ),
            1.0
        );
        assert_eq!(
            render_scale_for_viewport(
                &descriptor,
                ViewportRenderGraphOutput::RealtimeStream,
                false,
                (1_920, 1_080)
            ),
            1.0
        );

        descriptor.render_mode = ViewportRenderMode::Wireframe;
        assert_eq!(
            render_scale_for_viewport(
                &descriptor,
                ViewportRenderGraphOutput::RealtimeStream,
                true,
                (1_920, 1_080)
            ),
            1.0
        );
    }

    #[test]
    fn ssaa_policy_skips_high_dpr_output_sizes() {
        let mut descriptor = default_pbr_viewport_descriptor();
        descriptor.post_process.taa = true;

        assert_eq!(
            render_scale_for_viewport(
                &descriptor,
                ViewportRenderGraphOutput::RealtimeStream,
                true,
                (2_976, 2_160)
            ),
            1.0
        );
    }

    #[test]
    fn scaled_render_output_size_keeps_even_dimensions() {
        assert_eq!(scaled_render_output_size((1488, 1080), 1.0), (1488, 1080));
        assert_eq!(scaled_render_output_size((1488, 1080), 1.5), (2232, 1620));
        assert_eq!(scaled_render_output_size((101, 99), 1.5), (152, 150));
    }
}
