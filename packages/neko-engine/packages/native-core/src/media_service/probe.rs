//! Media Probe - Extract metadata from media files
//!
//! Uses FFmpeg to probe media files and extract:
//! - Video stream info (codec, resolution, fps, duration)
//! - Audio stream info (codec, sample rate, channels)
//! - Subtitle stream info

use crate::error::{Error, Result};
use ffmpeg_next as ffmpeg;
use std::path::Path;
use std::sync::Once;

static FFMPEG_INIT: Once = Once::new();

/// Initialize FFmpeg (thread-safe, called once)
fn init_ffmpeg() {
    FFMPEG_INIT.call_once(|| {
        ffmpeg::init().expect("Failed to initialize FFmpeg");
    });
}

/// Subtitle stream information
#[derive(Debug, Clone)]
pub struct SubtitleStream {
    /// Stream index
    pub index: usize,
    /// Codec name (subrip, ass, webvtt, etc.)
    pub codec: String,
    /// Language code (eng, chi, etc.)
    pub language: Option<String>,
    /// Stream title
    pub title: Option<String>,
    /// Is default stream
    pub is_default: bool,
    /// Is forced stream
    pub is_forced: bool,
}

/// Media file information
#[derive(Debug, Clone)]
pub struct MediaInfo {
    /// Duration in seconds
    pub duration: f64,
    /// Video width
    pub width: u32,
    /// Video height
    pub height: u32,
    /// Frame rate
    pub fps: f64,
    /// Video codec name
    pub codec: String,
    /// Container format
    pub format: String,
    /// Video bitrate (bps)
    pub bitrate: Option<u64>,
    /// Has audio stream
    pub has_audio: bool,
    /// Audio codec name
    pub audio_codec: Option<String>,
    /// Audio sample rate
    pub audio_sample_rate: Option<u32>,
    /// Audio channels
    pub audio_channels: Option<u32>,
    /// Audio bitrate (bps)
    pub audio_bitrate: Option<u64>,
    /// Has subtitle streams
    pub has_subtitles: bool,
    /// Subtitle stream info
    pub subtitle_streams: Vec<SubtitleStream>,
}

impl Default for MediaInfo {
    fn default() -> Self {
        Self {
            duration: 0.0,
            width: 0,
            height: 0,
            fps: 0.0,
            codec: "unknown".to_string(),
            format: "unknown".to_string(),
            bitrate: None,
            has_audio: false,
            audio_codec: None,
            audio_sample_rate: None,
            audio_channels: None,
            audio_bitrate: None,
            has_subtitles: false,
            subtitle_streams: Vec::new(),
        }
    }
}

/// Probe media file and extract metadata
///
/// # Arguments
/// * `path` - Path to the media file
///
/// # Returns
/// * `MediaInfo` containing all extracted metadata
pub fn probe_media_info<P: AsRef<Path>>(path: P) -> Result<MediaInfo> {
    init_ffmpeg();

    let path = path.as_ref();
    if !path.exists() {
        return Err(Error::FileNotFound(path.display().to_string()));
    }

    let input = ffmpeg::format::input(&path)
        .map_err(|e| Error::Ffmpeg(format!("Failed to open file: {}", e)))?;

    let mut info = MediaInfo::default();

    // Get format info
    info.format = input.format().name().to_string();
    info.duration = input.duration() as f64 / ffmpeg::ffi::AV_TIME_BASE as f64;

    // Find video stream
    if let Some(stream) = input.streams().best(ffmpeg::media::Type::Video) {
        let codec_params = stream.parameters();

        // Get codec name
        let codec_id = unsafe { (*codec_params.as_ptr()).codec_id };
        if let Some(codec) = ffmpeg::codec::decoder::find(ffmpeg::codec::Id::from(codec_id)) {
            info.codec = codec.name().to_string();
        }

        // Get video dimensions
        info.width = unsafe { (*codec_params.as_ptr()).width as u32 };
        info.height = unsafe { (*codec_params.as_ptr()).height as u32 };

        // Get frame rate
        let frame_rate = stream.avg_frame_rate();
        if frame_rate.denominator() != 0 {
            info.fps = frame_rate.numerator() as f64 / frame_rate.denominator() as f64;
        }

        // Get bitrate
        let bit_rate = unsafe { (*codec_params.as_ptr()).bit_rate };
        if bit_rate > 0 {
            info.bitrate = Some(bit_rate as u64);
        }
    }

    // Find audio stream
    if let Some(stream) = input.streams().best(ffmpeg::media::Type::Audio) {
        info.has_audio = true;
        let codec_params = stream.parameters();

        // Get audio codec name
        let codec_id = unsafe { (*codec_params.as_ptr()).codec_id };
        if let Some(codec) = ffmpeg::codec::decoder::find(ffmpeg::codec::Id::from(codec_id)) {
            info.audio_codec = Some(codec.name().to_string());
        }

        // Get audio parameters
        unsafe {
            let params = codec_params.as_ptr();
            info.audio_sample_rate = Some((*params).sample_rate as u32);

            // Get channel count from ch_layout
            let ch_layout = &(*params).ch_layout;
            info.audio_channels = Some(ch_layout.nb_channels as u32);

            let bit_rate = (*params).bit_rate;
            if bit_rate > 0 {
                info.audio_bitrate = Some(bit_rate as u64);
            }
        }
    }

    // Find subtitle streams
    for stream in input.streams() {
        if stream.parameters().medium() == ffmpeg::media::Type::Subtitle {
            let codec_params = stream.parameters();
            let codec_id = unsafe { (*codec_params.as_ptr()).codec_id };

            let codec_name = ffmpeg::codec::decoder::find(ffmpeg::codec::Id::from(codec_id))
                .map(|c| c.name().to_string())
                .unwrap_or_else(|| "unknown".to_string());

            // Get metadata
            let metadata = stream.metadata();
            let language = metadata.get("language").map(|s| s.to_string());
            let title = metadata.get("title").map(|s| s.to_string());

            // Check disposition flags
            let disposition = stream.disposition();
            let is_default = disposition.contains(ffmpeg::format::stream::Disposition::DEFAULT);
            let is_forced = disposition.contains(ffmpeg::format::stream::Disposition::FORCED);

            info.subtitle_streams.push(SubtitleStream {
                index: stream.index(),
                codec: codec_name,
                language,
                title,
                is_default,
                is_forced,
            });
        }
    }

    info.has_subtitles = !info.subtitle_streams.is_empty();

    Ok(info)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_media_info_default() {
        let info = MediaInfo::default();
        assert_eq!(info.duration, 0.0);
        assert_eq!(info.codec, "unknown");
        assert!(!info.has_audio);
    }
}
