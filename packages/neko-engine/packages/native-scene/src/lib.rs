//! native-scene — 3D scene management with ECS
//!
//! Provides scene graph, glTF loading, transform hierarchy,
//! and animation systems using bevy_ecs.

pub mod components;
pub mod hierarchy;
pub mod loader;
pub mod systems;
pub mod world;

pub use components::*;
pub use world::{BevySceneWorld, SceneWorld};
