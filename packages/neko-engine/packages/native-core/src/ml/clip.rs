//! CLIP score computation — image + text → cosine similarity.
//!
//! TODO(P1): Implement when ort 2.0 stable is released.
//! Requires dual-session model loading (visual + textual encoder).

use crate::error::{Error, Result};

/// Compute CLIP similarity score between an image and a text prompt.
pub fn clip_score(
    _image_session: &mut ort::session::Session,
    _text_session: &mut ort::session::Session,
    image_path: &str,
    _text_tokens: &[i32],
) -> Result<f32> {
    if !std::path::Path::new(image_path).exists() {
        return Err(Error::FileNotFound(image_path.to_string()));
    }

    Err(Error::Other(
        "CLIP score not yet implemented (ort 2.0 RC + dual-session)".to_string(),
    ))
}

/// Cosine similarity between two vectors.
pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    let len = a.len().min(b.len());
    if len == 0 {
        return 0.0;
    }
    let (mut dot, mut na, mut nb) = (0.0f32, 0.0f32, 0.0f32);
    for i in 0..len {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    let denom = na.sqrt() * nb.sqrt();
    if denom < 1e-8 { 0.0 } else { (dot / denom).clamp(-1.0, 1.0) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cosine_identical() {
        assert!((cosine_similarity(&[1.0, 2.0, 3.0], &[1.0, 2.0, 3.0]) - 1.0).abs() < 1e-6);
    }

    #[test]
    fn test_cosine_orthogonal() {
        assert!(cosine_similarity(&[1.0, 0.0], &[0.0, 1.0]).abs() < 1e-6);
    }
}
