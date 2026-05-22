//! MOC3 format support — clean-room implementation
//!
//! Based on OpenL2D MOC3 Spec v1.0, not derived from Cubism SDK.
//! Provides parsing of .moc3 binary files and conversion to format-agnostic
//! ECS components shared with the INP loader.

pub mod expression;
pub mod interpolation;
pub mod loader;
pub mod motion;
pub mod native_conversion;
pub mod parser;
pub mod physics;
pub mod rotation_deformer;
pub mod warp_deformer;
