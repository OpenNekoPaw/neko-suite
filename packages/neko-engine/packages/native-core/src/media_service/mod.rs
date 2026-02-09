//! Media Service Module
//!
//! Provides high-level media operations for Node.js integration:
//! - Media file probing (metadata extraction)
//! - Media file diff (compare two files)
//! - Content-level diff (pixel/waveform comparison)
//! - Subtitle extraction
//! - JPEG encoding (RGBA to JPEG)
//!
//! NOTE: Video frame extraction now uses GPU path only (HwAccelDecoder + Nv12Renderer).

mod audio_diff;
mod diff;
mod image_diff;
mod jpeg_encoder;
mod probe;
mod subtitle;

pub use audio_diff::{AudioContentDiff, AudioDiffRegion, diff_audio_content};
pub use diff::{ContentDiff, DiffCategory, DiffResult, FieldDiff, diff_media};
pub use image_diff::{ImageContentDiff, diff_image_content};
pub use jpeg_encoder::encode_rgba_to_jpeg;
pub use probe::{MediaInfo, SubtitleStream, probe_media_info};
pub use subtitle::{ExtractedSubtitleTrack, SubtitleCue, extract_subtitles};
