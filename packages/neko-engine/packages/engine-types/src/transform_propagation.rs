//! Shared transform propagation algorithm.
//!
//! Runtime crates own ECS queries and component storage. This module only owns
//! hierarchy traversal and local-to-global composition.

use std::ops::Mul;

/// Propagates transforms through a hierarchy supplied by a runtime-specific
/// adapter.
pub fn propagate_transform_hierarchy<Entity, Matrix, Children, Local, Write>(
    roots: &[Entity],
    identity: Matrix,
    mut children_of: Children,
    mut local_matrix: Local,
    mut write_global: Write,
) where
    Entity: Copy,
    Matrix: Copy + Mul<Output = Matrix>,
    Children: FnMut(Entity) -> Vec<Entity>,
    Local: FnMut(Entity) -> Option<Matrix>,
    Write: FnMut(Entity, Matrix),
{
    for &root in roots {
        propagate_entity(
            root,
            identity,
            &mut children_of,
            &mut local_matrix,
            &mut write_global,
        );
    }
}

fn propagate_entity<Entity, Matrix, Children, Local, Write>(
    entity: Entity,
    parent_global: Matrix,
    children_of: &mut Children,
    local_matrix: &mut Local,
    write_global: &mut Write,
) where
    Entity: Copy,
    Matrix: Copy + Mul<Output = Matrix>,
    Children: FnMut(Entity) -> Vec<Entity>,
    Local: FnMut(Entity) -> Option<Matrix>,
    Write: FnMut(Entity, Matrix),
{
    let Some(local) = local_matrix(entity) else {
        return;
    };
    let global = parent_global * local;
    write_global(entity, global);

    for child in children_of(entity) {
        propagate_entity(child, global, children_of, local_matrix, write_global);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn propagates_roots_and_children() {
        let roots = vec![1];
        let children = HashMap::from([(1, vec![2, 3]), (2, vec![4])]);
        let locals = HashMap::from([(1, 10), (2, 5), (3, 7), (4, 2)]);
        let mut globals = HashMap::new();

        propagate_transform_hierarchy(
            &roots,
            1,
            |entity| children.get(&entity).cloned().unwrap_or_default(),
            |entity| locals.get(&entity).copied(),
            |entity, global| {
                globals.insert(entity, global);
            },
        );

        assert_eq!(globals.get(&1), Some(&10));
        assert_eq!(globals.get(&2), Some(&50));
        assert_eq!(globals.get(&3), Some(&70));
        assert_eq!(globals.get(&4), Some(&100));
    }

    #[test]
    fn skips_entities_without_local_transform() {
        let roots = vec![1];
        let children = HashMap::from([(1, vec![2])]);
        let locals = HashMap::from([(2, 5)]);
        let mut globals = HashMap::new();

        propagate_transform_hierarchy(
            &roots,
            1,
            |entity| children.get(&entity).cloned().unwrap_or_default(),
            |entity| locals.get(&entity).copied(),
            |entity, global| {
                globals.insert(entity, global);
            },
        );

        assert!(globals.is_empty());
    }
}
