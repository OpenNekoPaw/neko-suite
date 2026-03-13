//! ECS systems for 2D puppet deformation and physics
//!
//! Called manually (not via a scheduler) — mirrors native-scene pattern.
//! Systems operate on bevy_ecs::World directly.

use crate::animation::{AnimationLibrary, AnimationPlayback};
use crate::components::*;
use crate::hierarchy;
use bevy_ecs::prelude::*;
use glam::{Mat3, Vec2};

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
pub fn parameter_update(world: &mut World) {
    // Collect parameter current values from PuppetParameters on root
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

    // Collect entities that need deformation
    let entities: Vec<(Entity, Vec<Vec2>, String, f32)> = {
        let mut query = world.query::<(Entity, &MeshData, &ParameterBinding)>();
        query
            .iter(world)
            .map(|(e, mesh, binding)| {
                (e, mesh.vertices.clone(), binding.param_name.clone(), binding.weight)
            })
            .collect()
    };

    for (entity, base_vertices, param_name, weight) in entities {
        // Find current parameter value
        let param_value = param_values
            .iter()
            .find(|(name, _)| *name == param_name)
            .map(|(_, v)| *v)
            .unwrap_or(0.0);

        // Simple linear deformation: offset vertices by weighted parameter value
        // TODO(P1): implement proper inox2d deformation grid interpolation
        let deformed: Vec<Vec2> = base_vertices
            .iter()
            .map(|v| *v + Vec2::new(param_value * weight, 0.0))
            .collect();

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
    //    Format: Vec<(param_name, Vec<(time_ms, value)>)>
    let (duration, raw_curves): (f32, Vec<(String, Vec<(f32, f32)>)>) = {
        match world.get::<AnimationLibrary>(root_entity) {
            Some(lib) => match lib.clips.get(clip_index) {
                Some(clip) => {
                    let curves = clip
                        .curves
                        .iter()
                        .map(|c| {
                            let kfs = c.keyframes.iter().map(|k| (k.time_ms, k.value)).collect();
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

    // 5. Sample curves at new_elapsed using linear interpolation
    let param_updates: Vec<(String, f32)> = raw_curves
        .iter()
        .map(|(name, kfs)| (name.clone(), sample_linear(kfs, new_elapsed)))
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

/// Linear interpolation helper for sampled keyframe data
fn sample_linear(keyframes: &[(f32, f32)], time_ms: f32) -> f32 {
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
        let (t0, v0) = keyframes[i];
        let (t1, v1) = keyframes[i + 1];
        if time_ms >= t0 && time_ms <= t1 {
            let t = (time_ms - t0) / (t1 - t0);
            return v0 + t * (v1 - v0);
        }
    }
    last.1
}

/// Run a single physics simulation step.
///
/// Currently a no-op placeholder. When inox2d physics simulation is available
/// upstream, this will drive spring/pendulum physics for hair, accessories, etc.
pub fn physics_tick(world: &mut World, _delta_ms: f32) {
    // TODO(P2): implement spring/pendulum physics from inox2d
    // For now, just ensure transforms are propagated
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
    fn test_parameter_update_basic() {
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

        // Create a mesh node bound to mouth_open
        world.spawn((
            MeshData {
                vertices: vec![Vec2::new(0.0, 0.0), Vec2::new(1.0, 0.0)],
                uvs: vec![Vec2::ZERO; 2],
                indices: vec![0, 1],
            },
            ParameterBinding {
                param_name: "mouth_open".to_string(),
                weight: 1.0,
            },
        ));

        parameter_update(&mut world);

        let mut query = world.query::<&DeformedVertices>();
        let dv = query.iter(&world).next().unwrap();
        // With param=0.5 and weight=1.0, x offset should be 0.5
        assert!((dv.0[0].x - 0.5).abs() < 1e-6);
        assert!((dv.0[1].x - 1.5).abs() < 1e-6);
    }
}
