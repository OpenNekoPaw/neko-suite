//! runtime-scene — 3D scene management with ECS
//!
//! Provides scene graph, glTF loading, transform hierarchy,
//! and animation systems using bevy_ecs.

pub mod access;
pub mod animation_blend;
pub mod asset_database;
pub mod bounds;
pub mod character_authoring;
pub mod character_baking;
pub mod components;
pub mod csg;
pub mod exporter;
pub mod hierarchy;
pub mod ik;
pub mod loader;
pub mod modeling_session;
pub mod procedural;
pub mod procedural_mesh;
pub mod project;
pub mod scene_control;
pub mod systems;
pub mod text_mesh;
pub mod world;

#[cfg(test)]
mod architecture_tests;
#[cfg(test)]
mod contract_tests;

pub use asset_database::*;
pub use bounds::*;
pub use character_authoring::*;
pub use character_baking::*;
pub use components::*;
pub use modeling_session::*;
pub use scene_control::*;
pub use text_mesh::*;
pub use world::{BevySceneWorld, SceneWorld};
