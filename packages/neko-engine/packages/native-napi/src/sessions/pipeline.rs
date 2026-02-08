//! Pipeline session classes - ExportPipelineSession and PreviewPipelineSession

use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::sync::{Arc, Mutex};

use crate::types::{JsPipelineConfig, JsPipelineFrame, JsPipelineProgress};
use neko_native_core::encoder::{AsyncExportPipeline, PipelineFrame};
use neko_native_core::gpu::GpuContext;

/// Async export pipeline session for high-performance video export
///
/// This implements a three-stage concurrent pipeline:
/// - Compose (GPU): Composites layers into frames
/// - Encode (CPU/HW): Encodes frames to video codec
/// - Mux (IO): Writes encoded packets to container file
///
/// Usage:
/// ```javascript
/// const pipeline = await ExportPipelineSession.create({
///     outputPath: '/path/to/output.mp4',
///     encoderConfig: { width: 1920, height: 1080, fps: 30, codec: 'h264', hwEncoder: 'auto' },
///     totalFrames: 300
/// });
///
/// for (let i = 0; i < 300; i++) {
///     pipeline.submitFrame({ index: i, pts: i * 1001, layers: [...], outputWidth: 1920, outputHeight: 1080 });
///     const progress = pipeline.getProgress();
///     console.log(`Progress: ${progress.progressRatio * 100}%`);
/// }
///
/// await pipeline.finalize();
/// ```
#[deprecated(note = "Use NativeEngine.dispatch() instead")]
#[napi]
pub struct ExportPipelineSession {
    pipeline: Mutex<Option<AsyncExportPipeline>>,
    #[allow(dead_code)]
    gpu_ctx: Arc<GpuContext>,
}

#[napi]
impl ExportPipelineSession {
    /// Create a new export pipeline session
    #[napi(factory)]
    pub async fn create(config: JsPipelineConfig) -> Result<Self> {
        // Initialize GPU context
        let gpu_ctx = GpuContext::new()
            .await
            .map_err(|e| Error::from_reason(format!("GPU initialization failed: {}", e)))?;

        let gpu_ctx = Arc::new(gpu_ctx);

        // Convert config
        let pipeline_config = config.to_pipeline_config();

        tracing::info!(
            "Creating ExportPipelineSession (output={}, {}x{}@{} fps, hw_encoder={:?})",
            pipeline_config.output_path,
            pipeline_config.encoder_config.width,
            pipeline_config.encoder_config.height,
            pipeline_config.encoder_config.fps,
            pipeline_config.encoder_config.hw_encoder
        );

        // Start the pipeline
        let pipeline = AsyncExportPipeline::start(pipeline_config, Arc::clone(&gpu_ctx))
            .map_err(|e| Error::from_reason(format!("Failed to start pipeline: {}", e)))?;

        Ok(Self {
            pipeline: Mutex::new(Some(pipeline)),
            gpu_ctx,
        })
    }

    /// Submit a frame to the pipeline for processing
    ///
    /// This may block if the compose buffer is full (backpressure).
    /// The frame will be processed asynchronously through the pipeline.
    #[napi]
    pub fn submit_frame(&self, frame: JsPipelineFrame) -> Result<()> {
        let pipeline_guard = self
            .pipeline
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock pipeline"))?;

        let pipeline = pipeline_guard
            .as_ref()
            .ok_or_else(|| Error::from_reason("Pipeline already finalized"))?;

        let rust_frame: PipelineFrame = frame.into();
        pipeline
            .submit_frame(rust_frame)
            .map_err(|e| Error::from_reason(format!("Failed to submit frame: {}", e)))
    }

    /// Get current pipeline progress
    #[napi]
    pub fn get_progress(&self) -> Result<JsPipelineProgress> {
        let pipeline_guard = self
            .pipeline
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock pipeline"))?;

        let pipeline = pipeline_guard
            .as_ref()
            .ok_or_else(|| Error::from_reason("Pipeline already finalized"))?;

        Ok(JsPipelineProgress::from(pipeline.progress()))
    }

    /// Check if pipeline is cancelled
    #[napi]
    pub fn is_cancelled(&self) -> Result<bool> {
        let pipeline_guard = self
            .pipeline
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock pipeline"))?;

        match pipeline_guard.as_ref() {
            Some(pipeline) => Ok(pipeline.is_cancelled()),
            None => Ok(false),
        }
    }

    /// Cancel the pipeline
    ///
    /// This signals all workers to stop. The output file may be incomplete or corrupted.
    #[napi]
    pub fn cancel(&self) -> Result<()> {
        let pipeline_guard = self
            .pipeline
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock pipeline"))?;

        if let Some(pipeline) = pipeline_guard.as_ref() {
            pipeline.cancel();
        }

        Ok(())
    }

    /// Finalize the pipeline and wait for completion
    ///
    /// This signals that no more frames will be submitted and waits for all
    /// pending frames to be processed and written to the output file.
    ///
    /// After this call, the session cannot be used again.
    #[napi]
    pub async fn finalize(&self) -> Result<()> {
        // Take the pipeline out of the mutex
        let pipeline = {
            let mut pipeline_guard = self
                .pipeline
                .lock()
                .map_err(|_| Error::from_reason("Failed to lock pipeline"))?;

            pipeline_guard.take()
        };

        match pipeline {
            Some(pipeline) => {
                tracing::info!("Finalizing export pipeline...");

                // Wait for pipeline to complete
                // Note: This blocks until all frames are processed
                pipeline
                    .wait()
                    .map_err(|e| Error::from_reason(format!("Pipeline failed: {}", e)))?;

                tracing::info!("Export pipeline finalized successfully");
                Ok(())
            }
            None => Err(Error::from_reason("Pipeline already finalized")),
        }
    }
}

// =============================================================================
// Preview Pipeline Session (Zero-Copy H.264 Streaming)
// =============================================================================

use super::frame_server::get_runtime;

/// Configuration for preview pipeline
#[napi(object)]
#[derive(Debug, Clone)]
pub struct JsPreviewPipelineConfig {
    /// Output width
    pub width: u32,
    /// Output height
    pub height: u32,
    /// Frame rate
    pub fps: f64,
    /// Bitrate in bits per second (default: 2 Mbps)
    pub bitrate: Option<i64>,
    /// GOP size (keyframe interval, default: 30)
    pub gop_size: Option<u32>,
}

/// Encoded preview frame (H.264 NAL unit)
#[napi(object)]
#[derive(Clone)]
pub struct JsPreviewFrame {
    /// H.264 NAL unit data
    pub data: Buffer,
    /// Presentation timestamp in microseconds
    pub pts: i64,
    /// Decode timestamp in microseconds
    pub dts: i64,
    /// Whether this is a keyframe (IDR)
    pub is_keyframe: bool,
}

/// Preview Pipeline Session - Zero-copy GPU pipeline for real-time H.264 preview
///
/// Data flow (macOS):
/// ```text
/// Timeline → GpuExportPipeline (decode + composite + IOSurface)
///         → VideoToolbox H.264 Encode → H.264 NAL units
/// ```
///
/// All processing stays on GPU until final H.264 output.
#[deprecated(note = "Use NativeEngine.dispatch() instead")]
#[napi]
pub struct PreviewPipelineSession {
    pipeline: Mutex<neko_native_core::preview::PreviewPipeline>,
    config: JsPreviewPipelineConfig,
}

#[napi]
impl PreviewPipelineSession {
    /// Create a new preview pipeline from timeline JSON
    #[napi(factory)]
    pub fn create(
        timeline_json: String,
        config: JsPreviewPipelineConfig,
    ) -> Result<Self> {
        use neko_native_core::export::TimelineData;
        use neko_native_core::preview::{PreviewPipeline, PreviewPipelineConfig};

        // Parse timeline
        let timeline: TimelineData = serde_json::from_str(&timeline_json)
            .map_err(|e| Error::from_reason(format!("Failed to parse timeline: {}", e)))?;

        // Create GPU context
        let runtime = get_runtime();
        let gpu_ctx = runtime
            .block_on(neko_native_core::gpu::GpuContext::new())
            .map_err(|e| Error::from_reason(format!("GPU initialization failed: {}", e)))?;
        let gpu_ctx = Arc::new(gpu_ctx);

        // Create preview config
        let preview_config = PreviewPipelineConfig {
            width: config.width,
            height: config.height,
            fps: config.fps,
            bitrate: config.bitrate.unwrap_or(2_000_000) as u64,
            gop_size: config.gop_size.unwrap_or(30),
        };

        // Create pipeline
        let mut pipeline = PreviewPipeline::new(timeline, gpu_ctx, preview_config)
            .map_err(|e| Error::from_reason(format!("Failed to create preview pipeline: {}", e)))?;

        // Initialize (open decoders)
        pipeline
            .initialize()
            .map_err(|e| Error::from_reason(format!("Failed to initialize pipeline: {}", e)))?;

        tracing::info!(
            "PreviewPipelineSession created: {}x{} @ {}fps, hw={}",
            config.width,
            config.height,
            config.fps,
            pipeline.is_hw_active()
        );

        Ok(Self {
            pipeline: Mutex::new(pipeline),
            config,
        })
    }

    /// Render frame at given time and encode to H.264
    ///
    /// Returns H.264 NAL units ready for WebSocket streaming.
    #[napi]
    pub fn render_frame(
        &self,
        time: f64,
        background_color: Option<Vec<f64>>,
    ) -> Result<Vec<JsPreviewFrame>> {
        let bg = if let Some(bg) = background_color {
            if bg.len() >= 4 {
                [bg[0] as f32, bg[1] as f32, bg[2] as f32, bg[3] as f32]
            } else {
                [0.0, 0.0, 0.0, 1.0]
            }
        } else {
            [0.0, 0.0, 0.0, 1.0]
        };

        let mut pipeline = self
            .pipeline
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock pipeline"))?;

        let frames = pipeline
            .render_frame(time, bg)
            .map_err(|e| Error::from_reason(format!("Failed to render frame: {}", e)))?;

        Ok(frames
            .into_iter()
            .map(|f| JsPreviewFrame {
                data: Buffer::from(f.data),
                pts: f.pts,
                dts: f.dts,
                is_keyframe: f.is_keyframe,
            })
            .collect())
    }

    /// Flush encoder and get remaining packets
    #[napi]
    pub fn flush(&self) -> Result<Vec<JsPreviewFrame>> {
        let mut pipeline = self
            .pipeline
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock pipeline"))?;

        let frames = pipeline
            .flush()
            .map_err(|e| Error::from_reason(format!("Failed to flush: {}", e)))?;

        Ok(frames
            .into_iter()
            .map(|f| JsPreviewFrame {
                data: Buffer::from(f.data),
                pts: f.pts,
                dts: f.dts,
                is_keyframe: f.is_keyframe,
            })
            .collect())
    }

    /// Reset frame counter (call on seek)
    #[napi]
    pub fn reset_frame_counter(&self) -> Result<()> {
        let mut pipeline = self
            .pipeline
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock pipeline"))?;

        pipeline.reset_frame_counter();
        Ok(())
    }

    /// Check if hardware encoding is active
    #[napi]
    pub fn is_hw_active(&self) -> bool {
        self.pipeline
            .lock()
            .map(|p| p.is_hw_active())
            .unwrap_or(false)
    }

    /// Get current configuration
    #[napi]
    pub fn get_config(&self) -> JsPreviewPipelineConfig {
        self.config.clone()
    }

    /// Close the pipeline and release resources
    #[napi]
    pub fn close(&self) -> Result<()> {
        let mut pipeline = self
            .pipeline
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock pipeline"))?;

        pipeline.close();
        tracing::info!("PreviewPipelineSession closed");
        Ok(())
    }
}
