//! ONNX Runtime session management — placeholder for ort 2.0 stable.
//!
//! The `ort` crate is currently at 2.0.0-rc.12 with unstable API.
//! This module defines the interface; actual session creation will be
//! implemented when ort 2.0 reaches stable.

use crate::error::{Error, Result};

/// Device selection for ONNX Runtime inference.
#[derive(Debug, Clone, Default)]
pub enum DeviceSelection {
    #[default]
    Auto,
    Cpu,
    Cuda(i32),
    CoreMl,
}

/// Create an ort Session from a model file path.
///
/// TODO(P1): Implement when ort 2.0 stable is released.
/// Current ort 2.0.0-rc.12 has unstable API (SessionBuilder private,
/// Value::from_array signature changes, try_extract_tensor return type changes).
pub fn create_session(
    model_path: &str,
    _device: &DeviceSelection,
) -> Result<ort::session::Session> {
    // Verify path exists
    if !std::path::Path::new(model_path).exists() {
        return Err(Error::FileNotFound(model_path.to_string()));
    }

    // Basic session creation — CPU only for now
    ort::session::Session::builder()
        .and_then(|mut b| b.commit_from_file(model_path))
        .map_err(|e| Error::Other(format!("Failed to load ONNX model: {}", e)))
}
