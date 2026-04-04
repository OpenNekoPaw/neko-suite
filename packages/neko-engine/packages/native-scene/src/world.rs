//! SceneWorld — abstraction over bevy_ecs::World for scene management
//!
//! Isolates bevy_ecs API details behind a stable interface.

use crate::animation_blend::{
    SceneAnimationBlendState, SceneBlendLayer, SceneBlendLayerInfo, SceneCrossfadeRequest,
};
use crate::components::*;
use crate::hierarchy;
use crate::ik::{self, IkChain, IkChainInfo, IkSolverType};
use crate::loader::{self, LoadError, LoadResult};
use crate::systems;
use bevy_ecs::prelude::*;
use glam::Vec3;
use neko_types::easing::EasingType;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

/// Snapshot of the scene graph for serialization to the frontend
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
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
    /// Restore scene from a snapshot (used when loading .nkm projects).
    fn restore_snapshot(&mut self, snapshot: &SceneSnapshot);

    /// Get keyframe tracks for a named animation clip
    fn get_keyframe_tracks(&mut self, clip_name: &str) -> Result<Vec<AnimationChannelInfo>, String>;

    /// Add a keyframe to a channel within a named clip.
    /// `node_id` + `property` identify the channel; creates channel if needed.
    fn add_keyframe(
        &mut self,
        clip_name: &str,
        node_id: &str,
        property: &str,
        timestamp: f32,
        values: Vec<f32>,
    ) -> Result<String, String>;

    /// Remove a keyframe by ID from a named clip
    fn remove_keyframe(&mut self, clip_name: &str, keyframe_id: &str) -> Result<(), String>;

    /// Update a keyframe by ID (partial update)
    fn update_keyframe(
        &mut self,
        clip_name: &str,
        keyframe_id: &str,
        timestamp: Option<f32>,
        values: Option<Vec<f32>>,
        easing: Option<EasingType>,
    ) -> Result<(), String>;

    /// Create a new empty animation clip
    fn create_clip(&mut self, name: &str, duration: f32) -> Result<(), String>;

    /// Crossfade to a named animation clip over a duration
    fn crossfade_animation(
        &mut self,
        clip_name: &str,
        fade_duration: f32,
        loop_anim: bool,
    ) -> Result<(), String>;

    /// Set blend weight for a named clip layer
    fn set_blend_weight(&mut self, clip_name: &str, weight: f32) -> Result<(), String>;

    /// Get the current blend state
    fn get_blend_state(&mut self) -> Vec<SceneBlendLayerInfo>;

    /// Create an IK chain between two joints
    fn create_ik_chain(
        &mut self,
        root_joint: &str,
        end_effector: &str,
        solver: &str,
        iterations: u32,
        tolerance: f32,
    ) -> Result<String, String>;

    /// Remove an IK chain by ID
    fn remove_ik_chain(&mut self, chain_id: &str) -> Result<(), String>;

    /// Set IK target for a chain
    fn set_ik_target(
        &mut self,
        chain_id: &str,
        position: [f32; 3],
        rotation: Option<[f32; 4]>,
        pole: Option<[f32; 3]>,
    ) -> Result<(), String>;

    /// Enable/disable an IK chain
    fn set_ik_enabled(&mut self, chain_id: &str, enabled: bool) -> Result<(), String>;

    /// Get all IK chains
    fn get_ik_chains(&mut self) -> Vec<IkChainInfo>;
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

    /// Find the entity + clip by clip name within AnimationTarget components
    fn find_clip_mut(&mut self, clip_name: &str) -> Result<(Entity, usize), String> {
        let mut q = self.world.query::<(Entity, &AnimationTarget)>();
        let targets: Vec<(Entity, Vec<String>)> = q
            .iter(&self.world)
            .map(|(e, t)| {
                (
                    e,
                    t.clips.iter().map(|c| c.name.clone()).collect::<Vec<_>>(),
                )
            })
            .collect();

        for (entity, names) in targets {
            for (idx, name) in names.iter().enumerate() {
                if name == clip_name {
                    return Ok((entity, idx));
                }
            }
        }
        Err(format!("Clip '{}' not found", clip_name))
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

    fn restore_snapshot(&mut self, snapshot: &SceneSnapshot) {
        // Clear existing world
        self.world.clear_all();

        // Rebuild ECS entities from snapshot nodes
        let mut id_to_entity: HashMap<String, Entity> = HashMap::new();

        for node in &snapshot.nodes {
            let entity = self
                .world
                .spawn((
                    SceneNodeId(node.id.clone()),
                    NodeName(node.name.clone()),
                    Transform {
                        position: Vec3::from(node.position),
                        rotation: glam::Quat::from_array(node.rotation),
                        scale: Vec3::from(node.scale),
                    },
                    GlobalTransform::identity(),
                ))
                .id();

            id_to_entity.insert(node.id.clone(), entity);
        }

        // Restore parent-child relationships
        for node in &snapshot.nodes {
            if let Some(ref parent_id) = node.parent_id {
                if let (Some(&child_e), Some(&parent_e)) =
                    (id_to_entity.get(&node.id), id_to_entity.get(parent_id))
                {
                    self.world
                        .entity_mut(child_e)
                        .insert(hierarchy::Parent(parent_e));
                }
            }
        }

        // Propagate transforms
        systems::transform_propagation(&mut self.world);
    }

    fn get_keyframe_tracks(&mut self, clip_name: &str) -> Result<Vec<AnimationChannelInfo>, String> {
        let (entity, clip_idx) = self.find_clip_mut(clip_name)?;
        let target = self.world.get::<AnimationTarget>(entity).ok_or("No animation target")?;
        Ok(target.clips[clip_idx].get_tracks())
    }

    fn add_keyframe(
        &mut self,
        clip_name: &str,
        node_id: &str,
        property: &str,
        timestamp: f32,
        values: Vec<f32>,
    ) -> Result<String, String> {
        let prop = parse_animation_property(property)?;
        let (entity, clip_idx) = self.find_clip_mut(clip_name)?;
        let mut target = self.world.get_mut::<AnimationTarget>(entity).ok_or("No animation target")?;
        let channel = target.clips[clip_idx].get_or_create_channel(node_id, prop);
        Ok(channel.add_keyframe(timestamp, values))
    }

    fn remove_keyframe(&mut self, clip_name: &str, keyframe_id: &str) -> Result<(), String> {
        let (entity, clip_idx) = self.find_clip_mut(clip_name)?;
        let mut target = self.world.get_mut::<AnimationTarget>(entity).ok_or("No animation target")?;
        // Search all channels for the keyframe
        for channel in &mut target.clips[clip_idx].channels {
            if channel.keyframes.iter().any(|k| k.id == keyframe_id) {
                return channel.remove_keyframe(keyframe_id);
            }
        }
        Err(format!("Keyframe '{}' not found in clip '{}'", keyframe_id, clip_name))
    }

    fn update_keyframe(
        &mut self,
        clip_name: &str,
        keyframe_id: &str,
        timestamp: Option<f32>,
        values: Option<Vec<f32>>,
        easing: Option<EasingType>,
    ) -> Result<(), String> {
        let (entity, clip_idx) = self.find_clip_mut(clip_name)?;
        let mut target = self.world.get_mut::<AnimationTarget>(entity).ok_or("No animation target")?;
        for channel in &mut target.clips[clip_idx].channels {
            if channel.keyframes.iter().any(|k| k.id == keyframe_id) {
                return channel.update_keyframe(keyframe_id, timestamp, values, easing);
            }
        }
        Err(format!("Keyframe '{}' not found in clip '{}'", keyframe_id, clip_name))
    }

    fn create_clip(&mut self, name: &str, duration: f32) -> Result<(), String> {
        // Check if clip already exists
        let mut q = self.world.query::<&AnimationTarget>();
        for target in q.iter(&self.world) {
            if target.clips.iter().any(|c| c.name == name) {
                return Err(format!("Clip '{}' already exists", name));
            }
        }

        // Find scene root or first entity with AnimationTarget, or create AnimationTarget on root
        let root = {
            let mut rq = self.world.query_filtered::<Entity, With<SceneRoot>>();
            rq.iter(&self.world).next()
        };

        if let Some(root) = root {
            if let Some(mut target) = self.world.get_mut::<AnimationTarget>(root) {
                target.clips.push(AnimationClipData::create(name, duration));
            } else {
                self.world.entity_mut(root).insert(AnimationTarget {
                    clips: vec![AnimationClipData::create(name, duration)],
                });
            }
        } else {
            // No scene root — spawn a dedicated entity
            self.world.spawn(AnimationTarget {
                clips: vec![AnimationClipData::create(name, duration)],
            });
        }
        Ok(())
    }

    fn crossfade_animation(
        &mut self,
        clip_name: &str,
        fade_duration: f32,
        loop_anim: bool,
    ) -> Result<(), String> {
        // Find scene root
        let root = {
            let mut rq = self.world.query_filtered::<Entity, With<SceneRoot>>();
            rq.iter(&self.world).next().ok_or("No scene root entity")?
        };

        // Find the target clip index
        let target_clip_index = {
            let target = self
                .world
                .get::<AnimationTarget>(root)
                .ok_or("No animation target on scene root")?;
            target
                .clips
                .iter()
                .position(|c| c.name == clip_name)
                .ok_or_else(|| format!("Clip '{}' not found", clip_name))?
        };

        // Ensure blend state exists; migrate current single-clip if needed
        let has_blend = self
            .world
            .get::<SceneAnimationBlendState>(root)
            .map(|s| !s.layers.is_empty())
            .unwrap_or(false);

        if !has_blend {
            // Start with an empty blend state (or single layer at weight 1.0 if something is playing)
            let initial_layers = Vec::new();
            self.world.entity_mut(root).insert(SceneAnimationBlendState {
                layers: initial_layers,
            });
        }

        // Add target clip as new layer with weight 0
        if let Some(mut blend) = self.world.get_mut::<SceneAnimationBlendState>(root) {
            // Remove existing layer for same clip if present
            blend.layers.retain(|l| l.clip_index != target_clip_index);
            blend.layers.push(SceneBlendLayer {
                clip_index: target_clip_index,
                elapsed: 0.0,
                weight: 0.0,
                looping: loop_anim,
            });
        }

        // Insert crossfade request
        self.world.entity_mut(root).insert(SceneCrossfadeRequest {
            target_clip_index,
            fade_duration,
            fade_elapsed: 0.0,
            loop_anim,
        });

        Ok(())
    }

    fn set_blend_weight(&mut self, clip_name: &str, weight: f32) -> Result<(), String> {
        let root = {
            let mut rq = self.world.query_filtered::<Entity, With<SceneRoot>>();
            rq.iter(&self.world).next().ok_or("No scene root entity")?
        };

        let clip_index = {
            let target = self
                .world
                .get::<AnimationTarget>(root)
                .ok_or("No animation target on scene root")?;
            target
                .clips
                .iter()
                .position(|c| c.name == clip_name)
                .ok_or_else(|| format!("Clip '{}' not found", clip_name))?
        };

        let mut blend = self
            .world
            .get_mut::<SceneAnimationBlendState>(root)
            .ok_or("No blend state on scene root")?;

        for layer in &mut blend.layers {
            if layer.clip_index == clip_index {
                layer.weight = weight.clamp(0.0, 1.0);
                return Ok(());
            }
        }

        Err(format!(
            "Clip '{}' not found in blend layers",
            clip_name
        ))
    }

    fn get_blend_state(&mut self) -> Vec<SceneBlendLayerInfo> {
        let root = {
            let mut rq = self.world.query_filtered::<Entity, With<SceneRoot>>();
            rq.iter(&self.world).next()
        };
        let root = match root {
            Some(e) => e,
            None => return Vec::new(),
        };

        let clip_names: Vec<String> = self
            .world
            .get::<AnimationTarget>(root)
            .map(|t| t.clips.iter().map(|c| c.name.clone()).collect())
            .unwrap_or_default();

        self.world
            .get::<SceneAnimationBlendState>(root)
            .map(|blend| {
                blend
                    .layers
                    .iter()
                    .map(|l| SceneBlendLayerInfo {
                        clip_name: clip_names
                            .get(l.clip_index)
                            .cloned()
                            .unwrap_or_default(),
                        elapsed: l.elapsed,
                        weight: l.weight,
                        looping: l.looping,
                    })
                    .collect()
            })
            .unwrap_or_default()
    }

    fn create_ik_chain(
        &mut self,
        root_joint: &str,
        end_effector: &str,
        solver: &str,
        iterations: u32,
        tolerance: f32,
    ) -> Result<String, String> {
        // Build the joint chain by walking the hierarchy from end_effector up to root_joint
        let chain_nodes = self.build_joint_chain(root_joint, end_effector)?;

        let chain_id = uuid::Uuid::new_v4().to_string();
        let solver_type = ik::parse_solver_type(solver, iterations, tolerance);

        // Get the end effector's current world position as initial target
        let target_pos = {
            let entity = self.find_node_entity(end_effector)?;
            self.world
                .get::<GlobalTransform>(entity)
                .map(|gt| gt.0.col(3).truncate())
                .unwrap_or(glam::Vec3::ZERO)
        };

        self.world.spawn(IkChain {
            id: chain_id.clone(),
            joint_node_ids: chain_nodes,
            target_position: target_pos,
            target_rotation: None,
            pole_target: None,
            solver: solver_type,
            enabled: true,
        });

        Ok(chain_id)
    }

    fn remove_ik_chain(&mut self, chain_id: &str) -> Result<(), String> {
        let entity = {
            let mut q = self.world.query::<(Entity, &IkChain)>();
            q.iter(&self.world)
                .find(|(_, c)| c.id == chain_id)
                .map(|(e, _)| e)
                .ok_or_else(|| format!("IK chain '{}' not found", chain_id))?
        };
        self.world.despawn(entity);
        Ok(())
    }

    fn set_ik_target(
        &mut self,
        chain_id: &str,
        position: [f32; 3],
        rotation: Option<[f32; 4]>,
        pole: Option<[f32; 3]>,
    ) -> Result<(), String> {
        let entity = {
            let mut q = self.world.query::<(Entity, &IkChain)>();
            q.iter(&self.world)
                .find(|(_, c)| c.id == chain_id)
                .map(|(e, _)| e)
                .ok_or_else(|| format!("IK chain '{}' not found", chain_id))?
        };

        if let Some(mut chain) = self.world.get_mut::<IkChain>(entity) {
            chain.target_position = glam::Vec3::from(position);
            chain.target_rotation =
                rotation.map(|r| glam::Quat::from_array(r));
            chain.pole_target = pole.map(|p| glam::Vec3::from(p));
        }

        // Solve IK immediately and propagate
        ik::ik_solve(&mut self.world);
        systems::transform_propagation(&mut self.world);

        Ok(())
    }

    fn set_ik_enabled(&mut self, chain_id: &str, enabled: bool) -> Result<(), String> {
        let entity = {
            let mut q = self.world.query::<(Entity, &IkChain)>();
            q.iter(&self.world)
                .find(|(_, c)| c.id == chain_id)
                .map(|(e, _)| e)
                .ok_or_else(|| format!("IK chain '{}' not found", chain_id))?
        };

        if let Some(mut chain) = self.world.get_mut::<IkChain>(entity) {
            chain.enabled = enabled;
        }

        Ok(())
    }

    fn get_ik_chains(&mut self) -> Vec<IkChainInfo> {
        let mut chains = Vec::new();
        let mut q = self.world.query::<&IkChain>();
        for chain in q.iter(&self.world) {
            chains.push(IkChainInfo {
                id: chain.id.clone(),
                root_joint: chain
                    .joint_node_ids
                    .first()
                    .cloned()
                    .unwrap_or_default(),
                end_effector: chain
                    .joint_node_ids
                    .last()
                    .cloned()
                    .unwrap_or_default(),
                joint_count: chain.joint_node_ids.len(),
                solver: match &chain.solver {
                    IkSolverType::Fabrik { .. } => "fabrik".to_string(),
                    IkSolverType::Ccd { .. } => "ccd".to_string(),
                    IkSolverType::TwoBone { .. } => "two_bone".to_string(),
                },
                enabled: chain.enabled,
                target_position: chain.target_position.to_array(),
                target_rotation: chain.target_rotation.map(|r| r.to_array()),
                pole_target: chain.pole_target.map(|p| p.to_array()),
            });
        }
        chains
    }
}

impl BevySceneWorld {
    /// Find a node entity by SceneNodeId
    fn find_node_entity(&mut self, node_id: &str) -> Result<Entity, String> {
        let mut q = self.world.query::<(Entity, &SceneNodeId)>();
        q.iter(&self.world)
            .find(|(_, id)| id.0 == node_id)
            .map(|(e, _)| e)
            .ok_or_else(|| format!("Node '{}' not found", node_id))
    }

    /// Build a joint chain by walking up the hierarchy from end_effector to root_joint.
    /// Returns node IDs from root to end (inclusive).
    fn build_joint_chain(
        &mut self,
        root_joint: &str,
        end_effector: &str,
    ) -> Result<Vec<String>, String> {
        // Verify both nodes exist
        let _root_entity = self.find_node_entity(root_joint)?;
        let _end_entity = self.find_node_entity(end_effector)?;

        // Walk up from end_effector collecting node IDs until we reach root
        let mut chain = Vec::new();
        let mut current_id = end_effector.to_string();

        for _ in 0..100 {
            // Safety limit
            chain.push(current_id.clone());

            if current_id == root_joint {
                chain.reverse();
                return Ok(chain);
            }

            // Find parent
            let entity = self.find_node_entity(&current_id)?;
            let parent = self
                .world
                .get::<hierarchy::Parent>(entity)
                .map(|p| p.0);

            match parent {
                Some(parent_entity) => {
                    let parent_id = self
                        .world
                        .get::<SceneNodeId>(parent_entity)
                        .map(|id| id.0.clone())
                        .ok_or_else(|| "Parent has no SceneNodeId".to_string())?;
                    current_id = parent_id;
                }
                None => {
                    return Err(format!(
                        "Could not find path from '{}' up to '{}'",
                        end_effector, root_joint
                    ));
                }
            }
        }

        Err("Joint chain too deep (> 100 levels)".to_string())
    }
}

/// Parse animation property string to enum
fn parse_animation_property(s: &str) -> Result<AnimationProperty, String> {
    match s {
        "translation" => Ok(AnimationProperty::Translation),
        "rotation" => Ok(AnimationProperty::Rotation),
        "scale" => Ok(AnimationProperty::Scale),
        "morphWeights" | "morph_weights" => Ok(AnimationProperty::MorphWeights),
        _ => Err(format!("Unknown animation property: {}", s)),
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
