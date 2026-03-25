//! Image denoise inference pipeline.
//!
//! TODO(P1): Implement when ort 2.0 stable is released.

use crate::error::{Error, Result};

/// Run denoise inference on an image file.
pub fn denoise(
    _session: &mut ort::session::Session,
    input_path: &str,
    output_path: &str,
    strength: f32,
) -> Result<()> {
    if !std::path::Path::new(input_path).exists() {
        return Err(Error::FileNotFound(input_path.to_string()));
    }

    Err(Error::Other(format!(
        "Denoise inference not yet implemented (ort 2.0 RC). \
         Input: {}, Output: {}, Strength: {}",
        input_path, output_path, strength
    )))
}
