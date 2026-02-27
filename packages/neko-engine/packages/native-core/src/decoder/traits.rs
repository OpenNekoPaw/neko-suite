//! Decoder trait and types

use crate::error::Result;

/// Pixel format for decoded frames
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PixelFormat {
    /// RGBA 8-bit per channel
    Rgba,
    /// RGB 8-bit per channel
    Rgb,
    /// YUV 4:2:0 planar
    Yuv420p,
    /// NV12 (Y plane + interleaved UV)
    Nv12,
}

impl PixelFormat {
    /// Get bytes per pixel for packed formats
    pub fn bytes_per_pixel(&self) -> Option<usize> {
        match self {
            PixelFormat::Rgba => Some(4),
            PixelFormat::Rgb => Some(3),
            PixelFormat::Yuv420p | PixelFormat::Nv12 => None, // Planar formats
        }
    }

    /// Calculate buffer size for given dimensions
    pub fn buffer_size(&self, width: u32, height: u32) -> usize {
        let w = width as usize;
        let h = height as usize;
        match self {
            PixelFormat::Rgba => w * h * 4,
            PixelFormat::Rgb => w * h * 3,
            PixelFormat::Yuv420p | PixelFormat::Nv12 => w * h * 3 / 2,
        }
    }

    /// Convert to string representation
    pub fn as_str(&self) -> &'static str {
        match self {
            PixelFormat::Rgba => "rgba",
            PixelFormat::Rgb => "rgb",
            PixelFormat::Yuv420p => "yuv420p",
            PixelFormat::Nv12 => "nv12",
        }
    }
}

/// Frame data - either CPU buffer or GPU texture handle
#[derive(Debug)]
pub enum FrameData {
    /// CPU memory buffer
    Cpu(Vec<u8>),
    /// GPU texture handle (platform-specific)
    #[allow(dead_code)]
    Gpu(GpuTextureHandle),
}

/// GPU texture handle for hardware-decoded frames
#[derive(Debug)]
pub enum GpuTextureHandle {
    /// No GPU texture (CPU-only frame)
    None,
    /// CPU NV12 data (software decode fallback when hardware decoder is exhausted)
    CpuNv12 {
        /// Y plane data
        y_data: Vec<u8>,
        /// UV plane data (interleaved)
        uv_data: Vec<u8>,
        /// Y plane linesize (bytes per row)
        y_linesize: u32,
        /// UV plane linesize (bytes per row)
        uv_linesize: u32,
    },
    /// macOS VideoToolbox CVPixelBuffer
    #[cfg(target_os = "macos")]
    VideoToolbox {
        /// CVPixelBuffer pointer (as usize for FFI safety)
        pixel_buffer: usize,
        /// IOSurface pointer for Metal interop
        io_surface: usize,
    },
    /// Linux VAAPI surface
    #[cfg(target_os = "linux")]
    Vaapi {
        /// VASurfaceID
        surface_id: u32,
        /// VADisplay pointer
        display: usize,
    },
    /// NVIDIA CUDA surface
    #[cfg(any(target_os = "linux", target_os = "windows"))]
    Cuda {
        /// CUdeviceptr
        device_ptr: usize,
        /// Pitch in bytes
        pitch: usize,
    },
    /// Windows D3D11 texture
    #[cfg(target_os = "windows")]
    D3d11 {
        /// ID3D11Texture2D pointer
        texture: usize,
        /// Texture array index
        array_index: u32,
    },
}

/// Decoded video frame
#[derive(Debug)]
pub struct DecodedFrame {
    /// Frame width in pixels
    pub width: u32,
    /// Frame height in pixels
    pub height: u32,
    /// Pixel format
    pub format: PixelFormat,
    /// Timestamp in seconds
    pub timestamp: f64,
    /// Whether this is a keyframe
    pub is_keyframe: bool,
    /// Frame data
    pub data: FrameData,
}

impl DecodedFrame {
    /// Get frame data as bytes (only for CPU frames)
    pub fn as_bytes(&self) -> Option<&[u8]> {
        match &self.data {
            FrameData::Cpu(data) => Some(data),
            FrameData::Gpu(_) => None,
        }
    }

    /// Take ownership of CPU frame data
    pub fn into_bytes(self) -> Option<Vec<u8>> {
        match self.data {
            FrameData::Cpu(data) => Some(data),
            FrameData::Gpu(_) => None,
        }
    }
}

/// Media information
#[derive(Debug, Clone)]
pub struct MediaInfo {
    /// Video width
    pub width: u32,
    /// Video height
    pub height: u32,
    /// Duration in seconds
    pub duration: f64,
    /// Frame rate (fps)
    pub fps: f64,
    /// Video codec name
    pub codec: String,
    /// Pixel format string
    pub pixel_format: String,
    /// Total number of frames (estimated)
    pub frame_count: u64,
}

/// Decoder trait for video decoding
pub trait Decoder {
    /// Open a video file
    fn open(&mut self, path: &str) -> Result<MediaInfo>;

    /// Seek to a specific time position
    fn seek(&mut self, time_seconds: f64) -> Result<()>;

    /// Decode the next frame
    fn decode_next(&mut self) -> Result<Option<DecodedFrame>>;

    /// Decode frame at specific time
    fn decode_at(&mut self, time_seconds: f64) -> Result<Option<DecodedFrame>> {
        self.seek(time_seconds)?;
        self.decode_next()
    }

    /// Get current position in seconds
    fn position(&self) -> f64;

    /// Get media info (must call open first)
    fn media_info(&self) -> Option<&MediaInfo>;

    /// Close the decoder and release resources
    fn close(&mut self);
}
