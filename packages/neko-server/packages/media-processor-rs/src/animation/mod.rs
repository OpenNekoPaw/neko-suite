//! Animation Engine
//!
//! Keyframe-based animation system for video editing.
//! Supports property animations with various easing curves.

mod easing;
mod interpolate;
mod keyframe;
mod timeline;

pub use easing::{Easing, EasingType};
pub use interpolate::{AnimatableValue, InterpolationMode};
pub use keyframe::{Keyframe, KeyframeTrack};
pub use timeline::{AnimationPresets, AnimationTimeline, AnimationState, EvaluatedProperties};
