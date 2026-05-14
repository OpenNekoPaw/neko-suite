//! PuppetWorld — abstraction over bevy_ecs::World for puppet management
//!
//! Isolates bevy_ecs API details behind a stable interface.
//! Mirrors runtime-scene's SceneWorld pattern.

use crate::access::{
    CreativeAccess, DataAccess, PuppetAnimationTracks, PuppetEntityFilter, RawWorldAccess,
    SerializedPuppetEntities,
};
use crate::animation::{
    AnimationClipInfo, AnimationLibrary, AnimationPlayback, ParameterCurveInfo,
};
use crate::animation_blend::{AnimationBlendState, BlendLayer, BlendLayerInfo, CrossfadeRequest};
use crate::components::*;
use crate::hierarchy;
use crate::loader::{self, LoadError};
use crate::moc3;
use crate::systems;
use bevy_ecs::prelude::*;
use neko_engine_types::easing::EasingType;
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

/// Delta change from a puppet tick (deformed vertices + optional animation progress)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PuppetDelta {
    pub deformed_meshes: Vec<DeformedMesh>,
    /// Current animation elapsed time in milliseconds (None if no animation active)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub animation_time_ms: Option<f32>,
    /// Whether the animation is currently playing (None if no animation active)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub animation_playing: Option<bool>,
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
    /// Load a puppet from binary data (auto-detects INP or MOC3 format)
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

    /// Get all keyframe tracks for a named animation clip
    fn get_keyframe_tracks(&mut self, clip_name: &str) -> Result<Vec<ParameterCurveInfo>, String>;

    /// Add a keyframe to a parameter curve within a named clip.
    /// Creates the curve if it doesn't exist for the given param_name.
    /// Returns the new keyframe's UUID.
    fn add_keyframe(
        &mut self,
        clip_name: &str,
        param_name: &str,
        time_ms: f32,
        value: f32,
    ) -> Result<String, String>;

    /// Remove a keyframe by ID from a parameter curve within a named clip
    fn remove_keyframe(
        &mut self,
        clip_name: &str,
        param_name: &str,
        keyframe_id: &str,
    ) -> Result<(), String>;

    /// Update a keyframe by ID (partial update — only provided fields change)
    fn update_keyframe(
        &mut self,
        clip_name: &str,
        param_name: &str,
        keyframe_id: &str,
        time_ms: Option<f32>,
        value: Option<f32>,
        easing: Option<EasingType>,
    ) -> Result<(), String>;

    /// Create a new empty animation clip
    fn create_clip(&mut self, name: &str, duration_ms: f32) -> Result<(), String>;

    /// Crossfade from current animation(s) to a target clip over fade_duration_ms
    fn crossfade_animation(
        &mut self,
        clip_name: &str,
        fade_duration_ms: f32,
        loop_anim: bool,
    ) -> Result<(), String>;

    /// Set the blend weight for a specific clip layer
    fn set_blend_weight(&mut self, clip_name: &str, weight: f32) -> Result<(), String>;

    /// Get the current blend state (all active layers)
    fn get_blend_state(&mut self) -> Vec<BlendLayerInfo>;

    /// Set opacity for a specific puppet node
    fn set_node_opacity(&mut self, node_id: &str, opacity: f32) -> Result<(), String>;

    /// Set texture index for a specific puppet node (hot-swap textures)
    fn set_texture(&mut self, node_id: &str, texture_index: usize) -> Result<(), String>;

    /// Get available expression names
    fn get_expressions(&mut self) -> Vec<moc3::expression::ExpressionInfo>;

    /// Activate an expression by name (with fade-in)
    fn set_expression(&mut self, name: &str) -> Result<(), String>;

    /// Clear the active expression (triggers fade-out, then removal)
    fn clear_expression(&mut self);

    /// Load auxiliary MOC3 files (expressions, motions, physics) from JSON strings
    fn load_moc3_auxiliary(
        &mut self,
        expressions: &[(String, String)],
        motions: &[(String, String)],
        physics_json: Option<&str>,
    ) -> Result<(), String>;

    /// Export an animation clip to .motion3.json format string
    fn export_motion3(&mut self, clip_name: &str) -> Result<String, String>;

    /// Export an expression to .exp3.json format string
    fn export_expression3(&mut self, expression_name: &str) -> Result<String, String>;
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

    /// Find the root entity carrying PuppetRoot component
    fn find_root(&mut self) -> Option<Entity> {
        let mut q = self.world.query_filtered::<Entity, With<PuppetRoot>>();
        q.iter(&self.world).next()
    }
}

impl Default for BevyPuppetWorld {
    fn default() -> Self {
        Self::new()
    }
}

impl CreativeAccess for BevyPuppetWorld {}

impl DataAccess for BevyPuppetWorld {
    fn serialize_puppet(&mut self, filter: PuppetEntityFilter) -> SerializedPuppetEntities {
        let snapshot = self.get_snapshot();
        let animations = if matches!(filter, PuppetEntityFilter::All | PuppetEntityFilter::Export) {
            self.get_animations()
        } else {
            Vec::new()
        };
        let expressions = if matches!(filter, PuppetEntityFilter::All | PuppetEntityFilter::Export)
        {
            self.get_expressions()
        } else {
            Vec::new()
        };
        let tracks = if matches!(filter, PuppetEntityFilter::All | PuppetEntityFilter::Export) {
            animations
                .iter()
                .filter_map(|animation| {
                    self.get_keyframe_tracks(&animation.name)
                        .ok()
                        .map(|tracks| PuppetAnimationTracks {
                            clip_name: animation.name.clone(),
                            tracks,
                        })
                })
                .collect()
        } else {
            Vec::new()
        };

        SerializedPuppetEntities {
            snapshot,
            animations,
            expressions,
            tracks,
        }
    }

    fn extract_deformed_meshes(&mut self) -> Vec<DeformedMesh> {
        self.get_deformed_meshes()
    }

    fn tick_data(&mut self, delta_ms: f32) -> PuppetDelta {
        self.tick(delta_ms)
    }
}

#[allow(deprecated)]
impl RawWorldAccess for BevyPuppetWorld {
    fn ecs_world_mut_raw(&mut self) -> &mut World {
        &mut self.world
    }
}

impl PuppetWorld for BevyPuppetWorld {
    fn load_puppet(&mut self, data: &[u8]) -> Result<PuppetSnapshot, LoadError> {
        // Clear previous world state
        self.world = World::new();

        // Auto-detect format by magic bytes
        let load_result = if moc3::parser::is_moc3(data) {
            moc3::loader::load_moc3(&mut self.world, data)?
        } else {
            loader::load_inp(&mut self.world, data)?
        };

        // Attach animation components to the puppet root entity
        {
            let lib = AnimationLibrary {
                clips: load_result.animations,
            };
            self.world.entity_mut(load_result.root_entity).insert((
                lib,
                AnimationPlayback::default(),
                AnimationBlendState::default(),
            ));
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
            let parent_id =
                parent.and_then(|p| self.world.get::<PuppetNodeId>(p.0).map(|id| id.0.clone()));

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

        // Recompute deformations (both INP and MOC3 paths)
        systems::multi_key_deformation_update(&mut self.world);
        systems::rotation_deformer_update(&mut self.world);
        systems::warp_deformer_update(&mut self.world);
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
        // Check if blend layers exist — use blend_tick instead of animation_tick
        let has_blend_layers = {
            let mut q = self
                .world
                .query_filtered::<&AnimationBlendState, With<PuppetRoot>>();
            q.iter(&self.world)
                .next()
                .map(|s| !s.layers.is_empty())
                .unwrap_or(false)
        };

        // 0. Reset parameters to defaults — prevents expression Add/Multiply accumulation
        systems::parameter_reset(&mut self.world);

        if has_blend_layers {
            // 1. Multi-layer blend animation
            systems::animation_blend_tick(&mut self.world, delta_ms);
        } else {
            // 1. Single-clip animation
            systems::animation_tick(&mut self.world, delta_ms);
        }

        // 2. Expression fade + parameter override
        systems::expression_update(&mut self.world, delta_ms);

        // 3. Run physics step
        systems::physics_tick(&mut self.world, delta_ms);

        // 4. Apply parameter-driven deformation
        //    Execution order:
        //    a. multi_key_deformation_update — MOC3 leaf node key form interpolation (base vertices)
        //    b. rotation_deformer_update — rotates child DeformedVertices
        //    c. warp_deformer_update — warps child DeformedVertices through grid
        //    d. parameter_update — INP ParameterBinding deformation
        systems::multi_key_deformation_update(&mut self.world);
        systems::rotation_deformer_update(&mut self.world);
        systems::warp_deformer_update(&mut self.world);
        systems::parameter_update(&mut self.world);

        // 5. Read animation playback state for the delta
        let (animation_time_ms, animation_playing) = {
            let mut q = self
                .world
                .query_filtered::<&AnimationPlayback, With<PuppetRoot>>();
            match q.iter(&self.world).next() {
                Some(pb) if pb.clip_index.is_some() => (Some(pb.elapsed_ms), Some(pb.playing)),
                _ => (None, None),
            }
        };

        // 5. Return deformed meshes + animation progress
        PuppetDelta {
            deformed_meshes: self.get_deformed_meshes(),
            animation_time_ms,
            animation_playing,
        }
    }

    fn get_deformed_meshes(&mut self) -> Vec<DeformedMesh> {
        // Ensure transforms are up-to-date
        crate::systems::transform_propagation_2d(&mut self.world);

        let mut meshes = Vec::new();

        let mut query = self.world.query::<(
            &PuppetNodeId,
            &MeshData,
            &GlobalTransform2D,
            &ZOrder,
            &Opacity,
            &BlendMode,
            Option<&DeformedVertices>,
        )>();

        for (node_id, mesh_data, global_transform, z_order, opacity, blend_mode, deformed) in
            query.iter(&self.world)
        {
            let raw_verts = if let Some(dv) = deformed {
                &dv.0
            } else {
                &mesh_data.vertices
            };

            // Apply global transform to convert local vertices → world space
            let mat = &global_transform.0;
            let vertices: Vec<[f32; 2]> = raw_verts
                .iter()
                .map(|v| {
                    let world = *mat * glam::Vec3::new(v.x, v.y, 1.0);
                    [world.x, world.y]
                })
                .collect();

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
        meshes.sort_by(|a, b| {
            a.z_order
                .partial_cmp(&b.z_order)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        meshes
    }

    fn get_animations(&mut self) -> Vec<AnimationClipInfo> {
        let mut q = self
            .world
            .query_filtered::<&AnimationLibrary, With<PuppetRoot>>();
        match q.iter(&self.world).next() {
            Some(lib) => lib.clips.iter().map(|c| c.info()).collect(),
            None => Vec::new(),
        }
    }

    fn play_animation(&mut self, name: &str, loop_anim: bool) -> Result<(), String> {
        // Find the clip index
        let clip_index = {
            let mut q = self
                .world
                .query_filtered::<&AnimationLibrary, With<PuppetRoot>>();
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

    fn get_keyframe_tracks(&mut self, clip_name: &str) -> Result<Vec<ParameterCurveInfo>, String> {
        let root = self.find_root().ok_or("No puppet loaded")?;
        let lib = self
            .world
            .get::<AnimationLibrary>(root)
            .ok_or("No animation library")?;
        let clip = lib
            .clips
            .iter()
            .find(|c| c.name == clip_name)
            .ok_or_else(|| format!("Clip '{}' not found", clip_name))?;
        Ok(clip.get_tracks())
    }

    fn add_keyframe(
        &mut self,
        clip_name: &str,
        param_name: &str,
        time_ms: f32,
        value: f32,
    ) -> Result<String, String> {
        let root = self.find_root().ok_or("No puppet loaded")?;
        let mut lib = self
            .world
            .get_mut::<AnimationLibrary>(root)
            .ok_or("No animation library")?;
        let clip = lib
            .clips
            .iter_mut()
            .find(|c| c.name == clip_name)
            .ok_or_else(|| format!("Clip '{}' not found", clip_name))?;
        let curve = clip.get_or_create_curve(param_name);
        Ok(curve.add_keyframe(time_ms, value))
    }

    fn remove_keyframe(
        &mut self,
        clip_name: &str,
        param_name: &str,
        keyframe_id: &str,
    ) -> Result<(), String> {
        let root = self.find_root().ok_or("No puppet loaded")?;
        let mut lib = self
            .world
            .get_mut::<AnimationLibrary>(root)
            .ok_or("No animation library")?;
        let clip = lib
            .clips
            .iter_mut()
            .find(|c| c.name == clip_name)
            .ok_or_else(|| format!("Clip '{}' not found", clip_name))?;
        let curve = clip
            .curves
            .iter_mut()
            .find(|c| c.param_name == param_name)
            .ok_or_else(|| format!("Curve for param '{}' not found", param_name))?;
        curve.remove_keyframe(keyframe_id)
    }

    fn update_keyframe(
        &mut self,
        clip_name: &str,
        param_name: &str,
        keyframe_id: &str,
        time_ms: Option<f32>,
        value: Option<f32>,
        easing: Option<EasingType>,
    ) -> Result<(), String> {
        let root = self.find_root().ok_or("No puppet loaded")?;
        let mut lib = self
            .world
            .get_mut::<AnimationLibrary>(root)
            .ok_or("No animation library")?;
        let clip = lib
            .clips
            .iter_mut()
            .find(|c| c.name == clip_name)
            .ok_or_else(|| format!("Clip '{}' not found", clip_name))?;
        let curve = clip
            .curves
            .iter_mut()
            .find(|c| c.param_name == param_name)
            .ok_or_else(|| format!("Curve for param '{}' not found", param_name))?;
        curve.update_keyframe(keyframe_id, time_ms, value, easing)
    }

    fn create_clip(&mut self, name: &str, duration_ms: f32) -> Result<(), String> {
        let root = self.find_root().ok_or("No puppet loaded")?;
        let mut lib = self
            .world
            .get_mut::<AnimationLibrary>(root)
            .ok_or("No animation library")?;
        if lib.clips.iter().any(|c| c.name == name) {
            return Err(format!("Clip '{}' already exists", name));
        }
        lib.clips
            .push(crate::animation::AnimationClip::create(name, duration_ms));
        Ok(())
    }

    fn crossfade_animation(
        &mut self,
        clip_name: &str,
        fade_duration_ms: f32,
        loop_anim: bool,
    ) -> Result<(), String> {
        let root = self.find_root().ok_or("No puppet loaded")?;

        // Find target clip index
        let target_clip_index = {
            let lib = self
                .world
                .get::<AnimationLibrary>(root)
                .ok_or("No animation library")?;
            lib.clips
                .iter()
                .position(|c| c.name == clip_name)
                .ok_or_else(|| format!("Clip '{}' not found", clip_name))?
        };

        // Migrate current single-clip playback into blend layer if needed
        {
            let blend_empty = self
                .world
                .get::<AnimationBlendState>(root)
                .map(|s| s.layers.is_empty())
                .unwrap_or(true);

            if blend_empty {
                // Check if there's an active single-clip playback to migrate
                if let Some(pb) = self.world.get::<AnimationPlayback>(root) {
                    if let Some(idx) = pb.clip_index {
                        let layer = BlendLayer {
                            clip_index: idx,
                            elapsed_ms: pb.elapsed_ms,
                            weight: 1.0,
                            looping: pb.looping,
                        };
                        if let Some(mut blend) = self.world.get_mut::<AnimationBlendState>(root) {
                            blend.layers.push(layer);
                        }
                    }
                }
                // Stop single-clip playback
                if let Some(mut pb) = self.world.get_mut::<AnimationPlayback>(root) {
                    pb.playing = false;
                }
            }
        }

        // Add target clip layer if not already present
        {
            let already_present = self
                .world
                .get::<AnimationBlendState>(root)
                .map(|s| s.layers.iter().any(|l| l.clip_index == target_clip_index))
                .unwrap_or(false);

            if !already_present {
                if let Some(mut blend) = self.world.get_mut::<AnimationBlendState>(root) {
                    blend.layers.push(BlendLayer {
                        clip_index: target_clip_index,
                        elapsed_ms: 0.0,
                        weight: 0.0,
                        looping: loop_anim,
                    });
                }
            }
        }

        // Insert or replace CrossfadeRequest
        self.world.entity_mut(root).insert(CrossfadeRequest {
            target_clip_index,
            fade_duration_ms,
            fade_elapsed_ms: 0.0,
            loop_anim,
        });

        Ok(())
    }

    fn set_blend_weight(&mut self, clip_name: &str, weight: f32) -> Result<(), String> {
        let root = self.find_root().ok_or("No puppet loaded")?;

        let clip_index = {
            let lib = self
                .world
                .get::<AnimationLibrary>(root)
                .ok_or("No animation library")?;
            lib.clips
                .iter()
                .position(|c| c.name == clip_name)
                .ok_or_else(|| format!("Clip '{}' not found", clip_name))?
        };

        let mut blend = self
            .world
            .get_mut::<AnimationBlendState>(root)
            .ok_or("No blend state")?;
        let layer = blend
            .layers
            .iter_mut()
            .find(|l| l.clip_index == clip_index)
            .ok_or_else(|| format!("No blend layer for clip '{}'", clip_name))?;
        layer.weight = weight.clamp(0.0, 1.0);
        Ok(())
    }

    fn get_blend_state(&mut self) -> Vec<BlendLayerInfo> {
        let root = match self.find_root() {
            Some(r) => r,
            None => return Vec::new(),
        };

        let clip_names: Vec<String> = self
            .world
            .get::<AnimationLibrary>(root)
            .map(|lib| lib.clips.iter().map(|c| c.name.clone()).collect())
            .unwrap_or_default();

        self.world
            .get::<AnimationBlendState>(root)
            .map(|blend| {
                blend
                    .layers
                    .iter()
                    .map(|l| BlendLayerInfo {
                        clip_name: clip_names
                            .get(l.clip_index)
                            .cloned()
                            .unwrap_or_else(|| format!("clip_{}", l.clip_index)),
                        elapsed_ms: l.elapsed_ms,
                        weight: l.weight,
                        looping: l.looping,
                    })
                    .collect()
            })
            .unwrap_or_default()
    }

    fn set_node_opacity(&mut self, node_id: &str, opacity: f32) -> Result<(), String> {
        let mut found = None;
        let mut query = self.world.query::<(Entity, &PuppetNodeId)>();
        for (entity, id) in query.iter(&self.world) {
            if id.0 == node_id {
                found = Some(entity);
                break;
            }
        }
        let entity = found.ok_or_else(|| format!("Node '{}' not found", node_id))?;

        if let Some(mut op) = self.world.get_mut::<Opacity>(entity) {
            op.0 = opacity.clamp(0.0, 1.0);
        } else {
            self.world
                .entity_mut(entity)
                .insert(Opacity(opacity.clamp(0.0, 1.0)));
        }
        Ok(())
    }

    fn set_texture(&mut self, node_id: &str, texture_index: usize) -> Result<(), String> {
        let mut found = None;
        let mut query = self.world.query::<(Entity, &PuppetNodeId)>();
        for (entity, id) in query.iter(&self.world) {
            if id.0 == node_id {
                found = Some(entity);
                break;
            }
        }
        let entity = found.ok_or_else(|| format!("Node '{}' not found", node_id))?;

        if let Some(mut tex) = self.world.get_mut::<TextureRef>(entity) {
            tex.texture_index = texture_index;
        } else {
            self.world
                .entity_mut(entity)
                .insert(TextureRef { texture_index });
        }
        Ok(())
    }

    fn get_expressions(&mut self) -> Vec<moc3::expression::ExpressionInfo> {
        let root = match self.find_root() {
            Some(r) => r,
            None => return Vec::new(),
        };
        self.world
            .get::<ExpressionLibrary>(root)
            .map(|lib| {
                lib.expressions
                    .iter()
                    .map(|e| moc3::expression::ExpressionInfo {
                        name: e.name.clone(),
                        parameter_count: e.parameters.len(),
                    })
                    .collect()
            })
            .unwrap_or_default()
    }

    fn set_expression(&mut self, name: &str) -> Result<(), String> {
        let root = self.find_root().ok_or("No puppet loaded")?;

        let expr_index = {
            let lib = self
                .world
                .get::<ExpressionLibrary>(root)
                .ok_or("No expression library")?;
            lib.expressions
                .iter()
                .position(|e| e.name == name)
                .ok_or_else(|| format!("Expression '{}' not found", name))?
        };

        let fade_in_ms = {
            let lib = self
                .world
                .get::<ExpressionLibrary>(root)
                .ok_or("No expression library")?;
            lib.expressions[expr_index].fade_in_time * 1000.0
        };

        // Set or replace active expression
        // expression_update() in the tick pipeline will advance the fade and apply
        self.world.entity_mut(root).insert(ActiveExpression {
            expression_index: expr_index,
            weight: if fade_in_ms <= 0.0 { 1.0 } else { 0.0 },
            fade_elapsed_ms: 0.0,
            fading_in: true,
        });

        // If instant fade, apply immediately via expression_update(0)
        if fade_in_ms <= 0.0 {
            systems::expression_update(&mut self.world, 0.0);
        }

        Ok(())
    }

    fn clear_expression(&mut self) {
        let root = match self.find_root() {
            Some(r) => r,
            None => return,
        };

        // Read fade-out duration from the expression definition
        let fade_out_ms = self
            .world
            .get::<ActiveExpression>(root)
            .and_then(|ae| {
                self.world
                    .get::<ExpressionLibrary>(root)
                    .and_then(|lib| lib.expressions.get(ae.expression_index))
                    .map(|expr| expr.fade_out_time * 1000.0)
            })
            .unwrap_or(0.0);

        if fade_out_ms <= 0.0 {
            // Instant removal
            self.world.entity_mut(root).remove::<ActiveExpression>();
        } else {
            // Transition to fade-out: reset elapsed timer, flip fading_in to false
            if let Some(mut ae) = self.world.get_mut::<ActiveExpression>(root) {
                ae.fading_in = false;
                ae.fade_elapsed_ms = 0.0;
                // weight stays at current value — expression_update will decay it
            }
        }
    }

    fn load_moc3_auxiliary(
        &mut self,
        expressions: &[(String, String)],
        motions: &[(String, String)],
        physics_json: Option<&str>,
    ) -> Result<(), String> {
        let root = self.find_root().ok_or("No puppet loaded")?;

        // Parse expressions
        if !expressions.is_empty() {
            let mut expr_defs = Vec::new();
            for (name, json_str) in expressions {
                match moc3::expression::parse_expression(name, json_str) {
                    Ok(expr) => expr_defs.push(expr),
                    Err(e) => tracing::warn!("Failed to parse expression '{}': {}", name, e),
                }
            }
            self.world.entity_mut(root).insert(ExpressionLibrary {
                expressions: expr_defs,
            });
        }

        // Parse motions → add to AnimationLibrary
        if !motions.is_empty() {
            let mut new_clips = Vec::new();
            for (name, json_str) in motions {
                match moc3::motion::parse_motion(name, json_str) {
                    Ok(clip) => new_clips.push(clip),
                    Err(e) => tracing::warn!("Failed to parse motion '{}': {}", name, e),
                }
            }
            if !new_clips.is_empty() {
                if let Some(mut lib) = self
                    .world
                    .get_mut::<crate::animation::AnimationLibrary>(root)
                {
                    lib.clips.extend(new_clips);
                } else {
                    self.world
                        .entity_mut(root)
                        .insert(crate::animation::AnimationLibrary { clips: new_clips });
                }
            }
        }

        // Parse physics → create SimplePhysics entities
        if let Some(physics_str) = physics_json {
            match moc3::physics::parse_physics(physics_str) {
                Ok(result) => {
                    for (param_name, physics) in result.physics_nodes {
                        let entity = self
                            .world
                            .spawn((
                                PuppetNodeId(format!("physics_{}", param_name)),
                                NodeName(format!("Physics: {}", param_name)),
                                PuppetNodeType::Group,
                                Transform2D::default(),
                                GlobalTransform2D::default(),
                                ZOrder(0.0),
                                Opacity::default(),
                                BlendMode::default(),
                                physics,
                                crate::components::PhysicsState::default(),
                            ))
                            .id();
                        crate::hierarchy::set_parent(&mut self.world, entity, root);
                    }
                }
                Err(e) => tracing::warn!("Failed to parse physics: {}", e),
            }
        }

        Ok(())
    }

    fn export_motion3(&mut self, clip_name: &str) -> Result<String, String> {
        let root = self.find_root().ok_or("No puppet loaded")?;
        let lib = self
            .world
            .get::<crate::animation::AnimationLibrary>(root)
            .ok_or("No animation library")?;
        let clip = lib
            .clips
            .iter()
            .find(|c| c.name == clip_name)
            .ok_or_else(|| format!("Clip '{}' not found", clip_name))?;
        moc3::motion::serialize_motion3(clip)
    }

    fn export_expression3(&mut self, expression_name: &str) -> Result<String, String> {
        let root = self.find_root().ok_or("No puppet loaded")?;
        let lib = self
            .world
            .get::<ExpressionLibrary>(root)
            .ok_or("No expression library")?;
        let expr = lib
            .expressions
            .iter()
            .find(|e| e.name == expression_name)
            .ok_or_else(|| format!("Expression '{}' not found", expression_name))?;
        moc3::expression::serialize_expression3(expr)
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
        assert!(delta.animation_time_ms.is_none());
        assert!(delta.animation_playing.is_none());
    }

    #[test]
    fn test_get_parameters_empty() {
        let mut world = BevyPuppetWorld::new();
        let params = world.get_parameters();
        assert!(params.is_empty());
    }
}
