//! Error types and codes

use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Unified error codes for API responses
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ErrorCode {
    // Resource errors (1xx)
    ResourceNotFound,
    ResourceAlreadyExists,
    InvalidResourceId,
    InvalidResourceType,

    // Stream errors (2xx)
    StreamNotFound,
    StreamAlreadyExists,
    InvalidStreamState,
    StreamTimeout,

    // Media errors (3xx)
    DecodeError,
    EncodeError,
    UnsupportedCodec,
    UnsupportedFormat,
    InvalidMediaFile,
    MediaNotReady,

    // Task errors (4xx)
    TaskNotFound,
    TaskAlreadyCancelled,
    TaskAlreadyCompleted,
    InvalidTaskState,

    // GPU errors (5xx)
    GpuNotAvailable,
    GpuContextError,
    ShaderCompilationError,
    TextureError,

    // IO errors (6xx)
    FileNotFound,
    PermissionDenied,
    IoError,

    // Validation errors (7xx)
    InvalidParameter,
    MissingParameter,
    ValidationError,

    // Internal errors (9xx)
    InternalError,
    NotImplemented,
    Unknown,
}

impl ErrorCode {
    /// Get HTTP status code equivalent
    pub fn http_status(&self) -> u16 {
        match self {
            Self::ResourceNotFound
            | Self::StreamNotFound
            | Self::TaskNotFound
            | Self::FileNotFound => 404,

            Self::ResourceAlreadyExists | Self::StreamAlreadyExists => 409,

            Self::InvalidResourceId
            | Self::InvalidResourceType
            | Self::InvalidStreamState
            | Self::InvalidTaskState
            | Self::InvalidParameter
            | Self::MissingParameter
            | Self::ValidationError => 400,

            Self::PermissionDenied => 403,

            Self::UnsupportedCodec | Self::UnsupportedFormat | Self::NotImplemented => 501,

            Self::GpuNotAvailable
            | Self::GpuContextError
            | Self::ShaderCompilationError
            | Self::TextureError
            | Self::DecodeError
            | Self::EncodeError
            | Self::InvalidMediaFile
            | Self::MediaNotReady
            | Self::IoError
            | Self::InternalError
            | Self::Unknown => 500,

            Self::StreamTimeout => 504,

            Self::TaskAlreadyCancelled | Self::TaskAlreadyCompleted => 409,
        }
    }
}

/// API error response
#[derive(Debug, Clone, Serialize, Deserialize, Error)]
#[error("{message}")]
#[serde(rename_all = "camelCase")]
pub struct ApiError {
    pub code: ErrorCode,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<serde_json::Value>,
}

impl ApiError {
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            details: None,
        }
    }

    pub fn with_details(mut self, details: serde_json::Value) -> Self {
        self.details = Some(details);
        self
    }

    // Convenience constructors
    pub fn resource_not_found(id: &str) -> Self {
        Self::new(ErrorCode::ResourceNotFound, format!("Resource not found: {}", id))
    }

    pub fn stream_not_found(id: &str) -> Self {
        Self::new(ErrorCode::StreamNotFound, format!("Stream not found: {}", id))
    }

    pub fn task_not_found(id: &str) -> Self {
        Self::new(ErrorCode::TaskNotFound, format!("Task not found: {}", id))
    }

    pub fn invalid_parameter(param: &str, reason: &str) -> Self {
        Self::new(
            ErrorCode::InvalidParameter,
            format!("Invalid parameter '{}': {}", param, reason),
        )
    }

    pub fn missing_parameter(param: &str) -> Self {
        Self::new(
            ErrorCode::MissingParameter,
            format!("Missing required parameter: {}", param),
        )
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::InternalError, message)
    }

    pub fn decode_error(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::DecodeError, message)
    }

    pub fn encode_error(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::EncodeError, message)
    }
}
