//! Media Service Module
//!
//! Provides high-level media operations for Node.js integration:
//! - Media file probing (metadata extraction)
//! - Media file diff (compare two files)
//! - Subtitle extraction
//! - JPEG encoding (RGBA to JPEG)
//!
//! NOTE: Video frame extraction now uses GPU path only (HwAccelDecoder + Nv12Renderer).

mod diff;
mod jpeg_encoder;
mod probe;
mod subtitle;

pub use diff::{diff_media, DiffCategory, DiffResult, FieldDiff};
pub use jpeg_encoder::encode_rgba_to_jpeg;
pub use probe::{MediaInfo, SubtitleStream, probe_media_info};
pub use subtitle::{ExtractedSubtitleTrack, SubtitleCue, extract_subtitles};
