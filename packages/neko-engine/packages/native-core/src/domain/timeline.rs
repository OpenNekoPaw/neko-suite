//! Unified Timeline model
//!
//! The single source of truth for timeline data structures.
//! Used by all modules: export, jvi, keyframe_cache, preview, services.

use neko_types::{BlendMode, EffectParams, Resolution, TrackType};
use serde::{Deserialize, Serialize};

use super::Transform;
use crate::gpu::{BlendMode as GpuBlendMode, Transform2D};

/// A timeline represents a complete editing project
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Timeline {
    /// Total duration in seconds
    pub duration: f64,
    /// Output resolution
    pub resolution: Resolution,
    /// Frame rate
    pub fps: f64,
    /// Tracks in the timeline
    pub tracks: Vec<Track>,
    /// Project defaults
    #[serde(skip_serializing_if = "Option::is_none")]
    pub defaults: Option<ProjectDefaults>,
}

impl Timeline {
    /// Create a new empty timeline
    pub fn new(resolution: Resolution, fps: f64) -> Self {
        Self {
            duration: 0.0,
            resolution,
            fps,
            tracks: Vec::new(),
            defaults: None,
        }
    }

    /// Calculate duration from elements (max end time across all tracks)
    pub fn calculated_duration(&self) -> f64 {
        self.tracks
            .iter()
            .flat_map(|t| t.elements.iter())
            .map(|e| e.end_time())
            .fold(0.0_f64, f64::max)
    }

    /// Return effective duration: use `self.duration` if set, otherwise calculate from elements
    pub fn effective_duration(&self) -> f64 {
        if self.duration > 0.0 {
            self.duration
        } else {
            self.calculated_duration()
        }
    }

    /// Calculate total frames based on fps
    pub fn total_frames(&self) -> u64 {
        (self.duration * self.fps).ceil() as u64
    }

    /// Calculate total frames with custom fps
    pub fn total_frames_at_fps(&self, fps: f64) -> u64 {
        (self.duration * fps).ceil() as u64
    }

    /// Get all video tracks
    pub fn video_tracks(&self) -> impl Iterator<Item = &Track> {
        self.tracks
            .iter()
            .filter(|t| matches!(t.track_type, TrackType::Video | TrackType::Media))
    }

    /// Get all audio tracks
    pub fn audio_tracks(&self) -> impl Iterator<Item = &Track> {
        self.tracks
            .iter()
            .filter(|t| matches!(t.track_type, TrackType::Audio))
    }

    /// Get all media sources (file paths) used in the timeline
    pub fn get_media_sources(&self) -> Vec<String> {
        let mut sources = Vec::new();
        for track in &self.tracks {
            for element in &track.elements {
                if let Some(src) = element.source_path() {
                    if !sources.contains(&src) {
                        sources.push(src);
                    }
                }
            }
        }
        sources
    }

    /// Get elements visible at a specific time
    pub fn elements_at_time(&self, time: f64) -> Vec<&Element> {
        self.tracks
            .iter()
            .flat_map(|t| t.elements.iter())
            .filter(|e| e.is_visible_at(time))
            .collect()
    }

    /// Recalculate duration from track contents
    pub fn recalculate_duration(&mut self) {
        self.duration = self
            .tracks
            .iter()
            .flat_map(|t| t.elements.iter())
            .map(|e| e.end_time())
            .fold(0.0, f64::max);
    }

    // =========================================================================
    // Incremental operation apply (used by streams:applyOperation)
    // =========================================================================

    /// Try to apply an EditOperation incrementally.
    /// Returns `Unsupported` for operation types not handled here;
    /// the caller should fall back to full `streams:update`.
    pub fn try_apply_operation(
        &mut self,
        op: &super::operations::EditOperationEnvelope,
    ) -> crate::error::Result<super::operations::ApplyResult> {
        use super::operations::*;

        match op.op_type.as_str() {
            "element.update" => {
                let payload: ElementUpdatePayload =
                    serde_json::from_value(op.payload.clone()).map_err(|e| {
                        crate::error::Error::Other(format!(
                            "Invalid element.update payload: {}",
                            e
                        ))
                    })?;
                self.apply_element_update(&payload)?;
                Ok(ApplyResult::Applied)
            }
            "track.toggle" => {
                let payload: TrackTogglePayload =
                    serde_json::from_value(op.payload.clone()).map_err(|e| {
                        crate::error::Error::Other(format!(
                            "Invalid track.toggle payload: {}",
                            e
                        ))
                    })?;
                self.apply_track_toggle(&payload)?;
                Ok(ApplyResult::Applied)
            }
            "element.toggle" => {
                let payload: ElementTogglePayload =
                    serde_json::from_value(op.payload.clone()).map_err(|e| {
                        crate::error::Error::Other(format!(
                            "Invalid element.toggle payload: {}",
                            e
                        ))
                    })?;
                self.apply_element_toggle(&payload)?;
                Ok(ApplyResult::Applied)
            }
            _ => Ok(ApplyResult::Unsupported),
        }
    }

    fn apply_element_update(
        &mut self,
        payload: &super::operations::ElementUpdatePayload,
    ) -> crate::error::Result<()> {
        let element = self
            .tracks
            .iter_mut()
            .find(|t| t.id == payload.track_id)
            .and_then(|t| t.elements.iter_mut().find(|e| e.id == payload.element_id))
            .ok_or_else(|| {
                crate::error::Error::Other(format!(
                    "Element not found: track={}, element={}",
                    payload.track_id, payload.element_id
                ))
            })?;

        let u = &payload.updates;
        if let Some(v) = u.start_time {
            element.start_time = v;
        }
        if let Some(v) = u.duration {
            element.duration = v;
        }
        if let Some(v) = u.trim_start {
            element.trim_start = v;
        }
        if let Some(v) = u.trim_end {
            element.trim_end = v;
        }
        if let Some(v) = u.opacity {
            element.opacity = v;
        }
        if let Some(v) = u.muted {
            element.muted = v;
        }
        if let Some(v) = u.hidden {
            element.hidden = v;
        }
        if let Some(v) = u.locked {
            element.locked = v;
        }
        if let Some(ref v) = u.name {
            element.name = v.clone();
        }

        self.recalculate_duration();
        Ok(())
    }

    fn apply_track_toggle(
        &mut self,
        payload: &super::operations::TrackTogglePayload,
    ) -> crate::error::Result<()> {
        let track = self
            .tracks
            .iter_mut()
            .find(|t| t.id == payload.track_id)
            .ok_or_else(|| {
                crate::error::Error::Other(format!("Track not found: {}", payload.track_id))
            })?;

        match payload.field.as_str() {
            "muted" => track.muted = !track.muted,
            "locked" => track.locked = !track.locked,
            "hidden" => track.hidden = !track.hidden,
            other => {
                return Err(crate::error::Error::Other(format!(
                    "Unknown toggle field: {}",
                    other
                )))
            }
        }
        Ok(())
    }

    fn apply_element_toggle(
        &mut self,
        payload: &super::operations::ElementTogglePayload,
    ) -> crate::error::Result<()> {
        let element = self
            .tracks
            .iter_mut()
            .find(|t| t.id == payload.track_id)
            .and_then(|t| t.elements.iter_mut().find(|e| e.id == payload.element_id))
            .ok_or_else(|| {
                crate::error::Error::Other(format!(
                    "Element not found: track={}, element={}",
                    payload.track_id, payload.element_id
                ))
            })?;

        match payload.field.as_str() {
            "muted" => element.muted = !element.muted,
            "hidden" => element.hidden = !element.hidden,
            "locked" => element.locked = !element.locked,
            other => {
                return Err(crate::error::Error::Other(format!(
                    "Unknown toggle field: {}",
                    other
                )))
            }
        }
        Ok(())
    }
}

impl Default for Timeline {
    fn default() -> Self {
        Self::new(Resolution::full_hd(), 30.0)
    }
}

/// A track contains ordered elements of the same type
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    /// Track ID
    pub id: String,
    /// Track name
    #[serde(default)]
    pub name: String,
    /// Track type
    #[serde(rename = "type")]
    pub track_type: TrackType,
    /// Elements in the track
    pub elements: Vec<Element>,
    /// Whether track is muted
    #[serde(default)]
    pub muted: bool,
    /// Whether track is locked
    #[serde(default)]
    pub locked: bool,
    /// Whether track is hidden
    #[serde(default)]
    pub hidden: bool,
    /// Whether this is the main track
    #[serde(default)]
    pub is_main: bool,
}

impl Track {
    pub fn new(id: impl Into<String>, track_type: TrackType) -> Self {
        Self {
            id: id.into(),
            name: String::new(),
            track_type,
            elements: Vec::new(),
            muted: false,
            locked: false,
            hidden: false,
            is_main: false,
        }
    }

    /// Get elements visible at a specific time
    pub fn elements_at_time(&self, time: f64) -> impl Iterator<Item = &Element> {
        self.elements.iter().filter(move |e| e.is_visible_at(time))
    }
}

/// An element is a clip on the timeline
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Element {
    /// Element ID
    pub id: String,
    /// Element name
    #[serde(default)]
    pub name: String,
    /// Element-specific data
    #[serde(flatten)]
    pub element_type: ElementType,
    /// Start time on timeline (seconds)
    pub start_time: f64,
    /// Duration on timeline (seconds)
    pub duration: f64,
    /// Trim start (seconds into source)
    #[serde(default)]
    pub trim_start: f64,
    /// Trim end (seconds from source end)
    #[serde(default)]
    pub trim_end: f64,
    /// 2D transform
    #[serde(default)]
    pub transform: Transform,
    /// Opacity (0.0 - 1.0)
    #[serde(default = "default_opacity")]
    pub opacity: f64,
    /// Blend mode
    #[serde(default)]
    pub blend_mode: BlendMode,
    /// Applied effects
    #[serde(default)]
    pub effects: Vec<EffectParams>,
    /// Whether element is muted
    #[serde(default)]
    pub muted: bool,
    /// Whether element is hidden
    #[serde(default)]
    pub hidden: bool,
    /// Whether element is locked
    #[serde(default)]
    pub locked: bool,
}

fn default_opacity() -> f64 {
    1.0
}

impl Element {
    /// Get end time on timeline
    pub fn end_time(&self) -> f64 {
        self.start_time + self.duration
    }

    /// Check if element is visible at a specific time
    pub fn is_visible_at(&self, time: f64) -> bool {
        !self.hidden && time >= self.start_time && time < self.end_time()
    }

    /// Get source time for a given timeline time
    pub fn get_source_time(&self, timeline_time: f64) -> f64 {
        let relative_time = timeline_time - self.start_time;
        self.trim_start + relative_time
    }

    /// Get source file path if applicable
    pub fn source_path(&self) -> Option<String> {
        match &self.element_type {
            ElementType::Media(m) => Some(m.src.clone()),
            ElementType::Audio(a) => Some(a.src.clone()),
            _ => None,
        }
    }

    /// Check if this is a media element
    pub fn is_media(&self) -> bool {
        matches!(self.element_type, ElementType::Media(_))
    }

    /// Check if this is an audio element
    pub fn is_audio(&self) -> bool {
        matches!(self.element_type, ElementType::Audio(_))
    }

    /// Check if this is a text element
    pub fn is_text(&self) -> bool {
        matches!(self.element_type, ElementType::Text(_))
    }

    /// Convert element transform to GPU Transform2D
    pub fn to_transform_2d(&self) -> Transform2D {
        Transform2D {
            x: self.transform.x,
            y: self.transform.y,
            scale_x: self.transform.scale_x,
            scale_y: self.transform.scale_y,
            rotation: self.transform.rotation,
            anchor_x: self.transform.anchor_x,
            anchor_y: self.transform.anchor_y,
            _padding: 0.0,
        }
    }

    /// Convert element blend mode to GPU BlendMode
    pub fn to_gpu_blend_mode(&self) -> GpuBlendMode {
        match self.blend_mode {
            BlendMode::Normal => GpuBlendMode::Normal,
            BlendMode::Multiply => GpuBlendMode::Multiply,
            BlendMode::Screen => GpuBlendMode::Screen,
            BlendMode::Overlay => GpuBlendMode::Overlay,
            BlendMode::Darken => GpuBlendMode::Darken,
            BlendMode::Lighten => GpuBlendMode::Lighten,
            BlendMode::ColorDodge => GpuBlendMode::ColorDodge,
            BlendMode::ColorBurn => GpuBlendMode::ColorBurn,
            BlendMode::HardLight => GpuBlendMode::HardLight,
            BlendMode::SoftLight => GpuBlendMode::SoftLight,
            BlendMode::Difference => GpuBlendMode::Difference,
            BlendMode::Exclusion => GpuBlendMode::Exclusion,
            BlendMode::Hue => GpuBlendMode::Hue,
            BlendMode::Saturation => GpuBlendMode::Saturation,
            BlendMode::Color => GpuBlendMode::Color,
            BlendMode::Luminosity => GpuBlendMode::Luminosity,
        }
    }

    /// Get effective volume for this element
    pub fn effective_volume(&self) -> f32 {
        match &self.element_type {
            ElementType::Media(m) => {
                if m.audio.as_ref().map(|a| a.muted).unwrap_or(false) {
                    0.0
                } else {
                    m.audio.as_ref().map(|a| a.volume as f32).unwrap_or(1.0)
                }
            }
            ElementType::Audio(a) => {
                if a.audio_settings.as_ref().map(|s| s.muted).unwrap_or(false) {
                    return 0.0;
                }
                if let Some(ref settings) = a.audio_settings {
                    settings
                        .volume
                        .as_ref()
                        .map(|v| v.base_value)
                        .unwrap_or(a.volume)
                } else {
                    a.volume
                }
            }
            _ => 1.0,
        }
    }

    /// Get effective pan for this element
    pub fn effective_pan(&self) -> f32 {
        match &self.element_type {
            ElementType::Audio(a) => {
                if let Some(ref settings) = a.audio_settings {
                    settings
                        .pan
                        .as_ref()
                        .map(|p| p.base_value)
                        .unwrap_or(a.pan)
                } else {
                    a.pan
                }
            }
            _ => 0.0,
        }
    }

    /// Check if audio is muted for this element
    pub fn is_audio_muted(&self) -> bool {
        self.muted
            || match &self.element_type {
                ElementType::Media(m) => m.audio.as_ref().map(|a| a.muted).unwrap_or(false),
                ElementType::Audio(a) => {
                    a.audio_settings.as_ref().map(|s| s.muted).unwrap_or(false)
                }
                _ => false,
            }
    }
}

/// Element-specific data
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ElementType {
    /// Media element (video/image)
    #[serde(rename = "media")]
    Media(MediaElementData),
    /// Audio element
    #[serde(rename = "audio")]
    Audio(AudioElementData),
    /// Text element
    #[serde(rename = "text")]
    Text(TextElementData),
    /// Shape element
    #[serde(rename = "shape")]
    Shape(ShapeElementData),
    /// Subtitle element
    #[serde(rename = "subtitle")]
    Subtitle(SubtitleElementData),
}

/// Media element data (video/image)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaElementData {
    /// Source file path
    pub src: String,
    /// Resource ID (deterministic hash)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resource_id: Option<String>,
    /// Audio properties (for video with audio)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub audio: Option<AudioProperties>,
    /// Media type (video/image)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub media_type: Option<String>,
    /// Linked audio element ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub linked_audio_id: Option<String>,
    /// Volume (0.0 - 1.0) for video's embedded audio
    #[serde(default = "default_volume_f32")]
    pub volume: f32,
}

/// Audio element data
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioElementData {
    /// Source file path
    pub src: String,
    /// Resource ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resource_id: Option<String>,
    /// Audio properties (legacy nested format)
    #[serde(default)]
    pub audio: Option<AudioProperties>,
    /// Audio settings (JVI nested format with baseValue)
    #[serde(default)]
    pub audio_settings: Option<AudioSettings>,
    /// Linked video element ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub linked_video_id: Option<String>,
    /// Volume (0.0 - 1.0) - direct value
    #[serde(default = "default_volume_f32")]
    pub volume: f32,
    /// Pan (-1.0 = left, 0.0 = center, 1.0 = right) - direct value
    #[serde(default)]
    pub pan: f32,
    /// Fade in duration (seconds)
    #[serde(default)]
    pub fade_in: f64,
    /// Fade out duration (seconds)
    #[serde(default)]
    pub fade_out: f64,
}

fn default_volume_f32() -> f32 {
    1.0
}

/// Audio settings (JVI nested format with baseValue)
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AudioSettings {
    /// Volume setting
    pub volume: Option<AudioValue>,
    /// Pan setting
    pub pan: Option<AudioValue>,
    /// Whether audio is muted
    #[serde(default)]
    pub muted: bool,
}

/// Audio value with baseValue (JVI format)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioValue {
    /// Base value
    pub base_value: f32,
}

/// Text element data
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextElementData {
    /// Text content
    #[serde(default)]
    pub content: String,
    /// Font family
    #[serde(default = "default_font_family")]
    pub font_family: String,
    /// Font size in pixels
    #[serde(default = "default_font_size")]
    pub font_size: f32,
    /// Text color (hex)
    #[serde(default = "default_color")]
    pub color: String,
    /// Background color
    #[serde(default = "default_background_color")]
    pub background_color: String,
    /// Text alignment
    #[serde(default = "default_text_align")]
    pub text_align: String,
    /// Font weight
    #[serde(default = "default_font_weight")]
    pub font_weight: String,
    /// Font style
    #[serde(default = "default_font_style")]
    pub font_style: String,
}

fn default_font_family() -> String {
    "Arial".to_string()
}
fn default_font_size() -> f32 {
    48.0
}
fn default_color() -> String {
    "#ffffff".to_string()
}
fn default_background_color() -> String {
    "transparent".to_string()
}
fn default_text_align() -> String {
    "center".to_string()
}
fn default_font_weight() -> String {
    "normal".to_string()
}
fn default_font_style() -> String {
    "normal".to_string()
}

/// Shape element data
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShapeElementData {
    /// Shape type
    #[serde(default)]
    pub shape_type: String,
    /// Fill color
    #[serde(default)]
    pub fill: String,
    /// Stroke color
    #[serde(default)]
    pub stroke: String,
    /// Stroke width
    #[serde(default)]
    pub stroke_width: f32,
}

/// Subtitle element data
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubtitleElementData {
    /// Subtitle text
    #[serde(default)]
    pub text: String,
    /// Font size
    #[serde(default = "default_font_size")]
    pub font_size: f32,
    /// Text color
    #[serde(default = "default_color")]
    pub color: String,
}

/// Audio properties within an element
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioProperties {
    /// Volume (0.0 - 1.0)
    #[serde(default = "default_volume")]
    pub volume: f64,
    /// Pan (-1.0 = left, 0.0 = center, 1.0 = right)
    #[serde(default)]
    pub pan: f64,
    /// Whether audio is muted
    #[serde(default)]
    pub muted: bool,
    /// Fade in duration (seconds)
    #[serde(default)]
    pub fade_in: f64,
    /// Fade out duration (seconds)
    #[serde(default)]
    pub fade_out: f64,
}

fn default_volume() -> f64 {
    1.0
}

impl Default for AudioProperties {
    fn default() -> Self {
        Self {
            volume: 1.0,
            pan: 0.0,
            muted: false,
            fade_in: 0.0,
            fade_out: 0.0,
        }
    }
}

/// Project default settings
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDefaults {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<TextDefaults>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transform: Option<TransformDefaults>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub audio: Option<AudioDefaults>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextDefaults {
    #[serde(default = "default_font_size")]
    pub font_size: f32,
    #[serde(default = "default_font_family")]
    pub font_family: String,
    #[serde(default = "default_color")]
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransformDefaults {
    #[serde(default)]
    pub x: f32,
    #[serde(default)]
    pub y: f32,
    #[serde(default = "default_scale")]
    pub scale_x: f32,
    #[serde(default = "default_scale")]
    pub scale_y: f32,
    #[serde(default)]
    pub rotation: f32,
}

fn default_scale() -> f32 {
    1.0
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioDefaults {
    #[serde(default = "default_volume_f32")]
    pub volume: f32,
    #[serde(default)]
    pub pan: f32,
    #[serde(default)]
    pub fade_in: f64,
    #[serde(default)]
    pub fade_out: f64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_timeline_total_frames() {
        let timeline = Timeline {
            duration: 10.0,
            fps: 30.0,
            ..Default::default()
        };
        assert_eq!(timeline.total_frames(), 300);
    }

    #[test]
    fn test_element_visibility() {
        let element = Element {
            id: "test".to_string(),
            name: String::new(),
            element_type: ElementType::Media(MediaElementData {
                src: "/path/to/video.mp4".to_string(),
                resource_id: None,
                audio: None,
                media_type: None,
                linked_audio_id: None,
                volume: 1.0,
            }),
            start_time: 5.0,
            duration: 10.0,
            trim_start: 0.0,
            trim_end: 0.0,
            transform: Transform::default(),
            opacity: 1.0,
            blend_mode: BlendMode::Normal,
            effects: Vec::new(),
            muted: false,
            hidden: false,
            locked: false,
        };

        assert!(!element.is_visible_at(4.9));
        assert!(element.is_visible_at(5.0));
        assert!(element.is_visible_at(10.0));
        assert!(!element.is_visible_at(15.0));
    }

    #[test]
    fn test_element_source_time() {
        let element = Element {
            id: "test".to_string(),
            name: String::new(),
            element_type: ElementType::Media(MediaElementData {
                src: "/path/to/video.mp4".to_string(),
                resource_id: None,
                audio: None,
                media_type: None,
                linked_audio_id: None,
                volume: 1.0,
            }),
            start_time: 5.0,
            duration: 10.0,
            trim_start: 2.0,
            trim_end: 0.0,
            transform: Transform::default(),
            opacity: 1.0,
            blend_mode: BlendMode::Normal,
            effects: Vec::new(),
            muted: false,
            hidden: false,
            locked: false,
        };

        assert_eq!(element.get_source_time(5.0), 2.0);
        assert_eq!(element.get_source_time(10.0), 7.0);
    }
}
