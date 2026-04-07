//! IBL (Image-Based Lighting) environment system
//!
//! Provides:
//! - Skybox cubemap rendering
//! - Irradiance map for diffuse IBL
//! - Pre-filtered environment map for specular IBL
//! - BRDF LUT (Look-Up Table) for split-sum approximation
//!
//! The Environment struct is optional — PBR rendering works without it
//! (falls back to constant ambient). When present, it dramatically improves
//! metallic/reflective surface quality.

use crate::gpu::GpuContext;
use std::sync::Arc;
use wgpu::util::DeviceExt;

/// IBL environment for PBR rendering
pub struct Environment {
    /// Skybox cubemap texture (HDR, 6 faces)
    pub skybox_cubemap: wgpu::Texture,
    pub skybox_view: wgpu::TextureView,
    /// Diffuse irradiance cubemap (low-res, pre-convolved)
    pub irradiance_map: wgpu::Texture,
    pub irradiance_view: wgpu::TextureView,
    /// Specular pre-filtered environment map (mip chain for roughness levels)
    pub prefilter_map: wgpu::Texture,
    pub prefilter_view: wgpu::TextureView,
    /// BRDF integration LUT (2D texture, u=NdotV, v=roughness)
    pub brdf_lut: wgpu::Texture,
    pub brdf_lut_view: wgpu::TextureView,
    /// Skybox render pipeline
    skybox_pipeline: wgpu::RenderPipeline,
    /// Bind group for skybox rendering
    skybox_bind_group: wgpu::BindGroup,
    /// Bind group for IBL sampling in PBR shader
    pub ibl_bind_group: wgpu::BindGroup,
    /// Bind group layout for IBL (needed by PBR pipeline to extend layout)
    pub ibl_bind_group_layout: wgpu::BindGroupLayout,
    #[allow(dead_code)]
    ctx: Arc<GpuContext>,
}

impl Environment {
    /// Create a default procedural environment (gradient sky + basic IBL)
    ///
    /// This generates all IBL textures on GPU without requiring an HDR image.
    /// Suitable for general-purpose 3D preview.
    pub fn new_default(ctx: Arc<GpuContext>) -> Self {
        let device = ctx.device();

        // Create IBL bind group layout
        let ibl_bgl = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("ibl_bind_group_layout"),
            entries: &[
                // binding 0: irradiance cubemap
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        multisampled: false,
                        view_dimension: wgpu::TextureViewDimension::Cube,
                        sample_type: wgpu::TextureSampleType::Float { filterable: true },
                    },
                    count: None,
                },
                // binding 1: prefilter cubemap
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        multisampled: false,
                        view_dimension: wgpu::TextureViewDimension::Cube,
                        sample_type: wgpu::TextureSampleType::Float { filterable: true },
                    },
                    count: None,
                },
                // binding 2: BRDF LUT
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
                // binding 3: sampler
                wgpu::BindGroupLayoutEntry {
                    binding: 3,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                    count: None,
                },
            ],
        });

        // Create placeholder textures (1x1 cubemaps, 1x1 2D LUT)
        let cubemap_size = 64u32;
        let lut_size = 128u32;

        let skybox_tex = Self::create_cubemap(device, cubemap_size, "skybox");
        let skybox_view = skybox_tex.create_view(&wgpu::TextureViewDescriptor {
            dimension: Some(wgpu::TextureViewDimension::Cube),
            ..Default::default()
        });

        let irradiance_tex = Self::create_cubemap(device, 32, "irradiance");
        let irradiance_view = irradiance_tex.create_view(&wgpu::TextureViewDescriptor {
            dimension: Some(wgpu::TextureViewDimension::Cube),
            ..Default::default()
        });

        let prefilter_tex = Self::create_cubemap(device, cubemap_size, "prefilter");
        let prefilter_view = prefilter_tex.create_view(&wgpu::TextureViewDescriptor {
            dimension: Some(wgpu::TextureViewDimension::Cube),
            ..Default::default()
        });

        let brdf_lut = Self::create_brdf_lut(device, lut_size);
        let brdf_lut_view = brdf_lut.create_view(&wgpu::TextureViewDescriptor::default());

        // Fill BRDF LUT with analytical approximation
        Self::generate_brdf_lut(&ctx, &brdf_lut, lut_size);

        let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("ibl_sampler"),
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            mipmap_filter: wgpu::FilterMode::Linear,
            ..Default::default()
        });

        let ibl_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("ibl_bind_group"),
            layout: &ibl_bgl,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(&irradiance_view),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::TextureView(&prefilter_view),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: wgpu::BindingResource::TextureView(&brdf_lut_view),
                },
                wgpu::BindGroupEntry {
                    binding: 3,
                    resource: wgpu::BindingResource::Sampler(&sampler),
                },
            ],
        });

        // Skybox pipeline
        let skybox_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("skybox_shader"),
            source: wgpu::ShaderSource::Wgsl(include_str!("../../../shaders/skybox.wgsl").into()),
        });

        let skybox_bgl = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("skybox_bgl"),
            entries: &[
                // binding 0: camera uniforms (view_projection_inverse)
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::VERTEX | wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                // binding 1: skybox cubemap
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        multisampled: false,
                        view_dimension: wgpu::TextureViewDimension::Cube,
                        sample_type: wgpu::TextureSampleType::Float { filterable: true },
                    },
                    count: None,
                },
                // binding 2: sampler
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                    count: None,
                },
            ],
        });

        let skybox_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("skybox_bind_group"),
            layout: &skybox_bgl,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    // Placeholder buffer — updated per render call
                    resource: device
                        .create_buffer_init(&wgpu::util::BufferInitDescriptor {
                            label: Some("skybox_camera_placeholder"),
                            contents: &[0u8; 128], // 2x mat4x4 = 128 bytes
                            usage: wgpu::BufferUsages::UNIFORM,
                        })
                        .as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::TextureView(&skybox_view),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: wgpu::BindingResource::Sampler(&sampler),
                },
            ],
        });

        let skybox_pipeline_layout =
            device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                label: Some("skybox_pipeline_layout"),
                bind_group_layouts: &[&skybox_bgl],
                push_constant_ranges: &[],
            });

        let skybox_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("skybox_pipeline"),
            layout: Some(&skybox_pipeline_layout),
            vertex: wgpu::VertexState {
                module: &skybox_shader,
                entry_point: "vs_main",
                buffers: &[],
            },
            fragment: Some(wgpu::FragmentState {
                module: &skybox_shader,
                entry_point: "fs_main",
                targets: &[Some(wgpu::ColorTargetState {
                    format: wgpu::TextureFormat::Rgba16Float,
                    blend: None,
                    write_mask: wgpu::ColorWrites::ALL,
                })],
            }),
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::TriangleList,
                front_face: wgpu::FrontFace::Ccw,
                cull_mode: None, // No culling for skybox
                ..Default::default()
            },
            depth_stencil: Some(wgpu::DepthStencilState {
                format: wgpu::TextureFormat::Depth32Float,
                depth_write_enabled: false, // Skybox doesn't write depth
                depth_compare: wgpu::CompareFunction::LessEqual,
                stencil: wgpu::StencilState::default(),
                bias: wgpu::DepthBiasState::default(),
            }),
            multisample: wgpu::MultisampleState::default(),
            multiview: None,
        });

        Self {
            skybox_cubemap: skybox_tex,
            skybox_view,
            irradiance_map: irradiance_tex,
            irradiance_view,
            prefilter_map: prefilter_tex,
            prefilter_view,
            brdf_lut,
            brdf_lut_view,
            skybox_pipeline,
            skybox_bind_group,
            ibl_bind_group,
            ibl_bind_group_layout: ibl_bgl,
            ctx,
        }
    }

    fn create_cubemap(device: &wgpu::Device, size: u32, label: &str) -> wgpu::Texture {
        device.create_texture(&wgpu::TextureDescriptor {
            label: Some(label),
            size: wgpu::Extent3d {
                width: size,
                height: size,
                depth_or_array_layers: 6,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba16Float,
            usage: wgpu::TextureUsages::TEXTURE_BINDING
                | wgpu::TextureUsages::COPY_DST
                | wgpu::TextureUsages::RENDER_ATTACHMENT,
            view_formats: &[],
        })
    }

    fn create_brdf_lut(device: &wgpu::Device, size: u32) -> wgpu::Texture {
        device.create_texture(&wgpu::TextureDescriptor {
            label: Some("brdf_lut"),
            size: wgpu::Extent3d {
                width: size,
                height: size,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rg16Float,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        })
    }

    /// Generate BRDF LUT using analytical approximation (CPU-side)
    fn generate_brdf_lut(ctx: &GpuContext, texture: &wgpu::Texture, size: u32) {
        let mut data = vec![0u8; (size * size * 4) as usize]; // Rg16Float = 4 bytes per pixel

        for y in 0..size {
            for x in 0..size {
                let n_dot_v = (x as f32 + 0.5) / size as f32;
                let roughness = (y as f32 + 0.5) / size as f32;

                // Analytical BRDF LUT approximation (Karis 2014)
                let (scale, bias) = Self::integrate_brdf(n_dot_v.max(0.001), roughness.max(0.04));

                let offset = ((y * size + x) * 4) as usize;
                let scale_half = half::f16::from_f32(scale);
                let bias_half = half::f16::from_f32(bias);
                data[offset..offset + 2].copy_from_slice(&scale_half.to_le_bytes());
                data[offset + 2..offset + 4].copy_from_slice(&bias_half.to_le_bytes());
            }
        }

        ctx.queue().write_texture(
            wgpu::ImageCopyTexture {
                texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            &data,
            wgpu::ImageDataLayout {
                offset: 0,
                bytes_per_row: Some(size * 4),
                rows_per_image: Some(size),
            },
            wgpu::Extent3d {
                width: size,
                height: size,
                depth_or_array_layers: 1,
            },
        );
    }

    /// Numerical integration of BRDF for split-sum approximation
    fn integrate_brdf(n_dot_v: f32, roughness: f32) -> (f32, f32) {
        let v = glam::Vec3::new((1.0 - n_dot_v * n_dot_v).sqrt(), 0.0, n_dot_v);
        let n = glam::Vec3::Z;

        let mut a = 0.0f32;
        let mut b = 0.0f32;
        let sample_count = 64u32;

        for i in 0..sample_count {
            let xi = Self::hammersley(i, sample_count);
            let h = Self::importance_sample_ggx(xi, n, roughness);
            let l = (2.0 * v.dot(h) * h - v).normalize();

            let n_dot_l = l.z.max(0.0);
            let n_dot_h = h.z.max(0.0);
            let v_dot_h = v.dot(h).max(0.0);

            if n_dot_l > 0.0 {
                let alpha = roughness * roughness;
                let k = alpha / 2.0;
                let g_v = n_dot_v / (n_dot_v * (1.0 - k) + k);
                let g_l = n_dot_l / (n_dot_l * (1.0 - k) + k);
                let g = g_v * g_l;
                let g_vis = (g * v_dot_h) / (n_dot_h * n_dot_v);
                let fc = (1.0 - v_dot_h).powi(5);
                a += (1.0 - fc) * g_vis;
                b += fc * g_vis;
            }
        }

        (a / sample_count as f32, b / sample_count as f32)
    }

    fn hammersley(i: u32, n: u32) -> glam::Vec2 {
        let mut bits = i;
        bits = bits.rotate_right(16);
        bits = ((bits & 0x55555555) << 1) | ((bits & 0xAAAAAAAA) >> 1);
        bits = ((bits & 0x33333333) << 2) | ((bits & 0xCCCCCCCC) >> 2);
        bits = ((bits & 0x0F0F0F0F) << 4) | ((bits & 0xF0F0F0F0) >> 4);
        bits = ((bits & 0x00FF00FF) << 8) | ((bits & 0xFF00FF00) >> 8);
        glam::Vec2::new(i as f32 / n as f32, bits as f32 * 2.328_306_4e-10)
    }

    fn importance_sample_ggx(xi: glam::Vec2, n: glam::Vec3, roughness: f32) -> glam::Vec3 {
        let a = roughness * roughness;
        let phi = 2.0 * std::f32::consts::PI * xi.x;
        let cos_theta = ((1.0 - xi.y) / (1.0 + (a * a - 1.0) * xi.y)).sqrt();
        let sin_theta = (1.0 - cos_theta * cos_theta).sqrt();

        let h = glam::Vec3::new(phi.cos() * sin_theta, phi.sin() * sin_theta, cos_theta);

        // Tangent space to world space
        let up = if n.z.abs() < 0.999 {
            glam::Vec3::Z
        } else {
            glam::Vec3::X
        };
        let tangent = up.cross(n).normalize();
        let bitangent = n.cross(tangent);

        (tangent * h.x + bitangent * h.y + n * h.z).normalize()
    }

    /// Get the skybox pipeline for rendering
    pub fn skybox_pipeline(&self) -> &wgpu::RenderPipeline {
        &self.skybox_pipeline
    }

    /// Get the skybox bind group for rendering
    pub fn skybox_bind_group(&self) -> &wgpu::BindGroup {
        &self.skybox_bind_group
    }
}
