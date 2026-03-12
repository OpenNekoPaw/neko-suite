//! ECS components for 2D puppet models
//!
//! Defines the data layout for Inochi2D puppet nodes in the ECS world.
//! Each component maps to a concept in the Inochi2D specification.

use bevy_ecs::prelude::*;
use glam::{Mat3, Vec2};
use serde::{Deserialize, Serialize};

/// Unique identifier for a puppet node (persisted across sessions)
#[derive(Component, Debug, Clone, Serialize, Deserialize)]
pub struct PuppetNodeId(pub String);

/// Human-readable node name
#[derive(Component, Debug, Clone, Serialize, Deserialize)]
pub struct NodeName(pub String);

/// Local 2D transform (position, rotation in radians, scale)
#[derive(Component, Debug, Clone, Serialize, Deserialize)]
pub struct Transform2D {
    pub position: Vec2,
    pub rotation: f32,
    pub scale: Vec2,
}

impl Default for Transform2D {
    fn default() -> Self {
        Self {
            position: Vec2::ZERO,
            rotation: 0.0,
            scale: Vec2::ONE,
        }
    }
}

/// Computed world-space 2D transform (propagated by systems)
#[derive(Component, Debug, Clone)]
pub struct GlobalTransform2D(pub Mat3);

impl Default for GlobalTransform2D {
    fn default() -> Self {
        Self(Mat3::IDENTITY)
    }
}

/// Binding from a puppet parameter to this node's deformation
#[derive(Component, Debug, Clone, Serialize, Deserialize)]
pub struct ParameterBinding {
    pub param_name: String,
    pub weight: f32,
}

/// Static mesh data (vertices, UVs, indices) — loaded once from INP
#[derive(Component, Debug, Clone)]
pub struct MeshData {
    pub vertices: Vec<Vec2>,
    pub uvs: Vec<Vec2>,
    pub indices: Vec<u16>,
}

/// Deformed vertex positions — recomputed each tick
#[derive(Component, Debug, Clone)]
pub struct DeformedVertices(pub Vec<Vec2>);

/// Reference to a texture atlas region
#[derive(Component, Debug, Clone, Serialize, Deserialize)]
pub struct TextureRef {
    pub texture_index: usize,
}

/// Node type in the puppet hierarchy
#[derive(Component, Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum PuppetNodeType {
    /// Root node of the puppet
    Root,
    /// Drawable part (has mesh + texture)
    Part,
    /// Deformation node (applies warping)
    Deform,
    /// Composite node (blend group)
    Composite,
    /// Simple group node
    Group,
}

/// Z-order for rendering sort
#[derive(Component, Debug, Clone, Serialize, Deserialize)]
pub struct ZOrder(pub f32);

/// Blend mode for compositing
#[derive(Component, Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum BlendMode {
    Normal,
    Multiply,
    Screen,
    Overlay,
    Add,
}

impl Default for BlendMode {
    fn default() -> Self {
        Self::Normal
    }
}

/// Opacity value (0.0 = fully transparent, 1.0 = fully opaque)
#[derive(Component, Debug, Clone, Serialize, Deserialize)]
pub struct Opacity(pub f32);

impl Default for Opacity {
    fn default() -> Self {
        Self(1.0)
    }
}

/// Marker component: this entity is the puppet root
#[derive(Component, Debug, Clone)]
pub struct PuppetRoot;

/// Puppet-level parameter definition (stored on the root entity)
#[derive(Component, Debug, Clone, Serialize, Deserialize)]
pub struct PuppetParameters {
    pub params: Vec<ParameterDef>,
}

/// A single parameter definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParameterDef {
    pub name: String,
    pub min: f32,
    pub max: f32,
    pub default: f32,
    pub current: f32,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_transform2d_default() {
        let t = Transform2D::default();
        assert_eq!(t.position, Vec2::ZERO);
        assert_eq!(t.rotation, 0.0);
        assert_eq!(t.scale, Vec2::ONE);
    }

    #[test]
    fn test_global_transform2d_default() {
        let gt = GlobalTransform2D::default();
        assert_eq!(gt.0, Mat3::IDENTITY);
    }

    #[test]
    fn test_opacity_default() {
        let o = Opacity::default();
        assert_eq!(o.0, 1.0);
    }

    #[test]
    fn test_blend_mode_default() {
        assert_eq!(BlendMode::default(), BlendMode::Normal);
    }
}
