//! Hardware-accelerated encoding example
//!
//! Demonstrates how to use hardware acceleration for video encoding.
//!
//! Supported platforms:
//! - macOS: VideoToolbox (h264_videotoolbox, hevc_videotoolbox)
//! - Linux: VAAPI (h264_vaapi, hevc_vaapi), NVENC (h264_nvenc, hevc_nvenc)
//! - Windows: NVENC, QSV (h264_qsv, hevc_qsv)
//!
//! Run with: cargo run --example hw_accel_encode

use media_processor_rs::{
    detect_hw_encoders, Encoder, EncoderConfig, HwAccelEncoder, HwEncoderType, PixelFormat,
    VideoCodec,
};
use std::time::Instant;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .init();

    // Print available hardware encoders
    println!("=== Hardware Encoder Detection ===");
    let available_hw = detect_hw_encoders();
    for hw_type in &available_hw {
        println!("  Available: {:?}", hw_type);
        if *hw_type != HwEncoderType::None {
            println!(
                "    H.264: {:?}",
                hw_type.encoder_name(VideoCodec::H264)
            );
            println!(
                "    H.265: {:?}",
                hw_type.encoder_name(VideoCodec::H265)
            );
        }
    }
    println!();

    // Create test frame (YUV420P format)
    let width = 1920u32;
    let height = 1080u32;
    let fps = 30.0;

    // YUV420P frame size: Y (W*H) + U (W/2*H/2) + V (W/2*H/2) = W*H*1.5
    let y_size = (width * height) as usize;
    let uv_size = ((width / 2) * (height / 2)) as usize;
    let frame_size = y_size + uv_size * 2;

    // Create a gradient test pattern
    let mut frame_data = vec![0u8; frame_size];

    // Y plane: horizontal gradient
    for y in 0..height as usize {
        for x in 0..width as usize {
            frame_data[y * width as usize + x] = ((x * 255) / width as usize) as u8;
        }
    }

    // U plane: vertical gradient
    for y in 0..(height / 2) as usize {
        for x in 0..(width / 2) as usize {
            frame_data[y_size + y * (width / 2) as usize + x] =
                128 + ((y * 64) / (height / 2) as usize) as u8;
        }
    }

    // V plane: diagonal gradient
    for y in 0..(height / 2) as usize {
        for x in 0..(width / 2) as usize {
            frame_data[y_size + uv_size + y * (width / 2) as usize + x] =
                128 + (((x + y) * 64) / ((width + height) / 2) as usize) as u8;
        }
    }

    // Create encoder config with hardware acceleration
    let config = EncoderConfig::new(width, height, fps, VideoCodec::H264)
        .with_pixel_format(PixelFormat::Yuv420p)
        .with_hw_encoder(HwEncoderType::Auto) // Auto-detect best hardware
        .with_bitrate(8_000_000); // 8 Mbps

    // Create hardware-accelerated encoder
    let mut encoder = HwAccelEncoder::new();

    println!("=== Opening Encoder ===");
    encoder.open(&config)?;

    println!("  Hardware active: {}", encoder.is_hw_active());
    println!("  Hardware type: {:?}", encoder.active_hw_type());
    println!();

    // Encode frames
    println!("=== Encoding Frames ===");
    let start = Instant::now();
    let num_frames = 300; // 10 seconds at 30fps
    let mut total_encoded_bytes = 0usize;
    let mut total_packets = 0usize;

    for i in 0..num_frames {
        let pts = i as i64;
        let packets = encoder.encode_frame(&frame_data, pts)?;

        for packet in &packets {
            total_encoded_bytes += packet.data.len();
            total_packets += 1;

            if total_packets <= 5 || total_packets % 50 == 0 {
                println!(
                    "  Packet {}: {} bytes, pts={}, keyframe={}",
                    total_packets,
                    packet.data.len(),
                    packet.pts,
                    packet.is_keyframe
                );
            }
        }
    }

    // Flush encoder
    let flush_packets = encoder.flush()?;
    for packet in &flush_packets {
        total_encoded_bytes += packet.data.len();
        total_packets += 1;
    }
    println!("  Flushed {} packets", flush_packets.len());

    let elapsed = start.elapsed();
    println!();
    println!("=== Statistics ===");
    println!("  Frames encoded: {}", num_frames);
    println!("  Packets produced: {}", total_packets);
    println!(
        "  Input size: {:.2} MB",
        (frame_size * num_frames) as f64 / 1024.0 / 1024.0
    );
    println!(
        "  Output size: {:.2} MB",
        total_encoded_bytes as f64 / 1024.0 / 1024.0
    );
    println!(
        "  Compression ratio: {:.2}x",
        (frame_size * num_frames) as f64 / total_encoded_bytes as f64
    );
    println!("  Time: {:.2}s", elapsed.as_secs_f64());
    println!(
        "  Speed: {:.2} fps",
        num_frames as f64 / elapsed.as_secs_f64()
    );
    println!(
        "  Realtime factor: {:.2}x",
        (num_frames as f64 / fps) / elapsed.as_secs_f64()
    );

    // Close encoder
    encoder.close();

    Ok(())
}
