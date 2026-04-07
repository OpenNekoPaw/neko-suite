use super::*;
use crate::export::types::{ExportAudioCodec, ExportHwEncoder, ExportPreset, ExportVideoCodec};
use neko_types::Resolution;

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

#[tokio::test]
async fn test_pipeline_creation() {
    let ctx = match GpuContext::new().await {
        Ok(c) => Arc::new(c),
        Err(_) => return,
    };

    let mut timeline = Timeline::new(Resolution::full_hd(), 30.0);
    timeline.duration = 10.0;

    let pipeline = GpuExportPipeline::new(timeline, create_test_settings(), ctx, None).unwrap();
    assert_eq!(pipeline.total_frames(), 300);
    assert_eq!(pipeline.output_dimensions(), (1920, 1080));
}

#[tokio::test]
async fn test_empty_timeline_process() {
    let ctx = match GpuContext::new().await {
        Ok(c) => Arc::new(c),
        Err(_) => return,
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
