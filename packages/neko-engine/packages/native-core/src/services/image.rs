//! Image service trait

use crate::domain::{CaptureOptions, FrameData};
use crate::error::Result;
use neko_types::{MediaInfo, ResourceId};
use std::path::Path;

/// Image service interface
///
/// Handles image-related operations: probing and capture.
#[allow(async_fn_in_trait)]
pub trait IImageService: Send + Sync {
    /// Probe image file metadata
    async fn probe(&self, path: &Path) -> Result<MediaInfo>;

    /// Capture/load image with optional transformations
    async fn capture(
        &self,
        resource_id: &ResourceId,
        options: CaptureOptions,
    ) -> Result<FrameData>;
}
