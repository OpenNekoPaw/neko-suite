//! ECS components for 3D scene entities

use bevy_ecs::prelude::*;
use glam::{Mat4, Quat, Vec3};
use serde::{Deserialize, Serialize};

/// Unique stable identifier for serialization
#[derive(Component, Clone, Debug, Serialize, Deserialize)]
pub struct SceneNodeId(pub String);

/// Human-readable name
#[derive(Component, Clone, Debug, Serialize, Deserialize)]
pub struct NodeName(pub String);

/// 3D Transform (local space)
#[derive(Component, Clone, Debug, Serialize, Deserialize)]
pub struct Transform {
    pub position: Vec3,
    pub rotation: Quat,
    pub scale: Vec3,
}

impl Default for Transform {
    fn default() -> Self {
        Self {
            position: Vec3::ZERO,
            rotation: Quat::IDENTITY,
            scale: Vec3::ONE,
        }
    }
}

impl Transform {
    pub fn to_matrix(&self) -> Mat4 {
        Mat4::from_scale_rotation_translation(self.scale, self.rotation, self.position)
    }

    pub fn from_matrix(matrix: Mat4) -> Self {
        let (scale, rotation, position) = matrix.to_scale_rotation_translation();
        Self {
            position,
            rotation,
            scale,
        }
    }
}

/// World-space transform (computed by transform propagation system)
#[derive(Component, Clone, Debug, Default)]
pub struct GlobalTransform(pub Mat4);

impl GlobalTransform {
    pub fn identity() -> Self {
        Self(Mat4::IDENTITY)
    }
}

/// Reference to a mesh asset
#[derive(Component, Clone, Debug, Serialize, Deserialize)]
pub struct MeshRef {
    pub uri: String,
    pub primitive_index: usize,
}

/// Reference to a material asset
#[derive(Component, Clone, Debug, Serialize, Deserialize)]
pub struct MaterialRef {
    pub uri: String,
    pub material_index: usize,
}

/// Light types
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum LightKind {
    Directional,
    Point,
    Spot { inner_cone: f32, outer_cone: f32 },
}

/// Light component
#[derive(Component, Clone, Debug, Serialize, Deserialize)]
pub struct Light {
    pub kind: LightKind,
    pub color: Vec3,
    pub intensity: f32,
}

/// Camera projection mode
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum CameraProjection {
    Perspective { fov: f32, aspect_ratio: f32 },
    Orthographic { xmag: f32, ymag: f32 },
}

/// Camera component
#[derive(Component, Clone, Debug, Serialize, Deserialize)]
pub struct Camera {
    pub projection: CameraProjection,
    pub near: f32,
    pub far: f32,
}

impl Default for Camera {
    fn default() -> Self {
        Self {
            projection: CameraProjection::Perspective {
                fov: 45.0_f32.to_radians(),
                aspect_ratio: 16.0 / 9.0,
            },
            near: 0.1,
            far: 1000.0,
        }
    }
}

/// Morph target (blend shape) weights applied to a mesh
#[derive(Component, Clone, Debug, Default)]
pub struct MorphWeights {
    pub weights: Vec<f32>,
}

/// Skeleton component for skeletal animation
#[derive(Component, Clone, Debug)]
pub struct Skeleton {
    pub joint_entities: Vec<Entity>,
    pub inverse_bind_matrices: Vec<Mat4>,
}

/// Single animation channel target
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum AnimationProperty {
    Translation,
    Rotation,
    Scale,
    MorphWeights,
}

/// Keyframe data for one channel
#[derive(Clone, Debug)]
pub struct AnimationChannel {
    pub target_node: String,
    pub property: AnimationProperty,
    pub timestamps: Vec<f32>,
    pub values: Vec<f32>,
}

/// Animation clip data
#[derive(Clone, Debug)]
pub struct AnimationClipData {
    pub name: String,
    pub duration: f32,
    pub channels: Vec<AnimationChannel>,
}

/// Attached animation clips on an entity
#[derive(Component, Clone, Debug)]
pub struct AnimationTarget {
    pub clips: Vec<AnimationClipData>,
}

/// Marker: this entity is a scene root
#[derive(Component, Clone, Debug, Default)]
pub struct SceneRoot;
