//! Export module - Server-side video export
//!
//! All processing (decode, composite, encode, mux) happens server-side.
//! GPU-centric pipeline keeps all visual data on GPU textures until final encoding.
//!
//! Accessed via ActionRouter: `timelines:export`, `timelines:export_progress`, `timelines:export_cancel`

mod audio_mixer;
mod gpu_export_pipeline;
mod service;
mod types;

pub use audio_mixer::{AudioMixer, MixedAudioFrame};
pub use gpu_export_pipeline::{GpuExportPipeline, GpuPipelineTiming};
pub use service::ExportService;
pub use types::*;
