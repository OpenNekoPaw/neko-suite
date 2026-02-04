//! CLI runner - handles different command modes

use std::path::PathBuf;
use std::sync::Arc;

use crate::args::Command;
use neko_native_core::export::ExportService;
use neko_native_core::frame_server::{FrameServer, FrameServerConfig};
use neko_native_core::jvi::JviLoader;
use neko_native_core::export::{
    ExportJobConfig, ExportVideoCodec,
    ExportHwEncoder, ExportPreset, ExportState,
};
use neko_native_core::media_service::probe_media_info;
use neko_native_core::gpu::GpuContext;

/// CLI runner for executing commands
pub struct Runner;

impl Runner {
    pub fn new() -> Self {
        Self
    }

    /// Run the specified command
    pub async fn run(&self, command: Command) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        match command {
            Command::Serve { port, config, .. } => {
                self.run_server(port, config).await
            }
            Command::Export { jvi_file, output, codec, bitrate, preset, hw_encoder } => {
                self.run_export(jvi_file, output, codec, bitrate, preset, hw_encoder).await
            }
            Command::Probe { input, format } => {
                self.run_probe(input, format).await
            }
            Command::Extract { input, output, time, quality, width, height } => {
                self.run_extract(input, output, time, quality, width, height).await
            }
        }
    }

    /// Run in server mode
    async fn run_server(
        &self,
        port: u16,
        _config: Option<PathBuf>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        tracing::info!("Starting Neko Suite Export Server on port {}", port);

        let config = FrameServerConfig {
            port,
            ..Default::default()
        };

        let handle = FrameServer::start_with_export(config).await?;
        tracing::info!("Server started on http://127.0.0.1:{}", handle.port());

        // Wait for shutdown signal
        tokio::signal::ctrl_c().await?;
        tracing::info!("Shutting down...");
        handle.shutdown();

        Ok(())
    }

    /// Run direct export mode
    async fn run_export(
        &self,
        jvi_file: PathBuf,
        output: PathBuf,
        codec: String,
        bitrate: u64,
        preset: String,
        hw_encoder: String,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        tracing::info!("Exporting {} to {}", jvi_file.display(), output.display());

        // Load .jvi file
        let loader = JviLoader::new();
        let (timeline, mut settings) = loader.load(&jvi_file)?;

        // Override settings from CLI
        settings.video_codec = parse_video_codec(&codec);
        settings.video_bitrate = Some(bitrate);
        settings.preset = parse_preset(&preset);
        settings.hw_encoder = parse_hw_encoder(&hw_encoder);

        // Create export service and run
        let service = Arc::new(ExportService::new().await.map_err(|e| {
            Box::new(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("Failed to create export service: {}", e),
            )) as Box<dyn std::error::Error + Send + Sync>
        })?);

        let config = ExportJobConfig {
            job_id: uuid::Uuid::new_v4().to_string(),
            output_path: output.to_string_lossy().to_string(),
            settings,
            timeline,
        };

        let total_frames = config.timeline.total_frames(config.settings.fps);
        tracing::info!("Starting export: {} frames at {} fps", total_frames, config.settings.fps);

        let response = service.start_export(config).await.map_err(|e| {
            Box::new(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("Failed to start export: {}", e),
            )) as Box<dyn std::error::Error + Send + Sync>
        })?;

        tracing::info!("Export job started: {}", response.job_id);

        // Poll for completion
        loop {
            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

            let status = service.get_progress(&response.job_id).await;
            if let Some(progress) = status {
                tracing::info!(
                    "Progress: {:.1}% ({}/{} frames)",
                    progress.progress,
                    progress.current_frame,
                    progress.total_frames
                );

                match progress.state {
                    ExportState::Completed => {
                        tracing::info!("Export completed successfully!");
                        break;
                    }
                    ExportState::Error => {
                        let error_msg = progress.error.unwrap_or_else(|| "Unknown error".to_string());
                        return Err(Box::new(std::io::Error::new(
                            std::io::ErrorKind::Other,
                            format!("Export failed: {}", error_msg),
                        )));
                    }
                    ExportState::Cancelled => {
                        return Err(Box::new(std::io::Error::new(
                            std::io::ErrorKind::Interrupted,
                            "Export was cancelled",
                        )));
                    }
                    _ => {}
                }
            }
        }

        Ok(())
    }

    /// Run probe command - display media file metadata
    async fn run_probe(
        &self,
        input: PathBuf,
        format: String,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let info = probe_media_info(&input).map_err(|e| {
            Box::new(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("Failed to probe media: {}", e),
            )) as Box<dyn std::error::Error + Send + Sync>
        })?;

        match format.to_lowercase().as_str() {
            "json" => {
                // Output as JSON
                let json = serde_json::json!({
                    "file": input.display().to_string(),
                    "format": info.format,
                    "duration": info.duration,
                    "video": {
                        "codec": info.codec,
                        "width": info.width,
                        "height": info.height,
                        "fps": info.fps,
                        "bitrate": info.bitrate
                    },
                    "audio": if info.has_audio {
                        Some(serde_json::json!({
                            "codec": info.audio_codec,
                            "sample_rate": info.audio_sample_rate,
                            "channels": info.audio_channels,
                            "bitrate": info.audio_bitrate
                        }))
                    } else {
                        None
                    },
                    "subtitles": info.subtitle_streams.iter().map(|s| {
                        serde_json::json!({
                            "index": s.index,
                            "codec": s.codec,
                            "language": s.language,
                            "title": s.title,
                            "default": s.is_default,
                            "forced": s.is_forced
                        })
                    }).collect::<Vec<_>>()
                });
                println!("{}", serde_json::to_string_pretty(&json)?);
            }
            _ => {
                // Output as text
                println!("File: {}", input.display());
                println!("Format: {}", info.format);
                println!("Duration: {:.2}s", info.duration);
                println!();
                println!("Video:");
                println!("  Codec: {}", info.codec);
                println!("  Resolution: {}x{}", info.width, info.height);
                println!("  FPS: {:.2}", info.fps);
                if let Some(bitrate) = info.bitrate {
                    println!("  Bitrate: {} kbps", bitrate / 1000);
                }

                if info.has_audio {
                    println!();
                    println!("Audio:");
                    if let Some(codec) = &info.audio_codec {
                        println!("  Codec: {}", codec);
                    }
                    if let Some(sample_rate) = info.audio_sample_rate {
                        println!("  Sample Rate: {} Hz", sample_rate);
                    }
                    if let Some(channels) = info.audio_channels {
                        println!("  Channels: {}", channels);
                    }
                    if let Some(bitrate) = info.audio_bitrate {
                        println!("  Bitrate: {} kbps", bitrate / 1000);
                    }
                }

                if info.has_subtitles {
                    println!();
                    println!("Subtitles:");
                    for sub in &info.subtitle_streams {
                        let mut flags = Vec::new();
                        if sub.is_default {
                            flags.push("default");
                        }
                        if sub.is_forced {
                            flags.push("forced");
                        }
                        let flags_str = if flags.is_empty() {
                            String::new()
                        } else {
                            format!(" [{}]", flags.join(", "))
                        };

                        println!(
                            "  #{}: {} ({}){}",
                            sub.index,
                            sub.codec,
                            sub.language.as_deref().unwrap_or("unknown"),
                            flags_str
                        );
                    }
                }
            }
        }

        Ok(())
    }

    /// Run extract command - extract single frame from video
    async fn run_extract(
        &self,
        input: PathBuf,
        output: PathBuf,
        time: f64,
        quality: u32,
        _width: Option<u32>,
        _height: Option<u32>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        use neko_native_core::decoder::{Decoder, HwAccelType, HwAccelDecoder};
        use neko_native_core::gpu::{ColorSpace, GpuContext, Nv12Renderer, Nv12TextureImporter};
        use neko_native_core::media_service::encode_rgba_to_jpeg;

        tracing::info!("Extracting frame at {:.2}s from {}", time, input.display());

        // Create GPU context
        let gpu_ctx = Arc::new(GpuContext::new().await.map_err(|e| {
            Box::new(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("Failed to create GPU context: {}", e),
            )) as Box<dyn std::error::Error + Send + Sync>
        })?);

        // Create decoder with hardware acceleration
        let mut decoder = HwAccelDecoder::with_hw_accel(HwAccelType::Auto);

        // Open video file
        let input_str = input.to_string_lossy();
        let media_info = decoder.open(&input_str).map_err(|e| {
            Box::new(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("Failed to open video: {}", e),
            )) as Box<dyn std::error::Error + Send + Sync>
        })?;

        tracing::info!(
            "Video: {}x{} @ {:.2} fps, duration: {:.2}s",
            media_info.width,
            media_info.height,
            media_info.fps,
            media_info.duration
        );

        // Seek and decode frame
        let gpu_texture = decoder.decode_gpu_at(time).map_err(|e| {
            Box::new(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("Failed to decode frame: {}", e),
            )) as Box<dyn std::error::Error + Send + Sync>
        })?.ok_or_else(|| {
            Box::new(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                format!("Frame not found at time {}", time),
            )) as Box<dyn std::error::Error + Send + Sync>
        })?;

        let width = media_info.width;
        let height = media_info.height;

        // Import NV12 texture to wgpu
        let importer = Nv12TextureImporter::new(Arc::clone(&gpu_ctx));
        let nv12_texture = importer.import(&gpu_texture).map_err(|e| {
            Box::new(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("Failed to import texture: {}", e),
            )) as Box<dyn std::error::Error + Send + Sync>
        })?;

        // Convert NV12 to RGBA using GPU
        let renderer = Nv12Renderer::new(Arc::clone(&gpu_ctx)).map_err(|e| {
            Box::new(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("Failed to create renderer: {}", e),
            )) as Box<dyn std::error::Error + Send + Sync>
        })?;

        let output_texture = renderer.create_output_texture(width, height);
        let output_view = output_texture.create_view(&wgpu::TextureViewDescriptor::default());
        renderer.render(&nv12_texture, &output_view, ColorSpace::Bt709);

        // Read RGBA data from GPU
        let rgba_data = read_texture_to_buffer(&gpu_ctx, &output_texture, width, height).map_err(|e| {
            Box::new(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("Failed to read texture: {}", e),
            )) as Box<dyn std::error::Error + Send + Sync>
        })?;

        // Encode to JPEG
        let ffmpeg_quality = ((100 - quality.clamp(1, 100)) * 29 / 99 + 2) as u32;
        let jpeg_data = encode_rgba_to_jpeg(&rgba_data, width, height, ffmpeg_quality).map_err(|e| {
            Box::new(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("Failed to encode JPEG: {}", e),
            )) as Box<dyn std::error::Error + Send + Sync>
        })?;

        // Write to file
        std::fs::write(&output, &jpeg_data).map_err(|e| {
            Box::new(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("Failed to write output file: {}", e),
            )) as Box<dyn std::error::Error + Send + Sync>
        })?;

        tracing::info!(
            "Frame extracted successfully: {} ({} bytes)",
            output.display(),
            jpeg_data.len()
        );

        Ok(())
    }
}

/// Read texture data back to CPU buffer
fn read_texture_to_buffer(
    ctx: &GpuContext,
    texture: &wgpu::Texture,
    width: u32,
    height: u32,
) -> Result<Vec<u8>, Box<dyn std::error::Error + Send + Sync>> {
    let device = ctx.device();
    let queue = ctx.queue();

    let bytes_per_row = width * 4;
    let padded_bytes_per_row = (bytes_per_row + 255) & !255; // Align to 256

    let buffer_size = (padded_bytes_per_row * height) as u64;
    let staging_buffer = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("Texture Readback Buffer"),
        size: buffer_size,
        usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
        mapped_at_creation: false,
    });

    let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
        label: Some("Texture Readback Encoder"),
    });

    encoder.copy_texture_to_buffer(
        wgpu::ImageCopyTexture {
            texture,
            mip_level: 0,
            origin: wgpu::Origin3d::ZERO,
            aspect: wgpu::TextureAspect::All,
        },
        wgpu::ImageCopyBuffer {
            buffer: &staging_buffer,
            layout: wgpu::ImageDataLayout {
                offset: 0,
                bytes_per_row: Some(padded_bytes_per_row),
                rows_per_image: Some(height),
            },
        },
        wgpu::Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
    );

    queue.submit(std::iter::once(encoder.finish()));

    // Map buffer and read data
    let buffer_slice = staging_buffer.slice(..);
    let (tx, rx) = std::sync::mpsc::channel();
    buffer_slice.map_async(wgpu::MapMode::Read, move |result: Result<(), wgpu::BufferAsyncError>| {
        tx.send(result).unwrap();
    });

    device.poll(wgpu::Maintain::Wait);
    rx.recv()
        .map_err(|_| {
            Box::new(std::io::Error::new(
                std::io::ErrorKind::Other,
                "Buffer map failed",
            )) as Box<dyn std::error::Error + Send + Sync>
        })?
        .map_err(|e| {
            Box::new(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("Buffer map error: {:?}", e),
            )) as Box<dyn std::error::Error + Send + Sync>
        })?;

    let data = buffer_slice.get_mapped_range();

    // Remove padding if necessary
    let result = if padded_bytes_per_row == bytes_per_row {
        data.to_vec()
    } else {
        let mut result = Vec::with_capacity((width * height * 4) as usize);
        for row in 0..height {
            let start = (row * padded_bytes_per_row) as usize;
            let end = start + bytes_per_row as usize;
            result.extend_from_slice(&data[start..end]);
        }
        result
    };

    drop(data);
    staging_buffer.unmap();

    Ok(result)
}

impl Default for Runner {
    fn default() -> Self {
        Self::new()
    }
}

fn parse_video_codec(codec: &str) -> ExportVideoCodec {
    match codec.to_lowercase().as_str() {
        "h264" => ExportVideoCodec::H264,
        "h265" | "hevc" => ExportVideoCodec::H265,
        "vp9" => ExportVideoCodec::Vp9,
        "prores" => ExportVideoCodec::ProRes,
        _ => ExportVideoCodec::H264,
    }
}

fn parse_preset(preset: &str) -> ExportPreset {
    match preset.to_lowercase().as_str() {
        "ultrafast" => ExportPreset::Ultrafast,
        "fast" => ExportPreset::Fast,
        "medium" => ExportPreset::Medium,
        "slow" => ExportPreset::Slow,
        "veryslow" => ExportPreset::Veryslow,
        _ => ExportPreset::Medium,
    }
}

fn parse_hw_encoder(hw_encoder: &str) -> ExportHwEncoder {
    match hw_encoder.to_lowercase().as_str() {
        "auto" => ExportHwEncoder::Auto,
        "videotoolbox" => ExportHwEncoder::VideoToolbox,
        "nvenc" => ExportHwEncoder::Nvenc,
        "vaapi" => ExportHwEncoder::Vaapi,
        "qsv" => ExportHwEncoder::Qsv,
        "none" => ExportHwEncoder::None,
        _ => ExportHwEncoder::Auto,
    }
}
