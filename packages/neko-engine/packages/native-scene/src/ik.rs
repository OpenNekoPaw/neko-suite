//! Inverse Kinematics (IK) solver module
//!
//! Provides FABRIK, CCD, and analytical Two-Bone solvers for skeletal IK editing.
//! IK chains are stored as ECS components and solved before transform propagation.

use bevy_ecs::prelude::*;
use glam::{Quat, Vec3};
use serde::{Deserialize, Serialize};

/// IK solver type configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum IkSolverType {
    /// Forward And Backward Reaching Inverse Kinematics
    Fabrik {
        iterations: u32,
        tolerance: f32,
    },
    /// Cyclic Coordinate Descent
    Ccd {
        iterations: u32,
        damping: f32,
    },
    /// Analytical two-bone solver (for arms/legs)
    TwoBone {
        pole_vector: [f32; 3],
    },
}

impl Default for IkSolverType {
    fn default() -> Self {
        Self::Fabrik {
            iterations: 10,
            tolerance: 0.001,
        }
    }
}

/// ECS component: an IK chain definition
#[derive(Debug, Component)]
pub struct IkChain {
    /// Unique identifier
    pub id: String,
    /// Joint node IDs from root to end effector
    pub joint_node_ids: Vec<String>,
    /// Target position in world space
    pub target_position: Vec3,
    /// Optional target rotation
    pub target_rotation: Option<Quat>,
    /// Optional pole target (controls bend direction for elbows/knees)
    pub pole_target: Option<Vec3>,
    /// Solver configuration
    pub solver: IkSolverType,
    /// Whether this chain is active
    pub enabled: bool,
}

/// Frontend-facing IK chain info
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IkChainInfo {
    pub id: String,
    pub root_joint: String,
    pub end_effector: String,
    pub joint_count: usize,
    pub solver: String,
    pub enabled: bool,
    pub target_position: [f32; 3],
    pub target_rotation: Option<[f32; 4]>,
    pub pole_target: Option<[f32; 3]>,
}

/// FABRIK solver: iteratively reaches target via forward/backward passes
pub fn solve_fabrik(
    positions: &mut [Vec3],
    target: Vec3,
    iterations: u32,
    tolerance: f32,
) {
    let n = positions.len();
    if n < 2 {
        return;
    }

    // Compute segment lengths
    let lengths: Vec<f32> = (0..n - 1)
        .map(|i| (positions[i + 1] - positions[i]).length())
        .collect();

    let total_length: f32 = lengths.iter().sum();
    let root_pos = positions[0];

    // Check if target is reachable
    let dist_to_target = (target - root_pos).length();
    if dist_to_target > total_length {
        // Target unreachable: stretch toward it
        let dir = (target - root_pos).normalize_or_zero();
        let mut current = root_pos;
        for i in 0..n - 1 {
            positions[i] = current;
            current += dir * lengths[i];
        }
        positions[n - 1] = current;
        return;
    }

    for _ in 0..iterations {
        // Check convergence
        let end_to_target = (positions[n - 1] - target).length();
        if end_to_target < tolerance {
            break;
        }

        // Forward pass: set end effector to target, work backward
        positions[n - 1] = target;
        for i in (0..n - 1).rev() {
            let dir = (positions[i] - positions[i + 1]).normalize_or_zero();
            positions[i] = positions[i + 1] + dir * lengths[i];
        }

        // Backward pass: fix root, work forward
        positions[0] = root_pos;
        for i in 0..n - 1 {
            let dir = (positions[i + 1] - positions[i]).normalize_or_zero();
            positions[i + 1] = positions[i] + dir * lengths[i];
        }
    }
}

/// CCD solver: rotate each joint from end to root to minimize distance
pub fn solve_ccd(
    positions: &mut [Vec3],
    target: Vec3,
    iterations: u32,
    damping: f32,
) {
    let n = positions.len();
    if n < 2 {
        return;
    }

    for _ in 0..iterations {
        let end_to_target = (positions[n - 1] - target).length();
        if end_to_target < 0.001 {
            break;
        }

        // Iterate from end effector's parent back to root
        for i in (0..n - 1).rev() {
            let to_end = (positions[n - 1] - positions[i]).normalize_or_zero();
            let to_target = (target - positions[i]).normalize_or_zero();

            if to_end.length_squared() < 0.0001 || to_target.length_squared() < 0.0001 {
                continue;
            }

            let rotation = Quat::from_rotation_arc(to_end, to_target);
            // Apply damping
            let damped = Quat::IDENTITY.slerp(rotation, damping.clamp(0.0, 1.0));

            // Rotate all joints from i+1 to end around joint i
            for j in (i + 1)..n {
                let relative = positions[j] - positions[i];
                positions[j] = positions[i] + damped * relative;
            }
        }
    }
}

/// Analytical two-bone solver (upper arm + lower arm, or thigh + shin)
pub fn solve_two_bone(
    positions: &mut [Vec3],
    target: Vec3,
    pole_vector: Vec3,
) {
    if positions.len() != 3 {
        return;
    }

    let root = positions[0];
    let len_a = (positions[1] - positions[0]).length();
    let len_b = (positions[2] - positions[1]).length();

    let to_target = target - root;
    let dist = to_target.length().min(len_a + len_b - 0.0001);

    if dist < 0.0001 {
        return;
    }

    // Use law of cosines to find the angle at the middle joint
    let _cos_angle = ((len_a * len_a + len_b * len_b - dist * dist) / (2.0 * len_a * len_b))
        .clamp(-1.0, 1.0);

    // Angle at root joint
    let cos_root_angle = ((len_a * len_a + dist * dist - len_b * len_b) / (2.0 * len_a * dist))
        .clamp(-1.0, 1.0);
    let root_angle = cos_root_angle.acos();

    // Build coordinate frame
    let forward = to_target.normalize_or_zero();
    let pole_dir = (pole_vector - root).normalize_or_zero();

    // Create a plane normal from forward and pole direction
    let side = forward.cross(pole_dir).normalize_or_zero();
    let up = side.cross(forward).normalize_or_zero();

    // Position the middle joint
    let mid_dir = (forward * root_angle.cos() + up * root_angle.sin()).normalize_or_zero();
    positions[1] = root + mid_dir * len_a;

    // Position the end effector
    let end_dir = (target - positions[1]).normalize_or_zero();
    positions[2] = positions[1] + end_dir * len_b;
}

/// Convert solved world positions back to local rotations.
///
/// Given old and new world-space joint positions, compute the rotation
/// needed at each joint to achieve the new positions.
pub fn positions_to_rotations(
    old_positions: &[Vec3],
    new_positions: &[Vec3],
) -> Vec<Quat> {
    let n = old_positions.len();
    let mut rotations = Vec::with_capacity(n);

    for i in 0..n {
        if i + 1 < n {
            let old_dir = (old_positions[i + 1] - old_positions[i]).normalize_or_zero();
            let new_dir = (new_positions[i + 1] - new_positions[i]).normalize_or_zero();

            if old_dir.length_squared() > 0.0001 && new_dir.length_squared() > 0.0001 {
                rotations.push(Quat::from_rotation_arc(old_dir, new_dir));
            } else {
                rotations.push(Quat::IDENTITY);
            }
        } else {
            rotations.push(Quat::IDENTITY);
        }
    }

    rotations
}

/// IK system: solve all enabled IK chains and update Transform components.
///
/// Must run BEFORE transform_propagation.
pub fn ik_solve(world: &mut World) {
    use crate::components::{GlobalTransform, SceneNodeId, Transform};

    // Collect all IK chains
    let chains: Vec<IkChain> = {
        let mut q = world.query::<&IkChain>();
        q.iter(world).map(|c| IkChain {
            id: c.id.clone(),
            joint_node_ids: c.joint_node_ids.clone(),
            target_position: c.target_position,
            target_rotation: c.target_rotation,
            pole_target: c.pole_target,
            solver: c.solver.clone(),
            enabled: c.enabled,
        }).collect()
    };

    for chain in &chains {
        if !chain.enabled {
            continue;
        }

        // Collect current world-space positions for all joints in the chain
        let joint_entities: Vec<Option<Entity>> = chain
            .joint_node_ids
            .iter()
            .map(|node_id| {
                let mut q = world.query::<(Entity, &SceneNodeId)>();
                q.iter(world)
                    .find(|(_, id)| id.0 == *node_id)
                    .map(|(e, _)| e)
            })
            .collect();

        // Skip if any joint is missing
        if joint_entities.iter().any(|e| e.is_none()) {
            continue;
        }

        let entities: Vec<Entity> = joint_entities.into_iter().flatten().collect();

        let old_positions: Vec<Vec3> = entities
            .iter()
            .map(|&e| {
                world
                    .get::<GlobalTransform>(e)
                    .map(|gt| gt.0.col(3).truncate())
                    .unwrap_or(Vec3::ZERO)
            })
            .collect();

        let mut new_positions = old_positions.clone();

        // Solve
        match &chain.solver {
            IkSolverType::Fabrik {
                iterations,
                tolerance,
            } => {
                solve_fabrik(
                    &mut new_positions,
                    chain.target_position,
                    *iterations,
                    *tolerance,
                );
            }
            IkSolverType::Ccd {
                iterations,
                damping,
            } => {
                solve_ccd(
                    &mut new_positions,
                    chain.target_position,
                    *iterations,
                    *damping,
                );
            }
            IkSolverType::TwoBone { pole_vector } => {
                let pole = chain
                    .pole_target
                    .unwrap_or(Vec3::from_array(*pole_vector));
                solve_two_bone(&mut new_positions, chain.target_position, pole);
            }
        }

        // Apply pole constraint if set (for FABRIK/CCD)
        // (Two-bone handles pole internally)

        // Convert positions back to local rotations and apply
        let rotations = positions_to_rotations(&old_positions, &new_positions);

        for (i, &entity) in entities.iter().enumerate() {
            if let Some(mut transform) = world.get_mut::<Transform>(entity) {
                // Apply IK rotation delta to existing rotation
                transform.rotation = rotations[i] * transform.rotation;
                // Update position for root joint only (others follow via hierarchy)
                if i == 0 {
                    transform.position = new_positions[0];
                }
            }
        }
    }
}

/// Parse solver type from string name
pub fn parse_solver_type(solver: &str, iterations: u32, tolerance: f32) -> IkSolverType {
    match solver {
        "ccd" => IkSolverType::Ccd {
            iterations,
            damping: tolerance, // reuse tolerance as damping for CCD
        },
        "two_bone" | "twoBone" => IkSolverType::TwoBone {
            pole_vector: [0.0, 0.0, 1.0],
        },
        _ => IkSolverType::Fabrik {
            iterations,
            tolerance,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fabrik_reaches_target() {
        let mut positions = vec![
            Vec3::new(0.0, 0.0, 0.0),
            Vec3::new(1.0, 0.0, 0.0),
            Vec3::new(2.0, 0.0, 0.0),
        ];
        let target = Vec3::new(1.5, 1.0, 0.0);
        solve_fabrik(&mut positions, target, 20, 0.001);
        let end_dist = (positions[2] - target).length();
        assert!(end_dist < 0.01, "FABRIK should reach target, dist={}", end_dist);
        // Root should stay at origin
        assert!(
            (positions[0] - Vec3::ZERO).length() < 0.01,
            "Root should stay at origin"
        );
    }

    #[test]
    fn test_fabrik_unreachable_stretches() {
        let mut positions = vec![
            Vec3::new(0.0, 0.0, 0.0),
            Vec3::new(1.0, 0.0, 0.0),
            Vec3::new(2.0, 0.0, 0.0),
        ];
        let target = Vec3::new(10.0, 0.0, 0.0); // Beyond total length of 2
        solve_fabrik(&mut positions, target, 20, 0.001);
        // Should stretch toward target
        assert!(positions[2].x > positions[1].x);
        assert!(positions[1].x > positions[0].x);
    }

    #[test]
    fn test_ccd_reaches_target() {
        let mut positions = vec![
            Vec3::new(0.0, 0.0, 0.0),
            Vec3::new(1.0, 0.0, 0.0),
            Vec3::new(2.0, 0.0, 0.0),
        ];
        let target = Vec3::new(1.5, 1.0, 0.0);
        solve_ccd(&mut positions, target, 50, 0.5);
        let end_dist = (positions[2] - target).length();
        assert!(end_dist < 0.1, "CCD should approach target, dist={}", end_dist);
    }

    #[test]
    fn test_two_bone_basic() {
        let mut positions = vec![
            Vec3::new(0.0, 0.0, 0.0),
            Vec3::new(1.0, 0.0, 0.0),
            Vec3::new(2.0, 0.0, 0.0),
        ];
        let target = Vec3::new(1.0, 1.0, 0.0);
        let pole = Vec3::new(0.0, 0.0, 1.0);
        solve_two_bone(&mut positions, target, pole);

        let end_dist = (positions[2] - target).length();
        assert!(
            end_dist < 0.1,
            "Two-bone should reach target, dist={}",
            end_dist
        );

        // Segment lengths should be preserved
        let len_a = (positions[1] - positions[0]).length();
        let len_b = (positions[2] - positions[1]).length();
        assert!((len_a - 1.0).abs() < 0.01, "Segment A length preserved");
        assert!((len_b - 1.0).abs() < 0.01, "Segment B length preserved");
    }

    #[test]
    fn test_positions_to_rotations() {
        let old = vec![
            Vec3::new(0.0, 0.0, 0.0),
            Vec3::new(1.0, 0.0, 0.0),
            Vec3::new(2.0, 0.0, 0.0),
        ];
        let new = vec![
            Vec3::new(0.0, 0.0, 0.0),
            Vec3::new(0.0, 1.0, 0.0),
            Vec3::new(0.0, 2.0, 0.0),
        ];
        let rotations = positions_to_rotations(&old, &new);
        assert_eq!(rotations.len(), 3);
        // First rotation should be ~90 degrees around Z
        let rotated = rotations[0] * Vec3::new(1.0, 0.0, 0.0);
        assert!((rotated.y - 1.0).abs() < 0.01, "Should rotate X to Y");
    }

    #[test]
    fn test_parse_solver_type() {
        match parse_solver_type("fabrik", 10, 0.001) {
            IkSolverType::Fabrik { iterations, tolerance } => {
                assert_eq!(iterations, 10);
                assert!((tolerance - 0.001).abs() < f32::EPSILON);
            }
            _ => panic!("Expected FABRIK"),
        }
        match parse_solver_type("ccd", 20, 0.5) {
            IkSolverType::Ccd { iterations, damping } => {
                assert_eq!(iterations, 20);
                assert!((damping - 0.5).abs() < f32::EPSILON);
            }
            _ => panic!("Expected CCD"),
        }
        match parse_solver_type("two_bone", 0, 0.0) {
            IkSolverType::TwoBone { .. } => {}
            _ => panic!("Expected TwoBone"),
        }
    }
}
