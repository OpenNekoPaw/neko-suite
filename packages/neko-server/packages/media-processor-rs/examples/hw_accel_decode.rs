//! Hardware-accelerated decoding example
//!
//! Demonstrates how to use hardware acceleration for video decoding
//! with YUV420P output format.
//!
//! Supported platforms:
//! - macOS: VideoToolbox
//! - Linux: VAAPI (Intel/AMD), CUDA (NVIDIA)
//! - Windows: D3D11VA, CUDA (NVIDIA)
//!
//! Run with: cargo run --example hw_accel_decode -- <video_file>

use media_processor_rs::{
    detect_hw_accel, Decoder, HwAccelType, ZeroCopyDecoder,
};
use std::env;
use std::time::Instant;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize tracing for debug output
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .init();

    // Get video file path from command line
    let args: Vec<String> = env::args().collect();
    if args.len() < 2 {
        eprintln!("Usage: {} <video_file>", args[0]);
        eprintln!("\nAvailable hardware acceleration:");
        for hw_type in detect_hw_accel() {
            println!("  - {:?}", hw_type);
        }
        std::process::exit(1);
    }
    let video_path = &args[1];

    // Print available hardware acceleration
    println!("=== Hardware Acceleration Detection ===");
    let available_hw = detect_hw_accel();
    for hw_type in &available_hw {
        println!("  Available: {:?}", hw_type);
    }
    println!();

    // Create hardware-accelerated decoder with YUV420P output
    let mut decoder = ZeroCopyDecoder::with_hw_accel(HwAccelType::Auto);

    // Open video file
    println!("=== Opening Video ===");
    let info = decoder.open(video_path)?;
    println!("  Resolution: {}x{}", info.width, info.height);
    println!("  Duration: {:.2}s", info.duration);
    println!("  FPS: {:.2}", info.fps);
    println!("  Codec: {}", info.codec);
    println!("  Frame count: {}", info.frame_count);
    println!();

    // Check if hardware acceleration is active
    println!("=== Decoder Status ===");
    println!("  Hardware active: {}", decoder.is_hw_active());
    println!("  Hardware type: {:?}", decoder.active_hw_type());
    println!();

    // Decode frames
    println!("=== Decoding Frames ===");
    let start = Instant::now();
    let mut frame_count = 0;
    let mut total_bytes = 0usize;

    while let Some(frame) = decoder.decode_next()? {
        frame_count += 1;
        let bytes = frame.as_bytes();
        if let Some(b) = bytes {
            total_bytes += b.len();
        }

        if frame_count <= 5 || frame_count % 100 == 0 {
            println!(
                "  Frame {}: {}x{} {:?} @ {:.3}s (keyframe: {})",
                frame_count,
                frame.width,
                frame.height,
                frame.format,
                frame.timestamp,
                frame.is_keyframe
            );
        }

        // Stop after 500 frames for demo
        if frame_count >= 500 {
            break;
        }
    }

    let elapsed = start.elapsed();
    println!();
    println!("=== Statistics ===");
    println!("  Frames decoded: {}", frame_count);
    println!("  Total data: {:.2} MB", total_bytes as f64 / 1024.0 / 1024.0);
    println!("  Time: {:.2}s", elapsed.as_secs_f64());
    println!(
        "  Speed: {:.2} fps",
        frame_count as f64 / elapsed.as_secs_f64()
    );
    println!(
        "  Throughput: {:.2} MB/s",
        (total_bytes as f64 / 1024.0 / 1024.0) / elapsed.as_secs_f64()
    );

    // Close decoder
    decoder.close();

    Ok(())
}
