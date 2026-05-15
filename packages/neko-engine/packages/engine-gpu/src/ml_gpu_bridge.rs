//! Export-oriented ML GPU bridge contracts.
//!
//! The bridge is intentionally explicit about unsupported platform paths. It
//! must not read textures back to CPU ONNX and upload the result inside a hot
//! render path.

use crate::error::{GpuError as Error, GpuResult as Result};

/// ORT tensor handle owned by a platform-specific GPU bridge.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct OrtGpuTensorHandle {
    /// Backend name, e.g. "coreml", "cuda", "dml".
    pub backend: &'static str,
    /// Opaque backend handle.
    pub handle: usize,
    /// Tensor shape.
    pub shape: Vec<i64>,
}

/// Texture description passed across the bridge boundary.
pub struct MlGpuTexture<'a> {
    /// Texture to bridge.
    pub texture: &'a wgpu::Texture,
    /// Texture width.
    pub width: u32,
    /// Texture height.
    pub height: u32,
    /// Texture format.
    pub format: wgpu::TextureFormat,
}

/// Export-time texture/tensor bridge for ML workflows.
pub trait MlGpuBridge: Send + Sync {
    /// Stable backend name.
    fn backend(&self) -> &'static str;

    /// Convert a GPU texture into an ORT GPU tensor handle.
    fn texture_to_ort(&self, texture: MlGpuTexture<'_>) -> Result<OrtGpuTensorHandle>;

    /// Convert an ORT GPU tensor handle into a GPU texture.
    fn ort_to_texture(&self, tensor: &OrtGpuTensorHandle, output: MlGpuTexture<'_>) -> Result<()>;
}

/// Explicit unsupported bridge used when platform interop is unavailable.
#[derive(Debug, Clone)]
pub struct UnsupportedMlGpuBridge {
    backend: &'static str,
    reason: String,
}

impl UnsupportedMlGpuBridge {
    /// Create an unsupported bridge with an actionable reason.
    pub fn new(backend: &'static str, reason: impl Into<String>) -> Self {
        Self {
            backend,
            reason: reason.into(),
        }
    }

    /// Create the default bridge for this platform.
    pub fn for_current_platform() -> Self {
        Self::new(
            current_platform_backend(),
            format!(
                "ML GPU texture/ORT interop is not implemented on {}; CPU ONNX fallback is disabled for hot paths",
                std::env::consts::OS
            ),
        )
    }

    fn unsupported(&self) -> Error {
        Error::UnsupportedCapability(format!(
            "{} ML GPU bridge unavailable: {}",
            self.backend, self.reason
        ))
    }
}

impl MlGpuBridge for UnsupportedMlGpuBridge {
    fn backend(&self) -> &'static str {
        self.backend
    }

    fn texture_to_ort(&self, _texture: MlGpuTexture<'_>) -> Result<OrtGpuTensorHandle> {
        Err(self.unsupported())
    }

    fn ort_to_texture(
        &self,
        _tensor: &OrtGpuTensorHandle,
        _output: MlGpuTexture<'_>,
    ) -> Result<()> {
        Err(self.unsupported())
    }
}

/// Return a bridge implementation for the current platform.
pub fn default_ml_gpu_bridge() -> Box<dyn MlGpuBridge> {
    Box::new(UnsupportedMlGpuBridge::for_current_platform())
}

fn current_platform_backend() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        "coreml"
    }
    #[cfg(target_os = "linux")]
    {
        "cuda"
    }
    #[cfg(target_os = "windows")]
    {
        "dml"
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        "unsupported"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_bridge_reports_explicit_unsupported_capability() {
        let bridge = UnsupportedMlGpuBridge::for_current_platform();
        assert!(!bridge.backend().is_empty());

        let err = bridge.unsupported();

        assert!(matches!(err, Error::UnsupportedCapability(_)));
        assert!(err.to_string().contains("CPU ONNX fallback is disabled"));
    }
}
