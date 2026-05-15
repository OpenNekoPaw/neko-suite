//! Media Service Module
//!
//! Provides high-level media operations for Node.js integration:
//! - Media file probing (metadata extraction)
//! - Media file diff (compare two files)
//! - Content-level diff (pixel/waveform/frame comparison)
//! - Subtitle extraction
//! - JPEG encoding (RGBA to JPEG)
//!
//! NOTE: Video frame extraction now uses GPU path only (HwAccelDecoder + Nv12Renderer).

#![allow(unused_imports)]

mod audio_diff;
mod diff;
mod ffmpeg_parser;
mod image_diff;
mod jpeg_encoder;
mod probe;
mod subtitle;
mod timeline_diff;
mod video_diff;

pub use audio_diff::{
    diff_audio_content, diff_audio_content_with_options, AudioContentDiff, AudioDiffOptions,
    AudioDiffRegion,
};
pub use diff::{diff_media, ContentDiff, DiffCategory, DiffResult, FieldDiff};
pub use image_diff::{diff_image_content, ImageContentDiff};
pub use jpeg_encoder::encode_rgba_to_jpeg;
pub use probe::{global_probe_cache, probe_media_info, MediaInfo, ProbeCache, SubtitleStream};
pub use subtitle::{extract_subtitles, ExtractedSubtitleTrack, SubtitleCue};
pub use timeline_diff::{
    diff_timeline_content, diff_timeline_content_with_options, ElementChange, ElementContentDiff,
    ElementContentDiffResult, PropertyChange, TimelineChangeType, TimelineContentDiff,
    TimelineDiffOptions, TimelineDiffSummary, TimelineProjectMeta, TrackChange,
};
pub use video_diff::{
    diff_video_content, FrameMetric, VideoContentDiff, VideoDiffOptions, VideoDiffRegion,
};
