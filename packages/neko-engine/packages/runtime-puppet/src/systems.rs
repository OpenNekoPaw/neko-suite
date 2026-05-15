//! ECS systems for 2D puppet deformation and physics (format-agnostic)
//!
//! Called manually (not via a scheduler) — mirrors runtime-scene pattern.
//! Systems operate on bevy_ecs::World directly. Supports both INP and MOC3 formats.

use crate::animation::{AnimationLibrary, AnimationPlayback};
use crate::animation_blend::{AnimationBlendState, BlendLayer, CrossfadeRequest};
use crate::components::*;
use crate::hierarchy;
use bevy_ecs::prelude::*;
use glam::{Mat3, Vec2};
use neko_engine_types::easing::{Easing, EasingType};

/// Reset all puppet parameters to their default values.
///
/// Must run at the start of each tick, before animation and expression systems.
/// This ensures that Add/Multiply expressions always operate on a clean base
/// (the default or animation-output value), rather than accumulating on top of
/// the previous frame's expression output.
pub fn parameter_reset(world: &mut World) {
    let mut q = world.query::<&mut PuppetParameters>();
    for mut params in q.iter_mut(world) {
        for p in &mut params.params {
            p.current = p.default;
        }
    }
}

/// Deformation entity data: (entity, vertices, binding_param, binding_strength, control_points)
type DeformEntityData = (Entity, Vec<Vec2>, String, f32, Vec<[f32; 2]>);

/// Animation curve data: (param_name, keyframes as (time_ms, value, easing))
type AnimCurveData = (String, Vec<(f32, f32, EasingType)>);

/// Clip data for blend: (duration, curves)
type ClipBlendData = (f32, Vec<AnimCurveData>);

/// Propagate local Transform2D through the hierarchy to compute GlobalTransform2D.
///
/// Phase 1: Find root entities (Transform2D but no Parent)
/// Phase 2: Recursively multiply parent GlobalTransform2D × child local Transform2D
pub fn transform_propagation_2d(world: &mut World) {
    // Phase 1: find roots
    let roots: Vec<Entity> = {
        let mut query =
            world.query_filtered::<Entity, (With<Transform2D>, Without<hierarchy::Parent>)>();
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
    let entities: Vec<DeformEntityData> = {
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

/// Advance expression fade and apply expression parameter overrides.
///
/// Each tick: advance fade_elapsed_ms, recompute weight, and apply expression
/// blend modes to PuppetParameters. Removes ActiveExpression when fade-out completes.
pub fn expression_update(world: &mut World, delta_ms: f32) {
    // Find root entity
    let root_entity: Option<Entity> = {
        let mut q = world.query_filtered::<Entity, With<PuppetRoot>>();
        q.iter(world).next()
    };
    let root_entity = match root_entity {
        Some(e) => e,
        None => return,
    };

    // Read active expression data
    let active = match world.get::<ActiveExpression>(root_entity) {
        Some(ae) => ae.clone(),
        None => return,
    };

    // Read the expression definition
    let expression = match world.get::<ExpressionLibrary>(root_entity) {
        Some(lib) => match lib.expressions.get(active.expression_index) {
            Some(e) => e.clone(),
            None => return,
        },
        None => return,
    };

    // Compute new fade state
    let fade_duration_ms = if active.fading_in {
        expression.fade_in_time * 1000.0
    } else {
        expression.fade_out_time * 1000.0
    };

    let new_elapsed = active.fade_elapsed_ms + delta_ms;
    let new_weight = if fade_duration_ms <= 0.0 {
        if active.fading_in {
            1.0
        } else {
            0.0
        }
    } else {
        let t = (new_elapsed / fade_duration_ms).clamp(0.0, 1.0);
        if active.fading_in {
            t
        } else {
            1.0 - t
        }
    };

    // Check if fade-out completed → remove
    let fade_out_done = !active.fading_in && new_weight <= 0.0;

    if fade_out_done {
        world.entity_mut(root_entity).remove::<ActiveExpression>();
        return;
    }

    // Update active expression state
    if let Some(mut ae) = world.get_mut::<ActiveExpression>(root_entity) {
        ae.fade_elapsed_ms = new_elapsed;
        ae.weight = new_weight;
    }

    // Collect current parameter values
    let current_params: Vec<(String, f32)> = {
        let mut q = world.query::<&PuppetParameters>();
        q.iter(world)
            .flat_map(|params| params.params.iter().map(|p| (p.name.clone(), p.current)))
            .collect()
    };

    // Apply expression with current weight
    let updated =
        crate::moc3::expression::apply_expression(&expression, &current_params, new_weight);

    // Write back
    let mut q = world.query::<&mut PuppetParameters>();
    for mut params in q.iter_mut(world) {
        for p in &mut params.params {
            if let Some((_, val)) = updated.iter().find(|(n, _)| n == &p.name) {
                p.current = val.clamp(p.min, p.max);
            }
        }
    }
}

/// Apply multi-key-form deformation driven by parameter values (MOC3 models).
///
/// For each entity with MultiKeyDeformation + MeshData, look up the current
/// parameter value and interpolate between the surrounding key forms to produce
/// DeformedVertices. This runs after animation/physics ticks write parameter
/// values and before transform propagation.
pub fn multi_key_deformation_update(world: &mut World) {
    // Collect current parameter values
    let param_values: Vec<(String, f32)> = {
        let mut query = world.query::<&PuppetParameters>();
        let mut values = Vec::new();
        for params in query.iter(world) {
            for p in &params.params {
                values.push((p.name.clone(), p.current));
            }
        }
        values
    };

    // Collect entities with MultiKeyDeformation
    let entities: Vec<(Entity, String, Vec<crate::components::KeyFormData>)> = {
        let mut query = world.query::<(Entity, &MultiKeyDeformation)>();
        query
            .iter(world)
            .map(|(e, mkd)| (e, mkd.param_name.clone(), mkd.key_forms.clone()))
            .collect()
    };

    for (entity, param_name, key_forms) in entities {
        let param_value = param_values
            .iter()
            .find(|(name, _)| *name == param_name)
            .map(|(_, v)| *v)
            .unwrap_or(0.0);

        if let Some(deformed) = crate::moc3::interpolation::interpolate_1d(&key_forms, param_value)
        {
            if let Some(mut dv) = world.get_mut::<DeformedVertices>(entity) {
                dv.0 = deformed;
            } else {
                world.entity_mut(entity).insert(DeformedVertices(deformed));
            }
        }
    }
}

/// Apply warp deformation to child drawables (MOC3 models).
///
/// For each entity with WarpDeformer, interpolate its control points from key forms
/// based on the current parameter value, then warp all child mesh vertices.
pub fn warp_deformer_update(world: &mut World) {
    // Collect current parameter values
    let param_values: Vec<(String, f32)> = {
        let mut query = world.query::<&PuppetParameters>();
        let mut values = Vec::new();
        for params in query.iter(world) {
            for p in &params.params {
                values.push((p.name.clone(), p.current));
            }
        }
        values
    };

    // Collect warp deformers with their data
    let deformers: Vec<(Entity, WarpDeformer)> = {
        let mut query = world.query::<(Entity, &WarpDeformer)>();
        query.iter(world).map(|(e, wd)| (e, wd.clone())).collect()
    };

    for (deformer_entity, wd) in &deformers {
        let param_value = param_values
            .iter()
            .find(|(name, _)| *name == wd.param_name)
            .map(|(_, v)| *v)
            .unwrap_or(0.0);

        // Interpolate control points from key forms
        let deformed_cps =
            match crate::moc3::interpolation::interpolate_1d(&wd.key_forms, param_value) {
                Some(cps) => cps,
                None => continue,
            };

        // Rest-state control points = first key form (or zeros)
        let rest_cps = match wd.key_forms.first() {
            Some(kf) => &kf.vertices,
            None => continue,
        };

        // Find child meshes — use DeformedVertices (from key form) if available,
        // otherwise fall back to MeshData.vertices. This ensures deformer effects
        // stack on top of key form interpolation rather than overwriting.
        let children: Vec<(Entity, Vec<Vec2>)> = {
            let mut query = world.query::<(
                Entity,
                &ParentDeformerRef,
                &MeshData,
                Option<&DeformedVertices>,
            )>();
            query
                .iter(world)
                .filter(|(_, pdr, _, _)| pdr.0 == *deformer_entity)
                .map(|(e, _, mesh, dv)| {
                    let verts = dv
                        .map(|d| d.0.clone())
                        .unwrap_or_else(|| mesh.vertices.clone());
                    (e, verts)
                })
                .collect()
        };

        for (child_entity, child_verts) in children {
            let warped = crate::moc3::warp_deformer::apply_warp(
                rest_cps,
                &deformed_cps,
                wd.rows,
                wd.columns,
                &child_verts,
            );
            if let Some(mut dv) = world.get_mut::<DeformedVertices>(child_entity) {
                dv.0 = warped;
            } else {
                world
                    .entity_mut(child_entity)
                    .insert(DeformedVertices(warped));
            }
        }
    }
}

/// Apply rotation deformation to child drawables (MOC3 models).
///
/// For each entity with RotationDeformer, interpolate the rotation angle
/// from key forms, then rotate all child mesh vertices around the deformer's
/// world-space position.
pub fn rotation_deformer_update(world: &mut World) {
    // Collect current parameter values
    let param_values: Vec<(String, f32)> = {
        let mut query = world.query::<&PuppetParameters>();
        let mut values = Vec::new();
        for params in query.iter(world) {
            for p in &params.params {
                values.push((p.name.clone(), p.current));
            }
        }
        values
    };

    // Collect rotation deformers
    let deformers: Vec<(Entity, RotationDeformer, Vec2)> = {
        let mut query = world.query::<(Entity, &RotationDeformer, &GlobalTransform2D)>();
        query
            .iter(world)
            .map(|(e, rd, gt)| {
                let pivot = Vec2::new(gt.0.col(2).x, gt.0.col(2).y);
                (e, rd.clone(), pivot)
            })
            .collect()
    };

    for (deformer_entity, rd, pivot) in &deformers {
        let param_value = param_values
            .iter()
            .find(|(name, _)| *name == rd.param_name)
            .map(|(_, v)| *v)
            .unwrap_or(0.0);

        // Interpolate angle from key forms
        let angle =
            match crate::moc3::interpolation::interpolate_1d_scalar(&rd.key_forms, param_value) {
                Some(a) => a + rd.base_angle,
                None => rd.base_angle,
            };

        // Find child meshes — use DeformedVertices if available (stacks on key forms)
        let children: Vec<(Entity, Vec<Vec2>)> = {
            let mut query = world.query::<(
                Entity,
                &ParentDeformerRef,
                &MeshData,
                Option<&DeformedVertices>,
            )>();
            query
                .iter(world)
                .filter(|(_, pdr, _, _)| pdr.0 == *deformer_entity)
                .map(|(e, _, mesh, dv)| {
                    let verts = dv
                        .map(|d| d.0.clone())
                        .unwrap_or_else(|| mesh.vertices.clone());
                    (e, verts)
                })
                .collect()
        };

        for (child_entity, child_verts) in children {
            let rotated =
                crate::moc3::rotation_deformer::apply_rotation(*pivot, angle, &child_verts);
            if let Some(mut dv) = world.get_mut::<DeformedVertices>(child_entity) {
                dv.0 = rotated;
            } else {
                world
                    .entity_mut(child_entity)
                    .insert(DeformedVertices(rotated));
            }
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
                let transformed: Vec<Vec2> =
                    dv.0.iter()
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
    let (duration, raw_curves): (f32, Vec<AnimCurveData>) = {
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
    let clip_data: Vec<ClipBlendData> = {
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
            Some(cf) => cf.fade_elapsed_ms() + delta_ms >= cf.fade_duration_ms(),
            None => false,
        }
    };

    if let Some(mut cf) = world.get_mut::<CrossfadeRequest>(root_entity) {
        cf.advance_ms(delta_ms);
        let fade_t = (cf.fade_elapsed_ms() / cf.fade_duration_ms().max(0.001)).clamp(0.0, 1.0);
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
        let advanced = layer.elapsed_ms() + delta_ms;
        if advanced >= duration {
            if layer.looping {
                layer.set_elapsed_ms(advanced % duration.max(0.001));
            } else {
                layer.set_elapsed_ms(duration);
                layer.weight = 0.0; // Non-looping done → fade out
            }
        } else {
            layer.set_elapsed_ms(advanced);
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
            let value = sample_eased(kfs, layer.elapsed_ms());
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
/// Implements SimplePhysics (rigid pendulum + spring pendulum).
pub fn physics_tick(world: &mut World, delta_ms: f32) {
    let dt = (delta_ms / 1000.0).min(10.0);
    if dt <= 0.0 {
        transform_propagation_2d(world);
        return;
    }

    // Collect current parameter values for input driving
    let param_values: Vec<(String, f32)> = {
        let mut query = world.query::<&PuppetParameters>();
        let mut values = Vec::new();
        for params in query.iter(world) {
            for p in &params.params {
                values.push((p.name.clone(), p.current));
            }
        }
        values
    };

    // Collect physics nodes with their data
    let physics_nodes: Vec<(Entity, SimplePhysics, PhysicsState, Vec2)> = {
        let mut query =
            world.query::<(Entity, &SimplePhysics, &PhysicsState, &GlobalTransform2D)>();
        query
            .iter(world)
            .map(|(e, sp, ps, gt)| {
                let anchor = Vec2::new(gt.0.col(2).x, gt.0.col(2).y);
                (e, sp.clone(), ps.clone(), anchor)
            })
            .collect()
    };

    // Simulate each physics node
    let mut param_updates: Vec<(String, f32)> = Vec::new();

    for (entity, sp, mut state, mut anchor) in physics_nodes {
        // Apply input parameter driving: displace anchor based on input params
        for input in &sp.inputs {
            let input_value = param_values
                .iter()
                .find(|(n, _)| *n == input.param_name)
                .map(|(_, v)| *v)
                .unwrap_or(0.0);
            let weighted = input_value * input.weight;
            match input.input_type.as_str() {
                "X" => anchor.x += weighted,
                "Y" => anchor.y += weighted,
                "Angle" => {
                    // Convert angle to XY displacement for the pendulum
                    let rad = weighted.to_radians();
                    anchor.x += rad.sin() * sp.length;
                    anchor.y += rad.cos() * sp.length;
                }
                _ => {}
            }
        }
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
                    PhysicsMapMode::AngleLength => state.angle * sp.output_scale[0],
                    PhysicsMapMode::LengthAngle => state.angle * sp.output_scale[1],
                    PhysicsMapMode::XY => state.angle.sin() * rest_length * sp.output_scale[0],
                    PhysicsMapMode::YX => state.angle.sin() * rest_length * sp.output_scale[1],
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
                    PhysicsMapMode::AngleLength => delta.x.atan2(delta.y) * sp.output_scale[0],
                    PhysicsMapMode::LengthAngle => delta.length() * sp.output_scale[0],
                    PhysicsMapMode::XY => delta.x * sp.output_scale[0],
                    PhysicsMapMode::YX => delta.y * sp.output_scale[1],
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

    // ── Fix 1 integration test: expression fade-in via expression_update ──

    #[test]
    fn test_expression_update_fade_in() {
        let mut world = World::new();

        let root = world
            .spawn((
                PuppetRoot,
                PuppetParameters {
                    params: vec![ParameterDef {
                        name: "ParamAngleX".to_string(),
                        min: -30.0,
                        max: 30.0,
                        default: 0.0,
                        current: 0.0,
                    }],
                },
                ExpressionLibrary {
                    expressions: vec![crate::moc3::expression::ExpressionDef {
                        name: "smile".to_string(),
                        fade_in_time: 0.5, // 500ms
                        fade_out_time: 0.3,
                        parameters: vec![crate::moc3::expression::ExpressionParameter {
                            id: "ParamAngleX".to_string(),
                            value: 20.0,
                            blend: crate::moc3::expression::ExpressionBlendMode::Override,
                        }],
                    }],
                },
                ActiveExpression {
                    expression_index: 0,
                    weight: 0.0,
                    fade_elapsed_ms: 0.0,
                    fading_in: true,
                },
            ))
            .id();

        // After 250ms (half of 500ms fade), weight should be ~0.5
        expression_update(&mut world, 250.0);

        let ae = world.get::<ActiveExpression>(root).unwrap();
        assert!((ae.weight - 0.5).abs() < 1e-3);

        // Parameter should be partially applied: 0 + (20 - 0) * 0.5 = 10
        let params = world.get::<PuppetParameters>(root).unwrap();
        assert!((params.params[0].current - 10.0).abs() < 1.0);

        // After another 250ms, weight should be 1.0
        expression_update(&mut world, 250.0);
        let ae = world.get::<ActiveExpression>(root).unwrap();
        assert!((ae.weight - 1.0).abs() < 1e-3);
    }

    // ── Add/Multiply accumulation regression tests ──

    #[test]
    fn test_expression_add_does_not_accumulate_across_frames() {
        let mut world = World::new();

        world.spawn((
            PuppetRoot,
            PuppetParameters {
                params: vec![ParameterDef {
                    name: "ParamAngleX".to_string(),
                    min: -30.0,
                    max: 30.0,
                    default: 0.0,
                    current: 0.0,
                }],
            },
            ExpressionLibrary {
                expressions: vec![crate::moc3::expression::ExpressionDef {
                    name: "tilt".to_string(),
                    fade_in_time: 0.0, // instant
                    fade_out_time: 0.0,
                    parameters: vec![crate::moc3::expression::ExpressionParameter {
                        id: "ParamAngleX".to_string(),
                        value: 10.0,
                        blend: crate::moc3::expression::ExpressionBlendMode::Add,
                    }],
                }],
            },
            ActiveExpression {
                expression_index: 0,
                weight: 1.0,
                fade_elapsed_ms: 0.0,
                fading_in: true,
            },
        ));

        // Simulate multiple ticks with parameter_reset before each expression_update
        for _ in 0..5 {
            parameter_reset(&mut world);
            expression_update(&mut world, 16.0);
        }

        let mut q = world.query::<&PuppetParameters>();
        let params = q.iter(&world).next().unwrap();
        // Add 10 to default 0 = 10, NOT 50 (accumulated over 5 frames)
        assert!(
            (params.params[0].current - 10.0).abs() < 1e-6,
            "Add expression should not accumulate: expected 10.0, got {}",
            params.params[0].current
        );
    }

    #[test]
    fn test_expression_multiply_does_not_compound_across_frames() {
        let mut world = World::new();

        world.spawn((
            PuppetRoot,
            PuppetParameters {
                params: vec![ParameterDef {
                    name: "Param".to_string(),
                    min: 0.0,
                    max: 100.0,
                    default: 10.0,
                    current: 10.0,
                }],
            },
            ExpressionLibrary {
                expressions: vec![crate::moc3::expression::ExpressionDef {
                    name: "half".to_string(),
                    fade_in_time: 0.0,
                    fade_out_time: 0.0,
                    parameters: vec![crate::moc3::expression::ExpressionParameter {
                        id: "Param".to_string(),
                        value: 0.5,
                        blend: crate::moc3::expression::ExpressionBlendMode::Multiply,
                    }],
                }],
            },
            ActiveExpression {
                expression_index: 0,
                weight: 1.0,
                fade_elapsed_ms: 0.0,
                fading_in: true,
            },
        ));

        // Simulate multiple ticks
        for _ in 0..5 {
            parameter_reset(&mut world);
            expression_update(&mut world, 16.0);
        }

        let mut q = world.query::<&PuppetParameters>();
        let params = q.iter(&world).next().unwrap();
        // Multiply 10 * 0.5 = 5, NOT 10 * 0.5^5 (compounded)
        assert!(
            (params.params[0].current - 5.0).abs() < 1e-6,
            "Multiply expression should not compound: expected 5.0, got {}",
            params.params[0].current
        );
    }

    // ── Fade-out lifecycle tests ──

    #[test]
    fn test_expression_fade_out_removes_active_expression() {
        let mut world = World::new();

        let root = world
            .spawn((
                PuppetRoot,
                PuppetParameters {
                    params: vec![ParameterDef {
                        name: "Param".to_string(),
                        min: -30.0,
                        max: 30.0,
                        default: 0.0,
                        current: 0.0,
                    }],
                },
                ExpressionLibrary {
                    expressions: vec![crate::moc3::expression::ExpressionDef {
                        name: "smile".to_string(),
                        fade_in_time: 0.0,
                        fade_out_time: 0.3, // 300ms fade-out
                        parameters: vec![crate::moc3::expression::ExpressionParameter {
                            id: "Param".to_string(),
                            value: 20.0,
                            blend: crate::moc3::expression::ExpressionBlendMode::Override,
                        }],
                    }],
                },
                // Start in fade-out state
                ActiveExpression {
                    expression_index: 0,
                    weight: 1.0,
                    fade_elapsed_ms: 0.0,
                    fading_in: false,
                },
            ))
            .id();

        // Halfway through fade-out (150ms of 300ms)
        parameter_reset(&mut world);
        expression_update(&mut world, 150.0);

        let ae = world.get::<ActiveExpression>(root).unwrap();
        assert!(
            (ae.weight - 0.5).abs() < 1e-3,
            "Weight at 50% fade-out should be ~0.5, got {}",
            ae.weight
        );
        // Parameter should be partially faded: 0 + (20 - 0) * 0.5 = 10
        let params = world.get::<PuppetParameters>(root).unwrap();
        assert!((params.params[0].current - 10.0).abs() < 1.0);

        // Complete fade-out (another 200ms, total 350ms > 300ms)
        parameter_reset(&mut world);
        expression_update(&mut world, 200.0);

        // ActiveExpression should be removed
        assert!(
            world.get::<ActiveExpression>(root).is_none(),
            "ActiveExpression should be removed after fade-out completes"
        );
    }

    #[test]
    fn test_expression_instant_fade_out_removes_immediately() {
        let mut world = World::new();

        let root = world
            .spawn((
                PuppetRoot,
                PuppetParameters {
                    params: vec![ParameterDef {
                        name: "Param".to_string(),
                        min: -30.0,
                        max: 30.0,
                        default: 0.0,
                        current: 0.0,
                    }],
                },
                ExpressionLibrary {
                    expressions: vec![crate::moc3::expression::ExpressionDef {
                        name: "smile".to_string(),
                        fade_in_time: 0.0,
                        fade_out_time: 0.0, // instant fade-out
                        parameters: vec![crate::moc3::expression::ExpressionParameter {
                            id: "Param".to_string(),
                            value: 20.0,
                            blend: crate::moc3::expression::ExpressionBlendMode::Override,
                        }],
                    }],
                },
                ActiveExpression {
                    expression_index: 0,
                    weight: 1.0,
                    fade_elapsed_ms: 0.0,
                    fading_in: false, // fade-out with zero duration
                },
            ))
            .id();

        parameter_reset(&mut world);
        expression_update(&mut world, 16.0);

        assert!(
            world.get::<ActiveExpression>(root).is_none(),
            "Instant fade-out should remove ActiveExpression immediately"
        );
    }

    // ── Fix 2 integration test: physics input driving ──

    #[test]
    fn test_physics_input_driving_displaces_anchor() {
        // Verify that input parameters actually change the anchor position
        // that feeds into the physics simulation. We test this by comparing
        // simulation results with and without input driving.
        let mut world_with_input = World::new();

        world_with_input.spawn((
            PuppetRoot,
            PuppetParameters {
                params: vec![
                    ParameterDef {
                        name: "ParamAngleX".to_string(),
                        min: -30.0,
                        max: 30.0,
                        default: 0.0,
                        current: 20.0, // Large input
                    },
                    ParameterDef {
                        name: "ParamHairFront".to_string(),
                        min: -30.0,
                        max: 30.0,
                        default: 0.0,
                        current: 0.0,
                    },
                ],
            },
        ));

        world_with_input.spawn((
            SimplePhysics {
                param_name: "ParamHairFront".to_string(),
                model: PhysicsModel::SpringPendulum, // spring responds to anchor shift
                map_mode: PhysicsMapMode::XY,
                gravity: 0.1,
                length: 50.0,
                frequency: 2.0,
                angle_damping: 0.3,
                length_damping: 0.3,
                output_scale: [1.0, 1.0],
                local_only: false,
                inputs: vec![PhysicsInput {
                    param_name: "ParamAngleX".to_string(),
                    weight: 5.0,                 // Strong weight
                    input_type: "X".to_string(), // Direct X displacement
                }],
            },
            PhysicsState::default(),
            Transform2D::default(),
            GlobalTransform2D::default(),
        ));

        // Also create a world without input for comparison
        let mut world_without_input = World::new();
        world_without_input.spawn((
            PuppetRoot,
            PuppetParameters {
                params: vec![
                    ParameterDef {
                        name: "ParamAngleX".to_string(),
                        min: -30.0,
                        max: 30.0,
                        default: 0.0,
                        current: 20.0,
                    },
                    ParameterDef {
                        name: "ParamHairFront".to_string(),
                        min: -30.0,
                        max: 30.0,
                        default: 0.0,
                        current: 0.0,
                    },
                ],
            },
        ));
        world_without_input.spawn((
            SimplePhysics {
                param_name: "ParamHairFront".to_string(),
                model: PhysicsModel::SpringPendulum,
                map_mode: PhysicsMapMode::XY,
                gravity: 0.1,
                length: 50.0,
                frequency: 2.0,
                angle_damping: 0.3,
                length_damping: 0.3,
                output_scale: [1.0, 1.0],
                local_only: false,
                inputs: Vec::new(), // No input driving
            },
            PhysicsState::default(),
            Transform2D::default(),
            GlobalTransform2D::default(),
        ));

        // Run several ticks
        for _ in 0..20 {
            physics_tick(&mut world_with_input, 16.0);
            physics_tick(&mut world_without_input, 16.0);
        }

        // Get output values
        let hair_with = {
            let mut q = world_with_input.query::<&PuppetParameters>();
            let params = q.iter(&world_with_input).next().unwrap();
            params
                .params
                .iter()
                .find(|p| p.name == "ParamHairFront")
                .unwrap()
                .current
        };
        let hair_without = {
            let mut q = world_without_input.query::<&PuppetParameters>();
            let params = q.iter(&world_without_input).next().unwrap();
            params
                .params
                .iter()
                .find(|p| p.name == "ParamHairFront")
                .unwrap()
                .current
        };

        // With input driving, the result should differ from without input
        assert!(
            (hair_with - hair_without).abs() > 0.001,
            "Input-driven physics should differ from non-driven: with={}, without={}",
            hair_with,
            hair_without
        );
    }

    // ── Fix 3 integration test: deformer + keyform stacking ──

    #[test]
    fn test_deformer_keyform_stacking() {
        let mut world = World::new();

        world.spawn((
            PuppetRoot,
            PuppetParameters {
                params: vec![
                    ParameterDef {
                        name: "ParamAngleX".to_string(),
                        min: 0.0,
                        max: 1.0,
                        default: 0.0,
                        current: 1.0,
                    },
                    ParameterDef {
                        name: "ParamWarp".to_string(),
                        min: 0.0,
                        max: 1.0,
                        default: 0.0,
                        current: 1.0,
                    },
                ],
            },
        ));

        // Create a warp deformer
        let deformer = world
            .spawn((
                WarpDeformer {
                    rows: 1,
                    columns: 1,
                    key_forms: vec![
                        KeyFormData {
                            param_value: 0.0,
                            vertices: vec![
                                Vec2::new(0.0, 0.0),
                                Vec2::new(10.0, 0.0),
                                Vec2::new(0.0, 10.0),
                                Vec2::new(10.0, 10.0),
                            ],
                        },
                        KeyFormData {
                            param_value: 1.0,
                            vertices: vec![
                                Vec2::new(5.0, 0.0),
                                Vec2::new(15.0, 0.0),
                                Vec2::new(5.0, 10.0),
                                Vec2::new(15.0, 10.0),
                            ],
                        },
                    ],
                    param_name: "ParamWarp".to_string(),
                },
                Transform2D::default(),
                GlobalTransform2D::default(),
            ))
            .id();

        // Create a child mesh with its own key form deformation + parent deformer
        let child = world
            .spawn((
                MeshData {
                    vertices: vec![Vec2::new(5.0, 5.0)],
                    uvs: vec![Vec2::ZERO],
                    indices: vec![0],
                },
                MultiKeyDeformation {
                    param_name: "ParamAngleX".to_string(),
                    key_forms: vec![
                        KeyFormData {
                            param_value: 0.0,
                            vertices: vec![Vec2::new(5.0, 5.0)],
                        },
                        KeyFormData {
                            param_value: 1.0,
                            vertices: vec![Vec2::new(5.0, 8.0)], // moves Y from 5→8
                        },
                    ],
                },
                ParentDeformerRef(deformer),
            ))
            .id();

        // Step 1: key form interpolation sets DeformedVertices
        multi_key_deformation_update(&mut world);

        let dv = world.get::<DeformedVertices>(child).unwrap();
        // At ParamAngleX=1.0, should be (5.0, 8.0)
        assert!(
            (dv.0[0].y - 8.0).abs() < 1e-5,
            "Key form Y should be 8.0, got {}",
            dv.0[0].y
        );

        // Step 2: warp deformer applies on top of key form result
        warp_deformer_update(&mut world);

        let dv = world.get::<DeformedVertices>(child).unwrap();
        // The warp shifts everything +5 in X at param=1.0,
        // so the key-form result (5.0, 8.0) should be warped.
        // Exact value depends on bilinear interpolation, but X should be > 5.0
        assert!(
            dv.0[0].x > 5.0,
            "Warp should shift X beyond 5.0, got {}",
            dv.0[0].x
        );
    }
}
