//! ProjectData to TimelineData converter
//!
//! Converts JVI ProjectData to internal TimelineData format with path resolution.

use std::path::PathBuf;

use crate::error::{Error, Result};
use crate::export::{
    AudioElementData, ElementData, ElementTransform, ExportAudioCodec, ExportHwEncoder,
    ExportPreset, ExportSettings, ExportVideoCodec, MediaElementData, TextElementData,
    TimelineData, TrackData, TrackType,
};

use super::types::{JviElement, JviTrack, ProjectData};

/// Converter from ProjectData to TimelineData
pub struct ProjectConverter {
    /// Base directory for resolving relative paths
    base_dir: PathBuf,
}

impl ProjectConverter {
    /// Create a new converter with the given base directory
    pub fn new(base_dir: PathBuf) -> Self {
        Self { base_dir }
    }

    /// Convert ProjectData to TimelineData and ExportSettings
    pub fn convert(&self, project: ProjectData) -> Result<(TimelineData, ExportSettings)> {
        // Calculate timeline duration from tracks
        let duration = self.calculate_duration(&project.tracks);

        // Convert tracks
        let tracks = project
            .tracks
            .into_iter()
            .map(|track| self.convert_track(track))
            .collect::<Result<Vec<_>>>()?;

        let timeline = TimelineData { duration, tracks };

        // Create export settings from project
        let settings = ExportSettings {
            width: project.resolution.width,
            height: project.resolution.height,
            fps: project.fps,
            video_codec: ExportVideoCodec::H264,
            video_bitrate: Some(5_000_000), // 5 Mbps default
            audio_codec: ExportAudioCodec::Aac,
            audio_bitrate: Some(128_000), // 128 kbps default
            hw_encoder: ExportHwEncoder::Auto,
            time_range: None,
            preset: ExportPreset::Medium,
            use_zero_copy_gpu: false, // Disabled: direct IOSurface mapping is faster than CVPixelBuffer wrapping
        };

        Ok((timeline, settings))
    }

    /// Calculate total duration from tracks
    fn calculate_duration(&self, tracks: &[JviTrack]) -> f64 {
        let mut max_end_time = 0.0;

        for track in tracks {
            for element in &track.elements {
                let end_time = match element {
                    JviElement::Media(m) => m.start_time + m.duration,
                    JviElement::Audio(a) => a.start_time + a.duration,
                    JviElement::Text(t) => t.start_time + t.duration,
                    JviElement::Shape(s) => s.start_time + s.duration,
                    JviElement::Subtitle(s) => s.start_time + s.duration,
                };

                if end_time > max_end_time {
                    max_end_time = end_time;
                }
            }
        }

        max_end_time
    }

    /// Convert a JVI track to internal TrackData
    fn convert_track(&self, track: JviTrack) -> Result<TrackData> {
        let track_type = match track.track_type.as_str() {
            "media" => TrackType::Video,
            "audio" => TrackType::Audio,
            "text" => TrackType::Text,
            "shape" | "subtitle" => TrackType::Effect,
            _ => TrackType::Video,
        };

        let elements = track
            .elements
            .into_iter()
            .filter_map(|element| self.convert_element(element).ok())
            .collect();

        Ok(TrackData {
            id: track.id,
            track_type,
            elements,
            muted: track.muted,
        })
    }

    /// Convert a JVI element to internal ElementData
    fn convert_element(&self, element: JviElement) -> Result<ElementData> {
        match element {
            JviElement::Media(media) => {
                let src = self.resolve_path(&media.src);

                let transform = media.transform.map(|t| ElementTransform {
                    x: t.x,
                    y: t.y,
                    scale_x: t.scale_x,
                    scale_y: t.scale_y,
                    rotation: t.rotation,
                    anchor_x: t.anchor_x,
                    anchor_y: t.anchor_y,
                });

                let (volume, muted) = if let Some(audio) = &media.audio {
                    (audio.volume, media.muted)
                } else {
                    (1.0, media.muted)
                };

                Ok(ElementData::Media(MediaElementData {
                    id: media.id,
                    src,
                    start_time: media.start_time,
                    duration: media.duration,
                    trim_start: media.trim_start,
                    trim_end: media.trim_end,
                    transform,
                    opacity: media.opacity,
                    blend_mode: media.blend_mode,
                    muted,
                    volume,
                }))
            }
            JviElement::Audio(audio) => {
                let src = self.resolve_path(&audio.src);

                let (volume, pan, fade_in, fade_out) = if let Some(props) = &audio.audio {
                    (props.volume, props.pan, props.fade_in, props.fade_out)
                } else {
                    (1.0, 0.0, 0.0, 0.0)
                };

                Ok(ElementData::Audio(AudioElementData {
                    id: audio.id,
                    src,
                    start_time: audio.start_time,
                    duration: audio.duration,
                    trim_start: audio.trim_start,
                    trim_end: audio.trim_end,
                    audio: None, // Already extracted volume/pan above
                    volume,
                    pan,
                    fade_in,
                    fade_out,
                }))
            }
            JviElement::Text(text) => {
                let transform = Some(ElementTransform {
                    x: text.x,
                    y: text.y,
                    scale_x: 1.0,
                    scale_y: 1.0,
                    rotation: text.rotation,
                    anchor_x: 0.5,
                    anchor_y: 0.5,
                });

                Ok(ElementData::Text(TextElementData {
                    id: text.id,
                    text: text.content,
                    start_time: text.start_time,
                    duration: text.duration,
                    font_family: text.font_family,
                    font_size: text.font_size,
                    color: text.color,
                    transform,
                    opacity: text.opacity,
                }))
            }
            JviElement::Shape(_) | JviElement::Subtitle(_) => {
                // Shape and subtitle elements are not fully supported yet
                Err(Error::Other("Shape and subtitle elements not yet supported".to_string()))
            }
        }
    }

    /// Resolve a relative path to an absolute path
    fn resolve_path(&self, relative_path: &str) -> String {
        if std::path::Path::new(relative_path).is_absolute() {
            relative_path.to_string()
        } else {
            self.base_dir
                .join(relative_path)
                .to_string_lossy()
                .to_string()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::jvi::types::{JviMediaElement, Resolution};

    #[test]
    fn test_convert_project() {
        let project = ProjectData {
            version: "1.0".to_string(),
            name: "test".to_string(),
            resolution: Resolution {
                width: 1920,
                height: 1080,
            },
            fps: 30.0,
            tracks: vec![JviTrack {
                id: "track-1".to_string(),
                name: "Main Track".to_string(),
                track_type: "media".to_string(),
                elements: vec![JviElement::Media(JviMediaElement {
                    id: "elem-1".to_string(),
                    name: "test.mp4".to_string(),
                    src: "test.mp4".to_string(),
                    duration: 10.0,
                    start_time: 0.0,
                    trim_start: 0.0,
                    trim_end: 0.0,
                    muted: false,
                    hidden: false,
                    locked: false,
                    transform: None,
                    opacity: 1.0,
                    blend_mode: None,
                    audio: None,
                    linked_audio_id: None,
                    media_type: Some("video".to_string()),
                })],
                muted: false,
                is_main: true,
                locked: false,
                solo: false,
                hidden: false,
            }],
            defaults: None,
        };

        let converter = ProjectConverter::new(PathBuf::from("/project"));
        let result = converter.convert(project);

        assert!(result.is_ok());
        let (timeline, settings) = result.unwrap();

        assert_eq!(timeline.duration, 10.0);
        assert_eq!(timeline.tracks.len(), 1);
        assert_eq!(settings.width, 1920);
        assert_eq!(settings.height, 1080);
        assert_eq!(settings.fps, 30.0);
    }

    #[test]
    fn test_resolve_path() {
        let converter = ProjectConverter::new(PathBuf::from("/project/assets"));

        // Relative path
        let resolved = converter.resolve_path("video.mp4");
        assert_eq!(resolved, "/project/assets/video.mp4");

        // Absolute path
        let resolved = converter.resolve_path("/absolute/path/video.mp4");
        assert_eq!(resolved, "/absolute/path/video.mp4");
    }
}
