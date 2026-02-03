//! JPEG Encoder - Encode RGBA frames to JPEG using FFmpeg's MJPEG encoder
//!
//! This provides a zero-copy alternative to sharp for JPEG encoding.

use crate::error::{Error, Result};
use ffmpeg_next as ffmpeg;
use std::sync::Once;

static FFMPEG_INIT: Once = Once::new();

/// Initialize FFmpeg (thread-safe, called once)
fn init_ffmpeg() {
    FFMPEG_INIT.call_once(|| {
        ffmpeg::init().expect("Failed to initialize FFmpeg");
    });
}

/// Encode RGBA buffer to JPEG using FFmpeg's MJPEG encoder
///
/// # Arguments
/// * `rgba_data` - RGBA pixel data (4 bytes per pixel)
/// * `width` - Image width in pixels
/// * `height` - Image height in pixels
/// * `quality` - JPEG quality (2-31, lower is better quality)
///
/// # Returns
/// * JPEG image data as Vec<u8>
pub fn encode_rgba_to_jpeg(
    rgba_data: &[u8],
    width: u32,
    height: u32,
    quality: u32,
) -> Result<Vec<u8>> {
    init_ffmpeg();

    let width = width as usize;
    let height = height as usize;
    let expected_size = width * height * 4;

    if rgba_data.len() != expected_size {
        return Err(Error::InvalidParameter(format!(
            "RGBA data size mismatch: expected {} bytes, got {} bytes",
            expected_size,
            rgba_data.len()
        )));
    }

    // Find MJPEG encoder
    let encoder = ffmpeg::encoder::find(ffmpeg::codec::Id::MJPEG)
        .ok_or_else(|| Error::Ffmpeg("MJPEG encoder not found".to_string()))?;

    // Create encoder context
    let context = ffmpeg::codec::context::Context::new_with_codec(encoder);
    let mut encoder_ctx = context.encoder().video()?;

    // Configure encoder
    encoder_ctx.set_width(width as u32);
    encoder_ctx.set_height(height as u32);
    encoder_ctx.set_format(ffmpeg::format::Pixel::YUVJ420P); // MJPEG uses YUVJ420P
    encoder_ctx.set_time_base(ffmpeg::Rational::new(1, 25));

    // Set quality (qscale)
    let quality = quality.clamp(2, 31);
    unsafe {
        (*encoder_ctx.as_mut_ptr()).global_quality = (quality as i32) * ffmpeg::ffi::FF_QP2LAMBDA;
        (*encoder_ctx.as_mut_ptr()).flags |= ffmpeg::ffi::AV_CODEC_FLAG_QSCALE as i32;
    }

    // Open encoder
    let mut encoder = encoder_ctx.open()?;

    // Create input frame (RGBA)
    let mut rgba_frame = ffmpeg::frame::Video::new(
        ffmpeg::format::Pixel::RGBA,
        width as u32,
        height as u32,
    );

    // Get stride first before mutable borrow
    let stride = rgba_frame.stride(0);

    // Copy RGBA data to frame
    let rgba_plane = rgba_frame.data_mut(0);
    for y in 0..height {
        let src_offset = y * width * 4;
        let dst_offset = y * stride;
        rgba_plane[dst_offset..dst_offset + width * 4]
            .copy_from_slice(&rgba_data[src_offset..src_offset + width * 4]);
    }

    // Create output frame (YUVJ420P for MJPEG)
    let mut yuv_frame = ffmpeg::frame::Video::new(
        ffmpeg::format::Pixel::YUVJ420P,
        width as u32,
        height as u32,
    );

    // Create scaler for RGBA -> YUVJ420P conversion
    let mut scaler = ffmpeg::software::scaling::Context::get(
        ffmpeg::format::Pixel::RGBA,
        width as u32,
        height as u32,
        ffmpeg::format::Pixel::YUVJ420P,
        width as u32,
        height as u32,
        ffmpeg::software::scaling::Flags::BILINEAR,
    )?;

    // Convert RGBA to YUVJ420P
    scaler.run(&rgba_frame, &mut yuv_frame)?;

    // Set PTS
    yuv_frame.set_pts(Some(0));

    // Encode frame
    encoder.send_frame(&yuv_frame)?;

    // Receive encoded packet
    let mut packet = ffmpeg::Packet::empty();
    let mut jpeg_data = Vec::new();

    while encoder.receive_packet(&mut packet).is_ok() {
        jpeg_data.extend_from_slice(packet.data().unwrap_or(&[]));
    }

    // Flush encoder
    encoder.send_eof()?;
    while encoder.receive_packet(&mut packet).is_ok() {
        jpeg_data.extend_from_slice(packet.data().unwrap_or(&[]));
    }

    if jpeg_data.is_empty() {
        return Err(Error::Ffmpeg("JPEG encoding produced no output".to_string()));
    }

    Ok(jpeg_data)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encode_rgba_to_jpeg() {
        // Create a simple 2x2 red image
        let rgba_data: Vec<u8> = vec![
            255, 0, 0, 255, // Red pixel
            255, 0, 0, 255, // Red pixel
            255, 0, 0, 255, // Red pixel
            255, 0, 0, 255, // Red pixel
        ];

        let result = encode_rgba_to_jpeg(&rgba_data, 2, 2, 3);
        assert!(result.is_ok());

        let jpeg = result.unwrap();
        // JPEG magic bytes
        assert!(jpeg.len() > 2);
        assert_eq!(jpeg[0], 0xFF);
        assert_eq!(jpeg[1], 0xD8);
    }
}
