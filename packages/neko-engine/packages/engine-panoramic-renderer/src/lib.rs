//! Panoramic video projection renderer.
//!
//! The renderer consumes an RGBA texture produced by the decode/import path and
//! projects equirectangular content into a view texture. View state is mutable so
//! stream loops can update yaw/pitch/roll/FOV without recreating the decoder.

#[cfg(test)]
mod architecture_tests;

use std::sync::{Arc, Mutex};

use bytemuck::{Pod, Zeroable};
use neko_runtime_media::{PanoramaViewMode, PanoramaViewState};
use wgpu::util::DeviceExt;

use neko_engine_gpu::error::{Error, Result};
use neko_engine_gpu::{GpuContext, GpuReadbackTarget};
use neko_engine_types::{GpuFrameLease, GpuOutputHandle, VideoGpuFrame, VideoOutput};

/// Output texture format used by panoramic preview before encode handoff.
pub const PANORAMIC_RENDER_TARGET_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba16Float;

const PANORAMIC_SHADER: &str = r#"
struct ViewUniforms {
    output_size: vec2<f32>,
    yaw_rad: f32,
    pitch_rad: f32,
    roll_rad: f32,
    fov_rad: f32,
    mode: u32,
    _padding: u32,
}

@group(0) @binding(0) var<uniform> uniforms: ViewUniforms;
@group(0) @binding(1) var input_texture: texture_2d<f32>;
@group(0) @binding(2) var input_sampler: sampler;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
    var positions = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(3.0, -1.0),
        vec2<f32>(-1.0, 3.0)
    );
    var uvs = array<vec2<f32>, 3>(
        vec2<f32>(0.0, 1.0),
        vec2<f32>(2.0, 1.0),
        vec2<f32>(0.0, -1.0)
    );
    var out: VertexOutput;
    out.position = vec4<f32>(positions[vertex_index], 0.0, 1.0);
    out.uv = uvs[vertex_index];
    return out;
}

fn rotate_x(v: vec3<f32>, angle: f32) -> vec3<f32> {
    let c = cos(angle);
    let s = sin(angle);
    return vec3<f32>(v.x, v.y * c - v.z * s, v.y * s + v.z * c);
}

fn rotate_y(v: vec3<f32>, angle: f32) -> vec3<f32> {
    let c = cos(angle);
    let s = sin(angle);
    return vec3<f32>(v.x * c + v.z * s, v.y, -v.x * s + v.z * c);
}

fn rotate_z(v: vec3<f32>, angle: f32) -> vec3<f32> {
    let c = cos(angle);
    let s = sin(angle);
    return vec3<f32>(v.x * c - v.y * s, v.x * s + v.y * c, v.z);
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
    if (uniforms.mode == 1u) {
        return textureSample(input_texture, input_sampler, in.uv);
    }

    let aspect = uniforms.output_size.x / max(uniforms.output_size.y, 1.0);
    let ndc = vec2<f32>(in.uv.x * 2.0 - 1.0, 1.0 - in.uv.y * 2.0);
    let half_fov_tan = tan(uniforms.fov_rad * 0.5);
    var dir = normalize(vec3<f32>(
        ndc.x * aspect * half_fov_tan,
        ndc.y * half_fov_tan,
        -1.0
    ));
    dir = rotate_z(dir, uniforms.roll_rad);
    dir = rotate_x(dir, uniforms.pitch_rad);
    dir = rotate_y(dir, uniforms.yaw_rad);

    return textureSample(input_texture, input_sampler, equirect_uv(dir));
}
"#;

/// One projected panoramic frame.
pub struct PanoramicRenderOutput {
    /// Projected color texture.
    pub color_texture: wgpu::Texture,
    /// Projected color view.
    pub color_view: wgpu::TextureView,
    /// Width in pixels.
    pub width: u32,
    /// Height in pixels.
    pub height: u32,
}

impl PanoramicRenderOutput {
    /// Convert to a PipelineSink-compatible GPU video output.
    pub fn into_video_output(
        self,
        ctx: Arc<GpuContext>,
        pts: i64,
        duration: i64,
        frame_index: u64,
    ) -> VideoOutput {
        let readback = GpuReadbackTarget::new(ctx, self.color_texture, self.width, self.height);
        VideoOutput::GpuFrame(VideoGpuFrame {
            lease: GpuFrameLease::with_readback(
                GpuOutputHandle::Unsupported {
                    platform: std::env::consts::OS,
                    reason: "panoramic renderer native encoder interop is not implemented"
                        .to_string(),
                },
                Some(Arc::new(readback)),
            ),
            pts,
            duration,
            frame_index,
            width: self.width,
            height: self.height,
            diagnostics: None,
        })
    }
}

/// GPU renderer for panoramic preview projection.
pub struct PanoramicRenderer {
    ctx: Arc<GpuContext>,
    state: Mutex<PanoramicRendererState>,
}

struct PanoramicRendererState {
    view_state: PanoramaViewState,
    bind_group_layout: wgpu::BindGroupLayout,
    pipeline: wgpu::RenderPipeline,
    uniform_buffer: wgpu::Buffer,
    sampler: wgpu::Sampler,
}

#[repr(C)]
#[derive(Clone, Copy, Debug, Pod, Zeroable)]
struct PanoramicViewUniforms {
    output_size: [f32; 2],
    yaw_rad: f32,
    pitch_rad: f32,
    roll_rad: f32,
    fov_rad: f32,
    mode: u32,
    _padding: u32,
}

impl PanoramicRenderer {
    /// Validate a panoramic view state against currently implemented GPU projection modes.
    pub fn validate_view_state(view_state: &PanoramaViewState) -> Result<()> {
        validate_view_state(view_state)
    }

    /// Create a panoramic renderer with an initial view state.
    pub fn new(ctx: Arc<GpuContext>, view_state: PanoramaViewState) -> Self {
        let device = ctx.device();
        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("panoramic_bind_group_layout"),
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
                        sample_type: wgpu::TextureSampleType::Float { filterable: true },
                        view_dimension: wgpu::TextureViewDimension::D2,
                        multisampled: false,
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
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("panoramic_projection_shader"),
            source: wgpu::ShaderSource::Wgsl(PANORAMIC_SHADER.into()),
        });
        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("panoramic_pipeline_layout"),
            bind_group_layouts: &[&bind_group_layout],
            push_constant_ranges: &[],
        });
        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("panoramic_projection_pipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: "vs_main",
                buffers: &[],
            },
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: "fs_main",
                targets: &[Some(wgpu::ColorTargetState {
                    format: PANORAMIC_RENDER_TARGET_FORMAT,
                    blend: None,
                    write_mask: wgpu::ColorWrites::ALL,
                })],
            }),
            primitive: wgpu::PrimitiveState::default(),
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(),
            multiview: None,
        });
        let uniform_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("panoramic_view_uniforms"),
            contents: bytemuck::bytes_of(&uniforms_for_state(1, 1, &view_state)),
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        });
        let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("panoramic_sampler"),
            address_mode_u: wgpu::AddressMode::Repeat,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            address_mode_w: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            mipmap_filter: wgpu::FilterMode::Nearest,
            ..Default::default()
        });

        Self {
            ctx,
            state: Mutex::new(PanoramicRendererState {
                view_state,
                bind_group_layout,
                pipeline,
                uniform_buffer,
                sampler,
            }),
        }
    }

    /// Replace the view state without touching decoder or imported frame state.
    pub fn update_view_state(&self, view_state: PanoramaViewState) -> Result<()> {
        validate_view_state(&view_state)?;
        let mut state = self
            .state
            .lock()
            .map_err(|_| Error::Other("PanoramicRenderer state lock poisoned".to_string()))?;
        state.view_state = view_state;
        Ok(())
    }

    /// Return the currently active view state.
    pub fn view_state(&self) -> Result<PanoramaViewState> {
        let state = self
            .state
            .lock()
            .map_err(|_| Error::Other("PanoramicRenderer state lock poisoned".to_string()))?;
        Ok(state.view_state.clone())
    }

    /// Project an input RGBA texture view into a new output texture.
    pub fn render(
        &self,
        input_view: &wgpu::TextureView,
        width: u32,
        height: u32,
    ) -> Result<PanoramicRenderOutput> {
        if width == 0 || height == 0 {
            return Err(Error::InvalidParameter(
                "panoramic render output dimensions must be non-zero".to_string(),
            ));
        }

        let state = self
            .state
            .lock()
            .map_err(|_| Error::Other("PanoramicRenderer state lock poisoned".to_string()))?;
        validate_view_state(&state.view_state)?;
        let output = self.ctx.device().create_texture(&wgpu::TextureDescriptor {
            label: Some("panoramic_projection_output"),
            size: wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: PANORAMIC_RENDER_TARGET_FORMAT,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT
                | wgpu::TextureUsages::TEXTURE_BINDING
                | wgpu::TextureUsages::COPY_SRC,
            view_formats: &[],
        });
        let output_view = output.create_view(&wgpu::TextureViewDescriptor::default());

        self.ctx.queue().write_buffer(
            &state.uniform_buffer,
            0,
            bytemuck::bytes_of(&uniforms_for_state(width, height, &state.view_state)),
        );
        let bind_group = self
            .ctx
            .device()
            .create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("panoramic_bind_group"),
                layout: &state.bind_group_layout,
                entries: &[
                    wgpu::BindGroupEntry {
                        binding: 0,
                        resource: state.uniform_buffer.as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: 1,
                        resource: wgpu::BindingResource::TextureView(input_view),
                    },
                    wgpu::BindGroupEntry {
                        binding: 2,
                        resource: wgpu::BindingResource::Sampler(&state.sampler),
                    },
                ],
            });
        let mut encoder =
            self.ctx
                .device()
                .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                    label: Some("panoramic_projection_encoder"),
                });
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("panoramic_projection_pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &output_view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color::BLACK),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                occlusion_query_set: None,
                timestamp_writes: None,
            });
            pass.set_pipeline(&state.pipeline);
            pass.set_bind_group(0, &bind_group, &[]);
            pass.draw(0..3, 0..1);
        }
        drop(state);

        self.ctx.queue().submit(Some(encoder.finish()));
        Ok(PanoramicRenderOutput {
            color_texture: output,
            color_view: output_view,
            width,
            height,
        })
    }
}

fn validate_view_state(view_state: &PanoramaViewState) -> Result<()> {
    if !(1.0..=179.0).contains(&view_state.fov_deg) {
        return Err(Error::InvalidParameter(format!(
            "panoramic FOV must be in 1..=179 degrees, got {}",
            view_state.fov_deg
        )));
    }
    if view_state.mode == PanoramaViewMode::LittlePlanet {
        return Err(Error::UnsupportedCapability(
            "panoramic LittlePlanet mode requires stereographic projection shader support"
                .to_string(),
        ));
    }
    Ok(())
}

fn uniforms_for_state(
    width: u32,
    height: u32,
    view_state: &PanoramaViewState,
) -> PanoramicViewUniforms {
    PanoramicViewUniforms {
        output_size: [width as f32, height as f32],
        yaw_rad: view_state.yaw_deg.to_radians() as f32,
        pitch_rad: view_state.pitch_deg.to_radians() as f32,
        roll_rad: view_state.roll_deg.to_radians() as f32,
        fov_rad: view_state.fov_deg.clamp(1.0, 179.0).to_radians() as f32,
        mode: match view_state.mode {
            PanoramaViewMode::Flat => 1,
            PanoramaViewMode::Sphere => 0,
            PanoramaViewMode::LittlePlanet => 2,
        },
        _padding: 0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use neko_runtime_media::default_panorama_view_state;

    #[test]
    fn view_uniforms_convert_degrees_to_radians() {
        let mut state = default_panorama_view_state();
        state.yaw_deg = 180.0;
        state.pitch_deg = 90.0;
        state.fov_deg = 90.0;

        let uniforms = uniforms_for_state(1920, 1080, &state);

        assert_eq!(uniforms.output_size, [1920.0, 1080.0]);
        assert!((uniforms.yaw_rad - std::f32::consts::PI).abs() < 0.0001);
        assert!((uniforms.pitch_rad - std::f32::consts::FRAC_PI_2).abs() < 0.0001);
        assert!((uniforms.fov_rad - std::f32::consts::FRAC_PI_2).abs() < 0.0001);
    }

    #[test]
    fn rejects_invalid_fov() {
        let mut state = default_panorama_view_state();
        state.fov_deg = 0.0;

        assert!(validate_view_state(&state).is_err());
    }

    #[test]
    fn rejects_little_planet_until_shader_is_implemented() {
        let mut state = default_panorama_view_state();
        state.mode = PanoramaViewMode::LittlePlanet;

        assert!(matches!(
            validate_view_state(&state),
            Err(Error::UnsupportedCapability(_))
        ));
    }
}
