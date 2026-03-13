//! ECS systems for scene updates
//!
//! - transform_propagation: computes GlobalTransform from hierarchy
//! - animation_tick: advances animation playback

use crate::components::{AnimationProperty, AnimationTarget, GlobalTransform, MorphWeights, Transform};
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
                let n_frames = channel.timestamps.len();
                if n_frames == 0 || channel.values.is_empty() {
                    continue;
                }
                // Number of morph targets = total values / number of frames
                let morph_count = channel.values.len() / n_frames;
                if morph_count == 0 {
                    continue;
                }
                let base = idx * morph_count;
                if channel.values.len() < base + morph_count {
                    continue;
                }
                let weights = channel.values[base..base + morph_count].to_vec();
                if let Some(mut mw) = world.get_mut::<MorphWeights>(target_entity) {
                    mw.weights = weights;
                } else {
                    world.entity_mut(target_entity).insert(MorphWeights { weights });
                }
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
            channels: vec![AnimationChannel {
                target_node: "node_0".to_string(),
                property: AnimationProperty::MorphWeights,
                timestamps: vec![0.0, 0.5, 1.0],
                values: vec![0.0, 1.0, 0.5, 0.5, 1.0, 0.0],
            }],
        };

        let root = world
            .spawn(AnimationTarget { clips: vec![clip] })
            .id();

        // t=0.0 → idx=0, weights=[0.0, 1.0]
        animation_tick(&mut world, "morph_test", 0.0);
        let mw = world.get::<MorphWeights>(target).expect("MorphWeights should be set");
        assert_eq!(mw.weights.len(), 2);
        assert!((mw.weights[0] - 0.0).abs() < f32::EPSILON);
        assert!((mw.weights[1] - 1.0).abs() < f32::EPSILON);

        // t=0.7 → idx=1 (since timestamps[2]=1.0 > 0.7), weights=[0.5, 0.5]
        animation_tick(&mut world, "morph_test", 0.7);
        let mw = world.get::<MorphWeights>(target).expect("MorphWeights should be set");
        assert!((mw.weights[0] - 0.5).abs() < f32::EPSILON);
        assert!((mw.weights[1] - 0.5).abs() < f32::EPSILON);

        // t=1.0 → idx=2 (last frame, all timestamps exhausted), weights=[1.0, 0.0]
        animation_tick(&mut world, "morph_test", 1.0);
        let mw = world.get::<MorphWeights>(target).expect("MorphWeights should be set");
        assert!((mw.weights[0] - 1.0).abs() < f32::EPSILON);
        assert!((mw.weights[1] - 0.0).abs() < f32::EPSILON);

        let _ = root; // suppress unused warning
    }
}
