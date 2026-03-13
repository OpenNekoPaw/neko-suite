//! Puppet service trait for 2D puppet management
//!
//! Provides an interface for loading, querying, and manipulating 2D puppets.
//! Mirrors the ISceneService pattern for 3D scenes.

use neko_native_puppet::animation::AnimationClipInfo;
use neko_native_puppet::world::{DeformedMesh, ParameterInfo, PuppetDelta, PuppetSnapshot};

/// Service interface for 2D puppet management (Inochi2D/inox2d)
#[allow(async_fn_in_trait)]
pub trait IPuppetService: Send + Sync {
    /// Load a puppet from INP binary data and return a snapshot
    fn load_puppet(&self, data: &[u8]) -> crate::error::Result<PuppetSnapshot>;

    /// Get the current puppet snapshot
    fn get_snapshot(&self) -> crate::error::Result<PuppetSnapshot>;

    /// Set a parameter value (triggers deformation recompute)
    fn set_parameter(&self, name: &str, value: f32) -> crate::error::Result<()>;

    /// Get all parameter definitions
    fn get_parameters(&self) -> crate::error::Result<Vec<ParameterInfo>>;

    /// Advance physics simulation and return deformed mesh data
    fn tick(&self, delta_ms: f32) -> crate::error::Result<PuppetDelta>;

    /// Get current deformed mesh data without advancing physics
    fn get_deformed_meshes(&self) -> crate::error::Result<Vec<DeformedMesh>>;

    /// Get all available animation clip descriptions
    fn get_animations(&self) -> crate::error::Result<Vec<AnimationClipInfo>>;

    /// Play a named animation clip
    fn play_animation(&self, name: &str, loop_anim: bool) -> crate::error::Result<()>;

    /// Stop the current animation
    fn stop_animation(&self) -> crate::error::Result<()>;

    /// Seek the current animation to a time position (milliseconds)
    fn seek_animation(&self, time_ms: f32) -> crate::error::Result<()>;
}
