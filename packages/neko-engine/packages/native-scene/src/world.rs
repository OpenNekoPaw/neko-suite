//! SceneWorld — abstraction over bevy_ecs::World for scene management
//!
//! Isolates bevy_ecs API details behind a stable interface.

use crate::components::*;
use crate::hierarchy;
use crate::loader::{self, LoadError, LoadResult};
use crate::systems;
use bevy_ecs::prelude::*;
use glam::Vec3;
use serde::{Deserialize, Serialize};
use std::path::Path;

/// Snapshot of the scene graph for serialization to the frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SceneSnapshot {
    pub nodes: Vec<SceneNodeSnapshot>,
    pub animations: Vec<AnimationClipInfo>,
}

/// Snapshot of a single scene node
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SceneNodeSnapshot {
    pub id: String,
    pub name: String,
    pub position: [f32; 3],
    pub rotation: [f32; 4],
    pub scale: [f32; 3],
    pub parent_id: Option<String>,
    pub has_mesh: bool,
    pub has_light: bool,
    pub has_camera: bool,
    pub has_skeleton: bool,
}

/// Info about an animation clip
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnimationClipInfo {
    pub name: String,
    pub duration: f32,
    pub channel_count: usize,
}

/// Delta change from a scene tick
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SceneDelta {
    pub updated_transforms: Vec<TransformUpdate>,
    pub updated_morph_weights: Vec<MorphWeightsUpdate>,
}

/// A single transform update
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransformUpdate {
    pub node_id: String,
    pub position: [f32; 3],
    pub rotation: [f32; 4],
    pub scale: [f32; 3],
}

/// Morph weight update for a single mesh node
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MorphWeightsUpdate {
    pub node_id: String,
    pub weights: Vec<f32>,
}

/// Abstraction for scene management operations
pub trait SceneWorld: Send + Sync {
    fn load_model(&mut self, path: &Path) -> Result<LoadResult, LoadError>;
    fn get_snapshot(&mut self) -> SceneSnapshot;
    fn update_transform(
        &mut self,
        node_id: &str,
        position: Vec3,
        rotation: glam::Quat,
        scale: Vec3,
    ) -> Result<(), String>;
    fn tick(&mut self, clip_name: &str, time: f32) -> SceneDelta;
    fn get_animation_clips(&mut self) -> Vec<AnimationClipInfo>;
}

/// Implementation using bevy_ecs::World
pub struct BevySceneWorld {
    world: World,
}

impl BevySceneWorld {
    pub fn new() -> Self {
        Self {
            world: World::new(),
        }
    }

    /// Access the inner ECS World (for GPU rendering queries)
    pub fn ecs_world_mut(&mut self) -> &mut World {
        &mut self.world
    }
}

impl Default for BevySceneWorld {
    fn default() -> Self {
        Self::new()
    }
}

impl SceneWorld for BevySceneWorld {
    fn load_model(&mut self, path: &Path) -> Result<LoadResult, LoadError> {
        loader::load_gltf(&mut self.world, path)
    }

    fn get_snapshot(&mut self) -> SceneSnapshot {
        let mut nodes = Vec::new();

        // Query all scene nodes
        let mut query = self.world.query::<(
            Entity,
            &SceneNodeId,
            &NodeName,
            &Transform,
            Option<&hierarchy::Parent>,
            Option<&MeshRef>,
            Option<&Light>,
            Option<&Camera>,
            Option<&Skeleton>,
        )>();

        for (
            _entity,
            node_id,
            name,
            transform,
            parent,
            mesh,
            light,
            camera,
            skeleton,
        ) in query.iter(&self.world)
        {
            let parent_id = parent.and_then(|p| {
                self.world
                    .get::<SceneNodeId>(p.0)
                    .map(|id| id.0.clone())
            });

            nodes.push(SceneNodeSnapshot {
                id: node_id.0.clone(),
                name: name.0.clone(),
                position: transform.position.to_array(),
                rotation: transform.rotation.to_array(),
                scale: transform.scale.to_array(),
                parent_id,
                has_mesh: mesh.is_some(),
                has_light: light.is_some(),
                has_camera: camera.is_some(),
                has_skeleton: skeleton.is_some(),
            });
        }

        let animations = self.get_animation_clips();

        SceneSnapshot { nodes, animations }
    }

    fn update_transform(
        &mut self,
        node_id: &str,
        position: Vec3,
        rotation: glam::Quat,
        scale: Vec3,
    ) -> Result<(), String> {
        let entity = {
            let mut found = None;
            let mut query = self.world.query::<(Entity, &SceneNodeId)>();
            for (entity, id) in query.iter(&self.world) {
                if id.0 == node_id {
                    found = Some(entity);
                    break;
                }
            }
            found.ok_or_else(|| format!("Node not found: {}", node_id))?
        };

        if let Some(mut transform) = self.world.get_mut::<Transform>(entity) {
            transform.position = position;
            transform.rotation = rotation;
            transform.scale = scale;
        }

        // Re-propagate transforms
        systems::transform_propagation(&mut self.world);

        Ok(())
    }

    fn tick(&mut self, clip_name: &str, time: f32) -> SceneDelta {
        // Advance animation
        systems::animation_tick(&mut self.world, clip_name, time);

        // Propagate transforms
        systems::transform_propagation(&mut self.world);

        // Collect updated transforms
        let mut updated_transforms = Vec::new();
        let mut query = self.world.query::<(&SceneNodeId, &Transform)>();
        for (node_id, transform) in query.iter(&self.world) {
            updated_transforms.push(TransformUpdate {
                node_id: node_id.0.clone(),
                position: transform.position.to_array(),
                rotation: transform.rotation.to_array(),
                scale: transform.scale.to_array(),
            });
        }

        // Collect updated morph weights (only nodes that have the component)
        let mut updated_morph_weights = Vec::new();
        let mut mw_query = self.world.query::<(&SceneNodeId, &MorphWeights)>();
        for (node_id, morph_weights) in mw_query.iter(&self.world) {
            updated_morph_weights.push(MorphWeightsUpdate {
                node_id: node_id.0.clone(),
                weights: morph_weights.weights.clone(),
            });
        }

        SceneDelta {
            updated_transforms,
            updated_morph_weights,
        }
    }

    fn get_animation_clips(&mut self) -> Vec<AnimationClipInfo> {
        let mut clips = Vec::new();
        let mut query = self.world.query::<&AnimationTarget>();
        for target in query.iter(&self.world) {
            for clip in &target.clips {
                clips.push(AnimationClipInfo {
                    name: clip.name.clone(),
                    duration: clip.duration,
                    channel_count: clip.channels.len(),
                });
            }
        }
        clips
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bevy_scene_world_new() {
        let mut world = BevySceneWorld::new();
        let snapshot = world.get_snapshot();
        assert!(snapshot.nodes.is_empty());
        assert!(snapshot.animations.is_empty());
    }

    #[test]
    fn test_bevy_scene_world_default() {
        let mut world = BevySceneWorld::default();
        let snapshot = world.get_snapshot();
        assert!(snapshot.nodes.is_empty());
    }
}
