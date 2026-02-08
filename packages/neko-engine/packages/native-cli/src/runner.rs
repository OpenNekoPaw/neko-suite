//! CLI runner - handles different command modes
//!
//! All commands go through EngineApi for consistent MVC architecture.
//! The CLI layer is purely a View adapter — it handles user interaction
//! (progress bars, formatting) while delegating business logic to the engine.

use std::path::PathBuf;
use std::sync::Arc;

use crate::args::Command;
use indicatif::{ProgressBar, ProgressStyle};
use neko_native_api::{
    EngineApi, ExportHwEncoder, ExportJobConfig, ExportPreset, ExportVideoCodec, JviLoader,
};
use neko_types::ActionRequest;

/// CLI runner for executing commands
pub struct Runner {
    engine: Option<Arc<EngineApi>>,
}

impl Runner {
    pub fn new() -> Self {
        Self { engine: None }
    }

    /// Initialize the engine (lazy initialization)
    async fn get_engine(&mut self) -> Result<Arc<EngineApi>, Box<dyn std::error::Error + Send + Sync>> {
        if self.engine.is_none() {
            let engine = EngineApi::new().await.map_err(|e| {
                Box::new(std::io::Error::new(
                    std::io::ErrorKind::Other,
                    format!("Failed to initialize engine: {}", e),
                )) as Box<dyn std::error::Error + Send + Sync>
            })?;
            self.engine = Some(Arc::new(engine));
        }
        Ok(self.engine.clone().unwrap())
    }

    /// Run the specified command
    pub async fn run(&mut self, command: Command) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        match command {
            Command::Serve { port, config, .. } => {
                self.run_server(port, config).await
            }
            Command::Export { jvi_file, output, codec, bitrate, preset, hw_encoder, zero_copy } => {
                self.run_export(jvi_file, output, codec, bitrate, preset, hw_encoder, zero_copy).await
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
        &mut self,
        port: u16,
        _config: Option<PathBuf>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        tracing::info!("Starting Neko Suite Export Server on port {}", port);

        let engine = self.get_engine().await?;
        neko_native_http::start_server_with_frame_server(engine, port).await?;

        Ok(())
    }

    /// Run direct export mode (via EngineApi)
    async fn run_export(
        &mut self,
        jvi_file: PathBuf,
        output: PathBuf,
        codec: String,
        bitrate: u64,
        preset: String,
        hw_encoder: String,
        zero_copy: bool,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        // Load .jvi file
        let loader = JviLoader::new();
        let (timeline, mut settings) = loader.load(&jvi_file)?;

        // Override settings from CLI
        settings.video_codec = parse_video_codec(&codec);
        settings.video_bitrate = Some(bitrate);
        settings.preset = parse_preset(&preset);
        settings.hw_encoder = parse_hw_encoder(&hw_encoder);
        settings.use_zero_copy_gpu = zero_copy;

        // Build ExportJobConfig
        let config = ExportJobConfig {
            job_id: uuid::Uuid::new_v4().to_string(),
            output_path: output.to_string_lossy().to_string(),
            settings,
            timeline,
        };

        let total_frames = config.timeline.total_frames(config.settings.fps);
        let fps = config.settings.fps;

        // Create progress bar
        let pb = ProgressBar::new(total_frames);
        pb.set_style(
            ProgressStyle::default_bar()
                .template("{spinner:.green} [{elapsed_precise}] [{bar:40.cyan/blue}] {pos}/{len} frames ({percent}%) | {msg}")
                .unwrap()
                .progress_chars("=>-"),
        );

        pb.println(format!(
            "Exporting: {} -> {}",
            jvi_file.display(),
            output.display()
        ));
        pb.println(format!(
            "Settings: {} frames @ {} fps, codec: {}, bitrate: {} kbps",
            total_frames, fps, codec, bitrate / 1000
        ));

        // Start export via EngineApi
        let engine = self.get_engine().await?;

        let config_json = serde_json::to_value(&config).map_err(|e| {
            Box::new(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("Failed to serialize export config: {}", e),
            )) as Box<dyn std::error::Error + Send + Sync>
        })?;

        let request = ActionRequest::new("exports", "start")
            .with_body(config_json);

        let response = engine.dispatch(request).await;

        if !response.is_ok() {
            let error_msg = response.error
                .map(|e| e.message)
                .unwrap_or_else(|| "Unknown error".to_string());
            pb.finish_with_message(format!("Error: {}", error_msg));
            return Err(Box::new(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("Failed to start export: {}", error_msg),
            )));
        }

        // Extract job_id from response
        let data = response.data.ok_or_else(|| {
            Box::new(std::io::Error::new(
                std::io::ErrorKind::Other,
                "No data in export start response",
            )) as Box<dyn std::error::Error + Send + Sync>
        })?;

        let job_id = data["job_id"].as_str()
            .or_else(|| data["jobId"].as_str())
            .ok_or_else(|| {
                Box::new(std::io::Error::new(
                    std::io::ErrorKind::Other,
                    "No job_id in export start response",
                )) as Box<dyn std::error::Error + Send + Sync>
            })?
            .to_string();

        pb.set_message(format!("Exporting at {} fps", fps));

        // Poll for completion via EngineApi
        loop {
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

            let progress_request = ActionRequest::new("exports", "progress")
                .with_id(&job_id);

            let progress_response = engine.dispatch(progress_request).await;

            if let Some(data) = progress_response.data {
                let current_frame = data["current_frame"]
                    .as_u64()
                    .or_else(|| data["currentFrame"].as_u64())
                    .unwrap_or(0);
                pb.set_position(current_frame);

                // Update message with speed and detailed performance stats
                let stats = &data["stats"];
                if !stats.is_null() {
                    let avg_fps = stats["avg_fps"]
                        .as_f64()
                        .or_else(|| stats["avgFps"].as_f64())
                        .unwrap_or(0.0);

                    if avg_fps > 0.0 {
                        let eta_secs = ((total_frames - current_frame) as f64 / avg_fps) as u64;
                        let hw_decode_ms = stats["hw_decode_ms"].as_f64()
                            .or_else(|| stats["hwDecodeMs"].as_f64()).unwrap_or(0.0);
                        let nv12_import_ms = stats["nv12_import_ms"].as_f64()
                            .or_else(|| stats["nv12ImportMs"].as_f64()).unwrap_or(0.0);
                        let nv12_to_rgba_ms = stats["nv12_to_rgba_ms"].as_f64()
                            .or_else(|| stats["nv12ToRgbaMs"].as_f64()).unwrap_or(0.0);
                        let composite_ms = stats["composite_ms"].as_f64()
                            .or_else(|| stats["compositeMs"].as_f64()).unwrap_or(0.0);
                        let rgba_to_nv12_ms = stats["rgba_to_nv12_ms"].as_f64()
                            .or_else(|| stats["rgbaToNv12Ms"].as_f64()).unwrap_or(0.0);
                        let cpu_readback_ms = stats["cpu_readback_ms"].as_f64()
                            .or_else(|| stats["cpuReadbackMs"].as_f64()).unwrap_or(0.0);
                        let encode_submit_ms = stats["encode_submit_ms"].as_f64()
                            .or_else(|| stats["encodeSubmitMs"].as_f64()).unwrap_or(0.0);

                        pb.set_message(format!(
                            "{:.1}fps | dec:{:.1} imp:{:.1} cvt:{:.1} cmp:{:.1} nv12:{:.1} read:{:.1} enc:{:.1} | ETA {}:{:02}",
                            avg_fps,
                            hw_decode_ms,
                            nv12_import_ms,
                            nv12_to_rgba_ms,
                            composite_ms,
                            rgba_to_nv12_ms,
                            cpu_readback_ms,
                            encode_submit_ms,
                            eta_secs / 60,
                            eta_secs % 60
                        ));
                    }
                }

                // Check terminal state
                let state_str = data["state"].as_str().unwrap_or("");
                match state_str {
                    "completed" => {
                        pb.finish_with_message("Export completed!");
                        print_performance_summary(&data);
                        break;
                    }
                    "error" => {
                        let error_msg = data["error"].as_str().unwrap_or("Unknown error");
                        pb.finish_with_message(format!("Error: {}", error_msg));
                        return Err(Box::new(std::io::Error::new(
                            std::io::ErrorKind::Other,
                            format!("Export failed: {}", error_msg),
                        )));
                    }
                    "cancelled" => {
                        pb.finish_with_message("Cancelled");
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

    /// Run probe command - display media file metadata (via EngineApi)
    async fn run_probe(
        &mut self,
        input: PathBuf,
        format: String,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        // Use EngineApi for probe
        let engine = self.get_engine().await?;

        let request = ActionRequest::new("videos", "probe")
            .with_source(input.to_string_lossy().to_string());

        let response = engine.dispatch(request).await;

        if !response.is_ok() {
            let error_msg = response.error
                .map(|e| e.message)
                .unwrap_or_else(|| "Unknown error".to_string());
            return Err(Box::new(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("Failed to probe media: {}", error_msg),
            )));
        }

        // Parse the response data
        let data = response.data.ok_or_else(|| {
            Box::new(std::io::Error::new(
                std::io::ErrorKind::Other,
                "No data in response",
            )) as Box<dyn std::error::Error + Send + Sync>
        })?;

        match format.to_lowercase().as_str() {
            "json" => {
                // Output as JSON (response already contains structured data)
                println!("{}", serde_json::to_string_pretty(&data)?);
            }
            _ => {
                // Output as text - parse MediaInfo from response
                let info: neko_types::MediaInfo = serde_json::from_value(data.clone()).map_err(|e| {
                    Box::new(std::io::Error::new(
                        std::io::ErrorKind::Other,
                        format!("Failed to parse media info: {}", e),
                    )) as Box<dyn std::error::Error + Send + Sync>
                })?;

                println!("File: {}", input.display());
                println!("Format: {}", info.format);
                println!("Duration: {:.2}s", info.duration);

                if let Some(video) = info.primary_video() {
                    println!();
                    println!("Video:");
                    println!("  Codec: {}", video.codec);
                    println!("  Resolution: {}x{}", video.width, video.height);
                    println!("  FPS: {:.2}", video.fps);
                    if let Some(bitrate) = video.bitrate {
                        println!("  Bitrate: {} kbps", bitrate / 1000);
                    }
                }

                if let Some(audio) = info.primary_audio() {
                    println!();
                    println!("Audio:");
                    println!("  Codec: {}", audio.codec);
                    println!("  Sample Rate: {} Hz", audio.sample_rate);
                    println!("  Channels: {}", audio.channels);
                    if let Some(bitrate) = audio.bitrate {
                        println!("  Bitrate: {} kbps", bitrate / 1000);
                    }
                }

                if !info.subtitle_streams.is_empty() {
                    println!();
                    println!("Subtitles:");
                    for sub in &info.subtitle_streams {
                        println!(
                            "  #{}: {} ({})",
                            sub.index,
                            sub.codec,
                            sub.language.as_deref().unwrap_or("unknown")
                        );
                        if let Some(title) = &sub.title {
                            println!("      Title: {}", title);
                        }
                    }
                }
            }
        }

        Ok(())
    }

    /// Run extract command - extract single frame from video (via EngineApi)
    async fn run_extract(
        &mut self,
        input: PathBuf,
        output: PathBuf,
        time: f64,
        quality: u32,
        width: Option<u32>,
        height: Option<u32>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        tracing::info!("Extracting frame at {:.2}s from {}", time, input.display());

        // Use EngineApi for capture
        let engine = self.get_engine().await?;

        // Build capture options
        let mut options = serde_json::json!({
            "source": input.to_string_lossy(),
            "time": time,
            "quality": quality,
            "format": "jpeg"
        });

        // Add optional width/height
        if let Some(w) = width {
            options["width"] = serde_json::json!(w);
        }
        if let Some(h) = height {
            options["height"] = serde_json::json!(h);
        }

        let request = ActionRequest::new("videos", "capture")
            .with_options(options);

        let response = engine.dispatch(request).await;

        if !response.is_ok() {
            let error_msg = response.error
                .map(|e| e.message)
                .unwrap_or_else(|| "Unknown error".to_string());
            return Err(Box::new(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("Failed to capture frame: {}", error_msg),
            )));
        }

        // Parse the response data
        let data = response.data.ok_or_else(|| {
            Box::new(std::io::Error::new(
                std::io::ErrorKind::Other,
                "No data in response",
            )) as Box<dyn std::error::Error + Send + Sync>
        })?;

        // Extract base64-encoded frame data
        let frame_data_b64 = data["data"].as_str().ok_or_else(|| {
            Box::new(std::io::Error::new(
                std::io::ErrorKind::Other,
                "No frame data in response",
            )) as Box<dyn std::error::Error + Send + Sync>
        })?;

        // Decode base64
        let frame_data = base64_decode(frame_data_b64).map_err(|e| {
            Box::new(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("Failed to decode base64: {}", e),
            )) as Box<dyn std::error::Error + Send + Sync>
        })?;

        // Write to file
        std::fs::write(&output, &frame_data).map_err(|e| {
            Box::new(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("Failed to write output file: {}", e),
            )) as Box<dyn std::error::Error + Send + Sync>
        })?;

        let frame_width = data["width"].as_u64().unwrap_or(0);
        let frame_height = data["height"].as_u64().unwrap_or(0);

        tracing::info!(
            "Frame extracted successfully: {} ({}x{}, {} bytes)",
            output.display(),
            frame_width,
            frame_height,
            frame_data.len()
        );

        Ok(())
    }
}

impl Default for Runner {
    fn default() -> Self {
        Self::new()
    }
}

/// Print detailed performance summary from export progress data
fn print_performance_summary(data: &serde_json::Value) {
    let stats = &data["stats"];
    if stats.is_null() {
        return;
    }

    let current_frame = data["current_frame"]
        .as_u64()
        .or_else(|| data["currentFrame"].as_u64())
        .unwrap_or(0);
    let avg_fps = stats["avg_fps"].as_f64()
        .or_else(|| stats["avgFps"].as_f64()).unwrap_or(0.0);
    let hw_decode_ms = stats["hw_decode_ms"].as_f64()
        .or_else(|| stats["hwDecodeMs"].as_f64()).unwrap_or(0.0);
    let nv12_import_ms = stats["nv12_import_ms"].as_f64()
        .or_else(|| stats["nv12ImportMs"].as_f64()).unwrap_or(0.0);
    let nv12_to_rgba_ms = stats["nv12_to_rgba_ms"].as_f64()
        .or_else(|| stats["nv12ToRgbaMs"].as_f64()).unwrap_or(0.0);
    let composite_ms = stats["composite_ms"].as_f64()
        .or_else(|| stats["compositeMs"].as_f64()).unwrap_or(0.0);
    let rgba_to_nv12_ms = stats["rgba_to_nv12_ms"].as_f64()
        .or_else(|| stats["rgbaToNv12Ms"].as_f64()).unwrap_or(0.0);
    let cpu_readback_ms = stats["cpu_readback_ms"].as_f64()
        .or_else(|| stats["cpuReadbackMs"].as_f64()).unwrap_or(0.0);
    let encode_submit_ms = stats["encode_submit_ms"].as_f64()
        .or_else(|| stats["encodeSubmitMs"].as_f64()).unwrap_or(0.0);
    let cpu_usage_percent = stats["cpu_usage_percent"].as_f64()
        .or_else(|| stats["cpuUsagePercent"].as_f64()).unwrap_or(0.0);
    let gpu_usage_percent = stats["gpu_usage_percent"].as_f64()
        .or_else(|| stats["gpuUsagePercent"].as_f64());
    let peak_memory_bytes = stats["peak_memory_bytes"].as_u64()
        .or_else(|| stats["peakMemoryBytes"].as_u64()).unwrap_or(0);
    let vram_usage_bytes = stats["vram_usage_bytes"].as_u64()
        .or_else(|| stats["vramUsageBytes"].as_u64());

    println!();
    println!("=== Export Performance Summary ===");
    println!("Total frames: {}", current_frame);
    println!("Average FPS:  {:.1}", avg_fps);
    println!();
    println!("Per-frame timing (avg):");
    println!();
    println!("  [Decode]");
    println!("    HW Decode:     {:>6.2} ms", hw_decode_ms);
    println!();
    println!("  [GPU Pipeline]");
    println!("    NV12 Import:   {:>6.2} ms  (CPU→GPU transfer)", nv12_import_ms);
    println!("    NV12→RGBA:     {:>6.2} ms  (GPU shader)", nv12_to_rgba_ms);
    println!("    Composite:     {:>6.2} ms  (GPU render)", composite_ms);
    println!("    RGBA→NV12:     {:>6.2} ms  (GPU compute)", rgba_to_nv12_ms);
    println!("    CPU Readback:  {:>6.2} ms  (GPU→CPU transfer)", cpu_readback_ms);
    let gpu_total = nv12_import_ms + nv12_to_rgba_ms
        + composite_ms + rgba_to_nv12_ms + cpu_readback_ms;
    println!("    ─────────────────────────");
    println!("    GPU Total:     {:>6.2} ms", gpu_total);
    println!();
    println!("  [Encode]");
    println!("    Encode Submit: {:>6.2} ms", encode_submit_ms);
    println!();
    let frame_total = hw_decode_ms + gpu_total + encode_submit_ms;
    println!("  [Total]");
    println!("    Frame Total:   {:>6.2} ms", frame_total);

    // Resource usage section
    println!();
    println!("Resource usage:");
    println!("  CPU Usage:   {:>6.1} %", cpu_usage_percent);
    if let Some(gpu) = gpu_usage_percent {
        println!("  GPU Usage:   {:>6.1} %", gpu);
    }
    println!("  Peak RAM:    {:>6.1} MB", peak_memory_bytes as f64 / 1024.0 / 1024.0);
    if let Some(vram) = vram_usage_bytes {
        println!("  Peak VRAM:   {:>6.1} MB", vram as f64 / 1024.0 / 1024.0);
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

/// Simple base64 decoding
fn base64_decode(input: &str) -> Result<Vec<u8>, String> {
    const BASE64_CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    fn char_to_val(c: u8) -> Result<u8, String> {
        if let Some(pos) = BASE64_CHARS.iter().position(|&x| x == c) {
            Ok(pos as u8)
        } else if c == b'=' {
            Ok(0) // Padding
        } else {
            Err(format!("Invalid base64 character: {}", c as char))
        }
    }

    let input = input.as_bytes();
    let mut result = Vec::with_capacity(input.len() * 3 / 4);

    let mut i = 0;
    while i < input.len() {
        // Skip whitespace
        if input[i].is_ascii_whitespace() {
            i += 1;
            continue;
        }

        if i + 4 > input.len() {
            return Err("Invalid base64 length".to_string());
        }

        let a = char_to_val(input[i])?;
        let b = char_to_val(input[i + 1])?;
        let c = char_to_val(input[i + 2])?;
        let d = char_to_val(input[i + 3])?;

        result.push((a << 2) | (b >> 4));
        if input[i + 2] != b'=' {
            result.push((b << 4) | (c >> 2));
        }
        if input[i + 3] != b'=' {
            result.push((c << 6) | d);
        }

        i += 4;
    }

    Ok(result)
}
