//! Media probe endpoint for extracting metadata from media files
//!
//! ## Endpoints
//!
//! - `GET /probe` - Probe media file and return metadata as JSON
//!
//! ## Response Format
//!
//! Supports two output formats via `format` query parameter:
//! - `json` (default): Full JSON response with all metadata
//! - `text`: Human-readable text format

use axum::{
    body::Body,
    extract::Query,
    http::{header, Response, StatusCode},
    response::IntoResponse,
    routing::get,
    Router,
};
use serde::{Deserialize, Serialize};

use crate::media_service::{probe_media_info, MediaInfo};

// =============================================================================
// Types
// =============================================================================

/// Query parameters for /probe
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeQuery {
    /// Source media file path (required)
    pub source: String,
    /// Output format: "json" (default) or "text"
    #[serde(default = "default_format")]
    pub format: String,
}

fn default_format() -> String {
    "json".to_string()
}

/// Probe response for JSON format
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeResponse {
    /// Duration in seconds
    pub duration: f64,
    /// Container format
    pub format: String,
    /// Video stream info (if present)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub video: Option<VideoStreamInfo>,
    /// Audio stream info (if present)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub audio: Option<AudioStreamInfo>,
    /// Subtitle streams (if present)
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub subtitles: Vec<SubtitleStreamInfo>,
}

/// Video stream information
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoStreamInfo {
    /// Video codec name
    pub codec: String,
    /// Video width
    pub width: u32,
    /// Video height
    pub height: u32,
    /// Frame rate
    pub fps: f64,
    /// Bitrate in bps (if available)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bitrate: Option<u64>,
}

/// Audio stream information
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioStreamInfo {
    /// Audio codec name
    pub codec: String,
    /// Sample rate in Hz
    pub sample_rate: u32,
    /// Number of channels
    pub channels: u32,
    /// Bitrate in bps (if available)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bitrate: Option<u64>,
}

/// Subtitle stream information
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubtitleStreamInfo {
    /// Stream index
    pub index: usize,
    /// Codec name
    pub codec: String,
    /// Language code (if available)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    /// Stream title (if available)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// Is default stream
    pub is_default: bool,
    /// Is forced stream
    pub is_forced: bool,
}

/// Error response
#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: String,
    pub code: u16,
}

// =============================================================================
// Routes
// =============================================================================

/// Create router for probe endpoint
pub fn probe_routes() -> Router {
    Router::new().route("/probe", get(probe_handler))
}

// =============================================================================
// Handlers
// =============================================================================

/// GET /probe - Probe media file and return metadata
///
/// Query parameters:
/// - source: Media file path (required)
/// - format: Output format "json" (default) or "text"
async fn probe_handler(Query(query): Query<ProbeQuery>) -> impl IntoResponse {
    match probe_media_info(&query.source) {
        Ok(info) => {
            if query.format.to_lowercase() == "text" {
                // Return human-readable text format
                let text = format_media_info_text(&info, &query.source);
                Response::builder()
                    .status(StatusCode::OK)
                    .header(header::CONTENT_TYPE, "text/plain; charset=utf-8")
                    .body(Body::from(text))
                    .unwrap()
            } else {
                // Return JSON format
                let response = convert_to_probe_response(&info);
                Response::builder()
                    .status(StatusCode::OK)
                    .header(header::CONTENT_TYPE, "application/json")
                    .body(Body::from(serde_json::to_string_pretty(&response).unwrap()))
                    .unwrap()
            }
        }
        Err(e) => {
            let error = ErrorResponse {
                error: e.to_string(),
                code: if e.to_string().contains("not found") {
                    404
                } else {
                    500
                },
            };
            let status = if error.code == 404 {
                StatusCode::NOT_FOUND
            } else {
                StatusCode::INTERNAL_SERVER_ERROR
            };
            Response::builder()
                .status(status)
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(serde_json::to_string(&error).unwrap()))
                .unwrap()
        }
    }
}

// =============================================================================
// Helpers
// =============================================================================

/// Convert MediaInfo to ProbeResponse
fn convert_to_probe_response(info: &MediaInfo) -> ProbeResponse {
    let video = if info.width > 0 && info.height > 0 {
        Some(VideoStreamInfo {
            codec: info.codec.clone(),
            width: info.width,
            height: info.height,
            fps: info.fps,
            bitrate: info.bitrate,
        })
    } else {
        None
    };

    let audio = if info.has_audio {
        Some(AudioStreamInfo {
            codec: info.audio_codec.clone().unwrap_or_else(|| "unknown".to_string()),
            sample_rate: info.audio_sample_rate.unwrap_or(0),
            channels: info.audio_channels.unwrap_or(0),
            bitrate: info.audio_bitrate,
        })
    } else {
        None
    };

    let subtitles: Vec<SubtitleStreamInfo> = info
        .subtitle_streams
        .iter()
        .map(|s| SubtitleStreamInfo {
            index: s.index,
            codec: s.codec.clone(),
            language: s.language.clone(),
            title: s.title.clone(),
            is_default: s.is_default,
            is_forced: s.is_forced,
        })
        .collect();

    ProbeResponse {
        duration: info.duration,
        format: info.format.clone(),
        video,
        audio,
        subtitles,
    }
}

/// Format MediaInfo as human-readable text
fn format_media_info_text(info: &MediaInfo, source: &str) -> String {
    let mut lines = Vec::new();

    // File info
    lines.push(format!("File: {}", source));
    lines.push(format!("Format: {}", info.format));
    lines.push(format!("Duration: {:.2}s", info.duration));
    lines.push(String::new());

    // Video info
    if info.width > 0 && info.height > 0 {
        lines.push("Video:".to_string());
        lines.push(format!("  Codec: {}", info.codec));
        lines.push(format!("  Resolution: {}x{}", info.width, info.height));
        lines.push(format!("  FPS: {:.2}", info.fps));
        if let Some(bitrate) = info.bitrate {
            lines.push(format!("  Bitrate: {} bps", bitrate));
        }
        lines.push(String::new());
    }

    // Audio info
    if info.has_audio {
        lines.push("Audio:".to_string());
        if let Some(ref codec) = info.audio_codec {
            lines.push(format!("  Codec: {}", codec));
        }
        if let Some(sample_rate) = info.audio_sample_rate {
            lines.push(format!("  Sample Rate: {} Hz", sample_rate));
        }
        if let Some(channels) = info.audio_channels {
            lines.push(format!("  Channels: {}", channels));
        }
        if let Some(bitrate) = info.audio_bitrate {
            lines.push(format!("  Bitrate: {} bps", bitrate));
        }
        lines.push(String::new());
    }

    // Subtitle info
    if !info.subtitle_streams.is_empty() {
        lines.push("Subtitles:".to_string());
        for sub in &info.subtitle_streams {
            let mut sub_info = format!("  [{}] {}", sub.index, sub.codec);
            if let Some(ref lang) = sub.language {
                sub_info.push_str(&format!(" ({})", lang));
            }
            if let Some(ref title) = sub.title {
                sub_info.push_str(&format!(" - {}", title));
            }
            if sub.is_default {
                sub_info.push_str(" [default]");
            }
            if sub.is_forced {
                sub_info.push_str(" [forced]");
            }
            lines.push(sub_info);
        }
    }

    lines.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_probe_query_defaults() {
        let json = r#"{"source": "/test.mp4"}"#;
        let query: ProbeQuery = serde_json::from_str(json).unwrap();
        assert_eq!(query.format, "json");
    }

    #[test]
    fn test_probe_response_serialization() {
        let response = ProbeResponse {
            duration: 120.5,
            format: "mp4".to_string(),
            video: Some(VideoStreamInfo {
                codec: "h264".to_string(),
                width: 1920,
                height: 1080,
                fps: 30.0,
                bitrate: Some(5000000),
            }),
            audio: Some(AudioStreamInfo {
                codec: "aac".to_string(),
                sample_rate: 48000,
                channels: 2,
                bitrate: Some(128000),
            }),
            subtitles: vec![],
        };

        let json = serde_json::to_string(&response).unwrap();
        assert!(json.contains("\"duration\":120.5"));
        assert!(json.contains("\"codec\":\"h264\""));
    }

    #[test]
    fn test_format_media_info_text() {
        let info = MediaInfo {
            duration: 120.5,
            width: 1920,
            height: 1080,
            fps: 30.0,
            codec: "h264".to_string(),
            format: "mp4".to_string(),
            bitrate: Some(5000000),
            has_audio: true,
            audio_codec: Some("aac".to_string()),
            audio_sample_rate: Some(48000),
            audio_channels: Some(2),
            audio_bitrate: Some(128000),
            has_subtitles: false,
            subtitle_streams: vec![],
        };

        let text = format_media_info_text(&info, "/test/video.mp4");
        assert!(text.contains("File: /test/video.mp4"));
        assert!(text.contains("Resolution: 1920x1080"));
        assert!(text.contains("Codec: h264"));
        assert!(text.contains("Sample Rate: 48000 Hz"));
    }
}
