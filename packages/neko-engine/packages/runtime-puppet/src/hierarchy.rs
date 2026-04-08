//! Parent-child hierarchy for 2D puppet nodes
//!
//! Mirrors runtime-scene's hierarchy module — dual representation
//! with Parent (single parent) and Children (child list) components.

use bevy_ecs::prelude::*;

/// Reference to the parent entity
#[derive(Component, Debug, Clone)]
pub struct Parent(pub Entity);

/// List of child entities
#[derive(Component, Debug, Clone)]
pub struct Children(pub Vec<Entity>);

/// Set the parent of a child entity, maintaining bidirectional consistency
pub fn set_parent(world: &mut World, child: Entity, parent: Entity) {
    // Remove from old parent's children list
    if let Some(old_parent) = world.get::<Parent>(child) {
        let old_parent_entity = old_parent.0;
        if let Some(mut old_children) = world.get_mut::<Children>(old_parent_entity) {
            old_children.0.retain(|&e| e != child);
        }
    }

    // Set new parent on child
    world.entity_mut(child).insert(Parent(parent));

    // Add to new parent's children list
    if let Some(mut children) = world.get_mut::<Children>(parent) {
        if !children.0.contains(&child) {
            children.0.push(child);
        }
    } else {
        world.entity_mut(parent).insert(Children(vec![child]));
    }
}

/// Collect all descendants of an entity via DFS traversal
pub fn get_descendants(world: &World, entity: Entity) -> Vec<Entity> {
    let mut result = Vec::new();
    let mut stack = vec![entity];

    while let Some(current) = stack.pop() {
        if current != entity {
            result.push(current);
        }
        if let Some(children) = world.get::<Children>(current) {
            for &child in children.0.iter().rev() {
                stack.push(child);
            }
        }
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_set_parent() {
        let mut world = World::new();
        let parent = world.spawn_empty().id();
        let child = world.spawn_empty().id();

        set_parent(&mut world, child, parent);

        assert_eq!(world.get::<Parent>(child).unwrap().0, parent);
        assert!(world.get::<Children>(parent).unwrap().0.contains(&child));
    }

    #[test]
    fn test_reparent() {
        let mut world = World::new();
        let parent_a = world.spawn_empty().id();
        let parent_b = world.spawn_empty().id();
        let child = world.spawn_empty().id();

        set_parent(&mut world, child, parent_a);
        set_parent(&mut world, child, parent_b);

        assert_eq!(world.get::<Parent>(child).unwrap().0, parent_b);
        assert!(!world.get::<Children>(parent_a).unwrap().0.contains(&child));
        assert!(world.get::<Children>(parent_b).unwrap().0.contains(&child));
    }

    #[test]
    fn test_get_descendants() {
        let mut world = World::new();
        let root = world.spawn_empty().id();
        let child_a = world.spawn_empty().id();
        let child_b = world.spawn_empty().id();
        let grandchild = world.spawn_empty().id();

        set_parent(&mut world, child_a, root);
        set_parent(&mut world, child_b, root);
        set_parent(&mut world, grandchild, child_a);

        let descendants = get_descendants(&world, root);
        assert_eq!(descendants.len(), 3);
        assert!(descendants.contains(&child_a));
        assert!(descendants.contains(&child_b));
        assert!(descendants.contains(&grandchild));
    }
}
