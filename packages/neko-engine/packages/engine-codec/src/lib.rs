//! Codec infrastructure for neko-engine.
//!
//! This crate owns FFmpeg-backed encoder/decoder/muxer implementations and
//! codec pools. Shared DTO contracts remain in `neko-engine-types`; mixed GPU
//! export orchestration remains in `engine-kernel`.

pub mod decoder;
pub mod encoder;
pub mod error;

#[cfg(test)]
mod architecture_tests;

pub use error::{CodecError, CodecResult, Error, Result};
