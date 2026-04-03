//! Neko Types - Shared DTO types for neko-engine
//!
//! This crate contains pure data transfer objects (DTOs) shared across all neko-engine crates.
//! Types here have no behavior methods beyond serialization/deserialization.
//!
//! # Design Principles
//! - Pure data structures with `Serialize`/`Deserialize`
//! - No business logic or side effects
//! - Shared by all crates: native-core, native-api, native-napi, native-cli, native-http

#![deny(clippy::all)]

pub mod codec;
pub mod common;
pub mod easing;
pub mod effects;
pub mod error;
pub mod export;
pub mod health;
pub mod id;
pub mod keyframe;
pub mod media;
pub mod registry;
pub mod request;
pub mod stream;
pub mod task;
pub mod waveform;

// Re-export commonly used types
pub use codec::*;
pub use common::*;
pub use easing::*;
pub use effects::*;
pub use error::*;
pub use export::*;
pub use health::*;
pub use id::*;
pub use keyframe::*;
pub use media::*;
pub use request::*;
pub use stream::*;
pub use task::*;
pub use waveform::*;
