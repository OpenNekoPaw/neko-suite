//! ECS systems for 2D puppet deformation and physics
//!
//! Called manually (not via a scheduler) — mirrors native-scene pattern.
//! Systems operate on bevy_ecs::World directly.

use crate::animation::{AnimationClip, AnimationLibrary, AnimationPlayback};
use crate::animation_blend::{AnimationBlendState, BlendLayer, CrossfadeRequest};
use crate::components::*;
use crate::hierarchy;
use bevy_ecs::prelude::*;
use glam::{Mat3, Vec2};
use neko_types::easing::{Easing, EasingType};

/// Propagate local Transform2D through the hierarchy to compute GlobalTransform2D.
///
/// Phase 1: Find root entities (Transform2D but no Parent)
/// Phase 2: Recursively multiply parent GlobalTransform2D × child local Transform2D
pub fn transform_propagation_2d(world: &mut World) {
    // Phase 1: find roots
    let roots: Vec<Entity> = {
        let mut query = world.query_filtered::<Entity, (With<Transform2D>, Without<hierarchy::Parent>)>();
        query.iter(world).collect()
    };

    // Phase 2: propagate from each root
    for root in roots {
        propagate_recursive(world, root, Mat3::IDENTITY);
    }
}

/// Recursively compute GlobalTransform2D for entity and its children
fn propagate_recursive(world: &mut World, entity: Entity, parent_global: Mat3) {
    let local_mat = {
        let transform = match world.get::<Transform2D>(entity) {
            Some(t) => t,
            None => return,
        };
        compute_local_matrix(transform)
    };

    let global = parent_global * local_mat;

    // Update GlobalTransform2D
    if let Some(mut gt) = world.get_mut::<GlobalTransform2D>(entity) {
        gt.0 = global;
    } else {
        world.entity_mut(entity).insert(GlobalTransform2D(global));
    }

    // Recurse into children
    let children: Vec<Entity> = world
        .get::<hierarchy::Children>(entity)
        .map(|c| c.0.clone())
        .unwrap_or_default();

    for child in children {
        propagate_recursive(world, child, global);
    }
}

/// Compute a 2D affine matrix from Transform2D (position, rotation, scale)
fn compute_local_matrix(transform: &Transform2D) -> Mat3 {
    let cos = transform.rotation.cos();
    let sin = transform.rotation.sin();
    let sx = transform.scale.x;
    let sy = transform.scale.y;

    // Scale → Rotate → Translate (column-major)
    Mat3::from_cols(
        glam::Vec3::new(cos * sx, sin * sx, 0.0),
        glam::Vec3::new(-sin * sy, cos * sy, 0.0),
        glam::Vec3::new(transform.position.x, transform.position.y, 1.0),
    )
}

/// Apply parameter values to deform mesh vertices.
///
/// For each entity with MeshData + ParameterBinding, compute DeformedVertices
/// by interpolating between the base vertices based on parameter weights.
///
/// Two deformation modes:
/// 1. **Per-vertex displacement** (preferred): if `ParameterBinding.vertex_displacements`
///    is populated, each vertex is displaced by `displacement * t * weight` where
///    `t` is the normalised parameter value in [0, 1].
/// 2. **Legacy uniform offset**: if no per-vertex data, apply a uniform X-axis
///    offset of `param_value * weight` to every vertex.
pub fn parameter_update(world: &mut World) {
    // Collect parameter current values + ranges from PuppetParameters on root
    let param_info: Vec<(String, f32, f32, f32)> = {
        let mut query = world.query::<&PuppetParameters>();
        let mut values = Vec::new();
        for params in query.iter(world) {
            for p in &params.params {
                values.push((p.name.clone(), p.current, p.min, p.max));
            }
        }
        values
    };

    // Collect entities that need deformation
    let entities: Vec<(Entity, Vec<Vec2>, String, f32, Vec<[f32; 2]>)> = {
        let mut query = world.query::<(Entity, &MeshData, &ParameterBinding)>();
        query
            .iter(world)
            .map(|(e, mesh, binding)| {
                (
                    e,
                    mesh.vertices.clone(),
                    binding.param_name.clone(),
                    binding.weight,
                    binding.vertex_displacements.clone(),
                )
            })
            .collect()
    };

    for (entity, base_vertices, param_name, weight, displacements) in entities {
        // Find current parameter value and range
        let (param_value, param_min, param_max) = param_info
            .iter()
            .find(|(name, _, _, _)| *name == param_name)
            .map(|(_, v, mn, mx)| (*v, *mn, *mx))
            .unwrap_or((0.0, 0.0, 1.0));

        let deformed: Vec<Vec2> = if !displacements.is_empty() {
            // Per-vertex displacement mode: normalise parameter to [0, 1] range
            let range = (param_max - param_min).max(1e-6);
            let t = ((param_value - param_min) / range).clamp(0.0, 1.0);

            base_vertices
                .iter()
                .enumerate()
                .map(|(i, v)| {
                    if let Some(disp) = displacements.get(i) {
                        *v + Vec2::new(disp[0] * t * weight, disp[1] * t * weight)
                    } else {
                        *v
                    }
                })
                .collect()
        } else {
            // Legacy uniform X-axis offset
            base_vertices
                .iter()
                .map(|v| *v + Vec2::new(param_value * weight, 0.0))
                .collect()
        };

        if let Some(mut dv) = world.get_mut::<DeformedVertices>(entity) {
            dv.0 = deformed;
        } else {
            world.entity_mut(entity).insert(DeformedVertices(deformed));
        }
    }
}

/// Apply world-space transforms to deformed vertices for final output.
///
/// Each DeformedVertices is multiplied by its GlobalTransform2D to produce
/// world-space vertex positions for the frontend renderer.
pub fn apply_global_transforms(world: &mut World) {
    let updates: Vec<(Entity, Vec<Vec2>)> = {
        let mut query = world.query::<(Entity, &DeformedVertices, &GlobalTransform2D)>();
        query
            .iter(world)
            .map(|(e, dv, gt)| {
                let transformed: Vec<Vec2> = dv
                    .0
                    .iter()
                    .map(|v| {
                        let p = gt.0 * glam::Vec3::new(v.x, v.y, 1.0);
                        Vec2::new(p.x, p.y)
                    })
                    .collect();
                (e, transformed)
            })
            .collect()
    };

    for (entity, vertices) in updates {
        if let Some(mut dv) = world.get_mut::<DeformedVertices>(entity) {
            dv.0 = vertices;
        }
    }
}

/// Advance animation playback and write sampled parameter values.
///
/// Must be called before parameter_update so that animation-driven values
/// are already in PuppetParameters when deformation runs.
///
/// Steps:
///   1. Find the root entity carrying AnimationPlayback + AnimationLibrary
///   2. If playing, advance elapsed_ms by delta_ms (with loop/stop handling)
///   3. Sample all parameter curves at new elapsed_ms
///   4. Write sampled values into PuppetParameters.current
pub fn animation_tick(world: &mut World, delta_ms: f32) {
    // 1. Find root entity (carries AnimationPlayback)
    let root_entity: Option<Entity> = {
        let mut q = world.query_filtered::<Entity, With<PuppetRoot>>();
        q.iter(world).next()
    };
    let root_entity = match root_entity {
        Some(e) => e,
        None => return,
    };

    // 2. Read playback state (cloned to release the immutable borrow on world)
    let (clip_index, old_elapsed, looping) = {
        match world.get::<AnimationPlayback>(root_entity) {
            Some(pb) if pb.playing => match pb.clip_index {
                Some(idx) => (idx, pb.elapsed_ms, pb.looping),
                None => return,
            },
            _ => return,
        }
    };

    // 3. Read animation curves (cloned so we can mutate world later)
    //    Format: Vec<(param_name, Vec<(time_ms, value, easing)>)>
    let (duration, raw_curves): (f32, Vec<(String, Vec<(f32, f32, EasingType)>)>) = {
        match world.get::<AnimationLibrary>(root_entity) {
            Some(lib) => match lib.clips.get(clip_index) {
                Some(clip) => {
                    let curves = clip
                        .curves
                        .iter()
                        .map(|c| {
                            let kfs = c
                                .keyframes
                                .iter()
                                .map(|k| (k.time_ms, k.value, k.easing))
                                .collect();
                            (c.param_name.clone(), kfs)
                        })
                        .collect();
                    (clip.duration_ms, curves)
                }
                None => return,
            },
            None => return,
        }
    };

    // 4. Compute new elapsed time
    let advanced = old_elapsed + delta_ms;
    let (new_elapsed, still_playing) = if advanced >= duration {
        if looping {
            (advanced % duration.max(0.001), true)
        } else {
            (duration, false)
        }
    } else {
        (advanced, true)
    };

    // 5. Sample curves at new_elapsed using eased interpolation
    let param_updates: Vec<(String, f32)> = raw_curves
        .iter()
        .map(|(name, kfs)| (name.clone(), sample_eased(kfs, new_elapsed)))
        .collect();

    // 6. Update playback state
    if let Some(mut pb) = world.get_mut::<AnimationPlayback>(root_entity) {
        pb.elapsed_ms = new_elapsed;
        pb.playing = still_playing;
    }

    // 7. Apply sampled values to PuppetParameters
    let mut q = world.query::<&mut PuppetParameters>();
    for mut params in q.iter_mut(world) {
        for p in &mut params.params {
            if let Some((_, val)) = param_updates.iter().find(|(n, _)| n == &p.name) {
                p.current = val.clamp(p.min, p.max);
            }
        }
    }
}

/// Eased interpolation helper for sampled keyframe data (time, value, easing)
fn sample_eased(keyframes: &[(f32, f32, EasingType)], time_ms: f32) -> f32 {
    if keyframes.is_empty() {
        return 0.0;
    }
    if keyframes.len() == 1 {
        return keyframes[0].1;
    }
    let last = keyframes.last().unwrap();
    if time_ms >= last.0 {
        return last.1;
    }
    let first = keyframes.first().unwrap();
    if time_ms <= first.0 {
        return first.1;
    }
    for i in 0..keyframes.len() - 1 {
        let (t0, v0, easing) = keyframes[i];
        let (t1, v1, _) = keyframes[i + 1];
        if time_ms >= t0 && time_ms <= t1 {
            let linear_t = (time_ms - t0) / (t1 - t0);
            let eased_t = Easing::evaluate(easing, linear_t as f64) as f32;
            return v0 + eased_t * (v1 - v0);
        }
    }
    last.1
}

/// Sample all parameter curves in a clip at the given time.
/// Returns a list of (param_name, value) pairs.
fn sample_clip_params(clip: &AnimationClip, time_ms: f32) -> Vec<(&str, f32)> {
    clip.curves
        .iter()
        .map(|c| (c.param_name.as_str(), c.sample(time_ms)))
        .collect()
}

/// Advance multi-layer animation blending and write weighted parameter values.
///
/// Must be called instead of animation_tick when AnimationBlendState has layers.
///
/// Steps:
///   1. Read blend state + optional crossfade request from root
///   2. Process crossfade: advance fade timer, adjust weights, clean up on completion
///   3. Advance elapsed_ms per layer (with loop/stop handling)
///   4. Sample each layer's clip curves at new elapsed_ms, multiply by weight
///   5. Accumulate same-name parameters across layers → PuppetParameters.current
pub fn animation_blend_tick(world: &mut World, delta_ms: f32) {
    // Find root entity
    let root_entity: Option<Entity> = {
        let mut q = world.query_filtered::<Entity, With<PuppetRoot>>();
        q.iter(world).next()
    };
    let root_entity = match root_entity {
        Some(e) => e,
        None => return,
    };

    // Check if blend state has layers
    let has_layers = world
        .get::<AnimationBlendState>(root_entity)
        .map(|s| !s.layers.is_empty())
        .unwrap_or(false);
    if !has_layers {
        return;
    }

    // Read clip data (durations + curves) from AnimationLibrary
    let clip_data: Vec<(f32, Vec<(String, Vec<(f32, f32, EasingType)>)>)> = {
        match world.get::<AnimationLibrary>(root_entity) {
            Some(lib) => lib
                .clips
                .iter()
                .map(|clip| {
                    let curves = clip
                        .curves
                        .iter()
                        .map(|c| {
                            let kfs = c
                                .keyframes
                                .iter()
                                .map(|k| (k.time_ms, k.value, k.easing))
                                .collect();
                            (c.param_name.clone(), kfs)
                        })
                        .collect();
                    (clip.duration_ms, curves)
                })
                .collect(),
            None => return,
        }
    };

    // Process crossfade
    let crossfade_done = {
        match world.get::<CrossfadeRequest>(root_entity) {
            Some(cf) => cf.fade_elapsed_ms + delta_ms >= cf.fade_duration_ms,
            None => false,
        }
    };

    if let Some(mut cf) = world.get_mut::<CrossfadeRequest>(root_entity) {
        cf.fade_elapsed_ms += delta_ms;
        let fade_t = (cf.fade_elapsed_ms / cf.fade_duration_ms.max(0.001)).clamp(0.0, 1.0);
        let target_idx = cf.target_clip_index;

        // Adjust blend state weights: fade out old layers, fade in target
        if let Some(mut blend) = world.get_mut::<AnimationBlendState>(root_entity) {
            for layer in &mut blend.layers {
                if layer.clip_index == target_idx {
                    layer.weight = fade_t;
                } else {
                    layer.weight = (1.0 - fade_t).max(0.0);
                }
            }
        }
    }

    // If crossfade completed, remove old layers and CrossfadeRequest
    if crossfade_done {
        let target_info = world
            .get::<CrossfadeRequest>(root_entity)
            .map(|cf| (cf.target_clip_index, cf.loop_anim));

        if let Some((target_idx, _looping)) = target_info {
            if let Some(mut blend) = world.get_mut::<AnimationBlendState>(root_entity) {
                blend.layers.retain(|l| l.clip_index == target_idx);
                // Ensure target weight is 1.0
                for layer in &mut blend.layers {
                    layer.weight = 1.0;
                }
            }
        }
        world.entity_mut(root_entity).remove::<CrossfadeRequest>();
    }

    // Clone layers for iteration (releases mutable borrow)
    let mut layers: Vec<BlendLayer> = match world.get::<AnimationBlendState>(root_entity) {
        Some(blend) => blend.layers.clone(),
        None => return,
    };

    // Advance each layer's elapsed_ms
    for layer in &mut layers {
        if layer.clip_index >= clip_data.len() {
            continue;
        }
        let duration = clip_data[layer.clip_index].0;
        let advanced = layer.elapsed_ms + delta_ms;
        if advanced >= duration {
            if layer.looping {
                layer.elapsed_ms = advanced % duration.max(0.001);
            } else {
                layer.elapsed_ms = duration;
                layer.weight = 0.0; // Non-looping done → fade out
            }
        } else {
            layer.elapsed_ms = advanced;
        }
    }

    // Sample curves and accumulate weighted parameter values
    let mut param_accum: std::collections::HashMap<String, f32> = std::collections::HashMap::new();
    for layer in &layers {
        if layer.weight <= 0.0 || layer.clip_index >= clip_data.len() {
            continue;
        }
        let (_, ref curves) = clip_data[layer.clip_index];
        for (param_name, kfs) in curves {
            let value = sample_eased(kfs, layer.elapsed_ms);
            *param_accum.entry(param_name.clone()).or_insert(0.0) += value * layer.weight;
        }
    }

    // Write back updated layers
    if let Some(mut blend) = world.get_mut::<AnimationBlendState>(root_entity) {
        blend.layers = layers;
    }

    // Apply accumulated values to PuppetParameters
    let mut q = world.query::<&mut PuppetParameters>();
    for mut params in q.iter_mut(world) {
        for p in &mut params.params {
            if let Some(&val) = param_accum.get(&p.name) {
                p.current = val.clamp(p.min, p.max);
            }
        }
    }
}

/// Run a single physics simulation step.
///
/// Simulates spring/pendulum physics for hair, accessories, etc.
/// Ported from inox2d SimplePhysics (rigid pendulum + spring pendulum).
pub fn physics_tick(world: &mut World, delta_ms: f32) {
    let dt = (delta_ms / 1000.0).min(10.0);
    if dt <= 0.0 {
        transform_propagation_2d(world);
        return;
    }

    // Collect physics nodes with their data
    let physics_nodes: Vec<(Entity, SimplePhysics, PhysicsState, Vec2)> = {
        let mut query = world.query::<(
            Entity,
            &SimplePhysics,
            &PhysicsState,
            &GlobalTransform2D,
        )>();
        query
            .iter(world)
            .map(|(e, sp, ps, gt)| {
                // Anchor is the node's world position (parent drives the "hook")
                let anchor = Vec2::new(gt.0.col(2).x, gt.0.col(2).y);
                (e, sp.clone(), ps.clone(), anchor)
            })
            .collect()
    };

    // Simulate each physics node
    let mut param_updates: Vec<(String, f32)> = Vec::new();

    for (entity, sp, mut state, anchor) in physics_nodes {
        let gravity = sp.gravity * 9.81 * 100.0; // pixels/s²
        let rest_length = sp.length.max(1.0);
        let freq = sp.frequency.max(0.01);
        let omega = freq * std::f32::consts::TAU; // angular frequency

        match sp.model {
            PhysicsModel::RigidPendulum => {
                // Rigid pendulum: θ'' = -(g/L)*sin(θ) - damping*θ'
                let mut remaining = dt;
                while remaining > 0.0 {
                    let step = remaining.min(0.01);
                    let accel = -(gravity / rest_length) * state.angle.sin()
                        - sp.angle_damping * omega * state.angular_velocity;
                    state.angular_velocity += accel * step;
                    state.angle += state.angular_velocity * step;
                    remaining -= 0.01;
                }
                // Convert angle + length to parameter output
                let output = match sp.map_mode {
                    PhysicsMapMode::AngleLength => {
                        state.angle * sp.output_scale[0]
                    }
                    PhysicsMapMode::LengthAngle => {
                        state.angle * sp.output_scale[1]
                    }
                    PhysicsMapMode::XY => {
                        state.angle.sin() * rest_length * sp.output_scale[0]
                    }
                    PhysicsMapMode::YX => {
                        state.angle.sin() * rest_length * sp.output_scale[1]
                    }
                };
                param_updates.push((sp.param_name.clone(), output));
            }
            PhysicsModel::SpringPendulum => {
                // Spring pendulum: F = -k*x - damping*v + gravity
                let mut remaining = dt;
                while remaining > 0.0 {
                    let step = remaining.min(0.01);
                    // Spring restoring force toward rest position below anchor
                    let rest_pos = Vec2::new(anchor.x, anchor.y + rest_length);
                    let displacement = state.bob - rest_pos;
                    let spring_force = -omega * omega * displacement;
                    let damping_force = Vec2::new(
                        -sp.angle_damping * omega * state.velocity.x,
                        -sp.length_damping * omega * state.velocity.y,
                    );
                    let gravity_force = Vec2::new(0.0, gravity);
                    let accel = spring_force + damping_force + gravity_force;
                    state.velocity += accel * step;
                    state.bob += state.velocity * step;
                    remaining -= 0.01;
                }
                // Convert bob position to parameter output
                let delta = state.bob - anchor;
                let output = match sp.map_mode {
                    PhysicsMapMode::AngleLength => {
                        delta.x.atan2(delta.y) * sp.output_scale[0]
                    }
                    PhysicsMapMode::LengthAngle => {
                        delta.length() * sp.output_scale[0]
                    }
                    PhysicsMapMode::XY => {
                        delta.x * sp.output_scale[0]
                    }
                    PhysicsMapMode::YX => {
                        delta.y * sp.output_scale[1]
                    }
                };
                param_updates.push((sp.param_name.clone(), output));
            }
        }

        // Write back updated state
        if let Some(mut ps) = world.get_mut::<PhysicsState>(entity) {
            *ps = state;
        }
    }

    // Apply physics-driven parameter values
    if !param_updates.is_empty() {
        let mut query = world.query::<&mut PuppetParameters>();
        for mut params in query.iter_mut(world) {
            for (name, value) in &param_updates {
                if let Some(p) = params.params.iter_mut().find(|p| p.name == *name) {
                    p.current = value.clamp(p.min, p.max);
                }
            }
        }
        // Re-apply parameter-driven deformation
        parameter_update(world);
    }

    transform_propagation_2d(world);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hierarchy::set_parent;
    use std::f32::consts::PI;

    #[test]
    fn test_compute_local_matrix_identity() {
        let t = Transform2D::default();
        let m = compute_local_matrix(&t);
        // Should be close to identity
        assert!((m.col(0).x - 1.0).abs() < 1e-6);
        assert!((m.col(1).y - 1.0).abs() < 1e-6);
    }

    #[test]
    fn test_compute_local_matrix_translation() {
        let t = Transform2D {
            position: Vec2::new(10.0, 20.0),
            rotation: 0.0,
            scale: Vec2::ONE,
        };
        let m = compute_local_matrix(&t);
        assert!((m.col(2).x - 10.0).abs() < 1e-6);
        assert!((m.col(2).y - 20.0).abs() < 1e-6);
    }

    #[test]
    fn test_compute_local_matrix_rotation() {
        let t = Transform2D {
            position: Vec2::ZERO,
            rotation: PI / 2.0,
            scale: Vec2::ONE,
        };
        let m = compute_local_matrix(&t);
        // cos(90°) ≈ 0, sin(90°) ≈ 1
        assert!(m.col(0).x.abs() < 1e-5);
        assert!((m.col(0).y - 1.0).abs() < 1e-5);
    }

    #[test]
    fn test_transform_propagation_single_node() {
        let mut world = World::new();
        world.spawn((
            Transform2D {
                position: Vec2::new(5.0, 10.0),
                rotation: 0.0,
                scale: Vec2::ONE,
            },
            GlobalTransform2D::default(),
        ));

        transform_propagation_2d(&mut world);

        let mut query = world.query::<&GlobalTransform2D>();
        for gt in query.iter(&world) {
            assert!((gt.0.col(2).x - 5.0).abs() < 1e-6);
            assert!((gt.0.col(2).y - 10.0).abs() < 1e-6);
        }
    }

    #[test]
    fn test_transform_propagation_parent_child() {
        let mut world = World::new();
        let parent = world
            .spawn((
                Transform2D {
                    position: Vec2::new(10.0, 0.0),
                    rotation: 0.0,
                    scale: Vec2::ONE,
                },
                GlobalTransform2D::default(),
            ))
            .id();

        let child = world
            .spawn((
                Transform2D {
                    position: Vec2::new(5.0, 0.0),
                    rotation: 0.0,
                    scale: Vec2::ONE,
                },
                GlobalTransform2D::default(),
            ))
            .id();

        set_parent(&mut world, child, parent);
        transform_propagation_2d(&mut world);

        let child_gt = world.get::<GlobalTransform2D>(child).unwrap();
        // Child world position should be parent(10,0) + child(5,0) = (15,0)
        assert!((child_gt.0.col(2).x - 15.0).abs() < 1e-6);
        assert!(child_gt.0.col(2).y.abs() < 1e-6);
    }

    #[test]
    fn test_parameter_update_legacy_uniform() {
        let mut world = World::new();

        // Create puppet root with parameters
        world.spawn((
            PuppetRoot,
            PuppetParameters {
                params: vec![ParameterDef {
                    name: "mouth_open".to_string(),
                    min: 0.0,
                    max: 1.0,
                    default: 0.0,
                    current: 0.5,
                }],
            },
        ));

        // Create a mesh node bound to mouth_open (no vertex_displacements → legacy mode)
        world.spawn((
            MeshData {
                vertices: vec![Vec2::new(0.0, 0.0), Vec2::new(1.0, 0.0)],
                uvs: vec![Vec2::ZERO; 2],
                indices: vec![0, 1],
            },
            ParameterBinding {
                param_name: "mouth_open".to_string(),
                weight: 1.0,
                vertex_displacements: vec![],
            },
        ));

        parameter_update(&mut world);

        let mut query = world.query::<&DeformedVertices>();
        let dv = query.iter(&world).next().unwrap();
        // Legacy mode: param=0.5, weight=1.0 → x offset = 0.5
        assert!((dv.0[0].x - 0.5).abs() < 1e-6);
        assert!((dv.0[1].x - 1.5).abs() < 1e-6);
    }

    #[test]
    fn test_parameter_update_per_vertex_displacement() {
        let mut world = World::new();

        world.spawn((
            PuppetRoot,
            PuppetParameters {
                params: vec![ParameterDef {
                    name: "eye_close".to_string(),
                    min: 0.0,
                    max: 1.0,
                    default: 0.0,
                    current: 0.5,
                }],
            },
        ));

        // Per-vertex displacement: vertex 0 moves (0, -10), vertex 1 moves (0, 10)
        world.spawn((
            MeshData {
                vertices: vec![Vec2::new(0.0, 5.0), Vec2::new(0.0, -5.0)],
                uvs: vec![Vec2::ZERO; 2],
                indices: vec![0, 1],
            },
            ParameterBinding {
                param_name: "eye_close".to_string(),
                weight: 1.0,
                vertex_displacements: vec![[0.0, -10.0], [0.0, 10.0]],
            },
        ));

        parameter_update(&mut world);

        let mut query = world.query::<&DeformedVertices>();
        let dv = query.iter(&world).next().unwrap();
        // t = (0.5 - 0.0) / (1.0 - 0.0) = 0.5, weight = 1.0
        // vertex 0: (0, 5) + (0, -10) * 0.5 * 1.0 = (0, 0)
        // vertex 1: (0, -5) + (0, 10) * 0.5 * 1.0 = (0, 0)
        assert!((dv.0[0].y - 0.0).abs() < 1e-6);
        assert!((dv.0[1].y - 0.0).abs() < 1e-6);
    }

    #[test]
    fn test_parameter_update_per_vertex_at_max() {
        let mut world = World::new();

        world.spawn((
            PuppetRoot,
            PuppetParameters {
                params: vec![ParameterDef {
                    name: "smile".to_string(),
                    min: 0.0,
                    max: 1.0,
                    default: 0.0,
                    current: 1.0,
                }],
            },
        ));

        world.spawn((
            MeshData {
                vertices: vec![Vec2::new(0.0, 0.0)],
                uvs: vec![Vec2::ZERO],
                indices: vec![0],
            },
            ParameterBinding {
                param_name: "smile".to_string(),
                weight: 1.0,
                vertex_displacements: vec![[5.0, 3.0]],
            },
        ));

        parameter_update(&mut world);

        let mut query = world.query::<&DeformedVertices>();
        let dv = query.iter(&world).next().unwrap();
        // t = 1.0, weight = 1.0 → full displacement
        assert!((dv.0[0].x - 5.0).abs() < 1e-6);
        assert!((dv.0[0].y - 3.0).abs() < 1e-6);
    }
}
