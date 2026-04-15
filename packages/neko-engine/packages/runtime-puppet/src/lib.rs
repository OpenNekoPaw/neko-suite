//! runtime-puppet — format-agnostic 2D puppet management with ECS
//!
//! Provides puppet loading, parameter-driven deformation, physics simulation,
//! and mesh output using bevy_ecs. Mirrors the runtime-scene architecture
//! for 3D scenes but targets 2D puppet models (.inp / .moc3 files).

pub mod animation;
pub mod animation_blend;
pub mod components;
pub mod hierarchy;
pub mod loader;
pub mod moc3;
pub mod systems;
pub mod world;

pub use components::*;
pub use world::{BevyPuppetWorld, PuppetWorld};
