//! ECS components for 2D puppet models (format-agnostic)
//!
//! Defines the data layout for puppet nodes in the ECS world.
//! Components are shared across Live2D .moc3 and native .nkp projects;
//! legacy .inp remains metadata-only for migrated assets.

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

/// Binding from a puppet parameter to this node's deformation.
///
/// If `vertex_displacements` is non-empty, it provides per-vertex [dx, dy]
/// offsets that are scaled by the normalised parameter value and weight.
/// Otherwise falls back to a uniform X-axis offset (legacy behaviour).
#[derive(Component, Debug, Clone, Serialize, Deserialize)]
pub struct ParameterBinding {
    pub param_name: String,
    pub weight: f32,
    /// Per-vertex displacement vectors at max parameter value.
    /// Length must match `MeshData.vertices` when populated.
    #[serde(default)]
    pub vertex_displacements: Vec<[f32; 2]>,
}

/// Puppet format identifier
#[derive(Component, Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum PuppetFormat {
    #[deprecated(note = "INP import was removed on 2026-05-20; keep only for legacy metadata")]
    Inp,
    Moc3,
    Native,
}

/// Part visibility control (MOC3 Part → visibility group)
#[derive(Component, Debug, Clone, Serialize, Deserialize)]
pub struct PartVisibility {
    pub is_visible: bool,
    pub is_enabled: bool,
}

impl Default for PartVisibility {
    fn default() -> Self {
        Self {
            is_visible: true,
            is_enabled: true,
        }
    }
}

/// Multi-key-form deformation driven by a single parameter axis.
///
/// MOC3 models bind drawable vertices to parameter values via discrete key forms.
/// At runtime, the current parameter value is used to find the two surrounding
/// key forms and linearly interpolate vertex positions between them.
#[derive(Component, Debug, Clone)]
pub struct MultiKeyDeformation {
    pub param_name: String,
    pub key_forms: Vec<KeyFormData>,
}

/// A single key form: a parameter value and the corresponding vertex positions
#[derive(Debug, Clone)]
pub struct KeyFormData {
    pub param_value: f32,
    pub vertices: Vec<Vec2>,
}

/// Warp deformer — grid-based mesh distortion (MOC3).
///
/// Control points form a (rows+1) × (columns+1) grid. Child vertices are
/// distorted via bilinear interpolation within the grid cell they fall in.
/// The deformer itself has key forms that define control point positions
/// at discrete parameter values.
#[derive(Component, Debug, Clone)]
pub struct WarpDeformer {
    pub rows: u32,
    pub columns: u32,
    /// Key forms for control point positions, driven by a parameter
    pub key_forms: Vec<KeyFormData>,
    pub param_name: String,
}

/// Rotation deformer — pivot-based rotation (MOC3).
///
/// Rotates child nodes around a pivot point by an angle driven by a parameter.
/// The base_angle is the rest-state rotation; key forms provide angle offsets.
#[derive(Component, Debug, Clone)]
pub struct RotationDeformer {
    pub base_angle: f32,
    /// Key forms for angle/position values at discrete parameter values
    pub key_forms: Vec<KeyFormData>,
    pub param_name: String,
}

/// Parent deformer reference — links an art mesh or deformer to its parent deformer
#[derive(Component, Debug, Clone)]
pub struct ParentDeformerRef(pub Entity);

/// Static mesh data (vertices, UVs, indices) — loaded once from source puppet data
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
#[derive(Component, Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub enum BlendMode {
    #[default]
    Normal,
    Multiply,
    Screen,
    Overlay,
    Add,
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

/// Expression library — stores all loaded expressions for a puppet (on root entity)
#[derive(Component, Debug, Clone)]
pub struct ExpressionLibrary {
    pub expressions: Vec<crate::moc3::expression::ExpressionDef>,
}

/// Active expression state (on root entity)
#[derive(Component, Debug, Clone)]
pub struct ActiveExpression {
    /// Index into ExpressionLibrary.expressions
    pub expression_index: usize,
    /// Current fade weight [0.0, 1.0]
    pub weight: f32,
    /// Fade elapsed time in ms
    pub fade_elapsed_ms: f32,
    /// Whether fading in (true) or fading out (false)
    pub fading_in: bool,
}

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

/// Physics simulation model type
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum PhysicsModel {
    /// Gravity-driven rigid pendulum (2 state variables: angle + angular velocity)
    RigidPendulum,
    /// Spring pendulum with elastic restoring force (4 state variables: position + velocity)
    SpringPendulum,
}

/// How physics simulation output maps to parameter values
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum PhysicsMapMode {
    AngleLength,
    LengthAngle,
    XY,
    YX,
}

/// Input parameter reference for physics — specifies how a puppet parameter
/// feeds into the physics simulation anchor.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PhysicsInput {
    /// Name of the puppet parameter that drives this input
    pub param_name: String,
    /// Weight of this input's contribution
    pub weight: f32,
    /// Input type: "X", "Y", or "Angle"
    pub input_type: String,
}

/// SimplePhysics node — drives a parameter via spring/pendulum simulation
#[derive(Component, Clone, Debug, Serialize, Deserialize)]
pub struct SimplePhysics {
    /// Name of the parameter this physics node drives
    pub param_name: String,
    pub model: PhysicsModel,
    pub map_mode: PhysicsMapMode,
    /// Gravity scale (1.0 = puppet gravity)
    pub gravity: f32,
    /// Pendulum/spring rest length (pixels)
    pub length: f32,
    /// Resonant frequency (Hz)
    pub frequency: f32,
    /// Angular damping ratio [0..1]
    pub angle_damping: f32,
    /// Length damping ratio [0..1]
    pub length_damping: f32,
    /// Output scale (x, y)
    pub output_scale: [f32; 2],
    /// Whether to use local transform only
    pub local_only: bool,
    /// Input parameters that drive the physics anchor (MOC3 physics3.json inputs)
    #[serde(default)]
    pub inputs: Vec<PhysicsInput>,
}

/// Runtime physics simulation state (not serialized to project)
#[derive(Component, Clone, Debug, Default)]
pub struct PhysicsState {
    /// Bob position relative to anchor
    pub bob: Vec2,
    /// Velocity
    pub velocity: Vec2,
    /// Angle (radians, for rigid pendulum)
    pub angle: f32,
    /// Angular velocity (for rigid pendulum)
    pub angular_velocity: f32,
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
