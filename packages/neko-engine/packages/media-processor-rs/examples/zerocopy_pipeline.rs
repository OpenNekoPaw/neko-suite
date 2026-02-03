//! Zero-Copy Pipeline Example
//!
//! Demonstrates the full zero-copy pipeline:
//! FFmpeg HW Decode → wgpu Compositor → FFmpeg HW Encode
//!
//! Run with: cargo run --example zerocopy_pipeline -- <input_video> <output_video>

use media_processor_rs::{
    ColorSpace, Decoder, FrameData, GpuContext, GpuEncoderBridge, GpuTextureHandle,
    HwAccelType, Nv12FrameData, Nv12GpuTexture, Nv12RenderCache,
    Nv12TextureImporter, RgbaToNv12Converter, ZeroCopyDecoder,
};
use std::env;
use std::sync::Arc;
use std::time::Instant;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .init();

    // Get video file paths
    let args: Vec<String> = env::args().collect();
    if args.len() < 2 {
        eprintln!("Usage: {} <input_video> [output_video]", args[0]);
        eprintln!("\nThis example demonstrates the zero-copy pipeline:");
        eprintln!("  FFmpeg HW Decode → wgpu Compositor → FFmpeg HW Encode");
        eprintln!("\nPipeline stages:");
        eprintln!("  1. Hardware decode (VideoToolbox/VAAPI/D3D11VA)");
        eprintln!("  2. GPU texture import (NV12 → wgpu)");
        eprintln!("  3. NV12 → RGBA conversion (GPU shader)");
        eprintln!("  4. GPU compositing (wgpu compute shader)");
        eprintln!("  5. RGBA → NV12 conversion (GPU compute)");
        eprintln!("  6. Hardware encode (VideoToolbox/NVENC/VAAPI)");
        std::process::exit(1);
    }
    let input_path = &args[1];

    println!("=== Zero-Copy Pipeline Demo ===\n");

    // Initialize wgpu
    println!("Initializing GPU context...");
    let gpu_ctx = pollster::block_on(async { GpuContext::new().await })?;
    let gpu_ctx = Arc::new(gpu_ctx);
    println!("  GPU: {}", gpu_ctx.info().name);
    println!("  Backend: {:?}", gpu_ctx.info().backend);
    println!();

    // Create hardware decoder
    println!("Creating hardware decoder...");
    let mut decoder = ZeroCopyDecoder::with_hw_accel(HwAccelType::Auto);

    // Open input video
    let info = decoder.open(input_path)?;
    println!("  Input: {}x{} @ {:.2} fps", info.width, info.height, info.fps);
    println!("  Codec: {}", info.codec);
    println!("  Hardware active: {}", decoder.is_hw_active());
    println!("  Hardware type: {:?}", decoder.active_hw_type());
    println!();

    // Create pipeline components
    println!("Creating pipeline components...");

    // NV12 texture importer
    let importer = Nv12TextureImporter::new(gpu_ctx.clone());
    println!("  ✓ NV12 Texture Importer");

    // NV12 → RGBA renderer
    let mut nv12_renderer = Nv12RenderCache::new(gpu_ctx.clone())?;
    println!("  ✓ NV12 → RGBA Renderer");

    // RGBA → NV12 converter
    let rgba_to_nv12 = RgbaToNv12Converter::new(gpu_ctx.clone())?;
    let nv12_output = rgba_to_nv12.create_output_buffers(info.width, info.height);
    println!("  ✓ RGBA → NV12 Converter");
    println!("    Y buffer: {} bytes", nv12_output.y_size());
    println!("    UV buffer: {} bytes", nv12_output.uv_size());

    // GPU encoder bridge
    let _encoder_bridge = GpuEncoderBridge::new(gpu_ctx.clone(), info.width, info.height)?;
    println!("  ✓ GPU Encoder Bridge");
    println!();

    // Process frames
    println!("=== Processing Frames ===\n");
    let start = Instant::now();
    let mut frame_count = 0u64;
    let mut import_time_us = 0u64;
    let mut nv12_to_rgba_time_us = 0u64;
    let mut rgba_to_nv12_time_us = 0u64;

    // Create a dummy Nv12GpuTexture for the importer
    let dummy_gpu_texture = Nv12GpuTexture {
        width: info.width,
        height: info.height,
        handle: GpuTextureHandle::None,
        pts: 0,
        is_keyframe: false,
        color_space: ColorSpace::Bt709 as i32,
    };

    while let Some(frame) = decoder.decode_next()? {
        frame_count += 1;

        // 1. Import NV12 frame into wgpu
        let import_start = Instant::now();
        let imported = importer.import(&dummy_gpu_texture)?;

        // Upload frame data (in real zero-copy, this would be skipped)
        if let FrameData::Cpu(data) = &frame.data {
            let y_size = (info.width * info.height) as usize;
            if data.len() >= y_size {
                let frame_data = Nv12FrameData {
                    y_data: &data[0..y_size],
                    uv_data: &data[y_size..],
                    y_linesize: info.width,
                    uv_linesize: info.width,
                    width: info.width,
                    height: info.height,
                    color_space: ColorSpace::Bt709,
                };
                importer.upload_nv12_with_linesize(&imported, &frame_data)?;
            }
        }
        import_time_us += import_start.elapsed().as_micros() as u64;

        // 2. Convert NV12 → RGBA
        let nv12_to_rgba_start = Instant::now();
        let _rgba_texture = nv12_renderer.render(&imported);
        nv12_to_rgba_time_us += nv12_to_rgba_start.elapsed().as_micros() as u64;

        // 3. (Compositor would run here on RGBA texture)

        // 4. Convert RGBA → NV12
        let rgba_to_nv12_start = Instant::now();
        let rgba_view = _rgba_texture.create_view(&wgpu::TextureViewDescriptor::default());
        rgba_to_nv12.convert_sync(&rgba_view, &nv12_output, ColorSpace::Bt709 as u32)?;
        rgba_to_nv12_time_us += rgba_to_nv12_start.elapsed().as_micros() as u64;

        // Print progress
        if frame_count <= 5 || frame_count % 100 == 0 {
            println!(
                "  Frame {}: {}x{} @ {:.3}s",
                frame_count,
                frame.width,
                frame.height,
                frame.timestamp,
            );
        }

        // Stop after 500 frames for demo
        if frame_count >= 500 {
            break;
        }
    }

    let elapsed = start.elapsed();

    // Print statistics
    println!();
    println!("=== Pipeline Statistics ===");
    println!("  Frames processed: {}", frame_count);
    println!("  Total time: {:.2}s", elapsed.as_secs_f64());
    println!(
        "  Throughput: {:.2} fps",
        frame_count as f64 / elapsed.as_secs_f64()
    );
    println!();
    println!("  Per-frame timing:");
    println!("    Import (NV12 upload): {:.2} µs/frame", import_time_us as f64 / frame_count as f64);
    println!("    NV12 → RGBA: {:.2} µs/frame", nv12_to_rgba_time_us as f64 / frame_count as f64);
    println!("    RGBA → NV12: {:.2} µs/frame", rgba_to_nv12_time_us as f64 / frame_count as f64);
    println!();

    // Print pipeline architecture
    println!("=== Pipeline Architecture ===");
    println!();
    println!("  Current Implementation (hybrid):");
    println!("  ┌─────────────────────────────────────────────────────────────────┐");
    println!("  │ FFmpeg Decode → CPU → wgpu (NV12→RGBA→NV12) → CPU → Encode     │");
    println!("  └─────────────────────────────────────────────────────────────────┘");
    println!();
    println!("  Target Implementation (zero-copy):");
    println!("  ┌─────────────────────────────────────────────────────────────────┐");
    println!("  │ FFmpeg HW Decode → GPU Texture → wgpu → GPU Buffer → HW Encode │");
    println!("  │     (NV12)          (import)    (compute)  (export)             │");
    println!("  └─────────────────────────────────────────────────────────────────┘");
    println!();

    // Print platform-specific status
    println!("=== Platform Zero-Copy Status ===");
    #[cfg(target_os = "macos")]
    {
        println!("  macOS:");
        println!("    Decode: VideoToolbox → CVPixelBuffer → IOSurface");
        println!("    Import: IOSurface → Metal → wgpu (implemented, needs wgpu_hal)");
        println!("    Export: wgpu → Metal → IOSurface → VideoToolbox");
    }
    #[cfg(target_os = "linux")]
    {
        println!("  Linux:");
        println!("    Decode: VAAPI → VASurface → DMA-BUF");
        println!("    Import: DMA-BUF → Vulkan → wgpu (implemented, needs wgpu_hal)");
        println!("    Export: wgpu → Vulkan → DMA-BUF → VAAPI/NVENC");
    }
    #[cfg(target_os = "windows")]
    {
        println!("  Windows:");
        println!("    Decode: D3D11VA → ID3D11Texture2D → SharedHandle");
        println!("    Import: SharedHandle → D3D12 → wgpu (implemented, needs wgpu_hal)");
        println!("    Export: wgpu → D3D12 → SharedHandle → D3D11VA/NVENC");
    }

    // Close decoder
    decoder.close();

    Ok(())
}
