//! PuppetWorld — abstraction over bevy_ecs::World for puppet management
//!
//! Isolates bevy_ecs API details behind a stable interface.
//! Mirrors native-scene's SceneWorld pattern.

use crate::animation::{AnimationClipInfo, AnimationLibrary, AnimationPlayback};
use crate::components::*;
use crate::hierarchy;
use crate::loader::{self, LoadError};
use crate::systems;
use bevy_ecs::prelude::*;
use serde::{Deserialize, Serialize};

/// Full snapshot of a loaded puppet for serialization to the frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PuppetSnapshot {
    pub nodes: Vec<PuppetNodeSnapshot>,
    pub parameters: Vec<ParameterInfo>,
    pub meshes: Vec<MeshSnapshot>,
}

/// Snapshot of a single puppet node
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PuppetNodeSnapshot {
    pub id: String,
    pub name: String,
    pub node_type: String,
    pub position: [f32; 2],
    pub rotation: f32,
    pub scale: [f32; 2],
    pub z_order: f32,
    pub opacity: f32,
    pub parent_id: Option<String>,
    pub has_mesh: bool,
}

/// Parameter info for the frontend UI (sliders)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParameterInfo {
    pub name: String,
    pub min: f32,
    pub max: f32,
    pub default: f32,
    pub current: f32,
}

/// Mesh data snapshot (initial load — sent once)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeshSnapshot {
    pub node_id: String,
    pub vertices: Vec<[f32; 2]>,
    pub uvs: Vec<[f32; 2]>,
    pub indices: Vec<u16>,
    pub texture_index: Option<usize>,
}

/// Delta change from a puppet tick (deformed vertices only)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PuppetDelta {
    pub deformed_meshes: Vec<DeformedMesh>,
}

/// Deformed mesh data for a single drawable node
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeformedMesh {
    pub node_id: String,
    pub vertices: Vec<[f32; 2]>,
    pub blend_mode: String,
    pub opacity: f32,
    pub z_order: f32,
}

/// Abstraction for puppet management operations
pub trait PuppetWorld: Send + Sync {
    /// Load a puppet from INP binary data
    fn load_puppet(&mut self, data: &[u8]) -> Result<PuppetSnapshot, LoadError>;

    /// Get the current full snapshot
    fn get_snapshot(&mut self) -> PuppetSnapshot;

    /// Set a parameter value and recompute deformations
    fn set_parameter(&mut self, name: &str, value: f32) -> Result<(), String>;

    /// Get all parameter definitions
    fn get_parameters(&mut self) -> Vec<ParameterInfo>;

    /// Advance physics by delta_ms and return deformed mesh data
    fn tick(&mut self, delta_ms: f32) -> PuppetDelta;

    /// Get deformed mesh data for the current state
    fn get_deformed_meshes(&mut self) -> Vec<DeformedMesh>;

    /// Get all animation clip descriptions
    fn get_animations(&mut self) -> Vec<AnimationClipInfo>;

    /// Play a named animation clip (loop controls whether it repeats)
    fn play_animation(&mut self, name: &str, loop_anim: bool) -> Result<(), String>;

    /// Stop the currently playing animation
    fn stop_animation(&mut self);

    /// Seek the current animation to a specific time position (milliseconds)
    fn seek_animation(&mut self, time_ms: f32);
}

/// Implementation using bevy_ecs::World
pub struct BevyPuppetWorld {
    world: World,
}

impl BevyPuppetWorld {
    pub fn new() -> Self {
        Self {
            world: World::new(),
        }
    }
}

impl Default for BevyPuppetWorld {
    fn default() -> Self {
        Self::new()
    }
}

impl PuppetWorld for BevyPuppetWorld {
    fn load_puppet(&mut self, data: &[u8]) -> Result<PuppetSnapshot, LoadError> {
        // Clear previous world state
        self.world = World::new();

        loader::load_inp(&mut self.world, data)?;

        // Attach animation components to the puppet root entity
        {
            let root_entity: Option<Entity> = {
                let mut q = self.world.query_filtered::<Entity, With<PuppetRoot>>();
                q.iter(&self.world).next()
            };
            if let Some(root) = root_entity {
                self.world
                    .entity_mut(root)
                    .insert((AnimationLibrary::default(), AnimationPlayback::default()));
            }
        }

        // Run initial transform propagation
        systems::transform_propagation_2d(&mut self.world);

        Ok(self.get_snapshot())
    }

    fn get_snapshot(&mut self) -> PuppetSnapshot {
        let mut nodes = Vec::new();
        let mut meshes = Vec::new();

        // Query all puppet nodes
        let mut query = self.world.query::<(
            Entity,
            &PuppetNodeId,
            &NodeName,
            &PuppetNodeType,
            &Transform2D,
            &ZOrder,
            &Opacity,
            Option<&hierarchy::Parent>,
            Option<&MeshData>,
            Option<&TextureRef>,
        )>();

        for (
            _entity,
            node_id,
            name,
            node_type,
            transform,
            z_order,
            opacity,
            parent,
            mesh_data,
            texture_ref,
        ) in query.iter(&self.world)
        {
            let parent_id = parent.and_then(|p| {
                self.world
                    .get::<PuppetNodeId>(p.0)
                    .map(|id| id.0.clone())
            });

            let node_type_str = match node_type {
                PuppetNodeType::Root => "root",
                PuppetNodeType::Part => "part",
                PuppetNodeType::Deform => "deform",
                PuppetNodeType::Composite => "composite",
                PuppetNodeType::Group => "group",
            };

            nodes.push(PuppetNodeSnapshot {
                id: node_id.0.clone(),
                name: name.0.clone(),
                node_type: node_type_str.to_string(),
                position: transform.position.to_array(),
                rotation: transform.rotation,
                scale: transform.scale.to_array(),
                z_order: z_order.0,
                opacity: opacity.0,
                parent_id,
                has_mesh: mesh_data.is_some(),
            });

            // Collect mesh snapshots
            if let Some(mesh) = mesh_data {
                meshes.push(MeshSnapshot {
                    node_id: node_id.0.clone(),
                    vertices: mesh.vertices.iter().map(|v| v.to_array()).collect(),
                    uvs: mesh.uvs.iter().map(|v| v.to_array()).collect(),
                    indices: mesh.indices.clone(),
                    texture_index: texture_ref.map(|t| t.texture_index),
                });
            }
        }

        let parameters = self.get_parameters();

        PuppetSnapshot {
            nodes,
            parameters,
            meshes,
        }
    }

    fn set_parameter(&mut self, name: &str, value: f32) -> Result<(), String> {
        // Find and update parameter in PuppetParameters
        let mut found = false;
        let mut query = self.world.query::<&mut PuppetParameters>();
        for mut params in query.iter_mut(&mut self.world) {
            for p in &mut params.params {
                if p.name == name {
                    p.current = value.clamp(p.min, p.max);
                    found = true;
                    break;
                }
            }
        }

        if !found {
            return Err(format!("Parameter not found: {}", name));
        }

        // Recompute deformations
        systems::parameter_update(&mut self.world);
        systems::transform_propagation_2d(&mut self.world);

        Ok(())
    }

    fn get_parameters(&mut self) -> Vec<ParameterInfo> {
        let mut result = Vec::new();
        let mut query = self.world.query::<&PuppetParameters>();
        for params in query.iter(&self.world) {
            for p in &params.params {
                result.push(ParameterInfo {
                    name: p.name.clone(),
                    min: p.min,
                    max: p.max,
                    default: p.default,
                    current: p.current,
                });
            }
        }
        result
    }

    fn tick(&mut self, delta_ms: f32) -> PuppetDelta {
        // 1. Advance animation and write parameter values (must run before parameter_update)
        systems::animation_tick(&mut self.world, delta_ms);

        // 2. Run physics step
        systems::physics_tick(&mut self.world, delta_ms);

        // 3. Apply parameter-driven deformation
        systems::parameter_update(&mut self.world);

        // 4. Return deformed meshes
        PuppetDelta {
            deformed_meshes: self.get_deformed_meshes(),
        }
    }

    fn get_deformed_meshes(&mut self) -> Vec<DeformedMesh> {
        let mut meshes = Vec::new();

        let mut query = self.world.query::<(
            &PuppetNodeId,
            &MeshData,
            &ZOrder,
            &Opacity,
            &BlendMode,
            Option<&DeformedVertices>,
        )>();

        for (node_id, mesh_data, z_order, opacity, blend_mode, deformed) in query.iter(&self.world)
        {
            let vertices: Vec<[f32; 2]> = if let Some(dv) = deformed {
                dv.0.iter().map(|v| v.to_array()).collect()
            } else {
                // Fall back to base vertices if no deformation yet
                mesh_data.vertices.iter().map(|v| v.to_array()).collect()
            };

            let blend_str = match blend_mode {
                BlendMode::Normal => "normal",
                BlendMode::Multiply => "multiply",
                BlendMode::Screen => "screen",
                BlendMode::Overlay => "overlay",
                BlendMode::Add => "add",
            };

            meshes.push(DeformedMesh {
                node_id: node_id.0.clone(),
                vertices,
                blend_mode: blend_str.to_string(),
                opacity: opacity.0,
                z_order: z_order.0,
            });
        }

        // Sort by z-order for correct rendering
        meshes.sort_by(|a, b| a.z_order.partial_cmp(&b.z_order).unwrap_or(std::cmp::Ordering::Equal));

        meshes
    }

    fn get_animations(&mut self) -> Vec<AnimationClipInfo> {
        let mut q = self.world.query_filtered::<&AnimationLibrary, With<PuppetRoot>>();
        match q.iter(&self.world).next() {
            Some(lib) => lib.clips.iter().map(|c| c.info()).collect(),
            None => Vec::new(),
        }
    }

    fn play_animation(&mut self, name: &str, loop_anim: bool) -> Result<(), String> {
        // Find the clip index
        let clip_index = {
            let mut q = self.world.query_filtered::<&AnimationLibrary, With<PuppetRoot>>();
            match q.iter(&self.world).next() {
                Some(lib) => lib
                    .clips
                    .iter()
                    .position(|c| c.name == name)
                    .ok_or_else(|| format!("Animation clip '{}' not found", name))?,
                None => return Err("No animation library on puppet root".to_string()),
            }
        };

        // Update playback state
        let root_entity: Option<Entity> = {
            let mut q = self.world.query_filtered::<Entity, With<PuppetRoot>>();
            q.iter(&self.world).next()
        };
        if let Some(root) = root_entity {
            if let Some(mut pb) = self.world.get_mut::<AnimationPlayback>(root) {
                pb.clip_index = Some(clip_index);
                pb.elapsed_ms = 0.0;
                pb.playing = true;
                pb.looping = loop_anim;
            }
        }
        Ok(())
    }

    fn stop_animation(&mut self) {
        let root_entity: Option<Entity> = {
            let mut q = self.world.query_filtered::<Entity, With<PuppetRoot>>();
            q.iter(&self.world).next()
        };
        if let Some(root) = root_entity {
            if let Some(mut pb) = self.world.get_mut::<AnimationPlayback>(root) {
                pb.playing = false;
            }
        }
    }

    fn seek_animation(&mut self, time_ms: f32) {
        let root_entity: Option<Entity> = {
            let mut q = self.world.query_filtered::<Entity, With<PuppetRoot>>();
            q.iter(&self.world).next()
        };
        if let Some(root) = root_entity {
            if let Some(mut pb) = self.world.get_mut::<AnimationPlayback>(root) {
                pb.elapsed_ms = time_ms.max(0.0);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bevy_puppet_world_new() {
        let mut world = BevyPuppetWorld::new();
        let snapshot = world.get_snapshot();
        assert!(snapshot.nodes.is_empty());
        assert!(snapshot.parameters.is_empty());
        assert!(snapshot.meshes.is_empty());
    }

    #[test]
    fn test_bevy_puppet_world_default() {
        let mut world = BevyPuppetWorld::default();
        let snapshot = world.get_snapshot();
        assert!(snapshot.nodes.is_empty());
    }

    #[test]
    fn test_get_deformed_meshes_empty() {
        let mut world = BevyPuppetWorld::new();
        let meshes = world.get_deformed_meshes();
        assert!(meshes.is_empty());
    }

    #[test]
    fn test_set_parameter_not_found() {
        let mut world = BevyPuppetWorld::new();
        let result = world.set_parameter("nonexistent", 0.5);
        assert!(result.is_err());
    }

    #[test]
    fn test_tick_empty_world() {
        let mut world = BevyPuppetWorld::new();
        let delta = world.tick(16.0);
        assert!(delta.deformed_meshes.is_empty());
    }

    #[test]
    fn test_get_parameters_empty() {
        let mut world = BevyPuppetWorld::new();
        let params = world.get_parameters();
        assert!(params.is_empty());
    }
}
