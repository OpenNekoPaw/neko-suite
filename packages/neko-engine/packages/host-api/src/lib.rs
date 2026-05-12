//! Neko Native API - Controller Layer
//!
//! This crate provides the Controller layer for the Neko Engine MVC architecture:
//! - `EngineApi` - Main facade for all engine operations
//! - `ActionRouter` - Routes ActionRequest to appropriate controllers
//! - `ResourceRegistry` - Manages resources with deterministic IDs and self-healing
//! - `StreamRegistry` - Manages per-stream broadcast channels
//! - Controllers - Handle specific action groups (video, audio, timeline, etc.)
//!
//! # Architecture
//!
//! ```text
//! View Layer (host-napi, host-cli, host-http)
//!     │
//!     ▼ ActionRequest / ActionResponse
//! ┌─────────────────────────────────────────┐
//! │           Controller Layer               │
//! │  EngineApi → ActionRouter → Controllers  │
//! │  ResourceRegistry │ StreamRegistry       │
//! └─────────────────────────────────────────┘
//!     │
//!     ▼ Service trait calls
//! Model Layer (engine-kernel services)
//! ```

#![deny(clippy::all)]

pub mod controllers;
pub mod plugin;
pub mod registry;
pub mod runtime;

mod engine;
mod error;
mod router;
mod session;

pub use engine::EngineApi;
pub use error::{ApiError, ApiResult};
pub use registry::{ResourceRegistry, StreamRegistry};
pub use router::ActionRouter;
pub use session::{Session, SessionConfig, SessionManager};

// Re-export common types for convenience
pub use neko_engine_types::{ActionRequest, ActionResponse, ResourceId, StreamId};

// Re-export engine-kernel types needed by CLI and other view adapters
pub use neko_engine_kernel::export::{
    ExportHwEncoder, ExportJobConfig, ExportPreset, ExportSettings, ExportVideoCodec,
};
pub use neko_engine_kernel::jvi::JviLoader;
pub use neko_engine_kernel::services::audio_mixdown::{
    MixdownConfig, MixdownElement, MixdownTrack,
};

// Re-export puppet types needed by host-http for the WS stream endpoint
pub use neko_engine_kernel::services::IPuppetService;
pub use neko_engine_kernel::PuppetDelta;
