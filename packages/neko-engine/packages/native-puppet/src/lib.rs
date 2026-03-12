//! native-puppet — 2D puppet management with ECS (Inochi2D/inox2d)
//!
//! Provides puppet loading, parameter-driven deformation, physics simulation,
//! and mesh output using bevy_ecs. Mirrors the native-scene architecture
//! for 3D scenes but targets 2D Inochi2D puppet models (.inp files).

pub mod components;
pub mod hierarchy;
pub mod loader;
pub mod systems;
pub mod world;

pub use components::*;
pub use world::{BevyPuppetWorld, PuppetWorld};
