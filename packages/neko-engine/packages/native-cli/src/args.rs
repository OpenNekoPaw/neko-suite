//! Command-line argument definitions

use clap::{Parser, Subcommand};
use std::path::PathBuf;

/// Neko Engine - Media Processing Server
///
/// Standalone WebSocket server for compat mode video export.
/// Supports two modes:
/// 1. Server mode: Listen for WebSocket export requests
/// 2. CLI mode: Direct .jvi file export
#[derive(Parser, Debug)]
#[command(name = "neko-engine")]
#[command(version, about, long_about = None)]
pub struct Args {
    #[command(subcommand)]
    pub command: Command,
}

#[derive(Subcommand, Debug)]
pub enum Command {
    /// Start as WebSocket server, waiting for export requests
    Serve {
        /// Server port (default: 8765)
        #[arg(short, long, default_value = "8765")]
        port: u16,

        /// Config file path (optional)
        #[arg(short, long)]
        config: Option<PathBuf>,

        /// Enable verbose logging
        #[arg(short, long)]
        verbose: bool,
    },

    /// Export a .jvi project file directly
    Export {
        /// Path to .jvi project file
        #[arg(short = 'i', long)]
        jvi_file: PathBuf,

        /// Output video file path
        #[arg(short, long)]
        output: PathBuf,

        /// Video codec (h264, h265, vp9, prores)
        #[arg(long, default_value = "h264")]
        codec: String,

        /// Video bitrate in bps (default: 5000000)
        #[arg(long, default_value = "5000000")]
        bitrate: u64,

        /// Encoder preset (ultrafast, fast, medium, slow, veryslow)
        #[arg(long, default_value = "medium")]
        preset: String,

        /// Hardware encoder (auto, videotoolbox, nvenc, vaapi, qsv, none)
        #[arg(long, default_value = "auto")]
        hw_encoder: String,

        /// Enable zero-copy GPU encoding with CVPixelBufferPool (macOS only)
        /// Uses AV_PIX_FMT_VIDEOTOOLBOX format for true zero-copy encoding
        #[arg(long, default_value = "false")]
        zero_copy: bool,
    },

    /// Probe media file and display metadata
    Probe {
        /// Path to media file
        #[arg(short = 'i', long)]
        input: PathBuf,

        /// Output format (text, json)
        #[arg(short, long, default_value = "text")]
        format: String,
    },

    /// Extract a single frame from video as JPEG
    Extract {
        /// Path to video file
        #[arg(short = 'i', long)]
        input: PathBuf,

        /// Output JPEG file path
        #[arg(short, long)]
        output: PathBuf,

        /// Time in seconds to extract frame
        #[arg(short, long, default_value = "0.0")]
        time: f64,

        /// JPEG quality (1-100)
        #[arg(short, long, default_value = "85")]
        quality: u32,

        /// Output width (optional, for scaling)
        #[arg(long)]
        width: Option<u32>,

        /// Output height (optional, for scaling)
        #[arg(long)]
        height: Option<u32>,
    },
}
