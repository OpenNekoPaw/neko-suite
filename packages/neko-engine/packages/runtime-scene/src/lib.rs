//! runtime-scene — 3D scene management with ECS
//!
//! Provides scene graph, glTF loading, transform hierarchy,
//! and animation systems using bevy_ecs.

pub mod animation_blend;
pub mod components;
pub mod csg;
pub mod exporter;
pub mod hierarchy;
pub mod ik;
pub mod loader;
pub mod procedural;
pub mod procedural_mesh;
pub mod project;
pub mod systems;
pub mod world;

pub use components::*;
pub use world::{BevySceneWorld, SceneWorld};
