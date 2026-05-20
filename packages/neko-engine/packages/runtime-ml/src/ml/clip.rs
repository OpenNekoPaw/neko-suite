//! CLIP score computation — image + text tokens → cosine similarity.
//!
//! Uses two separate ONNX sessions:
//!   - `image_session`: visual encoder (e.g. clip-vit-base-visual.onnx)
//!     Input:  `pixel_values` [1, 3, 224, 224] f32 (ImageNet normalised)
//!     Output: `image_embeds` [1, 512] f32
//!   - `text_session`: textual encoder (e.g. clip-vit-base-text.onnx)
//!     Input:  `input_ids` [1, seq_len] i64
//!     Output: `text_embeds` [1, 512] f32
//!
//! Token IDs must be provided by the caller (use an external BPE tokeniser or
//! the CLIP tokeniser bundled with the model package).

use crate::{Error, Result};
use ndarray::{Array3, Array4};
use ort::value::Tensor as OrtTensor;

// ImageNet normalisation constants.
const IMAGENET_MEAN: [f32; 3] = [0.485, 0.456, 0.406];
const IMAGENET_STD: [f32; 3] = [0.229, 0.224, 0.225];
const CLIP_INPUT_SIZE: u32 = 224;

/// Compute CLIP similarity score between an image and pre-tokenised text.
///
/// `text_tokens`: BPE token IDs produced by the CLIP tokeniser (max 77 tokens,
/// start with SOT=49406, end with EOT=49407, padded with zeros).
pub fn clip_score(
    image_session: &mut ort::session::Session,
    text_session: &mut ort::session::Session,
    image_path: &str,
    text_tokens: &[i32],
) -> Result<f32> {
    if !std::path::Path::new(image_path).exists() {
        return Err(Error::FileNotFound(image_path.to_string()));
    }

    let img_embed = encode_image(image_session, image_path)?;
    let txt_embed = encode_text(text_session, text_tokens)?;

    Ok(cosine_similarity(&img_embed, &txt_embed))
}

/// Encode an image file into a CLIP embedding vector.
pub fn encode_image(session: &mut ort::session::Session, image_path: &str) -> Result<Vec<f32>> {
    let img = image::open(image_path)
        .map_err(|e| Error::Other(format!("Open '{}': {}", image_path, e)))?
        .to_rgb8();

    // Resize to 224×224 using Lanczos3.
    let resized = image::imageops::resize(
        &img,
        CLIP_INPUT_SIZE,
        CLIP_INPUT_SIZE,
        image::imageops::FilterType::Lanczos3,
    );

    // Convert to NCHW f32, apply ImageNet normalisation.
    let mut tensor =
        Array4::<f32>::zeros((1, 3, CLIP_INPUT_SIZE as usize, CLIP_INPUT_SIZE as usize));
    for (x, y, p) in resized.enumerate_pixels() {
        for c in 0..3usize {
            let v = p[c] as f32 / 255.0;
            tensor[[0, c, y as usize, x as usize]] = (v - IMAGENET_MEAN[c]) / IMAGENET_STD[c];
        }
    }

    let input_dyn = tensor.into_dyn();
    let input_tensor = OrtTensor::from_array(input_dyn)
        .map_err(|e| Error::Other(format!("Create image tensor: {}", e)))?;
    let outputs = session
        .run(ort::inputs!["pixel_values" => input_tensor])
        .map_err(|e| Error::Other(format!("Image encode: {}", e)))?;

    extract_embedding(&outputs, 0, "image_embeds")
}

/// Encode pre-tokenised text into a CLIP embedding vector.
pub fn encode_text(session: &mut ort::session::Session, token_ids: &[i32]) -> Result<Vec<f32>> {
    let seq_len = token_ids.len().max(1);
    let mut tokens = Array3::<i64>::zeros((1, 1, seq_len));
    for (i, &id) in token_ids.iter().enumerate() {
        tokens[[0, 0, i]] = id as i64;
    }
    // Reshape to [1, seq_len] as most CLIP text encoders expect.
    let tokens_2d = tokens
        .into_shape_with_order((1, seq_len))
        .map_err(|e| Error::Other(format!("Token reshape: {}", e)))?
        .into_dyn();

    let tokens_tensor = OrtTensor::from_array(tokens_2d)
        .map_err(|e| Error::Other(format!("Create tokens tensor: {}", e)))?;
    let outputs = session
        .run(ort::inputs!["input_ids" => tokens_tensor])
        .map_err(|e| Error::Other(format!("Text encode: {}", e)))?;

    extract_embedding(&outputs, 0, "text_embeds")
}

/// Extract a 1-D float embedding from a session output (tries by name then index).
fn extract_embedding(
    outputs: &ort::session::SessionOutputs<'_>,
    idx: usize,
    name: &str,
) -> Result<Vec<f32>> {
    // Try named output first, fall back to positional index.
    let tensor = outputs
        .get(name)
        .map(|v| v.try_extract_array::<f32>())
        .unwrap_or_else(|| outputs[idx].try_extract_array::<f32>())
        .map_err(|e| Error::Other(format!("Extract embedding '{}': {}", name, e)))?;

    Ok(tensor.iter().copied().collect())
}

/// Cosine similarity between two vectors (returns value in [-1, 1]).
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
    if denom < 1e-8 {
        0.0
    } else {
        (dot / denom).clamp(-1.0, 1.0)
    }
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

    #[test]
    fn test_cosine_empty() {
        assert_eq!(cosine_similarity(&[], &[]), 0.0);
    }
}
