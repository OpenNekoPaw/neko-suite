//! Image upscale inference pipeline (Real-ESRGAN / SwinIR).
//!
//! TODO(P1): Implement when ort 2.0 stable is released.
//! Pipeline: load image → normalize to [0,1] float32 NCHW → run session → denormalize → save

use crate::error::{Error, Result};

/// Run upscale inference on an image file.
///
/// Currently a placeholder — the ort 2.0 RC API is unstable.
/// Will be implemented when ort 2.0 reaches stable release.
pub fn upscale(
    _session: &mut ort::session::Session,
    input_path: &str,
    output_path: &str,
    scale: u32,
) -> Result<()> {
    // Verify paths
    if !std::path::Path::new(input_path).exists() {
        return Err(Error::FileNotFound(input_path.to_string()));
    }

    Err(Error::Other(format!(
        "Upscale inference not yet implemented (ort 2.0 RC). \
         Input: {}, Output: {}, Scale: {}x",
        input_path, output_path, scale
    )))
}
