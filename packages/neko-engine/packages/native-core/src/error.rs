//! Error types for media processor

use thiserror::Error;

/// Result type alias for media processor operations
pub type Result<T> = std::result::Result<T, Error>;

/// Error types for media processor
#[derive(Error, Debug)]
pub enum Error {
    /// GPU initialization failed
    #[error("GPU initialization failed: {0}")]
    GpuInit(String),

    /// GPU device lost
    #[error("GPU device lost")]
    GpuDeviceLost,

    /// Shader compilation failed
    #[error("Shader compilation failed: {0}")]
    ShaderCompilation(String),

    /// Buffer operation failed
    #[error("Buffer operation failed: {0}")]
    BufferError(String),

    /// FFmpeg error
    #[error("FFmpeg error: {0}")]
    Ffmpeg(String),

    /// Decoder not initialized
    #[error("Decoder not initialized")]
    DecoderNotInitialized,

    /// Encoder not initialized
    #[error("Encoder not initialized")]
    EncoderNotInitialized,

    /// Muxer not initialized
    #[error("Muxer not initialized")]
    MuxerNotInitialized,

    /// Invalid seek position
    #[error("Invalid seek position: {0}")]
    InvalidSeek(f64),

    /// Frame decode failed
    #[error("Frame decode failed: {0}")]
    DecodeFailed(String),

    /// Frame encode failed
    #[error("Frame encode failed: {0}")]
    EncodeFailed(String),

    /// Invalid frame format
    #[error("Invalid frame format: expected {expected}, got {actual}")]
    InvalidFormat { expected: String, actual: String },

    /// File not found
    #[error("File not found: {0}")]
    FileNotFound(String),

    /// Invalid parameter
    #[error("Invalid parameter: {0}")]
    InvalidParameter(String),

    /// Unsupported codec
    #[error("Unsupported codec: {0}")]
    UnsupportedCodec(String),

    /// Unsupported container format
    #[error("Unsupported container format: {0}")]
    UnsupportedContainer(String),

    /// Hardware encoder not available
    #[error("Hardware encoder not available: {0}")]
    HwEncoderNotAvailable(String),

    /// Operation cancelled
    #[error("Operation cancelled")]
    Cancelled,

    /// Frame not found at specified time
    #[error("Frame not found at time: {0}")]
    FrameNotFound(f64),

    /// GPU operation error
    #[error("GPU error: {0}")]
    GpuError(String),

    /// JPEG encoding error
    #[error("JPEG error: {0}")]
    Jpeg(String),

    /// IO error
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    /// Generic error
    #[error("{0}")]
    Other(String),
}

impl From<wgpu::RequestDeviceError> for Error {
    fn from(e: wgpu::RequestDeviceError) -> Self {
        Error::GpuInit(e.to_string())
    }
}

impl From<ffmpeg_next::Error> for Error {
    fn from(e: ffmpeg_next::Error) -> Self {
        Error::Ffmpeg(e.to_string())
    }
}
