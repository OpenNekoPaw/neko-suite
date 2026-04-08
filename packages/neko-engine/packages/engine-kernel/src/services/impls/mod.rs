//! Service implementations
//!
//! This module contains concrete implementations of the service traits,
//! wrapping the infrastructure layer (gpu, decoder, encoder, etc.).

mod audio;
mod camera;
pub(crate) mod common;
mod container;
mod effects;
mod export;
mod gamepad;
mod image;
mod midi;
mod node;
mod puppet;
mod scene;
pub(crate) mod stream_loop;
mod task;
mod timeline;
mod video;

#[cfg(feature = "onnx")]
mod ml;

pub use audio::AudioService;
pub use camera::CameraService;
pub use container::ServiceContainer;
pub use effects::EffectsService;
pub use export::ExportService;
pub use gamepad::GamepadService;
pub use image::ImageService;
pub use midi::MidiService;
pub use node::NodeService;
pub use puppet::PuppetService;
pub use scene::SceneService;
pub use task::TaskService;
pub use timeline::TimelineService;
pub use video::VideoService;

#[cfg(feature = "onnx")]
pub use ml::MlService;
