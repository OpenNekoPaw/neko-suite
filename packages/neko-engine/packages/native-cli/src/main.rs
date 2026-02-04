//! Neko Suite Video Export Server
//!
//! Standalone WebSocket server for compat mode video export.
//! Supports two modes:
//! 1. Server mode: Listen for WebSocket export requests
//! 2. CLI mode: Direct .jvi file export

mod args;
mod runner;

use clap::Parser;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use args::{Args, Command};
use runner::Runner;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Suppress macOS system warnings (Context leak, msgtracer)
    // These come from VideoToolbox/Metal frameworks and are harmless
    #[cfg(target_os = "macos")]
    unsafe {
        libc::setenv(
            b"OS_ACTIVITY_MODE\0".as_ptr() as *const i8,
            b"disable\0".as_ptr() as *const i8,
            1,
        );
    }

    // Parse command line arguments
    let args = Args::parse();

    // Determine log level based on command
    let log_level = match &args.command {
        Command::Serve { verbose, .. } if *verbose => "debug",
        Command::Export { .. } => "warn", // Reduce log noise during export (progress bar handles display)
        _ => "info",
    };

    // Initialize logging
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| log_level.into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    tracing::info!("Neko Suite Video Export Server v{}", env!("CARGO_PKG_VERSION"));

    // Run the appropriate command
    let runner = Runner::new();
    runner.run(args.command).await
}
