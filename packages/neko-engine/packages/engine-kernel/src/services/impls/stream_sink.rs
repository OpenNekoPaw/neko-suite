//! Stream sink for realtime preview output.

use std::sync::Mutex;

use tokio::sync::broadcast;

use crate::domain::FrameData;
use crate::encoder::{
    global_encoder_pool, EncodedPacket, Encoder, EncoderConfig, EncoderPreset, HwAccelEncoder,
    HwEncoderType, VideoCodec,
};
use crate::error::{Error, Result};
use crate::preview::PreviewPipelineConfig;
use crate::services::pipeline_sink::PipelineSink;
use neko_engine_types::{FrameFormat, PipelineOutput, VideoGpuFrame, VideoOutput};

/// Realtime H.264 stream sink.
pub struct StreamSink {
    state: Mutex<StreamSinkState>,
    tx: broadcast::Sender<FrameData>,
}

struct StreamSinkState {
    encoder: Option<HwAccelEncoder>,
    config: PreviewPipelineConfig,
    encoder_config: EncoderConfig,
    width: u32,
    height: u32,
    fps: f64,
    closed: bool,
}

impl StreamSink {
    /// Create a stream sink for preview output.
    pub fn new(config: PreviewPipelineConfig, tx: broadcast::Sender<FrameData>) -> Result<Self> {
        let encoder_config = preview_encoder_config(&config);
        let encoder = acquire_preview_encoder(&encoder_config)?;

        Ok(Self {
            state: Mutex::new(StreamSinkState {
                encoder: Some(encoder),
                width: config.width,
                height: config.height,
                fps: config.fps,
                config,
                encoder_config,
                closed: false,
            }),
            tx,
        })
    }

    /// Reconfigure encoder state, flushing the previous encoder before swapping.
    pub fn reconfigure(&self, config: PreviewPipelineConfig) -> Result<()> {
        let new_encoder_config = preview_encoder_config(&config);

        let mut state = self
            .state
            .lock()
            .map_err(|_| Error::Other("StreamSink state lock poisoned".to_string()))?;
        if state.closed {
            return Err(Error::Other("StreamSink is closed".to_string()));
        }

        if state.width == config.width
            && state.height == config.height
            && (state.fps - config.fps).abs() < f64::EPSILON
            && state.config.bitrate == config.bitrate
            && state.config.gop_size == config.gop_size
        {
            state.config = config;
            return Ok(());
        }

        let new_encoder = acquire_preview_encoder(&new_encoder_config)?;

        if let Some(mut old_encoder) = state.encoder.take() {
            let flush_result =
                self.flush_encoder(&mut old_encoder, state.width, state.height, state.fps);
            global_encoder_pool().release(old_encoder, state.encoder_config.clone());
            flush_result?;
        }

        state.encoder = Some(new_encoder);
        state.width = config.width;
        state.height = config.height;
        state.fps = config.fps;
        state.config = config;
        state.encoder_config = new_encoder_config;
        Ok(())
    }

    /// Whether the encoder is currently open.
    pub fn is_open(&self) -> bool {
        self.state
            .lock()
            .map(|state| !state.closed && state.encoder.is_some())
            .unwrap_or(false)
    }

    fn submit_gpu_frame(&self, frame: VideoGpuFrame) -> Result<()> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| Error::Other("StreamSink state lock poisoned".to_string()))?;
        if state.closed {
            return Err(Error::Other("StreamSink is closed".to_string()));
        }

        let gpu_handle = frame.lease.native_encoder_handle()?;
        let encoder = state.encoder.as_mut().ok_or(Error::EncoderNotInitialized)?;

        if !encoder.supports_gpu_input() {
            return Err(Error::UnsupportedCapability(format!(
                "encoder does not support zero-copy GPU input for '{}'",
                frame.lease.handle().kind()
            )));
        }

        let packets = encoder.encode_frame_gpu(gpu_handle, frame.pts)?;
        for mut packet in packets {
            packet.pts = frame.pts;
            packet.dts = frame.pts;
            if packet.duration <= 0 {
                packet.duration = frame.duration;
            }
            let output = pack_encoded_packet(&packet, state.width, state.height, state.fps);
            let _ = self.tx.send(output);
        }

        Ok(())
    }

    fn flush_encoder(
        &self,
        encoder: &mut HwAccelEncoder,
        width: u32,
        height: u32,
        fps: f64,
    ) -> Result<()> {
        let packets = encoder.flush()?;
        for packet in packets {
            let output = pack_encoded_packet(&packet, width, height, fps);
            let _ = self.tx.send(output);
        }
        Ok(())
    }
}

impl PipelineSink for StreamSink {
    fn accepts(&self, output: &PipelineOutput) -> bool {
        matches!(output, PipelineOutput::Video(VideoOutput::GpuFrame(_)))
    }

    fn submit(&self, output: PipelineOutput) -> Result<()> {
        match output {
            PipelineOutput::Video(VideoOutput::GpuFrame(frame)) => self.submit_gpu_frame(frame),
            other => Err(Error::UnsupportedOutput(format!(
                "StreamSink accepts only VideoOutput::GpuFrame, got {:?}",
                other
            ))),
        }
    }

    fn flush(&self) -> Result<()> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| Error::Other("StreamSink state lock poisoned".to_string()))?;
        if state.closed {
            return Ok(());
        }

        let width = state.width;
        let height = state.height;
        let fps = state.fps;
        if let Some(encoder) = state.encoder.as_mut() {
            self.flush_encoder(encoder, width, height, fps)?;
        }
        Ok(())
    }

    fn close(&self) -> Result<()> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| Error::Other("StreamSink state lock poisoned".to_string()))?;
        if state.closed {
            return Ok(());
        }

        let width = state.width;
        let height = state.height;
        let fps = state.fps;
        let mut flush_result = Ok(());
        if let Some(mut encoder) = state.encoder.take() {
            flush_result = self.flush_encoder(&mut encoder, width, height, fps);
            global_encoder_pool().release(encoder, state.encoder_config.clone());
        }
        state.closed = true;
        flush_result
    }
}

impl Drop for StreamSink {
    fn drop(&mut self) {
        let _ = self.close();
    }
}

fn preview_encoder_config(config: &PreviewPipelineConfig) -> EncoderConfig {
    let mut encoder_config =
        EncoderConfig::new(config.width, config.height, config.fps, VideoCodec::H264);
    encoder_config.bitrate = config.bitrate;
    encoder_config.gop_size = Some(config.gop_size);
    encoder_config.use_zero_copy_gpu = true;
    encoder_config.max_b_frames = Some(0);
    encoder_config.profile = Some("baseline".to_string());
    encoder_config.preset = EncoderPreset::Ultrafast;
    encoder_config.hw_encoder = HwEncoderType::Auto;
    encoder_config
}

fn acquire_preview_encoder(config: &EncoderConfig) -> Result<HwAccelEncoder> {
    let encoder = global_encoder_pool().acquire(config)?;
    if !encoder.supports_gpu_input() {
        global_encoder_pool().release(encoder, config.clone());
        return Err(Error::UnsupportedCapability(
            "zero-copy GPU preview encoding requires a hardware encoder with GPU input support"
                .to_string(),
        ));
    }
    Ok(encoder)
}

fn pack_encoded_packet(packet: &EncodedPacket, width: u32, height: u32, fps: f64) -> FrameData {
    let header_size = 8 + 8 + 1 + 8;
    let duration_us = if packet.duration > 0 {
        packet.duration
    } else {
        (1_000_000.0 / fps) as i64
    };
    let mut data = Vec::with_capacity(header_size + packet.data.len());
    data.extend_from_slice(&packet.pts.to_le_bytes());
    data.extend_from_slice(&packet.dts.to_le_bytes());
    data.push(if packet.is_keyframe { 1 } else { 0 });
    data.extend_from_slice(&duration_us.to_le_bytes());
    data.extend_from_slice(&packet.data);

    FrameData {
        data,
        width,
        height,
        format: FrameFormat::H264,
        timestamp: packet.pts as f64 / 1_000_000.0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use neko_engine_types::{
        AudioBuffer, AudioOutput, GpuFrameLease, GpuOutputHandle, VideoGpuFrame,
    };

    #[cfg(target_os = "macos")]
    fn test_handle() -> GpuOutputHandle {
        GpuOutputHandle::IOSurface(42)
    }

    #[cfg(not(target_os = "macos"))]
    fn test_handle() -> GpuOutputHandle {
        GpuOutputHandle::Unsupported {
            platform: std::env::consts::OS,
            reason: "unit test".to_string(),
        }
    }

    fn gpu_output() -> PipelineOutput {
        PipelineOutput::Video(VideoOutput::GpuFrame(VideoGpuFrame {
            lease: GpuFrameLease::new(test_handle()),
            pts: 0,
            duration: 33_333,
            frame_index: 0,
            width: 1920,
            height: 1080,
        }))
    }

    #[test]
    fn stream_sink_rejects_non_gpu_output_shape_without_encoder() {
        let (tx, _rx) = broadcast::channel(1);
        let sink = StreamSink {
            state: Mutex::new(StreamSinkState {
                encoder: None,
                config: PreviewPipelineConfig::default(),
                encoder_config: preview_encoder_config(&PreviewPipelineConfig::default()),
                width: 1920,
                height: 1080,
                fps: 30.0,
                closed: false,
            }),
            tx,
        };

        let output = PipelineOutput::Audio(AudioOutput::PcmF32(AudioBuffer {
            samples: vec![0.0],
            sample_rate: 48_000,
            channels: 1,
            pts: 0,
            duration: 1_000,
        }));

        assert!(!sink.accepts(&output));
        let err = sink.submit(output).unwrap_err();
        assert!(matches!(err, Error::UnsupportedOutput(_)));
    }

    #[test]
    fn stream_sink_accepts_gpu_output_shape_without_encoder() {
        let (tx, _rx) = broadcast::channel(1);
        let sink = StreamSink {
            state: Mutex::new(StreamSinkState {
                encoder: None,
                config: PreviewPipelineConfig::default(),
                encoder_config: preview_encoder_config(&PreviewPipelineConfig::default()),
                width: 1920,
                height: 1080,
                fps: 30.0,
                closed: false,
            }),
            tx,
        };

        assert!(sink.accepts(&gpu_output()));
    }

    #[test]
    fn stream_sink_close_is_idempotent_without_encoder() {
        let (tx, _rx) = broadcast::channel(1);
        let sink = StreamSink {
            state: Mutex::new(StreamSinkState {
                encoder: None,
                config: PreviewPipelineConfig::default(),
                encoder_config: preview_encoder_config(&PreviewPipelineConfig::default()),
                width: 1920,
                height: 1080,
                fps: 30.0,
                closed: false,
            }),
            tx,
        };

        assert!(sink.close().is_ok());
        assert!(sink.close().is_ok());
        assert!(!sink.is_open());
    }

    #[test]
    fn stream_sink_close_flushes_encoder_before_pool_release() {
        let source = include_str!("stream_sink.rs");
        let close_start = source.find("fn close(&self) -> Result<()>").unwrap();
        let close_body = &source[close_start..];
        let flush_pos = close_body.find("self.flush_encoder").unwrap();
        let release_pos = close_body.find("global_encoder_pool().release").unwrap();
        assert!(
            flush_pos < release_pos,
            "StreamSink::close must flush encoder buffered frames before releasing it to the pool"
        );
    }

    #[test]
    fn stream_sink_packs_legacy_h264_wire_format() {
        let packet = EncodedPacket {
            data: vec![1, 2, 3, 4],
            pts: 12_345,
            dts: 12_000,
            is_keyframe: true,
            duration: 33_333,
            stream_index: 0,
        };

        let frame = pack_encoded_packet(&packet, 1280, 720, 30.0);
        assert_eq!(frame.width, 1280);
        assert_eq!(frame.height, 720);
        assert_eq!(frame.format, FrameFormat::H264);
        assert_eq!(frame.timestamp, 0.012345);

        assert_eq!(
            i64::from_le_bytes(frame.data[0..8].try_into().unwrap()),
            12_345
        );
        assert_eq!(
            i64::from_le_bytes(frame.data[8..16].try_into().unwrap()),
            12_000
        );
        assert_eq!(frame.data[16], 1);
        assert_eq!(
            i64::from_le_bytes(frame.data[17..25].try_into().unwrap()),
            33_333
        );
        assert_eq!(&frame.data[25..], &[1, 2, 3, 4]);
    }
}
