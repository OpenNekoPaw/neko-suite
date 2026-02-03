//! Animation Timeline
//!
//! Manages multiple animation tracks for an element and evaluates them at a given time.

use std::collections::HashMap;

use super::interpolate::AnimatableValue;
use super::keyframe::KeyframeTrack;

/// Evaluated animation properties at a specific time
#[derive(Debug, Clone, Default)]
pub struct EvaluatedProperties {
    /// Property name -> value
    pub values: HashMap<String, AnimatableValue>,
}

impl EvaluatedProperties {
    /// Create empty properties
    pub fn new() -> Self {
        Self {
            values: HashMap::new(),
        }
    }

    /// Get a number property
    pub fn get_number(&self, property: &str) -> Option<f64> {
        self.values.get(property).and_then(|v| v.as_number())
    }

    /// Get a point2d property
    pub fn get_point2d(&self, property: &str) -> Option<(f64, f64)> {
        self.values.get(property).and_then(|v| v.as_point2d())
    }

    /// Get a point3d property
    pub fn get_point3d(&self, property: &str) -> Option<(f64, f64, f64)> {
        self.values.get(property).and_then(|v| v.as_point3d())
    }

    /// Get a color property
    pub fn get_color(&self, property: &str) -> Option<(f64, f64, f64, f64)> {
        self.values.get(property).and_then(|v| v.as_color())
    }

    /// Get opacity (convenience method)
    pub fn opacity(&self) -> Option<f64> {
        self.get_number("opacity")
    }

    /// Get position (convenience method)
    pub fn position(&self) -> Option<(f64, f64)> {
        self.get_point2d("position")
    }

    /// Get scale (convenience method)
    pub fn scale(&self) -> Option<(f64, f64)> {
        self.get_point2d("scale")
    }

    /// Get rotation (convenience method)
    pub fn rotation(&self) -> Option<f64> {
        self.get_number("rotation")
    }
}

/// Animation state
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum AnimationState {
    /// Animation not started yet
    #[default]
    Idle,
    /// Animation is playing
    Playing,
    /// Animation is paused
    Paused,
    /// Animation has completed
    Completed,
}

/// Animation timeline for an element
#[derive(Debug, Clone)]
pub struct AnimationTimeline {
    /// Unique identifier
    pub id: String,
    /// Target element ID
    pub target_id: String,
    /// Animation tracks
    tracks: Vec<KeyframeTrack>,
    /// Animation duration (calculated or explicit)
    duration: Option<f64>,
    /// Loop settings
    loop_enabled: bool,
    loop_count: Option<u32>,
    /// Current state
    state: AnimationState,
    /// Current loop iteration
    #[allow(dead_code)]
    current_loop: u32,
}

impl AnimationTimeline {
    /// Create a new animation timeline
    pub fn new(id: impl Into<String>, target_id: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            target_id: target_id.into(),
            tracks: Vec::new(),
            duration: None,
            loop_enabled: false,
            loop_count: None,
            state: AnimationState::Idle,
            current_loop: 0,
        }
    }

    /// Add a keyframe track
    pub fn add_track(&mut self, track: KeyframeTrack) {
        self.tracks.push(track);
    }

    /// Add multiple tracks
    pub fn add_tracks(&mut self, tracks: impl IntoIterator<Item = KeyframeTrack>) {
        self.tracks.extend(tracks);
    }

    /// Get track by property name
    pub fn get_track(&self, property: &str) -> Option<&KeyframeTrack> {
        self.tracks.iter().find(|t| t.property == property)
    }

    /// Get mutable track by property name
    pub fn get_track_mut(&mut self, property: &str) -> Option<&mut KeyframeTrack> {
        self.tracks.iter_mut().find(|t| t.property == property)
    }

    /// Set explicit duration
    pub fn set_duration(&mut self, duration: f64) {
        self.duration = Some(duration);
    }

    /// Get animation duration (calculated from tracks if not explicitly set)
    pub fn duration(&self) -> f64 {
        self.duration.unwrap_or_else(|| {
            self.tracks
                .iter()
                .map(|t| t.duration())
                .fold(0.0, f64::max)
        })
    }

    /// Enable looping
    pub fn set_loop(&mut self, enabled: bool, count: Option<u32>) {
        self.loop_enabled = enabled;
        self.loop_count = count;
    }

    /// Get current state
    pub fn state(&self) -> AnimationState {
        self.state
    }

    /// Set state
    pub fn set_state(&mut self, state: AnimationState) {
        self.state = state;
    }

    /// Evaluate all tracks at given time
    pub fn evaluate(&self, time: f64) -> EvaluatedProperties {
        let mut props = EvaluatedProperties::new();

        // Handle looping
        let duration = self.duration();
        let eval_time = if self.loop_enabled && duration > 0.0 {
            let loop_num = (time / duration).floor() as u32;
            if let Some(max_loops) = self.loop_count {
                if loop_num >= max_loops {
                    // Animation completed, use final time
                    duration
                } else {
                    time % duration
                }
            } else {
                // Infinite loop
                time % duration
            }
        } else {
            time
        };

        // Evaluate each track
        for track in &self.tracks {
            if let Some(value) = track.evaluate(eval_time) {
                props.values.insert(track.property.clone(), value);
            }
        }

        props
    }

    /// Check if animation is complete at given time
    pub fn is_complete(&self, time: f64) -> bool {
        let duration = self.duration();
        if duration <= 0.0 {
            return true;
        }

        if self.loop_enabled {
            if let Some(max_loops) = self.loop_count {
                return time >= duration * max_loops as f64;
            }
            // Infinite loop never completes
            return false;
        }

        time >= duration
    }

    /// Get all track properties
    pub fn properties(&self) -> Vec<&str> {
        self.tracks.iter().map(|t| t.property.as_str()).collect()
    }

    /// Get track count
    pub fn track_count(&self) -> usize {
        self.tracks.len()
    }

    /// Check if timeline has any keyframes
    pub fn has_keyframes(&self) -> bool {
        self.tracks.iter().any(|t| !t.is_empty())
    }
}

/// Builder for animation timelines
#[allow(dead_code)]
pub struct AnimationTimelineBuilder {
    timeline: AnimationTimeline,
}

#[allow(dead_code)]
impl AnimationTimelineBuilder {
    /// Create new builder
    pub fn new(id: impl Into<String>, target_id: impl Into<String>) -> Self {
        Self {
            timeline: AnimationTimeline::new(id, target_id),
        }
    }

    /// Add a track
    pub fn track(mut self, track: KeyframeTrack) -> Self {
        self.timeline.add_track(track);
        self
    }

    /// Set duration
    pub fn duration(mut self, duration: f64) -> Self {
        self.timeline.set_duration(duration);
        self
    }

    /// Enable looping
    pub fn loop_forever(mut self) -> Self {
        self.timeline.set_loop(true, None);
        self
    }

    /// Loop a specific number of times
    pub fn loop_times(mut self, count: u32) -> Self {
        self.timeline.set_loop(true, Some(count));
        self
    }

    /// Build the timeline
    pub fn build(self) -> AnimationTimeline {
        self.timeline
    }
}

/// Animation preset factory
pub struct AnimationPresets;

#[allow(dead_code)] // Used by napi module when feature is enabled
impl AnimationPresets {
    /// Create a fade in animation
    pub fn fade_in(id: &str, target_id: &str, duration: f64) -> AnimationTimeline {
        use super::easing::EasingType;

        let mut track = KeyframeTrack::new("opacity");
        track.add_with_easing(0.0, AnimatableValue::number(0.0), EasingType::EaseOutCubic);
        track.add(duration, AnimatableValue::number(1.0));

        let mut timeline = AnimationTimeline::new(id, target_id);
        timeline.add_track(track);
        timeline.set_duration(duration);
        timeline
    }

    /// Create a fade out animation
    pub fn fade_out(id: &str, target_id: &str, duration: f64) -> AnimationTimeline {
        use super::easing::EasingType;

        let mut track = KeyframeTrack::new("opacity");
        track.add_with_easing(0.0, AnimatableValue::number(1.0), EasingType::EaseInCubic);
        track.add(duration, AnimatableValue::number(0.0));

        let mut timeline = AnimationTimeline::new(id, target_id);
        timeline.add_track(track);
        timeline.set_duration(duration);
        timeline
    }

    /// Create a slide in from left animation
    pub fn slide_in_left(
        id: &str,
        target_id: &str,
        duration: f64,
        distance: f64,
    ) -> AnimationTimeline {
        use super::easing::EasingType;

        let mut pos_track = KeyframeTrack::new("positionX");
        pos_track.add_with_easing(0.0, AnimatableValue::number(-distance), EasingType::EaseOutCubic);
        pos_track.add(duration, AnimatableValue::number(0.0));

        let mut opacity_track = KeyframeTrack::new("opacity");
        opacity_track.add(0.0, AnimatableValue::number(0.0));
        opacity_track.add(duration * 0.3, AnimatableValue::number(1.0));

        let mut timeline = AnimationTimeline::new(id, target_id);
        timeline.add_track(pos_track);
        timeline.add_track(opacity_track);
        timeline.set_duration(duration);
        timeline
    }

    /// Create a scale up (zoom in) animation
    pub fn zoom_in(id: &str, target_id: &str, duration: f64) -> AnimationTimeline {
        use super::easing::EasingType;

        let mut scale_track = KeyframeTrack::new("scale");
        scale_track.add_with_easing(
            0.0,
            AnimatableValue::point2d(0.0, 0.0),
            EasingType::EaseOutBack,
        );
        scale_track.add(duration, AnimatableValue::point2d(1.0, 1.0));

        let mut opacity_track = KeyframeTrack::new("opacity");
        opacity_track.add(0.0, AnimatableValue::number(0.0));
        opacity_track.add(duration * 0.2, AnimatableValue::number(1.0));

        let mut timeline = AnimationTimeline::new(id, target_id);
        timeline.add_track(scale_track);
        timeline.add_track(opacity_track);
        timeline.set_duration(duration);
        timeline
    }

    /// Create a bounce animation
    pub fn bounce(id: &str, target_id: &str, duration: f64, height: f64) -> AnimationTimeline {
        use super::easing::EasingType;

        let mut pos_track = KeyframeTrack::new("positionY");
        pos_track.add(0.0, AnimatableValue::number(0.0));
        pos_track.add_with_easing(
            duration * 0.5,
            AnimatableValue::number(-height),
            EasingType::EaseOutQuad,
        );
        pos_track.add_with_easing(duration, AnimatableValue::number(0.0), EasingType::EaseInQuad);

        let mut timeline = AnimationTimeline::new(id, target_id);
        timeline.add_track(pos_track);
        timeline.set_duration(duration);
        timeline
    }

    /// Create a pulse (scale up and down) animation
    pub fn pulse(id: &str, target_id: &str, duration: f64, scale_factor: f64) -> AnimationTimeline {
        use super::easing::EasingType;

        let mut scale_track = KeyframeTrack::new("scale");
        scale_track.add(0.0, AnimatableValue::point2d(1.0, 1.0));
        scale_track.add_with_easing(
            duration * 0.5,
            AnimatableValue::point2d(scale_factor, scale_factor),
            EasingType::EaseOutQuad,
        );
        scale_track.add(duration, AnimatableValue::point2d(1.0, 1.0));

        let mut timeline = AnimationTimeline::new(id, target_id);
        timeline.add_track(scale_track);
        timeline.set_duration(duration);
        timeline.set_loop(true, None); // Infinite loop
        timeline
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_animation_timeline_basic() {
        let mut timeline = AnimationTimeline::new("anim1", "element1");

        let mut opacity_track = KeyframeTrack::new("opacity");
        opacity_track.add(0.0, AnimatableValue::number(0.0));
        opacity_track.add(1.0, AnimatableValue::number(1.0));
        timeline.add_track(opacity_track);

        assert_eq!(timeline.duration(), 1.0);
        assert_eq!(timeline.track_count(), 1);
        assert!(timeline.has_keyframes());

        // Evaluate at start
        let props = timeline.evaluate(0.0);
        assert_eq!(props.opacity().unwrap(), 0.0);

        // Evaluate at middle
        let props = timeline.evaluate(0.5);
        assert!((props.opacity().unwrap() - 0.5).abs() < 1e-6);

        // Evaluate at end
        let props = timeline.evaluate(1.0);
        assert_eq!(props.opacity().unwrap(), 1.0);
    }

    #[test]
    fn test_animation_looping() {
        let mut timeline = AnimationTimeline::new("anim1", "element1");
        timeline.set_duration(1.0);
        timeline.set_loop(true, Some(3));

        let mut opacity_track = KeyframeTrack::new("opacity");
        opacity_track.add(0.0, AnimatableValue::number(0.0));
        opacity_track.add(1.0, AnimatableValue::number(1.0));
        timeline.add_track(opacity_track);

        // Time 1.5 should be in second loop at 0.5
        let props = timeline.evaluate(1.5);
        assert!((props.opacity().unwrap() - 0.5).abs() < 1e-6);

        // At time 3.0 (after 3 loops), should be at end
        let props = timeline.evaluate(3.5);
        assert_eq!(props.opacity().unwrap(), 1.0);

        // Complete check
        assert!(!timeline.is_complete(2.0));
        assert!(timeline.is_complete(3.0));
    }

    #[test]
    fn test_animation_presets() {
        let fade_in = AnimationPresets::fade_in("fade", "target", 0.5);
        assert_eq!(fade_in.duration(), 0.5);

        let props = fade_in.evaluate(0.0);
        assert_eq!(props.opacity().unwrap(), 0.0);

        let props = fade_in.evaluate(0.5);
        assert_eq!(props.opacity().unwrap(), 1.0);
    }

    #[test]
    fn test_timeline_builder() {
        let mut track = KeyframeTrack::new("opacity");
        track.add(0.0, AnimatableValue::number(0.0));
        track.add(1.0, AnimatableValue::number(1.0));

        let timeline = AnimationTimelineBuilder::new("anim", "target")
            .track(track)
            .duration(1.0)
            .loop_times(2)
            .build();

        assert_eq!(timeline.duration(), 1.0);
        assert!(timeline.is_complete(2.0));
    }

    #[test]
    fn test_multi_track_animation() {
        let mut timeline = AnimationTimeline::new("anim", "target");

        let mut pos_track = KeyframeTrack::new("position");
        pos_track.add(0.0, AnimatableValue::point2d(0.0, 0.0));
        pos_track.add(1.0, AnimatableValue::point2d(100.0, 50.0));
        timeline.add_track(pos_track);

        let mut opacity_track = KeyframeTrack::new("opacity");
        opacity_track.add(0.0, AnimatableValue::number(0.0));
        opacity_track.add(0.5, AnimatableValue::number(1.0));
        timeline.add_track(opacity_track);

        let props = timeline.evaluate(0.5);

        let (x, y) = props.position().unwrap();
        assert!((x - 50.0).abs() < 1e-6);
        assert!((y - 25.0).abs() < 1e-6);

        assert_eq!(props.opacity().unwrap(), 1.0);
    }
}
