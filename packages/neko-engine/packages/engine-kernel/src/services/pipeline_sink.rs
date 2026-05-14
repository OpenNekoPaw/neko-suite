//! Pipeline output contracts and sink trait.
//!
//! These types define the boundary between GPU-producing pipelines and output
//! consumers such as realtime streams, snapshots, muxers, and analysis tools.

use std::fmt;
use std::sync::Arc;

use crate::error::{Error, Result};
use crate::gpu::GpuContext;
use neko_engine_types::{AudioCodec, FrameFormat, VideoCodec};

/// Top-level media output produced by a pipeline.
#[derive(Clone, Debug)]
pub enum PipelineOutput {
    /// Video output variants.
    Video(VideoOutput),
    /// Audio output variants.
    Audio(AudioOutput),
}

/// Video output variants, from GPU-resident hot-path frames to terminal artifacts.
#[derive(Clone, Debug)]
pub enum VideoOutput {
    /// GPU-resident frame intended for zero-copy consumers.
    GpuFrame(VideoGpuFrame),
    /// Terminal preview artifact such as RGBA/JPEG/PNG bytes.
    PreviewFrame(VideoPreviewFrame),
    /// Encoded video packet.
    EncodedPacket(VideoEncodedPacket),
    /// Raw terminal frame buffer.
    RawFrame(VideoRawFrame),
}

/// Audio output variants.
#[derive(Clone, Debug)]
pub enum AudioOutput {
    /// Interleaved f32 PCM audio.
    PcmF32(AudioBuffer),
    /// Encoded audio packet.
    EncodedPacket(AudioEncodedPacket),
}

/// Platform-aware GPU handle.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum GpuOutputHandle {
    /// macOS IOSurface handle.
    #[cfg(target_os = "macos")]
    IOSurface(usize),
    /// Linux VA-API surface placeholder until zero-copy interop is implemented.
    #[cfg(target_os = "linux")]
    VaSurface { id: u64 },
    /// Windows D3D11 texture placeholder until zero-copy interop is implemented.
    #[cfg(target_os = "windows")]
    D3D11Texture { handle: usize },
    /// Explicit unsupported platform/capability marker.
    Unsupported {
        /// Platform name.
        platform: &'static str,
        /// Actionable reason.
        reason: String,
    },
}

impl GpuOutputHandle {
    /// Return the native encoder handle for platforms supported in P0.
    pub fn native_encoder_handle(&self) -> Result<usize> {
        match self {
            #[cfg(target_os = "macos")]
            Self::IOSurface(handle) => Ok(*handle),
            Self::Unsupported { platform, reason } => Err(Error::UnsupportedCapability(format!(
                "GPU output handle is unsupported on {platform}: {reason}"
            ))),
            #[allow(unreachable_patterns)]
            other => Err(Error::UnsupportedCapability(format!(
                "GPU encoder input is not implemented for {:?}",
                other
            ))),
        }
    }

    /// Human-readable variant name for diagnostics.
    pub fn kind(&self) -> &'static str {
        match self {
            #[cfg(target_os = "macos")]
            Self::IOSurface(_) => "IOSurface",
            #[cfg(target_os = "linux")]
            Self::VaSurface { .. } => "VaSurface",
            #[cfg(target_os = "windows")]
            Self::D3D11Texture { .. } => "D3D11Texture",
            Self::Unsupported { .. } => "Unsupported",
        }
    }
}

/// Terminal GPU readback target for snapshot-style consumers.
pub struct GpuReadbackTarget {
    ctx: Arc<GpuContext>,
    texture: wgpu::Texture,
    width: u32,
    height: u32,
}

impl fmt::Debug for GpuReadbackTarget {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("GpuReadbackTarget")
            .field("width", &self.width)
            .field("height", &self.height)
            .field("format", &self.texture.format())
            .finish()
    }
}

impl GpuReadbackTarget {
    /// Create a terminal readback target.
    pub fn new(ctx: Arc<GpuContext>, texture: wgpu::Texture, width: u32, height: u32) -> Self {
        Self {
            ctx,
            texture,
            width,
            height,
        }
    }

    /// Read the texture back as RGBA8 bytes.
    pub fn read_rgba8(&self) -> Result<Vec<u8>> {
        let raw = self
            .ctx
            .read_texture_sync(&self.texture, self.width, self.height)?;

        if self.texture.format() == wgpu::TextureFormat::Rgba16Float {
            Ok(rgba16float_to_rgba8(&raw))
        } else {
            Ok(raw)
        }
    }

    /// Readback width.
    pub fn width(&self) -> u32 {
        self.width
    }

    /// Readback height.
    pub fn height(&self) -> u32 {
        self.height
    }
}

/// Cloneable GPU frame lease.
#[derive(Clone)]
pub struct GpuFrameLease {
    inner: Arc<GpuFrameLeaseInner>,
}

struct GpuFrameLeaseInner {
    handle: GpuOutputHandle,
    readback: Option<Arc<GpuReadbackTarget>>,
}

impl GpuFrameLease {
    /// Create a lease from a platform handle.
    pub fn new(handle: GpuOutputHandle) -> Self {
        Self {
            inner: Arc::new(GpuFrameLeaseInner {
                handle,
                readback: None,
            }),
        }
    }

    /// Create a lease from a platform handle and an optional terminal readback target.
    pub fn with_readback(
        handle: GpuOutputHandle,
        readback: Option<Arc<GpuReadbackTarget>>,
    ) -> Self {
        Self {
            inner: Arc::new(GpuFrameLeaseInner { handle, readback }),
        }
    }

    /// Borrow the platform handle.
    pub fn handle(&self) -> &GpuOutputHandle {
        &self.inner.handle
    }

    /// Return the native encoder handle for platforms supported in P0.
    pub fn native_encoder_handle(&self) -> Result<usize> {
        self.inner.handle.native_encoder_handle()
    }

    /// Read back this frame as RGBA8 if a terminal readback target is present.
    pub fn read_rgba8(&self) -> Result<VideoRawFrame> {
        let readback = self.inner.readback.as_ref().ok_or_else(|| {
            Error::UnsupportedCapability(format!(
                "GPU handle '{}' does not expose a terminal readback target",
                self.inner.handle.kind()
            ))
        })?;

        Ok(VideoRawFrame {
            data: readback.read_rgba8()?,
            width: readback.width(),
            height: readback.height(),
            format: FrameFormat::Rgba,
            pts: 0,
            duration: 0,
        })
    }

    /// Number of active lease references.
    pub fn strong_count(&self) -> usize {
        Arc::strong_count(&self.inner)
    }
}

impl fmt::Debug for GpuFrameLease {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("GpuFrameLease")
            .field("handle", &self.inner.handle)
            .field("has_readback", &self.inner.readback.is_some())
            .field("strong_count", &Arc::strong_count(&self.inner))
            .finish()
    }
}

/// GPU-resident video frame.
#[derive(Clone, Debug)]
pub struct VideoGpuFrame {
    /// GPU lease.
    pub lease: GpuFrameLease,
    /// Presentation timestamp in microseconds.
    pub pts: i64,
    /// Frame duration in microseconds.
    pub duration: i64,
    /// Monotonic frame index.
    pub frame_index: u64,
    /// Output width.
    pub width: u32,
    /// Output height.
    pub height: u32,
}

/// Terminal preview artifact.
#[derive(Clone, Debug)]
pub struct VideoPreviewFrame {
    /// Encoded or raw preview bytes.
    pub data: Vec<u8>,
    /// Width.
    pub width: u32,
    /// Height.
    pub height: u32,
    /// Format.
    pub format: FrameFormat,
    /// Presentation timestamp in microseconds.
    pub pts: i64,
    /// Frame duration in microseconds.
    pub duration: i64,
    /// Optional retryable unavailability state.
    pub unavailable: Option<PreviewUnavailable>,
}

/// Encoded video packet.
#[derive(Clone, Debug)]
pub struct VideoEncodedPacket {
    /// Encoded bytes.
    pub data: Vec<u8>,
    /// Presentation timestamp in microseconds.
    pub pts: i64,
    /// Decode timestamp in microseconds.
    pub dts: i64,
    /// Packet duration in microseconds.
    pub duration: i64,
    /// Keyframe marker.
    pub is_keyframe: bool,
    /// Codec.
    pub codec: VideoCodec,
    /// Stream index.
    pub stream_index: usize,
}

/// Raw terminal video frame.
#[derive(Clone, Debug)]
pub struct VideoRawFrame {
    /// Pixel bytes.
    pub data: Vec<u8>,
    /// Width.
    pub width: u32,
    /// Height.
    pub height: u32,
    /// Pixel format.
    pub format: FrameFormat,
    /// Presentation timestamp in microseconds.
    pub pts: i64,
    /// Frame duration in microseconds.
    pub duration: i64,
}

/// Interleaved f32 PCM audio buffer.
#[derive(Clone, Debug)]
pub struct AudioBuffer {
    /// Samples.
    pub samples: Vec<f32>,
    /// Sample rate.
    pub sample_rate: u32,
    /// Channel count.
    pub channels: u16,
    /// Presentation timestamp in microseconds.
    pub pts: i64,
    /// Buffer duration in microseconds.
    pub duration: i64,
}

/// Retryable preview unavailability contract.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PreviewUnavailable {
    /// Stable machine-readable reason.
    pub reason: PreviewUnavailableReason,
    /// Retry hint in milliseconds.
    pub retry_after_ms: u64,
    /// Human-readable message.
    pub message: String,
}

/// Preview unavailability reason.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum PreviewUnavailableReason {
    /// GPU budget policy paused this preview provider.
    GpuBusy,
}

impl PreviewUnavailable {
    /// Create a retryable GPU-busy preview artifact state.
    pub fn gpu_busy(retry_after: std::time::Duration) -> Self {
        Self {
            reason: PreviewUnavailableReason::GpuBusy,
            retry_after_ms: retry_after.as_millis().try_into().unwrap_or(u64::MAX),
            message: "GPU is busy; retry this preview shortly".to_string(),
        }
    }
}

/// Encoded audio packet.
#[derive(Clone, Debug)]
pub struct AudioEncodedPacket {
    /// Encoded bytes.
    pub data: Vec<u8>,
    /// Presentation timestamp in microseconds.
    pub pts: i64,
    /// Decode timestamp in microseconds.
    pub dts: i64,
    /// Packet duration in microseconds.
    pub duration: i64,
    /// Codec.
    pub codec: AudioCodec,
    /// Stream index.
    pub stream_index: usize,
}

/// Synchronous output adapter contract.
pub trait PipelineSink: Send + Sync {
    /// Return whether this sink accepts the output.
    fn accepts(&self, output: &PipelineOutput) -> bool;

    /// Submit one output item.
    fn submit(&self, output: PipelineOutput) -> Result<()>;

    /// Flush buffered state.
    fn flush(&self) -> Result<()>;

    /// Close the sink and release resources.
    fn close(&self) -> Result<()>;
}

fn rgba16float_to_rgba8(data: &[u8]) -> Vec<u8> {
    let pixel_count = data.len() / 8;
    let mut output = Vec::with_capacity(pixel_count * 4);
    for chunk in data.chunks_exact(8) {
        let r = half_to_f32(u16::from_le_bytes([chunk[0], chunk[1]]));
        let g = half_to_f32(u16::from_le_bytes([chunk[2], chunk[3]]));
        let b = half_to_f32(u16::from_le_bytes([chunk[4], chunk[5]]));
        let a = half_to_f32(u16::from_le_bytes([chunk[6], chunk[7]]));
        output.push((r.clamp(0.0, 1.0) * 255.0) as u8);
        output.push((g.clamp(0.0, 1.0) * 255.0) as u8);
        output.push((b.clamp(0.0, 1.0) * 255.0) as u8);
        output.push((a.clamp(0.0, 1.0) * 255.0) as u8);
    }
    output
}

fn half_to_f32(bits: u16) -> f32 {
    let sign = ((bits >> 15) & 1) as u32;
    let exponent = ((bits >> 10) & 0x1f) as u32;
    let mantissa = (bits & 0x03ff) as u32;

    if exponent == 0 {
        if mantissa == 0 {
            f32::from_bits(sign << 31)
        } else {
            let mut m = mantissa;
            let mut e = 0i32;
            while (m & 0x0400) == 0 {
                m <<= 1;
                e += 1;
            }
            let f32_exp = (127 - 15 - e) as u32;
            let f32_mantissa = (m & 0x03ff) << 13;
            f32::from_bits((sign << 31) | (f32_exp << 23) | f32_mantissa)
        }
    } else if exponent == 31 {
        let f32_mantissa = mantissa << 13;
        f32::from_bits((sign << 31) | (0xff << 23) | f32_mantissa)
    } else {
        let f32_exp = exponent + 127 - 15;
        let f32_mantissa = mantissa << 13;
        f32::from_bits((sign << 31) | (f32_exp << 23) | f32_mantissa)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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

    #[test]
    fn gpu_frame_lease_is_cloneable_and_ref_counted() {
        fn assert_send_sync<T: Send + Sync>() {}
        assert_send_sync::<GpuFrameLease>();

        let lease = GpuFrameLease::new(test_handle());
        assert_eq!(lease.strong_count(), 1);

        let clone = lease.clone();
        assert_eq!(lease.strong_count(), 2);
        assert_eq!(clone.strong_count(), 2);

        drop(clone);
        assert_eq!(lease.strong_count(), 1);
    }

    #[test]
    fn unsupported_handle_returns_actionable_error() {
        let handle = GpuOutputHandle::Unsupported {
            platform: "test",
            reason: "missing native interop".to_string(),
        };

        let err = handle.native_encoder_handle().unwrap_err();
        assert!(matches!(err, Error::UnsupportedCapability(_)));
        assert!(err.to_string().contains("missing native interop"));
    }
}
