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
//! View Layer (native-napi, native-cli, native-http)
//!     │
//!     ▼ ActionRequest / ActionResponse
//! ┌─────────────────────────────────────────┐
//! │           Controller Layer               │
//! │  EngineApi → ActionRouter → Controllers  │
//! │  ResourceRegistry │ StreamRegistry       │
//! └─────────────────────────────────────────┘
//!     │
//!     ▼ Service trait calls
//! Model Layer (native-core services)
//! ```

#![deny(clippy::all)]

pub mod controllers;
pub mod registry;

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
pub use neko_types::{ActionRequest, ActionResponse, ResourceId, StreamId};
