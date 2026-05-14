use super::*;
use crate::export::types::{ExportAudioCodec, ExportHwEncoder, ExportPreset, ExportVideoCodec};
use neko_engine_types::{ElementEffect, Resolution};
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

    let pipeline = GpuExportPipeline::new(timeline, create_test_settings(), ctx, None).unwrap();
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

    let mut pipeline = GpuExportPipeline::new(timeline, create_test_settings(), ctx, None).unwrap();
    pipeline.initialize().unwrap();

    let result = pipeline.process_frame(5.0, [0.0, 0.0, 0.0, 1.0]).unwrap();
    assert_eq!(result.width, 1920);
    assert_eq!(result.height, 1080);
    assert_eq!(result.layer_count, 0);
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
        Error::UnknownEffect(effect_id) if effect_id == "plugin-custom-effect"
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
