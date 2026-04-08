//! Frame data types

use neko_engine_types::FrameFormat;

/// Decoded frame data — output of capture/extract/composite operations
#[derive(Debug, Clone)]
pub struct FrameData {
    /// Raw pixel data
    pub data: Vec<u8>,
    /// Frame width
    pub width: u32,
    /// Frame height
    pub height: u32,
    /// Pixel format
    pub format: FrameFormat,
    /// Timestamp in seconds
    pub timestamp: f64,
}

impl FrameData {
    /// Create a new frame
    pub fn new(data: Vec<u8>, width: u32, height: u32, format: FrameFormat) -> Self {
        Self {
            data,
            width,
            height,
            format,
            timestamp: 0.0,
        }
    }

    /// Create with timestamp
    pub fn with_timestamp(mut self, timestamp: f64) -> Self {
        self.timestamp = timestamp;
        self
    }

    /// Get frame size in bytes
    pub fn size(&self) -> usize {
        self.data.len()
    }

    /// Check if frame is empty
    pub fn is_empty(&self) -> bool {
        self.data.is_empty()
    }

    /// Get expected size based on dimensions and format
    pub fn expected_size(&self) -> usize {
        let pixels = (self.width * self.height) as usize;
        match self.format {
            FrameFormat::Rgba => pixels * 4,
            FrameFormat::Nv12 => pixels * 3 / 2,
            FrameFormat::Jpeg
            | FrameFormat::Png
            | FrameFormat::Webp
            | FrameFormat::H264
            | FrameFormat::PcmF32
            | FrameFormat::Opus => self.data.len(), // Compressed/packed
        }
    }
}

/// NV12 frame data for GPU pipeline
#[derive(Debug, Clone)]
pub struct Nv12FrameData {
    /// Y plane data
    pub y_data: Vec<u8>,
    /// UV plane data (interleaved)
    pub uv_data: Vec<u8>,
    /// Frame width
    pub width: u32,
    /// Frame height
    pub height: u32,
    /// Timestamp
    pub timestamp: f64,
}

impl Nv12FrameData {
    pub fn new(y_data: Vec<u8>, uv_data: Vec<u8>, width: u32, height: u32) -> Self {
        Self {
            y_data,
            uv_data,
            width,
            height,
            timestamp: 0.0,
        }
    }

    /// Convert to contiguous bytes (Y followed by UV)
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut bytes = Vec::with_capacity(self.y_data.len() + self.uv_data.len());
        bytes.extend_from_slice(&self.y_data);
        bytes.extend_from_slice(&self.uv_data);
        bytes
    }

    /// Get Y plane stride
    pub fn y_stride(&self) -> u32 {
        self.width
    }

    /// Get UV plane stride
    pub fn uv_stride(&self) -> u32 {
        self.width
    }

    /// Get total size in bytes
    pub fn size(&self) -> usize {
        self.y_data.len() + self.uv_data.len()
    }
}
