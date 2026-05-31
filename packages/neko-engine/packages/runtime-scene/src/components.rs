//! ECS components for 3D scene entities

use crate::{asset_database::AssetHandle, bounds::SceneBounds3};
use bevy_ecs::prelude::*;
use glam::{Mat4, Quat, Vec3};
use neko_engine_types::easing::EasingType;
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
    pub asset: AssetHandle,
    pub uri: String,
    pub primitive_index: usize,
}

/// Reference to a material asset
#[derive(Component, Clone, Debug, Serialize, Deserialize)]
pub struct MaterialRef {
    pub asset: AssetHandle,
    pub uri: String,
    pub material_index: usize,
}

/// Mesh primitive and material pair attached to one glTF node.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MeshPrimitiveRef {
    pub mesh: MeshRef,
    pub material: Option<MaterialRef>,
}

/// All renderable primitives attached to one glTF node.
#[derive(Component, Clone, Debug, Default, Serialize, Deserialize)]
pub struct MeshPrimitiveRefs {
    pub primitives: Vec<MeshPrimitiveRef>,
}

/// Local-space bounds for all mesh primitives attached to one scene node.
#[derive(Component, Clone, Debug, Serialize, Deserialize)]
pub struct MeshBounds {
    pub local: SceneBounds3,
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
    pub range: Option<f32>,
    pub shadow: Option<LightShadow>,
}

/// Optional authored shadow settings for a light.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LightShadow {
    pub enabled: bool,
    pub resolution: Option<u32>,
    pub bias: Option<f32>,
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

/// Controls whether a node is rendered. Defaults to visible.
#[derive(Component, Clone, Debug)]
pub struct Visible(pub bool);

impl Default for Visible {
    fn default() -> Self {
        Self(true)
    }
}

/// Morph target (blend shape) weights applied to a mesh
#[derive(Component, Clone, Debug, Default)]
pub struct MorphWeights {
    pub weights: Vec<f32>,
}

/// Runtime reference to an editable character authoring description.
#[derive(Component, Clone, Debug, Serialize, Deserialize)]
pub struct CharacterInstanceId(pub String);

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct CharacterMorphWeight {
    pub morph_id: String,
    pub weight: f32,
}

/// Runtime projection of character morph weights.
#[derive(Component, Clone, Debug, Default, Serialize, Deserialize)]
pub struct CharacterMorphWeights {
    pub weights: Vec<CharacterMorphWeight>,
    pub topology_version: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct CharacterMaterialLayer {
    pub slot_id: String,
    pub params_json: String,
    pub topology_version: u64,
}

/// Runtime projection of character material layer overrides.
#[derive(Component, Clone, Debug, Default, Serialize, Deserialize)]
pub struct CharacterMaterialLayers {
    pub layers: Vec<CharacterMaterialLayer>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CharacterBonePose {
    pub bone_id: String,
    pub transform: Transform,
    pub topology_version: u64,
}

/// Runtime projection of a character skeleton pose.
#[derive(Component, Clone, Debug, Default, Serialize, Deserialize)]
pub struct SkeletonPose {
    pub bones: Vec<CharacterBonePose>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct CharacterOverrideState {
    pub path: String,
    pub value_type: String,
    pub value_json: String,
    pub topology_version: u64,
}

/// Runtime projection of acknowledged character override entries.
#[derive(Component, Clone, Debug, Default, Serialize, Deserialize)]
pub struct CharacterOverrides {
    pub entries: Vec<CharacterOverrideState>,
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

/// A single keyframe in a scene animation channel
#[derive(Clone, Debug)]
pub struct SceneKeyframe {
    /// Unique identifier (UUID v4)
    pub id: String,
    /// Timestamp in seconds
    pub timestamp: f32,
    /// Channel values at this keyframe (3 floats for translation/scale, 4 for rotation, N for morph weights)
    pub values: Vec<f32>,
    /// Easing function to the next keyframe
    pub easing: EasingType,
}

impl SceneKeyframe {
    pub fn new(timestamp: f32, values: Vec<f32>) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            timestamp,
            values,
            easing: EasingType::default(),
        }
    }
}

/// Serialized keyframe info returned by keyframe_tracks API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChannelKeyframeInfo {
    pub id: String,
    pub timestamp: f32,
    pub values: Vec<f32>,
    pub easing: String,
}

/// Serialized animation channel info
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnimationChannelInfo {
    pub target_node: String,
    pub property: String,
    pub keyframes: Vec<ChannelKeyframeInfo>,
}

/// Keyframe data for one channel
#[derive(Clone, Debug)]
pub struct AnimationChannel {
    pub target_node: String,
    pub property: AnimationProperty,
    pub keyframes: Vec<SceneKeyframe>,
}

impl AnimationChannel {
    /// Construct from flat timestamp/value arrays (migration constructor for glTF loader)
    pub fn from_flat(
        target_node: String,
        property: AnimationProperty,
        timestamps: &[f32],
        values: &[f32],
    ) -> Self {
        let stride = if property.value_stride() > 0 {
            property.value_stride()
        } else if !timestamps.is_empty() {
            // MorphWeights: infer stride from total values / number of keyframes
            values.len() / timestamps.len()
        } else {
            1
        };
        let keyframes = timestamps
            .iter()
            .enumerate()
            .map(|(i, &t)| {
                let start = i * stride;
                let end = (start + stride).min(values.len());
                SceneKeyframe::new(t, values[start..end].to_vec())
            })
            .collect();
        Self {
            target_node,
            property,
            keyframes,
        }
    }

    /// Get flat timestamps for interpolation (backwards compatibility)
    pub fn timestamps(&self) -> Vec<f32> {
        self.keyframes.iter().map(|k| k.timestamp).collect()
    }

    /// Get flat values for interpolation (backwards compatibility)
    pub fn values(&self) -> Vec<f32> {
        self.keyframes
            .iter()
            .flat_map(|k| k.values.iter().copied())
            .collect()
    }

    /// Add a keyframe, maintaining sorted order. Returns the new keyframe's ID.
    pub fn add_keyframe(&mut self, timestamp: f32, values: Vec<f32>) -> String {
        let kf = SceneKeyframe::new(timestamp, values);
        let id = kf.id.clone();
        let pos = self.keyframes.partition_point(|k| k.timestamp < timestamp);
        self.keyframes.insert(pos, kf);
        id
    }

    /// Remove a keyframe by ID
    pub fn remove_keyframe(&mut self, id: &str) -> Result<(), String> {
        let pos = self
            .keyframes
            .iter()
            .position(|k| k.id == id)
            .ok_or_else(|| format!("Keyframe '{}' not found", id))?;
        self.keyframes.remove(pos);
        Ok(())
    }

    /// Update a keyframe by ID (partial update). Re-sorts if timestamp changed.
    pub fn update_keyframe(
        &mut self,
        id: &str,
        timestamp: Option<f32>,
        values: Option<Vec<f32>>,
        easing: Option<EasingType>,
    ) -> Result<(), String> {
        let kf = self
            .keyframes
            .iter_mut()
            .find(|k| k.id == id)
            .ok_or_else(|| format!("Keyframe '{}' not found", id))?;

        let time_changed = timestamp.is_some();
        if let Some(t) = timestamp {
            kf.timestamp = t;
        }
        if let Some(v) = values {
            kf.values = v;
        }
        if let Some(e) = easing {
            kf.easing = e;
        }

        if time_changed {
            self.keyframes.sort_by(|a, b| {
                a.timestamp
                    .partial_cmp(&b.timestamp)
                    .unwrap_or(std::cmp::Ordering::Equal)
            });
        }
        Ok(())
    }

    /// Serialize to frontend-facing info
    pub fn to_info(&self) -> AnimationChannelInfo {
        let property_str = match self.property {
            AnimationProperty::Translation => "translation",
            AnimationProperty::Rotation => "rotation",
            AnimationProperty::Scale => "scale",
            AnimationProperty::MorphWeights => "morphWeights",
        };
        AnimationChannelInfo {
            target_node: self.target_node.clone(),
            property: property_str.to_string(),
            keyframes: self
                .keyframes
                .iter()
                .map(|k| ChannelKeyframeInfo {
                    id: k.id.clone(),
                    timestamp: k.timestamp,
                    values: k.values.clone(),
                    easing: k.easing.to_str().to_string(),
                })
                .collect(),
        }
    }
}

impl AnimationProperty {
    /// Number of float values per keyframe for this property
    pub fn value_stride(&self) -> usize {
        match self {
            AnimationProperty::Translation | AnimationProperty::Scale => 3,
            AnimationProperty::Rotation => 4,
            // Morph weights: variable, but handled separately
            AnimationProperty::MorphWeights => 0,
        }
    }
}

/// Animation clip data
#[derive(Clone, Debug)]
pub struct AnimationClipData {
    pub name: String,
    pub duration: f32,
    pub channels: Vec<AnimationChannel>,
}

impl AnimationClipData {
    /// Create an empty animation clip
    pub fn create(name: &str, duration: f32) -> Self {
        Self {
            name: name.to_string(),
            duration,
            channels: Vec::new(),
        }
    }

    /// Get all channels as serialized info
    pub fn get_tracks(&self) -> Vec<AnimationChannelInfo> {
        self.channels.iter().map(|c| c.to_info()).collect()
    }

    /// Find a channel by target_node + property, or create one if not found.
    pub fn get_or_create_channel(
        &mut self,
        target_node: &str,
        property: AnimationProperty,
    ) -> &mut AnimationChannel {
        let exists = self.channels.iter().position(|c| {
            c.target_node == target_node
                && std::mem::discriminant(&c.property) == std::mem::discriminant(&property)
        });
        match exists {
            Some(idx) => &mut self.channels[idx],
            None => {
                self.channels.push(AnimationChannel {
                    target_node: target_node.to_string(),
                    property,
                    keyframes: Vec::new(),
                });
                self.channels.last_mut().unwrap()
            }
        }
    }
}

/// Attached animation clips on an entity
#[derive(Component, Clone, Debug)]
pub struct AnimationTarget {
    pub clips: Vec<AnimationClipData>,
}

/// Marker: this entity is a scene root
#[derive(Component, Clone, Debug, Default)]
pub struct SceneRoot;
