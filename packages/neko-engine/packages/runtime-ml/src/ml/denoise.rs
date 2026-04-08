//! Image denoise inference pipeline.
//!
//! Same NCHW tensor pipeline as upscale; the model outputs a denoised image
//! at the same resolution. `strength` is forwarded as a diagnostic hint only —
//! the ONNX model encodes a fixed denoising level baked at export time.

use neko_engine_kernel::error::{Error, Result};
use ndarray::Array4;
use ort::value::Tensor as OrtTensor;

const TILE_SIZE: u32 = 512;
const TILE_PAD: u32 = 32;

/// Run denoise inference on an image file.
///
/// `strength` is informational (0.0–1.0); use a model trained at the desired
/// noise level. Tile-based processing is used for images larger than 512 px.
pub fn denoise(
    session: &mut ort::session::Session,
    input_path: &str,
    output_path: &str,
    strength: f32,
) -> Result<()> {
    if !std::path::Path::new(input_path).exists() {
        return Err(Error::FileNotFound(input_path.to_string()));
    }

    let img = image::open(input_path)
        .map_err(|e| Error::Other(format!("Open '{}': {}", input_path, e)))?
        .to_rgb8();

    let (w, h) = (img.width(), img.height());
    let result = if w <= TILE_SIZE && h <= TILE_SIZE {
        run_session(session, image_to_nchw(&img))?
    } else {
        denoise_tiled(session, &img)?
    };

    result
        .save(output_path)
        .map_err(|e| Error::Other(format!("Save '{}': {}", output_path, e)))?;

    tracing::info!(input = %input_path, output = %output_path, strength, width = w, height = h, "Denoise complete");
    Ok(())
}

// --- tensor helpers (mirrors upscale.rs) ---

fn image_to_nchw(img: &image::RgbImage) -> Array4<f32> {
    let (w, h) = (img.width() as usize, img.height() as usize);
    let mut t = Array4::<f32>::zeros((1, 3, h, w));
    for (x, y, p) in img.enumerate_pixels() {
        let (xi, yi) = (x as usize, y as usize);
        t[[0, 0, yi, xi]] = p[0] as f32 / 255.0;
        t[[0, 1, yi, xi]] = p[1] as f32 / 255.0;
        t[[0, 2, yi, xi]] = p[2] as f32 / 255.0;
    }
    t
}

fn nchw_to_image(view: &ndarray::ArrayViewD<f32>, w: u32, h: u32) -> image::RgbImage {
    let mut img = image::RgbImage::new(w, h);
    for y in 0..h as usize {
        for x in 0..w as usize {
            let r = (view[[0, 0, y, x]].clamp(0.0, 1.0) * 255.0) as u8;
            let g = (view[[0, 1, y, x]].clamp(0.0, 1.0) * 255.0) as u8;
            let b = (view[[0, 2, y, x]].clamp(0.0, 1.0) * 255.0) as u8;
            img.put_pixel(x as u32, y as u32, image::Rgb([r, g, b]));
        }
    }
    img
}

fn run_session(session: &mut ort::session::Session, input: Array4<f32>) -> Result<image::RgbImage> {
    let input_dyn = input.into_dyn();
    let input_tensor = OrtTensor::from_array(input_dyn)
        .map_err(|e| Error::Other(format!("Create input tensor: {}", e)))?;
    let outputs = session
        .run(ort::inputs!["input" => input_tensor])
        .map_err(|e| Error::Other(format!("Inference: {}", e)))?;

    let out_view = outputs[0]
        .try_extract_array::<f32>()
        .map_err(|e| Error::Other(format!("Extract output: {}", e)))?;
    let shape = out_view.shape().to_vec();
    Ok(nchw_to_image(&out_view, shape[3] as u32, shape[2] as u32))
}

fn denoise_tiled(
    session: &mut ort::session::Session,
    img: &image::RgbImage,
) -> Result<image::RgbImage> {
    let (src_w, src_h) = (img.width(), img.height());
    let mut output = image::RgbImage::new(src_w, src_h);
    let step = TILE_SIZE - 2 * TILE_PAD;
    let x_count = src_w.div_ceil(step);
    let y_count = src_h.div_ceil(step);

    for ty in 0..y_count {
        for tx in 0..x_count {
            let tile_x0 = (tx * step)
                .saturating_sub(TILE_PAD)
                .min(src_w.saturating_sub(1));
            let tile_y0 = (ty * step)
                .saturating_sub(TILE_PAD)
                .min(src_h.saturating_sub(1));
            let tile_x1 = (tile_x0 + TILE_SIZE).min(src_w);
            let tile_y1 = (tile_y0 + TILE_SIZE).min(src_h);

            let tile = image::imageops::crop_imm(
                img,
                tile_x0,
                tile_y0,
                tile_x1 - tile_x0,
                tile_y1 - tile_y0,
            )
            .to_image();
            let out_tile = run_session(session, image_to_nchw(&tile))?;

            let src_px = if tx == 0 { 0 } else { TILE_PAD };
            let src_py = if ty == 0 { 0 } else { TILE_PAD };
            let dst_x = if tx == 0 { 0 } else { tx * step };
            let dst_y = if ty == 0 { 0 } else { ty * step };
            let copy_w = (out_tile.width() - src_px).min(src_w.saturating_sub(dst_x));
            let copy_h = (out_tile.height() - src_py).min(src_h.saturating_sub(dst_y));

            for dy in 0..copy_h {
                for dx in 0..copy_w {
                    output.put_pixel(
                        dst_x + dx,
                        dst_y + dy,
                        *out_tile.get_pixel(src_px + dx, src_py + dy),
                    );
                }
            }
        }
    }
    Ok(output)
}
