//! Animation session class and preset functions

use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::sync::Mutex;

use crate::types::{JsEvaluatedProperties, JsKeyframeTrack};
use neko_native_core::animation::{AnimationPresets, AnimationTimeline, KeyframeTrack};

/// Animation timeline session for keyframe animations
#[deprecated(note = "Use NativeEngine.dispatch() instead")]
#[napi]
pub struct AnimationSession {
    pub(crate) timeline: Mutex<AnimationTimeline>,
}

#[napi]
impl AnimationSession {
    /// Create a new animation session
    #[napi(factory)]
    pub fn create(id: String, target_id: String) -> Result<Self> {
        let timeline = AnimationTimeline::new(id, target_id);
        tracing::info!("AnimationSession created for target: {}", timeline.target_id);

        Ok(Self {
            timeline: Mutex::new(timeline),
        })
    }

    /// Add a keyframe track to the animation
    #[napi]
    pub fn add_track(&self, track: JsKeyframeTrack) -> Result<()> {
        let mut timeline = self
            .timeline
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock timeline"))?;

        let rust_track: KeyframeTrack = track.into();
        timeline.add_track(rust_track);
        Ok(())
    }

    /// Evaluate all tracks at given time
    #[napi]
    pub fn evaluate(&self, time: f64) -> Result<JsEvaluatedProperties> {
        let timeline = self
            .timeline
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock timeline"))?;

        let props = timeline.evaluate(time);
        Ok(JsEvaluatedProperties::from(props))
    }

    /// Get animation duration
    #[napi]
    pub fn duration(&self) -> Result<f64> {
        let timeline = self
            .timeline
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock timeline"))?;

        Ok(timeline.duration())
    }

    /// Set explicit duration
    #[napi]
    pub fn set_duration(&self, duration: f64) -> Result<()> {
        let mut timeline = self
            .timeline
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock timeline"))?;

        timeline.set_duration(duration);
        Ok(())
    }

    /// Enable/disable looping
    #[napi]
    pub fn set_loop(&self, enabled: bool, count: Option<u32>) -> Result<()> {
        let mut timeline = self
            .timeline
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock timeline"))?;

        timeline.set_loop(enabled, count);
        Ok(())
    }

    /// Check if animation is complete at given time
    #[napi]
    pub fn is_complete(&self, time: f64) -> Result<bool> {
        let timeline = self
            .timeline
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock timeline"))?;

        Ok(timeline.is_complete(time))
    }

    /// Get number of tracks
    #[napi]
    pub fn track_count(&self) -> Result<u32> {
        let timeline = self
            .timeline
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock timeline"))?;

        Ok(timeline.track_count() as u32)
    }

    /// Get all animated properties
    #[napi]
    pub fn properties(&self) -> Result<Vec<String>> {
        let timeline = self
            .timeline
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock timeline"))?;

        Ok(timeline.properties().into_iter().map(|s| s.to_string()).collect())
    }
}

// =============================================================================
// Animation Presets
// =============================================================================

/// Create preset animations
#[deprecated(note = "Use NativeEngine.dispatch() instead")]
#[allow(dead_code)] // Exported via napi
#[napi]
pub fn create_fade_in_animation(id: String, target_id: String, duration: f64) -> AnimationSession {
    let timeline = AnimationPresets::fade_in(&id, &target_id, duration);
    AnimationSession {
        timeline: Mutex::new(timeline),
    }
}

#[deprecated(note = "Use NativeEngine.dispatch() instead")]
#[allow(dead_code)] // Exported via napi
#[napi]
pub fn create_fade_out_animation(id: String, target_id: String, duration: f64) -> AnimationSession {
    let timeline = AnimationPresets::fade_out(&id, &target_id, duration);
    AnimationSession {
        timeline: Mutex::new(timeline),
    }
}

#[deprecated(note = "Use NativeEngine.dispatch() instead")]
#[allow(dead_code)] // Exported via napi
#[napi]
pub fn create_slide_in_left_animation(
    id: String,
    target_id: String,
    duration: f64,
    distance: f64,
) -> AnimationSession {
    let timeline = AnimationPresets::slide_in_left(&id, &target_id, duration, distance);
    AnimationSession {
        timeline: Mutex::new(timeline),
    }
}

#[deprecated(note = "Use NativeEngine.dispatch() instead")]
#[allow(dead_code)] // Exported via napi
#[napi]
pub fn create_zoom_in_animation(id: String, target_id: String, duration: f64) -> AnimationSession {
    let timeline = AnimationPresets::zoom_in(&id, &target_id, duration);
    AnimationSession {
        timeline: Mutex::new(timeline),
    }
}

#[deprecated(note = "Use NativeEngine.dispatch() instead")]
#[allow(dead_code)] // Exported via napi
#[napi]
pub fn create_bounce_animation(
    id: String,
    target_id: String,
    duration: f64,
    height: f64,
) -> AnimationSession {
    let timeline = AnimationPresets::bounce(&id, &target_id, duration, height);
    AnimationSession {
        timeline: Mutex::new(timeline),
    }
}

#[deprecated(note = "Use NativeEngine.dispatch() instead")]
#[allow(dead_code)] // Exported via napi
#[napi]
pub fn create_pulse_animation(
    id: String,
    target_id: String,
    duration: f64,
    scale_factor: f64,
) -> AnimationSession {
    let timeline = AnimationPresets::pulse(&id, &target_id, duration, scale_factor);
    AnimationSession {
        timeline: Mutex::new(timeline),
    }
}
