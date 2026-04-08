//! Controllers for handling action groups
//!
//! Each controller handles a specific group of actions:
//! - VideoController: videos:* actions
//! - AudioController: audios:* actions
//! - ImageController: images:* actions
//! - TimelineController: timelines:* actions (including export)
//! - TaskController: tasks:* actions
//! - NodeController: nodes:* actions
//! - StreamController: streams:* actions (lifecycle management)
//! - EffectsController: effects:* actions (custom shader effects)
//! - ModelsController: models:* actions (placeholder)
//! - CanvasController: canvas:* actions (placeholder)
//! - ScenesController: scenes:* actions (3D scene management)
//! - PuppetsController: puppets:* actions (2D puppet management)
//! - ColorCorrectionController: color-correction:* actions (LUT management)

mod audio;
mod camera;
mod canvas;
mod color_correction;
mod documents;
mod effects;
mod gamepad;
mod image;
mod midi;
mod models;
mod node;
mod puppets;
mod scenes;
mod stream;
mod task;
mod timeline;
pub(crate) mod utils;
mod plugins;
mod video;

pub use audio::AudioController;
pub use camera::CameraController;
pub use canvas::CanvasController;
pub use color_correction::ColorCorrectionController;
pub use documents::DocumentsController;
pub use effects::EffectsController;
pub use gamepad::GamepadController;
pub use image::ImageController;
pub use midi::MidiController;
pub use models::ModelsController;
pub use node::NodeController;
pub use puppets::PuppetsController;
pub use scenes::ScenesController;
pub use stream::StreamController;
pub use task::TaskController;
pub use timeline::TimelineController;
pub use plugins::PluginsController;
pub use video::VideoController;

use crate::error::ApiResult;
use neko_engine_types::ActionResponse;
use serde_json::Value;

/// Controller trait for handling actions
#[allow(async_fn_in_trait)]
pub trait Controller: Send + Sync {
    /// Handle an action
    async fn handle(
        &self,
        action: &str,
        resource_id: Option<&str>,
        options: Value,
        body: Option<Value>,
    ) -> ApiResult<ActionResponse>;

    /// Get the group name this controller handles
    fn group(&self) -> &'static str;

    /// List supported actions
    fn actions(&self) -> &'static [&'static str];
}
