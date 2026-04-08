//! Keyframe System
//!
//! Keyframe definitions and track management for animations.

use super::easing::EasingType;
use super::interpolate::{interpolate_value, AnimatableValue, InterpolationMode};

/// Single keyframe definition
#[derive(Debug, Clone)]
pub struct Keyframe {
    /// Time in seconds from clip/animation start
    pub time: f64,
    /// Value at this keyframe
    pub value: AnimatableValue,
    /// Easing to next keyframe
    pub easing: EasingType,
    /// Interpolation mode
    pub interpolation: InterpolationMode,
}

impl Keyframe {
    /// Create a new keyframe
    pub fn new(time: f64, value: AnimatableValue) -> Self {
        Self {
            time,
            value,
            easing: EasingType::Linear,
            interpolation: InterpolationMode::Linear,
        }
    }

    /// Create keyframe with easing
    pub fn with_easing(mut self, easing: EasingType) -> Self {
        self.easing = easing;
        self
    }

    /// Create keyframe with interpolation mode
    pub fn with_interpolation(mut self, mode: InterpolationMode) -> Self {
        self.interpolation = mode;
        self
    }
}

/// Keyframe track for a single property
#[derive(Debug, Clone)]
pub struct KeyframeTrack {
    /// Property name (e.g., "opacity", "positionX", "scale")
    pub property: String,
    /// Keyframes sorted by time
    pub keyframes: Vec<Keyframe>,
    /// Default value when no keyframes
    pub default_value: Option<AnimatableValue>,
}

impl KeyframeTrack {
    /// Create a new keyframe track
    pub fn new(property: impl Into<String>) -> Self {
        Self {
            property: property.into(),
            keyframes: Vec::new(),
            default_value: None,
        }
    }

    /// Create with default value
    pub fn with_default(mut self, value: AnimatableValue) -> Self {
        self.default_value = Some(value);
        self
    }

    /// Add a keyframe (maintains sorted order)
    pub fn add_keyframe(&mut self, keyframe: Keyframe) {
        let pos = self
            .keyframes
            .binary_search_by(|k| k.time.partial_cmp(&keyframe.time).unwrap())
            .unwrap_or_else(|e| e);
        self.keyframes.insert(pos, keyframe);
    }

    /// Add a keyframe with just time and value (convenience method)
    pub fn add(&mut self, time: f64, value: AnimatableValue) -> &mut Self {
        self.add_keyframe(Keyframe::new(time, value));
        self
    }

    /// Add keyframe with easing
    pub fn add_with_easing(
        &mut self,
        time: f64,
        value: AnimatableValue,
        easing: EasingType,
    ) -> &mut Self {
        self.add_keyframe(Keyframe::new(time, value).with_easing(easing));
        self
    }

    /// Remove keyframe at index
    pub fn remove_at(&mut self, index: usize) -> Option<Keyframe> {
        if index < self.keyframes.len() {
            Some(self.keyframes.remove(index))
        } else {
            None
        }
    }

    /// Remove keyframe by time (with tolerance)
    pub fn remove_at_time(&mut self, time: f64, tolerance: f64) -> Option<Keyframe> {
        if let Some(pos) = self
            .keyframes
            .iter()
            .position(|k| (k.time - time).abs() < tolerance)
        {
            Some(self.keyframes.remove(pos))
        } else {
            None
        }
    }

    /// Get keyframe count
    pub fn len(&self) -> usize {
        self.keyframes.len()
    }

    /// Check if track is empty
    pub fn is_empty(&self) -> bool {
        self.keyframes.is_empty()
    }

    /// Get track duration (time of last keyframe)
    pub fn duration(&self) -> f64 {
        self.keyframes.last().map(|k| k.time).unwrap_or(0.0)
    }

    /// Evaluate track at given time
    pub fn evaluate(&self, time: f64) -> Option<AnimatableValue> {
        if self.keyframes.is_empty() {
            return self.default_value.clone();
        }

        // Before first keyframe
        if time <= self.keyframes[0].time {
            return Some(self.keyframes[0].value.clone());
        }

        // After last keyframe
        if time >= self.keyframes[self.keyframes.len() - 1].time {
            return Some(self.keyframes[self.keyframes.len() - 1].value.clone());
        }

        // Find surrounding keyframes
        for i in 0..self.keyframes.len() - 1 {
            let k1 = &self.keyframes[i];
            let k2 = &self.keyframes[i + 1];

            if time >= k1.time && time < k2.time {
                // Calculate normalized time between keyframes
                let duration = k2.time - k1.time;
                let t = if duration > 0.0 {
                    (time - k1.time) / duration
                } else {
                    0.0
                };

                return Some(interpolate_value(
                    &k1.value,
                    &k2.value,
                    t,
                    k1.easing,
                    k1.interpolation,
                ));
            }
        }

        self.default_value.clone()
    }

    /// Get keyframes in time range
    pub fn get_keyframes_in_range(&self, start: f64, end: f64) -> Vec<&Keyframe> {
        self.keyframes
            .iter()
            .filter(|k| k.time >= start && k.time <= end)
            .collect()
    }
}

/// Builder for creating keyframe tracks fluently
#[allow(dead_code)]
pub struct KeyframeTrackBuilder {
    track: KeyframeTrack,
}

#[allow(dead_code)]
impl KeyframeTrackBuilder {
    /// Create a new builder
    pub fn new(property: impl Into<String>) -> Self {
        Self {
            track: KeyframeTrack::new(property),
        }
    }

    /// Set default value
    pub fn default_value(mut self, value: AnimatableValue) -> Self {
        self.track.default_value = Some(value);
        self
    }

    /// Add a linear keyframe
    pub fn at(mut self, time: f64, value: AnimatableValue) -> Self {
        self.track.add(time, value);
        self
    }

    /// Add a keyframe with easing
    pub fn at_eased(mut self, time: f64, value: AnimatableValue, easing: EasingType) -> Self {
        self.track.add_with_easing(time, value, easing);
        self
    }

    /// Build the track
    pub fn build(self) -> KeyframeTrack {
        self.track
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_keyframe_track_basic() {
        let mut track = KeyframeTrack::new("opacity");
        track.add(0.0, AnimatableValue::Number(0.0));
        track.add(1.0, AnimatableValue::Number(1.0));

        assert_eq!(track.len(), 2);
        assert!(!track.is_empty());
        assert_eq!(track.duration(), 1.0);
    }

    #[test]
    fn test_keyframe_evaluation() {
        let mut track = KeyframeTrack::new("opacity");
        track.add(0.0, AnimatableValue::Number(0.0));
        track.add(1.0, AnimatableValue::Number(100.0));

        // At start
        let val = track.evaluate(0.0).unwrap();
        assert_eq!(val.as_number().unwrap(), 0.0);

        // In middle
        let val = track.evaluate(0.5).unwrap();
        assert!((val.as_number().unwrap() - 50.0).abs() < 1e-6);

        // At end
        let val = track.evaluate(1.0).unwrap();
        assert_eq!(val.as_number().unwrap(), 100.0);

        // Before start
        let val = track.evaluate(-1.0).unwrap();
        assert_eq!(val.as_number().unwrap(), 0.0);

        // After end
        let val = track.evaluate(2.0).unwrap();
        assert_eq!(val.as_number().unwrap(), 100.0);
    }

    #[test]
    fn test_keyframe_track_builder() {
        let track = KeyframeTrackBuilder::new("scale")
            .default_value(AnimatableValue::Number(1.0))
            .at(0.0, AnimatableValue::Number(1.0))
            .at_eased(0.5, AnimatableValue::Number(1.5), EasingType::EaseOutQuad)
            .at(1.0, AnimatableValue::Number(1.0))
            .build();

        assert_eq!(track.property, "scale");
        assert_eq!(track.len(), 3);
        assert!(track.default_value.is_some());
    }

    #[test]
    fn test_multiple_keyframes() {
        let mut track = KeyframeTrack::new("position");
        track.add(0.0, AnimatableValue::Point2D { x: 0.0, y: 0.0 });
        track.add(1.0, AnimatableValue::Point2D { x: 100.0, y: 50.0 });
        track.add(2.0, AnimatableValue::Point2D { x: 200.0, y: 100.0 });

        // Test middle of first segment
        let val = track.evaluate(0.5).unwrap();
        let (x, y) = val.as_point2d().unwrap();
        assert!((x - 50.0).abs() < 1e-6);
        assert!((y - 25.0).abs() < 1e-6);

        // Test middle of second segment
        let val = track.evaluate(1.5).unwrap();
        let (x, y) = val.as_point2d().unwrap();
        assert!((x - 150.0).abs() < 1e-6);
        assert!((y - 75.0).abs() < 1e-6);
    }

    #[test]
    fn test_sorted_insertion() {
        let mut track = KeyframeTrack::new("test");
        track.add(1.0, AnimatableValue::Number(1.0));
        track.add(0.5, AnimatableValue::Number(0.5));
        track.add(0.0, AnimatableValue::Number(0.0));

        assert_eq!(track.keyframes[0].time, 0.0);
        assert_eq!(track.keyframes[1].time, 0.5);
        assert_eq!(track.keyframes[2].time, 1.0);
    }

    #[test]
    fn test_empty_track_with_default() {
        let track = KeyframeTrack::new("test").with_default(AnimatableValue::Number(42.0));

        let val = track.evaluate(0.5);
        assert_eq!(val.unwrap().as_number().unwrap(), 42.0);
    }

    #[test]
    fn test_keyframe_removal() {
        let mut track = KeyframeTrack::new("test");
        track.add(0.0, AnimatableValue::Number(0.0));
        track.add(1.0, AnimatableValue::Number(1.0));
        track.add(2.0, AnimatableValue::Number(2.0));

        track.remove_at_time(1.0, 0.01);
        assert_eq!(track.len(), 2);
        assert_eq!(track.keyframes[1].time, 2.0);
    }
}
