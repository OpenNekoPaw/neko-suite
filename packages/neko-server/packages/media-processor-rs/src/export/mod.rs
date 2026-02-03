//! Export module - Server-side video export
//!
//! All processing (decode, composite, encode, mux) happens in the WebSocket Server.
//! GPU-centric pipeline keeps all visual data on GPU textures until final encoding.
//!
//! Architecture:
//! ```text
//! Extension Host                    WebSocket Server (Rust)
//!      │                                    │
//!      │  POST /export/start               │
//!      │  {timeline, outputPath, settings} │
//!      ├───────────────────────────────────►│
//!      │                                    │
//!      │                           ┌────────┴────────┐
//!      │                           │  ExportService  │
//!      │                           └────────┬────────┘
//!      │                                    │
//!      │                           ┌────────▼─────────────┐
//!      │                           │  GpuExportPipeline   │
//!      │                           │  (Facade: decode +   │
//!      │                           │   GPU composite)     │
//!      │                           └────────┬─────────────┘
//!      │                                    │
//!      │                           ┌────────▼────────┐
//!      │                           │ AsyncExportPipe │
//!      │                           │ (encode + mux)  │
//!      │                           └────────┬────────┘
//!      │                                    │
//!      │  WS /export/progress              │
//!      │◄───────────────────────────────────┤
//!      │                                    │
//! ```

mod audio_mixer;
mod gpu_export_pipeline;
mod routes;
mod service;
mod types;

pub use audio_mixer::{AudioMixer, MixedAudioFrame};
pub use gpu_export_pipeline::GpuExportPipeline;
pub use routes::export_routes;
pub use service::ExportService;
pub use types::*;
