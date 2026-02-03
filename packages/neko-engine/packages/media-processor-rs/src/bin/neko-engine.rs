//! UniEdit Video Export Server
//!
//! Standalone WebSocket server for compat mode video export.
//! Supports two modes:
//! 1. Server mode: Listen for WebSocket export requests
//! 2. CLI mode: Direct .jvi file export

use clap::Parser;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

// Import from the library crate
use media_processor_rs::cli::{Args, Command, Runner};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Parse command line arguments
    let args = Args::parse();

    // Determine log level based on command
    let log_level = match &args.command {
        Command::Serve { verbose, .. } if *verbose => "debug",
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

    tracing::info!("UniEdit Video Export Server v{}", env!("CARGO_PKG_VERSION"));

    // Run the appropriate command
    let runner = Runner::new();
    runner.run(args.command).await
}
