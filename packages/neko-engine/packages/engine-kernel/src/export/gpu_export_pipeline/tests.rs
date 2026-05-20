use super::*;
use crate::domain::{
    Element, ElementType, PuppetElementData, Scene3DElementData, Track, Transform,
};
use crate::export::types::{ExportAudioCodec, ExportHwEncoder, ExportPreset, ExportVideoCodec};
use neko_engine_puppet_renderer::PuppetRenderOutput;
use neko_engine_scene_renderer::{
    CameraParams, RenderTargetPool, SceneRenderGraphExecution, SceneRenderOutput,
    ViewportRenderGraphVariant,
};
use neko_engine_types::{BlendMode, ElementEffect, Resolution, TrackType};
use std::sync::Mutex;
use std::time::Instant;

fn create_test_settings() -> ExportSettings {
    ExportSettings {
        width: 1920,
        height: 1080,
        fps: 30.0,
        video_codec: ExportVideoCodec::H264,
        video_bitrate: None,
        audio_codec: ExportAudioCodec::Aac,
        audio_bitrate: None,
        hw_encoder: ExportHwEncoder::None,
        time_range: None,
        preset: ExportPreset::Medium,
        use_zero_copy_gpu: false,
    }
}

async fn create_test_context() -> Option<Arc<GpuContext>> {
    match GpuContext::new().await {
        Ok(c) => Some(Arc::new(c)),
        Err(_) => None,
    }
}

fn create_test_texture(ctx: &GpuContext, width: u32, height: u32) -> wgpu::Texture {
    let pixels = vec![128u8; (width * height * 4) as usize];
    let texture = ctx.device().create_texture(&wgpu::TextureDescriptor {
        label: Some("Effect Registry Test Texture"),
        size: wgpu::Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Rgba8Unorm,
        usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
        view_formats: &[],
    });
    ctx.queue().write_texture(
        wgpu::ImageCopyTexture {
            texture: &texture,
            mip_level: 0,
            origin: wgpu::Origin3d::ZERO,
            aspect: wgpu::TextureAspect::All,
        },
        &pixels,
        wgpu::ImageDataLayout {
            offset: 0,
            bytes_per_row: Some(width * 4),
            rows_per_image: Some(height),
        },
        wgpu::Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
    );
    texture
}

fn create_test_puppet_texture(ctx: &GpuContext, width: u32, height: u32) -> wgpu::Texture {
    let pixels = vec![255u8; (width * height * 4) as usize];
    let texture = ctx.device().create_texture(&wgpu::TextureDescriptor {
        label: Some("Fake Puppet Render Texture"),
        size: wgpu::Extent3d {
            width,
            height,
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
            texture: &texture,
            mip_level: 0,
            origin: wgpu::Origin3d::ZERO,
            aspect: wgpu::TextureAspect::All,
        },
        &pixels,
        wgpu::ImageDataLayout {
            offset: 0,
            bytes_per_row: Some(width * 4),
            rows_per_image: Some(height),
        },
        wgpu::Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
    );
    texture
}

struct FakePuppetRenderPort {
    ctx: Arc<GpuContext>,
    timings: Mutex<Vec<PuppetRenderTiming>>,
}

impl FakePuppetRenderPort {
    fn new(ctx: Arc<GpuContext>) -> Self {
        Self {
            ctx,
            timings: Mutex::new(Vec::new()),
        }
    }

    fn render_count(&self) -> usize {
        self.timings.lock().unwrap().len()
    }

    fn last_timing(&self) -> PuppetRenderTiming {
        *self.timings.lock().unwrap().last().unwrap()
    }
}

impl PuppetRenderPort for FakePuppetRenderPort {
    fn render_puppet_layer_output(
        &self,
        width: u32,
        height: u32,
        timing: PuppetRenderTiming,
    ) -> crate::error::Result<PuppetRenderOutput> {
        self.timings.lock().unwrap().push(timing);
        let texture = create_test_puppet_texture(&self.ctx, width, height);
        let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
        Ok(PuppetRenderOutput {
            color_texture: texture,
            color_view: view,
            width,
            height,
            frame_index: timing.frame_index,
            pts: timing.pts,
            duration: timing.duration,
            mesh_count: 1,
            vertex_count: 4,
            index_count: 6,
        })
    }
}

struct FakeSceneRenderPort {
    ctx: Arc<GpuContext>,
    calls: Mutex<Vec<(Option<String>, f32, (u32, u32))>>,
}

impl FakeSceneRenderPort {
    fn new(ctx: Arc<GpuContext>) -> Self {
        Self {
            ctx,
            calls: Mutex::new(Vec::new()),
        }
    }

    fn render_count(&self) -> usize {
        self.calls.lock().unwrap().len()
    }
}

impl SceneRenderPort for FakeSceneRenderPort {
    fn render_scene3d_frame(
        &self,
        clip_name: Option<&str>,
        time: f32,
        output_size: (u32, u32),
        _camera_override: Option<&CameraParams>,
        _background_color: Option<[f32; 4]>,
    ) -> crate::error::Result<SceneRenderOutput> {
        self.calls
            .lock()
            .unwrap()
            .push((clip_name.map(str::to_string), time, output_size));
        let pool = RenderTargetPool::default();
        let color_texture = pool.acquire(
            self.ctx.device(),
            "Fake Scene Color",
            output_size.0,
            output_size.1,
            wgpu::TextureFormat::Rgba16Float,
            wgpu::TextureUsages::TEXTURE_BINDING
                | wgpu::TextureUsages::COPY_DST
                | wgpu::TextureUsages::RENDER_ATTACHMENT,
        );
        let color_view = color_texture.create_view(&wgpu::TextureViewDescriptor::default());
        let depth_texture = pool.acquire(
            self.ctx.device(),
            "Fake Scene Depth",
            output_size.0,
            output_size.1,
            wgpu::TextureFormat::Depth32Float,
            wgpu::TextureUsages::RENDER_ATTACHMENT,
        );
        Ok(SceneRenderOutput {
            color_texture,
            color_view,
            depth_texture,
            width: output_size.0,
            height: output_size.1,
            graph_execution: SceneRenderGraphExecution {
                variant: ViewportRenderGraphVariant::StandardPbr,
                pass_ids: Vec::new(),
                helper_passes: false,
                post_process: false,
                color_convert: false,
                encoder_copy: false,
            },
        })
    }
}

fn scene3d_element(id: &str, start_time: f64, duration: f64) -> Element {
    Element {
        id: id.to_string(),
        name: id.to_string(),
        element_type: ElementType::Scene3D(Scene3DElementData {
            src: format!("{id}.glb"),
            camera_node_id: None,
            animation_clip: Some("walk".to_string()),
            animation_loop: true,
            animation_speed: 1.5,
            background_color: None,
            camera_override: None,
        }),
        start_time,
        duration,
        trim_start: 0.5,
        trim_end: 0.0,
        transform: Transform::centered(),
        opacity: 0.8,
        blend_mode: BlendMode::Normal,
        effects: Vec::new(),
        muted: false,
        hidden: false,
        locked: false,
        speed: None,
        transition_in: None,
        transition_out: None,
        masks: Vec::new(),
        transition: None,
    }
}

fn puppet_element(id: &str, start_time: f64, duration: f64, z_scale: f32) -> Element {
    Element {
        id: id.to_string(),
        name: id.to_string(),
        element_type: ElementType::Puppet(PuppetElementData {
            src: format!("{id}.moc3"),
            animation_clip: Some("idle".to_string()),
            animation_loop: true,
            animation_speed: 2.0,
            expression: None,
            parameter_overrides: None,
        }),
        start_time,
        duration,
        trim_start: 0.25,
        trim_end: 0.0,
        transform: Transform {
            x: 0.5,
            y: 0.5,
            scale_x: z_scale,
            scale_y: z_scale,
            rotation: 0.0,
            anchor_x: 0.5,
            anchor_y: 0.5,
        },
        opacity: 0.7,
        blend_mode: BlendMode::Normal,
        effects: Vec::new(),
        muted: false,
        hidden: false,
        locked: false,
        speed: None,
        transition_in: None,
        transition_out: None,
        masks: Vec::new(),
        transition: None,
    }
}

fn effect(
    effect_type: &str,
    parameters: serde_json::Map<String, serde_json::Value>,
) -> ElementEffect {
    ElementEffect {
        id: format!("test-{}", effect_type),
        effect_type: effect_type.to_string(),
        enabled: true,
        parameters,
        order: 0,
    }
}

fn params(entries: &[(&str, serde_json::Value)]) -> serde_json::Map<String, serde_json::Value> {
    entries
        .iter()
        .map(|(key, value)| ((*key).to_string(), value.clone()))
        .collect()
}

#[tokio::test]
async fn test_pipeline_creation() {
    let Some(ctx) = create_test_context().await else {
        return;
    };

    let mut timeline = Timeline::new(Resolution::full_hd(), 30.0);
    timeline.duration = 10.0;

    let pipeline = GpuExportPipeline::new(
        timeline,
        create_test_settings(),
        ctx,
        RenderServicePorts::default(),
    )
    .unwrap();
    assert_eq!(pipeline.total_frames(), 300);
    assert_eq!(pipeline.output_dimensions(), (1920, 1080));
}

#[tokio::test]
async fn test_empty_timeline_process() {
    let Some(ctx) = create_test_context().await else {
        return;
    };

    let mut timeline = Timeline::new(Resolution::full_hd(), 30.0);
    timeline.duration = 10.0;

    let mut pipeline = GpuExportPipeline::new(
        timeline,
        create_test_settings(),
        ctx,
        RenderServicePorts::default(),
    )
    .unwrap();
    pipeline.initialize().unwrap();

    let result = pipeline.process_frame(5.0, [0.0, 0.0, 0.0, 1.0]).unwrap();
    assert_eq!(result.width, 1920);
    assert_eq!(result.height, 1080);
    assert_eq!(result.layer_count, 0);
}

#[tokio::test]
async fn puppet_layers_are_collected_with_timeline_relative_timing() {
    let Some(ctx) = create_test_context().await else {
        return;
    };

    let mut timeline = Timeline::new(Resolution::full_hd(), 30.0);
    timeline.duration = 4.0;
    let mut track = Track::new("puppets", TrackType::Puppet);
    track
        .elements
        .push(puppet_element("puppet-a", 1.0, 2.0, 1.0));
    timeline.tracks.push(track);

    let puppet_service = Arc::new(FakePuppetRenderPort::new(Arc::clone(&ctx)));
    let mut pipeline = GpuExportPipeline::new(
        timeline,
        create_test_settings(),
        ctx,
        RenderServicePorts {
            scene: None,
            puppet: Some(puppet_service.clone()),
        },
    )
    .unwrap();

    let result = pipeline.process_frame(1.5, [0.0, 0.0, 0.0, 0.0]).unwrap();

    assert_eq!(result.layer_count, 1);
    assert_eq!(puppet_service.render_count(), 1);
    let timing = puppet_service.last_timing();
    assert_eq!(timing.frame_index, 45);
    assert_eq!(timing.duration, 33_333);
    assert_eq!(timing.pts, 1_500_000);
}

#[tokio::test]
async fn scene3d_and_puppet_layers_share_compositor_ordering() {
    let Some(ctx) = create_test_context().await else {
        return;
    };

    let mut timeline = Timeline::new(Resolution::full_hd(), 30.0);
    timeline.duration = 4.0;
    let mut scene_track = Track::new("scene", TrackType::Scene3d);
    scene_track
        .elements
        .push(scene3d_element("scene-a", 0.0, 4.0));
    let mut puppet_track = Track::new("puppet", TrackType::Puppet);
    puppet_track
        .elements
        .push(puppet_element("puppet-a", 0.5, 2.0, 1.0));
    timeline.tracks.push(scene_track);
    timeline.tracks.push(puppet_track);

    let scene_service = Arc::new(FakeSceneRenderPort::new(Arc::clone(&ctx)));
    let puppet_service = Arc::new(FakePuppetRenderPort::new(Arc::clone(&ctx)));
    let mut pipeline = GpuExportPipeline::new(
        timeline,
        create_test_settings(),
        ctx,
        RenderServicePorts {
            scene: Some(scene_service.clone()),
            puppet: Some(puppet_service.clone()),
        },
    )
    .unwrap();

    let result = pipeline.process_frame(1.0, [0.0, 0.0, 0.0, 0.0]).unwrap();

    assert_eq!(result.layer_count, 2);
    assert_eq!(scene_service.render_count(), 1);
    assert_eq!(puppet_service.render_count(), 1);
    let timing = puppet_service.last_timing();
    assert_eq!(timing.frame_index, 30);
    assert_eq!(timing.pts, 1_500_000);
}

#[tokio::test]
async fn puppet_layer_requires_injected_render_service() {
    let Some(ctx) = create_test_context().await else {
        return;
    };

    let mut timeline = Timeline::new(Resolution::full_hd(), 30.0);
    timeline.duration = 4.0;
    let mut track = Track::new("puppets", TrackType::Puppet);
    track
        .elements
        .push(puppet_element("puppet-a", 0.0, 2.0, 1.0));
    timeline.tracks.push(track);

    let mut pipeline = GpuExportPipeline::new(
        timeline,
        create_test_settings(),
        ctx,
        RenderServicePorts::default(),
    )
    .unwrap();

    let error = pipeline
        .process_frame(0.5, [0.0, 0.0, 0.0, 0.0])
        .unwrap_err();

    assert!(
        matches!(error, Error::UnsupportedCapability(message) if message.contains("puppet render service"))
    );
}

#[tokio::test]
async fn test_effect_dispatcher_registers_known_effects() {
    let Some(ctx) = create_test_context().await else {
        return;
    };
    let dispatcher = EffectDispatcher::new(ctx).unwrap();

    for effect_id in [
        "gaussian-blur",
        "motion-blur",
        "radial-blur",
        "sharpen",
        "vignette",
        "glow",
        "chromatic-aberration",
        "film-grain",
        "color-correction",
        "luma-key",
        "chroma-key",
        "pixelate",
        "edge_detect",
        "posterize",
        "noise",
        "rgb_split",
        "wave_distort",
    ] {
        assert!(
            dispatcher.has_effect(effect_id),
            "missing effect {effect_id}"
        );
    }
}

#[tokio::test]
async fn test_unknown_effect_returns_unknown_effect_error() {
    let Some(ctx) = create_test_context().await else {
        return;
    };
    let input = create_test_texture(&ctx, 8, 8);
    let mut dispatcher = EffectDispatcher::new(ctx).unwrap();
    let unknown = effect("plugin-custom-effect", serde_json::Map::new());

    let error = dispatcher
        .apply_effects_gpu(&input, 8, 8, &[unknown])
        .expect_err("unknown effects must fail clearly");

    assert!(matches!(
        error,
        neko_engine_gpu::GpuError::UnknownEffect(effect_id)
            if effect_id == "plugin-custom-effect"
    ));
}

#[tokio::test]
async fn test_builtin_effect_family_parity_smoke() {
    let Some(ctx) = create_test_context().await else {
        return;
    };
    let input = create_test_texture(&ctx, 8, 8);
    let mut dispatcher = EffectDispatcher::new(ctx).unwrap();

    let effects = [
        effect(
            "gaussian-blur",
            params(&[("radius", serde_json::json!(1.0))]),
        ),
        effect("vignette", params(&[("amount", serde_json::json!(0.1))])),
        effect(
            "color-correction",
            params(&[
                ("brightness", serde_json::json!(0.01)),
                ("contrast", serde_json::json!(1.0)),
            ]),
        ),
        effect(
            "pixelate",
            params(&[("pixel_size", serde_json::json!(2.0))]),
        ),
    ];

    for effect in effects {
        dispatcher
            .apply_effects_gpu(&input, 8, 8, &[effect])
            .expect("registered effect should apply through registry path");
    }
}

#[tokio::test]
async fn test_registry_dispatch_baseline_timing_smoke() {
    let Some(ctx) = create_test_context().await else {
        return;
    };
    let input = create_test_texture(&ctx, 16, 16);
    let mut dispatcher = EffectDispatcher::new(ctx).unwrap();
    let effects = [effect(
        "film-grain",
        params(&[("amount", serde_json::json!(0.001))]),
    )];

    let start = Instant::now();
    dispatcher
        .apply_effects_gpu(&input, 16, 16, &effects)
        .expect("registry dispatch timing smoke should apply");
    let elapsed = start.elapsed();

    assert!(
        elapsed.as_millis() < 500,
        "registry dispatch smoke exceeded loose baseline: {elapsed:?}"
    );
}
