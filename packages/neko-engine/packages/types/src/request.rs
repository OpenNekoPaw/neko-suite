//! Request/Response protocol types

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{ApiError, ErrorCode};

/// Unified action request — all View layers convert to this format
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionRequest {
    /// Resource group (videos, audios, images, timelines, tasks, nodes)
    pub group: String,

    /// Resource ID (deterministic hash or empty for new resources)
    #[serde(default)]
    pub id: String,

    /// Action to perform (probe, capture, extract, stream, etc.)
    pub action: String,

    /// Source file path (for self-healing when ID is stale)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,

    /// Session ID for multi-window isolation
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,

    /// Stream ID for signal targeting (pause/resume/speed/loop)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stream_id: Option<String>,

    /// Action-specific options
    #[serde(default)]
    pub options: Value,

    /// Request body (for complex payloads like Timeline)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<Value>,
}

impl ActionRequest {
    pub fn new(group: impl Into<String>, action: impl Into<String>) -> Self {
        Self {
            group: group.into(),
            id: String::new(),
            action: action.into(),
            source: None,
            session_id: None,
            stream_id: None,
            options: Value::Null,
            body: None,
        }
    }

    pub fn with_id(mut self, id: impl Into<String>) -> Self {
        self.id = id.into();
        self
    }

    pub fn with_source(mut self, source: impl Into<String>) -> Self {
        self.source = Some(source.into());
        self
    }

    pub fn with_session(mut self, session_id: impl Into<String>) -> Self {
        self.session_id = Some(session_id.into());
        self
    }

    pub fn with_stream(mut self, stream_id: impl Into<String>) -> Self {
        self.stream_id = Some(stream_id.into());
        self
    }

    pub fn with_options(mut self, options: Value) -> Self {
        self.options = options;
        self
    }

    pub fn with_body(mut self, body: Value) -> Self {
        self.body = Some(body);
        self
    }

    /// Get option as string
    pub fn option_str(&self, key: &str) -> Option<&str> {
        self.options.get(key).and_then(|v| v.as_str())
    }

    /// Get option as f64
    pub fn option_f64(&self, key: &str) -> Option<f64> {
        self.options.get(key).and_then(|v| v.as_f64())
    }

    /// Get option as i64
    pub fn option_i64(&self, key: &str) -> Option<i64> {
        self.options.get(key).and_then(|v| v.as_i64())
    }

    /// Get option as u64
    pub fn option_u64(&self, key: &str) -> Option<u64> {
        self.options.get(key).and_then(|v| v.as_u64())
    }

    /// Get option as bool
    pub fn option_bool(&self, key: &str) -> Option<bool> {
        self.options.get(key).and_then(|v| v.as_bool())
    }

    /// Parse body as typed value
    pub fn parse_body<T: for<'de> Deserialize<'de>>(&self) -> Result<T, ApiError> {
        match &self.body {
            Some(body) => serde_json::from_value(body.clone()).map_err(|e| {
                ApiError::new(ErrorCode::ValidationError, format!("Invalid body: {}", e))
            }),
            None => Err(ApiError::missing_parameter("body")),
        }
    }
}

/// Unified action response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionResponse {
    /// Request ID (echoed back for correlation)
    pub id: String,

    /// Response status
    pub status: ResponseStatus,

    /// Response data (action-specific)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,

    /// Progress info (for long-running operations)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub progress: Option<Value>,

    /// Error info (if status is Error)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<ApiError>,
}

/// Response status
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ResponseStatus {
    Ok,
    Error,
    Pending,
    Progress,
}

impl ActionResponse {
    /// Create success response
    pub fn ok(id: impl Into<String>, data: Value) -> Self {
        Self {
            id: id.into(),
            status: ResponseStatus::Ok,
            data: Some(data),
            progress: None,
            error: None,
        }
    }

    /// Create error response
    pub fn error(id: impl Into<String>, code: ErrorCode, message: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            status: ResponseStatus::Error,
            data: None,
            progress: None,
            error: Some(ApiError::new(code, message)),
        }
    }

    /// Create error response from ApiError
    pub fn from_error(id: impl Into<String>, error: ApiError) -> Self {
        Self {
            id: id.into(),
            status: ResponseStatus::Error,
            data: None,
            progress: None,
            error: Some(error),
        }
    }

    /// Create pending response (for async operations)
    pub fn pending(id: impl Into<String>, task_id: &str) -> Self {
        Self {
            id: id.into(),
            status: ResponseStatus::Pending,
            data: Some(serde_json::json!({ "taskId": task_id })),
            progress: None,
            error: None,
        }
    }

    /// Create progress response
    pub fn progress(id: impl Into<String>, progress: Value) -> Self {
        Self {
            id: id.into(),
            status: ResponseStatus::Progress,
            data: None,
            progress: Some(progress),
            error: None,
        }
    }

    /// Check if response is successful
    pub fn is_ok(&self) -> bool {
        self.status == ResponseStatus::Ok
    }

    /// Check if response is error
    pub fn is_error(&self) -> bool {
        self.status == ResponseStatus::Error
    }
}
