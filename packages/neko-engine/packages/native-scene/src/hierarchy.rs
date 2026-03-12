//! Scene graph hierarchy management
//!
//! Provides Parent/Children components and traversal utilities.

use bevy_ecs::prelude::*;

/// Parent relationship
#[derive(Component, Clone, Debug)]
pub struct Parent(pub Entity);

/// Children list
#[derive(Component, Clone, Debug, Default)]
pub struct Children(pub Vec<Entity>);

impl Children {
    pub fn add(&mut self, child: Entity) {
        if !self.0.contains(&child) {
            self.0.push(child);
        }
    }

    pub fn remove(&mut self, child: Entity) {
        self.0.retain(|e| *e != child);
    }
}

/// Set parent-child relationship in the world
pub fn set_parent(world: &mut World, child: Entity, parent: Entity) {
    // Remove from old parent
    if let Some(old_parent) = world.get::<Parent>(child) {
        let old_parent_entity = old_parent.0;
        if let Some(mut children) = world.get_mut::<Children>(old_parent_entity) {
            children.remove(child);
        }
    }

    // Set new parent
    world.entity_mut(child).insert(Parent(parent));

    // Add to new parent's children
    if let Some(mut children) = world.get_mut::<Children>(parent) {
        children.add(child);
    } else {
        let mut children = Children::default();
        children.add(child);
        world.entity_mut(parent).insert(children);
    }
}

/// Get all descendants of an entity (depth-first)
pub fn get_descendants(world: &World, entity: Entity) -> Vec<Entity> {
    let mut result = Vec::new();
    collect_descendants(world, entity, &mut result);
    result
}

fn collect_descendants(world: &World, entity: Entity, result: &mut Vec<Entity>) {
    if let Some(children) = world.get::<Children>(entity) {
        for &child in &children.0 {
            result.push(child);
            collect_descendants(world, child, result);
        }
    }
}
