//! INP file loader — converts Inochi2D puppet files into ECS entities
//!
//! Uses the inox2d crate to parse INP format, then maps the puppet tree
//! to bevy_ecs entities with appropriate components.

use crate::components::*;
use crate::hierarchy;
use bevy_ecs::prelude::*;
use glam::Vec2;
use thiserror::Error;

/// Result of loading a puppet file
#[derive(Debug)]
pub struct LoadResult {
    pub root_entity: Entity,
    pub entity_count: usize,
    pub parameter_count: usize,
}

/// Error type for puppet loading
#[derive(Error, Debug)]
pub enum LoadError {
    #[error("Failed to parse INP file: {0}")]
    ParseError(String),

    #[error("Invalid puppet data: {0}")]
    InvalidData(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Unsupported puppet version: {0}")]
    UnsupportedVersion(String),
}

/// Load an INP puppet file into the ECS world
///
/// Parses the INP binary format using inox2d, creates entities for each
/// puppet node, establishes parent-child hierarchy, and sets up parameter
/// bindings for deformation.
pub fn load_inp(world: &mut World, data: &[u8]) -> Result<LoadResult, LoadError> {
    // Parse INP using inox2d
    let puppet = inox2d::format::inp::parse_inp(data)
        .map_err(|e| LoadError::ParseError(format!("{:?}", e)))?;

    let mut entity_count = 0;

    // Spawn puppet root entity
    let root_entity = world
        .spawn((
            PuppetRoot,
            PuppetNodeId("puppet_root".to_string()),
            NodeName("Puppet".to_string()),
            Transform2D::default(),
            GlobalTransform2D::default(),
            PuppetNodeType::Root,
            ZOrder(0.0),
            Opacity::default(),
        ))
        .id();
    entity_count += 1;

    // Extract and store parameters
    let param_defs: Vec<ParameterDef> = puppet
        .puppet
        .parameters
        .iter()
        .map(|p| ParameterDef {
            name: p.name.clone(),
            min: p.axis_min.x.min(p.axis_min.y),
            max: p.axis_max.x.max(p.axis_max.y),
            default: p.defaults.x,
            current: p.defaults.x,
        })
        .collect();

    let param_count = param_defs.len();
    world
        .entity_mut(root_entity)
        .insert(PuppetParameters { params: param_defs });

    // Walk the puppet node tree and spawn ECS entities
    let root_node_id = puppet.puppet.nodes.root_node_id();
    let tree = &puppet.puppet.nodes;

    // Build a map from inox2d node ID → ECS entity
    let mut node_entity_map = std::collections::HashMap::new();
    node_entity_map.insert(root_node_id, root_entity);

    // BFS traversal of the puppet tree
    let mut queue = std::collections::VecDeque::new();
    for &child_id in tree.children_of(root_node_id) {
        queue.push_back((child_id, root_entity));
    }

    while let Some((node_id, parent_entity)) = queue.pop_front() {
        let node = &tree.arena[node_id];

        let node_type = classify_node(node);
        let transform = extract_transform(node);

        let entity = world
            .spawn((
                PuppetNodeId(format!("node_{}", node_id.into_raw_parts().0)),
                NodeName(node.name.clone()),
                transform,
                GlobalTransform2D::default(),
                node_type,
                ZOrder(node.zsort),
                Opacity(node.opacity),
                BlendMode::default(),
            ))
            .id();
        entity_count += 1;

        // Add mesh data if this is a drawable node
        if let Some(mesh) = extract_mesh_data(node) {
            world.entity_mut(entity).insert(mesh);
        }

        // Set up hierarchy
        hierarchy::set_parent(world, entity, parent_entity);
        node_entity_map.insert(node_id, entity);

        // Enqueue children
        for &child_id in tree.children_of(node_id) {
            queue.push_back((child_id, entity));
        }
    }

    // Set up parameter bindings from puppet parameter definitions
    // TODO(P1): extract actual parameter bindings from inox2d puppet data
    // The inox2d library's binding API may change; for now, bindings are
    // created when set_parameter is called from the frontend

    tracing::info!(
        "Loaded puppet: {} entities, {} parameters",
        entity_count,
        param_count
    );

    Ok(LoadResult {
        root_entity,
        entity_count,
        parameter_count: param_count,
    })
}

/// Classify an inox2d node into our PuppetNodeType
fn classify_node(node: &inox2d::nodes::node::InoxNode) -> PuppetNodeType {
    use inox2d::nodes::node::InoxNodeData;
    match &node.data {
        InoxNodeData::Part { .. } => PuppetNodeType::Part,
        InoxNodeData::Composite { .. } => PuppetNodeType::Composite,
        _ => PuppetNodeType::Group,
    }
}

/// Extract Transform2D from an inox2d node
fn extract_transform(node: &inox2d::nodes::node::InoxNode) -> Transform2D {
    Transform2D {
        position: Vec2::new(
            node.transform.translate.x,
            node.transform.translate.y,
        ),
        rotation: node.transform.rotation.z,
        scale: Vec2::new(
            node.transform.scale.x,
            node.transform.scale.y,
        ),
    }
}

/// Extract mesh data from an inox2d Part node
fn extract_mesh_data(node: &inox2d::nodes::node::InoxNode) -> Option<MeshData> {
    use inox2d::nodes::node::InoxNodeData;
    match &node.data {
        InoxNodeData::Part { mesh, .. } => {
            let vertices: Vec<Vec2> = mesh
                .vertices
                .iter()
                .map(|v| Vec2::new(v.x, v.y))
                .collect();
            let uvs: Vec<Vec2> = mesh
                .uvs
                .iter()
                .map(|v| Vec2::new(v.x, v.y))
                .collect();
            let indices: Vec<u16> = mesh.indices.clone();

            Some(MeshData {
                vertices,
                uvs,
                indices,
            })
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_load_empty_data_returns_error() {
        let mut world = World::new();
        let result = load_inp(&mut world, &[]);
        assert!(result.is_err());
    }

    #[test]
    fn test_load_invalid_data_returns_error() {
        let mut world = World::new();
        let result = load_inp(&mut world, b"not a valid inp file");
        assert!(result.is_err());
    }
}
