//! Neko Types - Shared DTO types for neko-engine
//!
//! This crate contains pure data transfer objects (DTOs) shared across all neko-engine crates.
//! Types here have no behavior methods beyond serialization/deserialization.
//!
//! # Design Principles
//! - Pure data structures with `Serialize`/`Deserialize`
//! - No business logic or side effects
//! - Shared by all crates: engine-kernel, host-api, host-napi, host-cli, host-http

#![deny(clippy::all)]

pub mod animation;
pub mod codec;
pub mod common;
pub mod easing;
pub mod effects;
pub mod engine_config;
pub mod error;
pub mod export;
pub mod file_access;
pub mod health;
pub mod id;
pub mod keyframe;
pub mod live_compositor;
pub mod media;
pub mod model_preview;
pub mod pipeline;
pub mod project_context;
pub mod puppet;
pub mod registry;
pub mod request;
pub mod scene;
pub mod stream;
pub mod task;
pub mod transform_propagation;
pub mod viewport;
pub mod waveform;

// Re-export commonly used types
pub use animation::*;
pub use codec::*;
pub use common::*;
pub use easing::Easing;
pub use effects::*;
pub use engine_config::EngineConfig;
pub use error::*;
pub use export::*;
pub use file_access::*;
pub use health::*;
pub use id::*;
pub use keyframe::*;
pub use live_compositor::*;
pub use media::*;
pub use model_preview::*;
pub use pipeline::*;
pub use puppet::*;
pub use request::*;
pub use scene::*;
pub use stream::*;
pub use task::*;
pub use transform_propagation::*;
pub use viewport::*;
pub use waveform::*;
