//! Service implementations
//!
//! This module contains concrete implementations of the service traits,
//! wrapping the infrastructure layer (gpu, decoder, encoder, etc.).

mod audio;
pub mod audio_mix_stream;
pub(crate) mod common;
mod effects;
mod export;
mod image;
pub mod muxer_sink;
mod node;
mod puppet;
mod scene;
mod scene_command_queue;
mod scene_computation;
mod scene_renderer;
pub mod snapshot_sink;
pub(crate) mod stream_loop;
pub mod stream_sink;
mod task;
mod timeline;
mod video;

// NOTE: ml impl moved to neko-runtime-ml
// NOTE: ServiceContainer removed — EngineApi (host-api) handles service assembly

pub use audio::AudioService;
pub use effects::EffectsService;
pub use export::ExportService;
pub use image::ImageService;
pub use muxer_sink::MuxerSink;
pub use node::NodeService;
pub use puppet::PuppetService;
pub use scene::SceneService;
pub use stream_sink::StreamSink;
pub use task::TaskService;
pub use timeline::TimelineService;
pub use video::VideoService;

// NOTE: MlService moved to neko-runtime-ml
