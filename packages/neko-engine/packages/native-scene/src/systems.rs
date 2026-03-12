//! ECS systems for scene updates
//!
//! - transform_propagation: computes GlobalTransform from hierarchy
//! - animation_tick: advances animation playback

use crate::components::{AnimationProperty, AnimationTarget, GlobalTransform, Transform};
use crate::hierarchy::{Children, Parent};
use bevy_ecs::prelude::*;

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
            world.entity_mut(child).insert(GlobalTransform(child_global));
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

fn apply_clip_at_time(
    world: &mut World,
    clip: &crate::components::AnimationClipData,
    time: f32,
) {
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

        // Interpolate value at time
        let idx = find_keyframe_index(&channel.timestamps, time);
        if channel.timestamps.is_empty() {
            continue;
        }

        match channel.property {
            AnimationProperty::Translation => {
                if channel.values.len() >= (idx + 1) * 3 {
                    let base = idx * 3;
                    let pos = glam::Vec3::new(
                        channel.values[base],
                        channel.values[base + 1],
                        channel.values[base + 2],
                    );
                    if let Some(mut transform) = world.get_mut::<Transform>(target_entity) {
                        transform.position = pos;
                    }
                }
            }
            AnimationProperty::Rotation => {
                if channel.values.len() >= (idx + 1) * 4 {
                    let base = idx * 4;
                    let rot = glam::Quat::from_xyzw(
                        channel.values[base],
                        channel.values[base + 1],
                        channel.values[base + 2],
                        channel.values[base + 3],
                    );
                    if let Some(mut transform) = world.get_mut::<Transform>(target_entity) {
                        transform.rotation = rot;
                    }
                }
            }
            AnimationProperty::Scale => {
                if channel.values.len() >= (idx + 1) * 3 {
                    let base = idx * 3;
                    let scl = glam::Vec3::new(
                        channel.values[base],
                        channel.values[base + 1],
                        channel.values[base + 2],
                    );
                    if let Some(mut transform) = world.get_mut::<Transform>(target_entity) {
                        transform.scale = scl;
                    }
                }
            }
            AnimationProperty::MorphWeights => {
                // TODO(P2): implement morph target animation
            }
        }
    }
}

/// Find the keyframe index for the given time
fn find_keyframe_index(timestamps: &[f32], time: f32) -> usize {
    for (i, &t) in timestamps.iter().enumerate() {
        if t > time {
            return if i > 0 { i - 1 } else { 0 };
        }
    }
    timestamps.len().saturating_sub(1)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::components::*;
    use crate::hierarchy::*;

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
    fn test_find_keyframe_index() {
        let timestamps = vec![0.0, 0.5, 1.0, 1.5, 2.0];
        assert_eq!(find_keyframe_index(&timestamps, 0.0), 0);
        assert_eq!(find_keyframe_index(&timestamps, 0.3), 0);
        assert_eq!(find_keyframe_index(&timestamps, 0.7), 1);
        assert_eq!(find_keyframe_index(&timestamps, 2.5), 4);
    }

    #[test]
    fn test_find_keyframe_index_empty() {
        assert_eq!(find_keyframe_index(&[], 1.0), 0);
    }
}
