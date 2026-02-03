//! Zero-copy hardware decoding example
//!
//! Demonstrates how to use zero-copy hardware decoding where:
//! 1. FFmpeg decodes video using hardware acceleration
//! 2. Decoded frames stay in GPU memory as NV12 textures
//! 3. wgpu imports these textures directly without CPU copy
//!
//! Run with: cargo run --example zerocopy_decode -- <video_file>

use media_processor_rs::{
    ColorSpace, Decoder, GpuContext, HwAccelType, Nv12TextureImporter, Nv12Uniforms,
    ZeroCopyConfig, ZeroCopyDecoder, NV12_TO_RGB_SHADER,
};
use std::env;
use std::sync::Arc;
use std::time::Instant;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .init();

    // Get video file path
    let args: Vec<String> = env::args().collect();
    if args.len() < 2 {
        eprintln!("Usage: {} <video_file>", args[0]);
        eprintln!("\nThis example demonstrates zero-copy hardware decoding:");
        eprintln!("  1. FFmpeg decodes video using hardware acceleration");
        eprintln!("  2. Decoded frames stay in GPU memory as NV12 textures");
        eprintln!("  3. wgpu imports these textures directly without CPU copy");
        std::process::exit(1);
    }
    let video_path = &args[1];

    // Create zero-copy decoder
    println!("=== Zero-Copy Hardware Decoding ===\n");

    let config = ZeroCopyConfig {
        hw_accel: HwAccelType::Auto,
        gpu_index: 0,
    };

    let mut decoder = ZeroCopyDecoder::new().with_config(config);

    // Open video file
    println!("Opening video: {}", video_path);
    let info = decoder.open(video_path)?;
    println!("  Resolution: {}x{}", info.width, info.height);
    println!("  Duration: {:.2}s", info.duration);
    println!("  FPS: {:.2}", info.fps);
    println!("  Codec: {}", info.codec);
    println!("  Pixel format: {} (hardware NV12)", info.pixel_format);
    println!("  Hardware active: {}", decoder.is_hw_active());
    println!();

    // Initialize wgpu for texture import
    println!("Initializing wgpu...");
    let gpu_ctx = pollster::block_on(async {
        GpuContext::new().await
    })?;
    let gpu_ctx = Arc::new(gpu_ctx);

    // Create texture importer
    let importer = Nv12TextureImporter::new(gpu_ctx.clone());

    // Decode frames
    println!("\n=== Decoding Frames ===\n");
    let start = Instant::now();
    let mut frame_count = 0;
    let mut total_pixels = 0u64;

    while let Some(gpu_texture) = decoder.decode_next_gpu()? {
        frame_count += 1;
        total_pixels += (gpu_texture.width * gpu_texture.height) as u64;

        // Get color space info
        let color_space = ColorSpace::from_ffmpeg(gpu_texture.color_space);

        if frame_count <= 5 || frame_count % 100 == 0 {
            println!(
                "  Frame {}: {}x{} NV12 @ pts={} (keyframe: {}, colorspace: {:?})",
                frame_count,
                gpu_texture.width,
                gpu_texture.height,
                gpu_texture.pts,
                gpu_texture.is_keyframe,
                color_space
            );

            // Import texture into wgpu (this would be zero-copy when implemented)
            match importer.import(&gpu_texture) {
                Ok(imported) => {
                    println!(
                        "    -> Imported to wgpu: Y={}x{}, UV={}x{}",
                        imported.width,
                        imported.height,
                        imported.width / 2,
                        imported.height / 2
                    );

                    // Create uniforms for shader
                    let uniforms = Nv12Uniforms::new(
                        imported.width,
                        imported.height,
                        imported.color_space,
                    );
                    println!(
                        "    -> Shader uniforms: size={}x{}, colorspace={}",
                        uniforms.output_size[0],
                        uniforms.output_size[1],
                        uniforms.color_space
                    );
                }
                Err(e) => {
                    println!("    -> Import failed: {}", e);
                }
            }
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
    println!("  Total pixels: {:.2} MP", total_pixels as f64 / 1_000_000.0);
    println!("  Time: {:.2}s", elapsed.as_secs_f64());
    println!(
        "  Speed: {:.2} fps",
        frame_count as f64 / elapsed.as_secs_f64()
    );
    println!(
        "  Throughput: {:.2} MP/s",
        (total_pixels as f64 / 1_000_000.0) / elapsed.as_secs_f64()
    );

    // Print shader info
    println!();
    println!("=== NV12 to RGB Shader ===");
    println!("  Shader length: {} bytes", NV12_TO_RGB_SHADER.len());
    println!("  Supported color spaces: BT.601, BT.709, BT.2020");
    println!("  Texture bindings:");
    println!("    @binding(0) uniforms: Nv12Uniforms");
    println!("    @binding(1) y_texture: texture_2d<f32> (R8Unorm)");
    println!("    @binding(2) uv_texture: texture_2d<f32> (RG8Unorm)");
    println!("    @binding(3) tex_sampler: sampler (linear)");

    // Close decoder
    decoder.close();

    Ok(())
}
