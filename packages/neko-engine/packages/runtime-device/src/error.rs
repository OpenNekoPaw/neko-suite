//! Error contracts for device runtime operations.

use thiserror::Error;

/// Result type alias for device runtime operations.
pub type DeviceResult<T> = std::result::Result<T, DeviceError>;

/// Backward-compatible local alias used by device modules.
pub type Result<T> = DeviceResult<T>;

/// Device runtime failures.
#[derive(Error, Debug)]
pub enum DeviceError {
    /// Requested device, port, gamepad, or stream was not found.
    #[error("Not found: {0}")]
    NotFound(String),

    /// Device capability is not implemented or unavailable on this platform.
    #[error("Unsupported capability: {0}")]
    UnsupportedCapability(String),

    /// Generic device runtime error.
    #[error("{0}")]
    Other(String),
}

/// Backward-compatible local alias used by device modules.
pub use DeviceError as Error;
