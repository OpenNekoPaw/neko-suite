//! ONNX Runtime session management with device-aware execution provider selection.
//!
//! macOS: CoreML EP (Apple Neural Engine / GPU) — auto-selected, falls back to CPU.
//! Windows/Linux: CPU only for now (DirectML / CUDA planned as future work).

use neko_engine_kernel::error::{Error, Result};
use ort::session::Session;

/// Device selection for ONNX Runtime inference.
#[derive(Debug, Clone, Default)]
pub enum DeviceSelection {
    /// Auto-select best available EP for the current platform.
    /// macOS → CoreML EP; others → CPU.
    #[default]
    Auto,
    Cpu,
    Cuda(i32),
    CoreMl,
    /// DirectML — Windows only, planned future support.
    DirectMl,
}

/// Create an ort Session from a model file path with the requested device.
///
/// On macOS, `Auto` and `CoreMl` attempt CoreML EP first, silently falling back
/// to CPU if the EP is unavailable (e.g. simulator, unsupported hardware).
///
/// Windows / Linux always use CPU until their respective EPs are wired up.
pub fn create_session(model_path: &str, device: &DeviceSelection) -> Result<Session> {
    if !std::path::Path::new(model_path).exists() {
        return Err(Error::FileNotFound(model_path.to_string()));
    }

    _create(model_path, device)
        .map_err(|e| Error::Other(format!("ONNX session '{}': {}", model_path, e)))
}

// --- platform implementations ---

/// macOS: try CoreML EP, fall back to CPU on failure.
#[cfg(target_os = "macos")]
fn _create(model_path: &str, device: &DeviceSelection) -> ort::Result<Session> {
    use ort::execution_providers::CoreMLExecutionProvider;

    let use_coreml = matches!(device, DeviceSelection::Auto | DeviceSelection::CoreMl);
    if use_coreml {
        let builder = Session::builder()?;
        match builder.with_execution_providers([CoreMLExecutionProvider::default().build()]) {
            Ok(mut b) => {
                tracing::debug!(model = %model_path, "Using CoreML EP");
                return b.commit_from_file(model_path);
            }
            Err(e) => {
                tracing::warn!("CoreML EP unavailable ({}), falling back to CPU", e);
            }
        }
    }
    Session::builder()?.commit_from_file(model_path)
}

/// Windows / Linux: CPU only (DirectML / CUDA planned).
#[cfg(not(target_os = "macos"))]
fn _create(model_path: &str, _device: &DeviceSelection) -> ort::Result<Session> {
    Session::builder()?.commit_from_file(model_path)
}
