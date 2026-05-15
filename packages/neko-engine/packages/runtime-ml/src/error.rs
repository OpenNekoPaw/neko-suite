//! Error contracts for ML runtime operations.

use thiserror::Error;

/// Result type alias for ML runtime operations.
pub type MlResult<T> = std::result::Result<T, MlError>;

/// Backward-compatible local alias used by ML modules.
pub type Result<T> = MlResult<T>;

/// ML runtime failures.
#[derive(Error, Debug)]
pub enum MlError {
    /// File not found.
    #[error("File not found: {0}")]
    FileNotFound(String),

    /// Requested model or resource was not found.
    #[error("Not found: {0}")]
    NotFound(String),

    /// Generic ML runtime error.
    #[error("{0}")]
    Other(String),
}

/// Backward-compatible local alias used by ML modules.
pub use MlError as Error;
