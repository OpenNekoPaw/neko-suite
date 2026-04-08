//! runtime-media — Media processing runtime for Neko Engine
//!
//! Provides audio/video/image domain logic that does NOT depend on GPU:
//! - Media file probing (FFmpeg metadata extraction + ProbeCache)
//! - Audio content diff (SNR-based waveform comparison)
//! - Video content diff (FFmpeg SSIM/PSNR frame comparison)
//! - Image content diff (pixel-level SSIM/PSNR)
//! - Subtitle extraction
//! - JPEG encoding (RGBA → JPEG via image crate)
//!
//! Timeline diff and GPU pipelines remain in engine-kernel.

pub mod audio_diff;
pub mod ffmpeg_parser;
pub mod image_diff;
pub mod jpeg_encoder;
pub mod probe;
pub mod subtitle;
pub mod video_diff;

// Re-export primary types
pub use audio_diff::{
    diff_audio_content, diff_audio_content_with_options, AudioContentDiff, AudioDiffOptions,
    AudioDiffRegion,
};
pub use image_diff::{diff_image_content, ImageContentDiff};
pub use jpeg_encoder::encode_rgba_to_jpeg;
pub use probe::{global_probe_cache, probe_media_info, MediaInfo, ProbeCache, SubtitleStream};
pub use subtitle::{extract_subtitles, ExtractedSubtitleTrack, SubtitleCue};
pub use video_diff::{
    diff_video_content, FrameMetric, VideoContentDiff, VideoDiffOptions, VideoDiffRegion,
};
