//! Controllers for handling action groups
//!
//! Each controller handles a specific group of actions:
//! - VideoController: videos:* actions
//! - AudioController: audios:* actions
//! - ImageController: images:* actions
//! - TimelineController: timelines:* actions
//! - ExportController: exports:* actions
//! - TaskController: tasks:* actions
//! - NodeController: nodes:* actions
//! - StreamController: streams:* actions (lifecycle management)
//! - ModelsController: models:* actions (placeholder)
//! - CanvasController: canvas:* actions (placeholder)
//! - ScenesController: scenes:* actions (placeholder)

mod audio;
mod canvas;
mod export;
mod image;
mod models;
mod node;
mod scenes;
mod stream;
mod task;
mod timeline;
pub(crate) mod utils;
mod video;

pub use audio::AudioController;
pub use canvas::CanvasController;
pub use export::ExportController;
pub use image::ImageController;
pub use models::ModelsController;
pub use node::NodeController;
pub use scenes::ScenesController;
pub use stream::StreamController;
pub use task::TaskController;
pub use timeline::TimelineController;
pub use video::VideoController;

use crate::error::ApiResult;
use neko_types::ActionResponse;
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
