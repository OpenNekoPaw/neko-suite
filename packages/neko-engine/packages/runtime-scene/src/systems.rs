//! ECS systems for scene updates
//!
//! - transform_propagation: computes GlobalTransform from hierarchy
//! - animation_tick: advances animation playback
//! - scene_animation_blend_tick: multi-layer blended animation with crossfade

use crate::animation_blend::{
    SceneAnimationBlendState, SceneAnimationPlaybackState, SceneBlendLayer, SceneCrossfadeRequest,
};
use crate::components::{
    AnimationProperty, AnimationTarget, GlobalTransform, MorphWeights, SceneRoot, Transform,
};
use crate::hierarchy::{Children, Parent};
use bevy_ecs::prelude::*;
use std::collections::HashMap;

/// Stable labels for simulation-side scene systems.
///
/// These labels define the authoring/simulation boundary used by engine-kernel
/// render extraction. They intentionally live in runtime-scene because they
/// describe ECS truth updates rather than GPU render work.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum SimulationSystemLabel {
    CommandApply,
    AnimationTick,
    AnimationBlendTick,
    IkSolve,
    TransformPropagation,
    DirtyDeltaExtraction,
}

impl SimulationSystemLabel {
    pub const fn as_str(self) -> &'static str {
        match self {
            SimulationSystemLabel::CommandApply => "simulation.command_apply",
            SimulationSystemLabel::AnimationTick => "simulation.animation_tick",
            SimulationSystemLabel::AnimationBlendTick => "simulation.animation_blend_tick",
            SimulationSystemLabel::IkSolve => "simulation.ik_solve",
            SimulationSystemLabel::TransformPropagation => "simulation.transform_propagation",
            SimulationSystemLabel::DirtyDeltaExtraction => "simulation.dirty_delta_extraction",
        }
    }
}

/// Canonical high-level order for a scene simulation step.
pub const SIMULATION_SYSTEM_ORDER: &[SimulationSystemLabel] = &[
    SimulationSystemLabel::CommandApply,
    SimulationSystemLabel::AnimationTick,
    SimulationSystemLabel::AnimationBlendTick,
    SimulationSystemLabel::IkSolve,
    SimulationSystemLabel::TransformPropagation,
    SimulationSystemLabel::DirtyDeltaExtraction,
];

/// Propagate local transforms through the hierarchy to compute GlobalTransform.
///
/// Root entities (no Parent) get GlobalTransform = local Transform.
/// Children multiply parent's GlobalTransform x local Transform.
pub fn transform_propagation(world: &mut World) {
    // Phase 1: update roots (entities with Transform but no Parent)
    let roots: Vec<Entity> = world
        .query_filtered::<Entity, (With<Transform>, Without<Parent>)>()
        .iter(world)
        .collect();

    for root in roots {
        let local = world
            .get::<Transform>(root)
            .map(|t| t.to_matrix())
            .unwrap_or(glam::Mat4::IDENTITY);
        if let Some(mut global) = world.get_mut::<GlobalTransform>(root) {
            global.0 = local;
        } else {
            world.entity_mut(root).insert(GlobalTransform(local));
        }
        propagate_children(world, root);
    }
}

fn propagate_children(world: &mut World, parent: Entity) {
    let parent_global = world
        .get::<GlobalTransform>(parent)
        .map(|g| g.0)
        .unwrap_or(glam::Mat4::IDENTITY);

    let child_entities: Vec<Entity> = world
        .get::<Children>(parent)
        .map(|c| c.0.clone())
        .unwrap_or_default();

    for child in child_entities {
        let local = world
            .get::<Transform>(child)
            .map(|t| t.to_matrix())
            .unwrap_or(glam::Mat4::IDENTITY);
        let child_global = parent_global * local;

        if let Some(mut global) = world.get_mut::<GlobalTransform>(child) {
            global.0 = child_global;
        } else {
            world
                .entity_mut(child)
                .insert(GlobalTransform(child_global));
        }
        propagate_children(world, child);
    }
}

/// Advance animation playback by delta seconds.
///
/// Iterates entities with AnimationTarget and applies interpolated values
/// to the corresponding Transform components.
pub fn animation_tick(world: &mut World, clip_name: &str, time: f32) {
    // Collect animation targets
    let targets: Vec<(Entity, AnimationTarget)> = world
        .query::<(Entity, &AnimationTarget)>()
        .iter(world)
        .map(|(e, t)| (e, t.clone()))
        .collect();

    for (_entity, target) in targets {
        for clip in &target.clips {
            if clip.name != clip_name {
                continue;
            }
            let wrapped_time = if clip.duration > 0.0 {
                time % clip.duration
            } else {
                0.0
            };
            apply_clip_at_time(world, clip, wrapped_time);
        }
    }
}

fn apply_clip_at_time(world: &mut World, clip: &crate::components::AnimationClipData, time: f32) {
    for channel in &clip.channels {
        // Find target entity by SceneNodeId
        let target_entity = {
            let mut found = None;
            for (entity, node_id) in world
                .query::<(Entity, &crate::components::SceneNodeId)>()
                .iter(world)
            {
                if node_id.0 == channel.target_node {
                    found = Some(entity);
                    break;
                }
            }
            match found {
                Some(e) => e,
                None => continue,
            }
        };

        let timestamps = channel.timestamps();
        let values = channel.values();

        if timestamps.is_empty() {
            continue;
        }

        let (idx, t) = find_keyframe_lerp(&timestamps, time);
        let has_next = idx + 1 < timestamps.len();

        match channel.property {
            AnimationProperty::Translation => {
                if values.len() >= (idx + 1) * 3 {
                    let base = idx * 3;
                    let a = glam::Vec3::new(values[base], values[base + 1], values[base + 2]);
                    let pos = if has_next && values.len() >= (idx + 2) * 3 {
                        let next_base = (idx + 1) * 3;
                        let b = glam::Vec3::new(
                            values[next_base],
                            values[next_base + 1],
                            values[next_base + 2],
                        );
                        a.lerp(b, t)
                    } else {
                        a
                    };
                    if let Some(mut transform) = world.get_mut::<Transform>(target_entity) {
                        transform.position = pos;
                    }
                }
            }
            AnimationProperty::Rotation => {
                if values.len() >= (idx + 1) * 4 {
                    let base = idx * 4;
                    let a = glam::Quat::from_xyzw(
                        values[base],
                        values[base + 1],
                        values[base + 2],
                        values[base + 3],
                    );
                    let rot = if has_next && values.len() >= (idx + 2) * 4 {
                        let next_base = (idx + 1) * 4;
                        let b = glam::Quat::from_xyzw(
                            values[next_base],
                            values[next_base + 1],
                            values[next_base + 2],
                            values[next_base + 3],
                        );
                        a.slerp(b, t)
                    } else {
                        a
                    };
                    if let Some(mut transform) = world.get_mut::<Transform>(target_entity) {
                        transform.rotation = rot;
                    }
                }
            }
            AnimationProperty::Scale => {
                if values.len() >= (idx + 1) * 3 {
                    let base = idx * 3;
                    let a = glam::Vec3::new(values[base], values[base + 1], values[base + 2]);
                    let scl = if has_next && values.len() >= (idx + 2) * 3 {
                        let next_base = (idx + 1) * 3;
                        let b = glam::Vec3::new(
                            values[next_base],
                            values[next_base + 1],
                            values[next_base + 2],
                        );
                        a.lerp(b, t)
                    } else {
                        a
                    };
                    if let Some(mut transform) = world.get_mut::<Transform>(target_entity) {
                        transform.scale = scl;
                    }
                }
            }
            AnimationProperty::MorphWeights => {
                let n_frames = timestamps.len();
                if n_frames == 0 || values.is_empty() {
                    continue;
                }
                let morph_count = values.len() / n_frames;
                if morph_count == 0 {
                    continue;
                }
                let base = idx * morph_count;
                if values.len() < base + morph_count {
                    continue;
                }
                let weights = if has_next && values.len() >= (idx + 2) * morph_count {
                    let next_base = (idx + 1) * morph_count;
                    // LERP each morph weight
                    (0..morph_count)
                        .map(|i| {
                            let a = values[base + i];
                            let b = values[next_base + i];
                            a + (b - a) * t
                        })
                        .collect()
                } else {
                    values[base..base + morph_count].to_vec()
                };
                if let Some(mut mw) = world.get_mut::<MorphWeights>(target_entity) {
                    mw.weights = weights;
                } else {
                    world
                        .entity_mut(target_entity)
                        .insert(MorphWeights { weights });
                }
            }
        }
    }
}

/// Find the keyframe index and interpolation factor for the given time.
///
/// Returns (lower_index, t) where t is the blend factor [0.0, 1.0]
/// between keyframe[lower_index] and keyframe[lower_index + 1].
fn find_keyframe_lerp(timestamps: &[f32], time: f32) -> (usize, f32) {
    if timestamps.is_empty() {
        return (0, 0.0);
    }
    if timestamps.len() == 1 || time <= timestamps[0] {
        return (0, 0.0);
    }
    for i in 1..timestamps.len() {
        if time < timestamps[i] {
            let span = timestamps[i] - timestamps[i - 1];
            let t = if span > 0.0 {
                (time - timestamps[i - 1]) / span
            } else {
                0.0
            };
            return (i - 1, t);
        }
    }
    // Past the last keyframe
    (timestamps.len() - 1, 0.0)
}

/// Advance multi-layer scene animation blending and apply weighted transforms.
///
/// Must be called instead of animation_tick when SceneAnimationBlendState has layers.
///
/// Steps:
///   1. Read blend state + optional crossfade request from scene root
///   2. Process crossfade: advance fade timer, adjust weights, clean up on completion
///   3. Advance elapsed per layer (with loop/stop handling)
///   4. For each layer, evaluate all channels at new elapsed, multiply by weight
///   5. Accumulate weighted transform values per node → apply to Transform components
pub fn scene_animation_blend_tick(world: &mut World, delta: f32) {
    // Find scene root entity
    let root_entity: Option<Entity> = {
        let mut q = world.query_filtered::<Entity, With<SceneRoot>>();
        q.iter(world).next()
    };
    let root_entity = match root_entity {
        Some(e) => e,
        None => return,
    };

    // Check if blend state has layers
    let has_layers = world
        .get::<SceneAnimationBlendState>(root_entity)
        .map(|s| !s.layers.is_empty())
        .unwrap_or(false);
    if !has_layers {
        return;
    }

    // Read clip data from AnimationTarget (durations + channels)
    let clips: Vec<_> = {
        match world.get::<AnimationTarget>(root_entity) {
            Some(target) => target
                .clips
                .iter()
                .map(|clip| (clip.name.clone(), clip.duration, clip.channels.clone()))
                .collect(),
            None => return,
        }
    };

    // Process crossfade
    let crossfade_done = {
        match world.get::<SceneCrossfadeRequest>(root_entity) {
            Some(cf) => cf.fade_elapsed + delta >= cf.fade_duration,
            None => false,
        }
    };

    if let Some(mut cf) = world.get_mut::<SceneCrossfadeRequest>(root_entity) {
        cf.fade_elapsed += delta;
        let fade_t = (cf.fade_elapsed / cf.fade_duration.max(0.001)).clamp(0.0, 1.0);
        let target_idx = cf.target_clip_index;

        if let Some(mut blend) = world.get_mut::<SceneAnimationBlendState>(root_entity) {
            for layer in &mut blend.layers {
                if layer.clip_index == target_idx {
                    layer.weight = fade_t;
                } else {
                    layer.weight = (1.0 - fade_t).max(0.0);
                }
            }
        }
    }

    // If crossfade completed, remove old layers and request
    if crossfade_done {
        let target_idx = world
            .get::<SceneCrossfadeRequest>(root_entity)
            .map(|cf| cf.target_clip_index);

        if let Some(target_idx) = target_idx {
            if let Some(mut blend) = world.get_mut::<SceneAnimationBlendState>(root_entity) {
                blend.layers.retain(|l| l.clip_index == target_idx);
                for layer in &mut blend.layers {
                    layer.weight = 1.0;
                }
            }
        }
        world
            .entity_mut(root_entity)
            .remove::<SceneCrossfadeRequest>();
    }

    // Clone layers for iteration
    let mut layers: Vec<SceneBlendLayer> = match world.get::<SceneAnimationBlendState>(root_entity)
    {
        Some(blend) => blend.layers.clone(),
        None => return,
    };

    // Advance each layer's elapsed time
    for layer in &mut layers {
        if layer.clip_index >= clips.len() {
            continue;
        }
        let duration = clips[layer.clip_index].1;
        let advanced = layer.elapsed + delta;
        if advanced >= duration {
            if layer.looping {
                layer.elapsed = advanced % duration.max(0.001);
            } else {
                layer.elapsed = duration;
                layer.weight = 0.0;
            }
        } else {
            layer.elapsed = advanced;
        }
    }

    // Write back updated layers
    if let Some(mut blend) = world.get_mut::<SceneAnimationBlendState>(root_entity) {
        blend.layers = layers.clone();
    }

    // Remove zero-weight non-looping layers
    if let Some(mut blend) = world.get_mut::<SceneAnimationBlendState>(root_entity) {
        blend.layers.retain(|l| l.weight > 0.0 || l.looping);
    }

    // Accumulate weighted transforms per node
    // Key: (node_id, property) -> accumulated (value_vec, total_weight)
    let mut translation_accum: HashMap<String, (glam::Vec3, f32)> = HashMap::new();
    let mut rotation_accum: HashMap<String, (glam::Quat, f32)> = HashMap::new();
    let mut scale_accum: HashMap<String, (glam::Vec3, f32)> = HashMap::new();
    let mut morph_accum: HashMap<String, (Vec<f32>, f32)> = HashMap::new();

    for layer in &layers {
        if layer.weight <= 0.0 || layer.clip_index >= clips.len() {
            continue;
        }
        let (_, duration, ref channels) = clips[layer.clip_index];
        let time = if duration > 0.0 {
            layer.elapsed % duration
        } else {
            0.0
        };

        for channel in channels {
            let timestamps = channel.timestamps();
            let values = channel.values();
            if timestamps.is_empty() {
                continue;
            }

            let (idx, t) = find_keyframe_lerp(&timestamps, time);
            let has_next = idx + 1 < timestamps.len();

            match channel.property {
                AnimationProperty::Translation => {
                    if values.len() >= (idx + 1) * 3 {
                        let base = idx * 3;
                        let a = glam::Vec3::new(values[base], values[base + 1], values[base + 2]);
                        let val = if has_next && values.len() >= (idx + 2) * 3 {
                            let nb = (idx + 1) * 3;
                            let b = glam::Vec3::new(values[nb], values[nb + 1], values[nb + 2]);
                            a.lerp(b, t)
                        } else {
                            a
                        };
                        let entry = translation_accum
                            .entry(channel.target_node.clone())
                            .or_insert((glam::Vec3::ZERO, 0.0));
                        entry.0 += val * layer.weight;
                        entry.1 += layer.weight;
                    }
                }
                AnimationProperty::Rotation => {
                    if values.len() >= (idx + 1) * 4 {
                        let base = idx * 4;
                        let a = glam::Quat::from_xyzw(
                            values[base],
                            values[base + 1],
                            values[base + 2],
                            values[base + 3],
                        );
                        let val = if has_next && values.len() >= (idx + 2) * 4 {
                            let nb = (idx + 1) * 4;
                            let b = glam::Quat::from_xyzw(
                                values[nb],
                                values[nb + 1],
                                values[nb + 2],
                                values[nb + 3],
                            );
                            a.slerp(b, t)
                        } else {
                            a
                        };
                        let entry = rotation_accum
                            .entry(channel.target_node.clone())
                            .or_insert((glam::Quat::IDENTITY, 0.0));
                        if entry.1 == 0.0 {
                            entry.0 = val;
                        } else {
                            // SLERP blend between accumulated and new
                            let blend_t = layer.weight / (entry.1 + layer.weight);
                            entry.0 = entry.0.slerp(val, blend_t);
                        }
                        entry.1 += layer.weight;
                    }
                }
                AnimationProperty::Scale => {
                    if values.len() >= (idx + 1) * 3 {
                        let base = idx * 3;
                        let a = glam::Vec3::new(values[base], values[base + 1], values[base + 2]);
                        let val = if has_next && values.len() >= (idx + 2) * 3 {
                            let nb = (idx + 1) * 3;
                            let b = glam::Vec3::new(values[nb], values[nb + 1], values[nb + 2]);
                            a.lerp(b, t)
                        } else {
                            a
                        };
                        let entry = scale_accum
                            .entry(channel.target_node.clone())
                            .or_insert((glam::Vec3::ZERO, 0.0));
                        entry.0 += val * layer.weight;
                        entry.1 += layer.weight;
                    }
                }
                AnimationProperty::MorphWeights => {
                    let n_frames = timestamps.len();
                    if n_frames == 0 || values.is_empty() {
                        continue;
                    }
                    let morph_count = values.len() / n_frames;
                    if morph_count == 0 {
                        continue;
                    }
                    let base = idx * morph_count;
                    if values.len() < base + morph_count {
                        continue;
                    }
                    let weights = if has_next && values.len() >= (idx + 2) * morph_count {
                        let nb = (idx + 1) * morph_count;
                        (0..morph_count)
                            .map(|i| {
                                let a = values[base + i];
                                let b = values[nb + i];
                                a + (b - a) * t
                            })
                            .collect::<Vec<_>>()
                    } else {
                        values[base..base + morph_count].to_vec()
                    };

                    let entry = morph_accum
                        .entry(channel.target_node.clone())
                        .or_insert((vec![0.0; morph_count], 0.0));
                    for (i, w) in weights.iter().enumerate() {
                        if i < entry.0.len() {
                            entry.0[i] += w * layer.weight;
                        }
                    }
                    entry.1 += layer.weight;
                }
            }
        }
    }

    // Apply accumulated values to Transform components
    for (node_id, (val, total_weight)) in &translation_accum {
        if *total_weight <= 0.0 {
            continue;
        }
        let normalized = *val / *total_weight;
        apply_to_node_transform(world, node_id, |t| t.position = normalized);
    }
    for (node_id, (val, total_weight)) in &rotation_accum {
        if *total_weight <= 0.0 {
            continue;
        }
        apply_to_node_transform(world, node_id, |t| t.rotation = val.normalize());
    }
    for (node_id, (val, total_weight)) in &scale_accum {
        if *total_weight <= 0.0 {
            continue;
        }
        let normalized = *val / *total_weight;
        apply_to_node_transform(world, node_id, |t| t.scale = normalized);
    }
    for (node_id, (weights, total_weight)) in &morph_accum {
        if *total_weight <= 0.0 {
            continue;
        }
        let normalized: Vec<f32> = weights.iter().map(|w| w / total_weight).collect();
        let entity = find_entity_by_node_id(world, node_id);
        if let Some(entity) = entity {
            if let Some(mut mw) = world.get_mut::<MorphWeights>(entity) {
                mw.weights = normalized;
            } else {
                world.entity_mut(entity).insert(MorphWeights {
                    weights: normalized,
                });
            }
        }
    }

    if let Some(dominant_layer) = layers
        .iter()
        .filter(|layer| layer.clip_index < clips.len())
        .max_by(|a, b| a.weight.total_cmp(&b.weight))
    {
        let (clip_name, duration, _) = &clips[dominant_layer.clip_index];
        let evaluated_time = if *duration > 0.0 {
            dominant_layer.elapsed % duration
        } else {
            0.0
        };
        world
            .entity_mut(root_entity)
            .insert(SceneAnimationPlaybackState {
                clip_name: Some(clip_name.clone()),
                time_cursor: dominant_layer.elapsed,
                evaluated_time,
                playing: dominant_layer.weight > 0.0,
                looping: dominant_layer.looping,
            });
    }
}

fn find_entity_by_node_id(world: &mut World, node_id: &str) -> Option<Entity> {
    let mut q = world.query::<(Entity, &crate::components::SceneNodeId)>();
    for (entity, id) in q.iter(world) {
        if id.0 == node_id {
            return Some(entity);
        }
    }
    None
}

fn apply_to_node_transform(world: &mut World, node_id: &str, f: impl FnOnce(&mut Transform)) {
    if let Some(entity) = find_entity_by_node_id(world, node_id) {
        if let Some(mut transform) = world.get_mut::<Transform>(entity) {
            f(&mut transform);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::components::*;
    use crate::hierarchy::*;

    #[test]
    fn simulation_system_labels_define_stable_boundary_order() {
        assert_eq!(
            SIMULATION_SYSTEM_ORDER,
            &[
                SimulationSystemLabel::CommandApply,
                SimulationSystemLabel::AnimationTick,
                SimulationSystemLabel::AnimationBlendTick,
                SimulationSystemLabel::IkSolve,
                SimulationSystemLabel::TransformPropagation,
                SimulationSystemLabel::DirtyDeltaExtraction,
            ]
        );
        assert_eq!(
            SimulationSystemLabel::TransformPropagation.as_str(),
            "simulation.transform_propagation"
        );
    }

    #[test]
    fn test_transform_propagation_single_root() {
        let mut world = World::new();
        let root = world
            .spawn((
                Transform {
                    position: glam::Vec3::new(1.0, 2.0, 3.0),
                    ..Default::default()
                },
                GlobalTransform::identity(),
            ))
            .id();

        transform_propagation(&mut world);

        let global = world.get::<GlobalTransform>(root).unwrap();
        let pos = global.0.w_axis;
        assert!((pos.x - 1.0).abs() < f32::EPSILON);
        assert!((pos.y - 2.0).abs() < f32::EPSILON);
        assert!((pos.z - 3.0).abs() < f32::EPSILON);
    }

    #[test]
    fn test_transform_propagation_parent_child() {
        let mut world = World::new();

        let parent = world
            .spawn((
                Transform {
                    position: glam::Vec3::new(10.0, 0.0, 0.0),
                    ..Default::default()
                },
                GlobalTransform::identity(),
            ))
            .id();

        let child = world
            .spawn((
                Transform {
                    position: glam::Vec3::new(0.0, 5.0, 0.0),
                    ..Default::default()
                },
                GlobalTransform::identity(),
                Parent(parent),
            ))
            .id();

        world.entity_mut(parent).insert(Children(vec![child]));

        transform_propagation(&mut world);

        let child_global = world.get::<GlobalTransform>(child).unwrap();
        let pos = child_global.0.w_axis;
        // Child should be at (10, 5, 0) in world space
        assert!((pos.x - 10.0).abs() < f32::EPSILON);
        assert!((pos.y - 5.0).abs() < f32::EPSILON);
        assert!((pos.z - 0.0).abs() < f32::EPSILON);
    }

    #[test]
    fn test_find_keyframe_lerp() {
        let timestamps = vec![0.0, 0.5, 1.0, 1.5, 2.0];
        let (idx, t) = find_keyframe_lerp(&timestamps, 0.0);
        assert_eq!(idx, 0);
        assert!((t - 0.0).abs() < f32::EPSILON);

        let (idx, t) = find_keyframe_lerp(&timestamps, 0.25);
        assert_eq!(idx, 0);
        assert!((t - 0.5).abs() < f32::EPSILON);

        let (idx, t) = find_keyframe_lerp(&timestamps, 0.75);
        assert_eq!(idx, 1);
        assert!((t - 0.5).abs() < f32::EPSILON);

        let (idx, t) = find_keyframe_lerp(&timestamps, 2.5);
        assert_eq!(idx, 4);
        assert!((t - 0.0).abs() < f32::EPSILON);
    }

    #[test]
    fn test_find_keyframe_lerp_empty() {
        let (idx, t) = find_keyframe_lerp(&[], 1.0);
        assert_eq!(idx, 0);
        assert!((t - 0.0).abs() < f32::EPSILON);
    }

    #[test]
    fn test_morph_weights_animation() {
        use crate::components::*;

        let mut world = World::new();

        // Spawn an entity targeted by morph weight animation
        let target = world
            .spawn((
                SceneNodeId("node_0".to_string()),
                NodeName("Mesh".to_string()),
                Transform::default(),
                GlobalTransform::identity(),
            ))
            .id();

        // 3 keyframes, 2 morph targets, duration 1.5 (so t=1.0 doesn't wrap to 0)
        // Flattened values: [frame0_w0, frame0_w1, frame1_w0, frame1_w1, frame2_w0, frame2_w1]
        let clip = AnimationClipData {
            name: "morph_test".to_string(),
            duration: 1.5,
            channels: vec![AnimationChannel::from_flat(
                "node_0".to_string(),
                AnimationProperty::MorphWeights,
                &[0.0, 0.5, 1.0],
                &[0.0, 1.0, 0.5, 0.5, 1.0, 0.0],
            )],
        };

        let root = world.spawn(AnimationTarget { clips: vec![clip] }).id();

        // t=0.0 → idx=0, weights=[0.0, 1.0]
        animation_tick(&mut world, "morph_test", 0.0);
        let mw = world
            .get::<MorphWeights>(target)
            .expect("MorphWeights should be set");
        assert_eq!(mw.weights.len(), 2);
        assert!((mw.weights[0] - 0.0).abs() < f32::EPSILON);
        assert!((mw.weights[1] - 1.0).abs() < f32::EPSILON);

        // t=0.7 → between idx=1 (t=0.5) and idx=2 (t=1.0), blend factor = 0.4
        // frame1=[0.5, 0.5], frame2=[1.0, 0.0]
        // lerp: [0.5 + 0.5*0.4, 0.5 + (-0.5)*0.4] = [0.7, 0.3]
        animation_tick(&mut world, "morph_test", 0.7);
        let mw = world
            .get::<MorphWeights>(target)
            .expect("MorphWeights should be set");
        assert!((mw.weights[0] - 0.7).abs() < 0.01);
        assert!((mw.weights[1] - 0.3).abs() < 0.01);

        // t=1.0 → idx=2 (last frame, all timestamps exhausted), weights=[1.0, 0.0]
        animation_tick(&mut world, "morph_test", 1.0);
        let mw = world
            .get::<MorphWeights>(target)
            .expect("MorphWeights should be set");
        assert!((mw.weights[0] - 1.0).abs() < f32::EPSILON);
        assert!((mw.weights[1] - 0.0).abs() < f32::EPSILON);

        let _ = root; // suppress unused warning
    }
}
