//! CLI module for standalone server
//!
//! Provides command-line interface for running the media processor as a standalone server
//! or for direct .jvi file export.

mod args;
mod runner;

pub use args::{Args, Command};
pub use runner::Runner;
