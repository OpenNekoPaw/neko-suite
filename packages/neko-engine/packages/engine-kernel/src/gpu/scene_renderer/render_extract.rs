//! One-way extraction from runtime-scene Simulation ECS into Render World.

use crate::gpu::scene_renderer::asset_cache::MaterialUniforms;
use crate::gpu::scene_renderer::{
    CameraParams, GpuMaterialHandle, GpuMeshHandle, RenderCameraData, RenderInstance,
    RenderLightData, RenderLightKind, RenderMaterialData, RenderWorld,
};
use bevy_ecs::prelude::*;
use glam::{Mat4, Vec3};
use neko_runtime_scene::asset_database::AssetDatabase;
use neko_runtime_scene::components::{
    Camera, CameraProjection, GlobalTransform, Light, LightKind, MaterialRef, MeshRef, SceneNodeId,
    Skeleton, Visible,
};
use neko_runtime_scene::SceneRevision;
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct RenderExtractStats {
    pub instances: usize,
    pub cameras: usize,
    pub lights: usize,
    pub materials: usize,
}

pub fn extract_render_world(
    simulation_world: &mut World,
    asset_database: &AssetDatabase,
    fallback_camera: &CameraParams,
    render_world: &mut RenderWorld,
) -> RenderExtractStats {
    let revision = simulation_world
        .get_resource::<SceneRevision>()
        .map(|revision| revision.current())
        .unwrap_or_default();
    render_world.clear_for_revision(revision);

    extract_instances(simulation_world, asset_database, render_world);
    extract_lights(simulation_world, render_world);
    extract_cameras(simulation_world, fallback_camera, render_world);

    RenderExtractStats {
        instances: render_world.instances.len(),
        cameras: render_world.cameras.len(),
        lights: render_world.lights.len(),
        materials: render_world.materials.len(),
    }
}

fn extract_instances(
    world: &mut World,
    asset_database: &AssetDatabase,
    render_world: &mut RenderWorld,
) {
    let skeleton_joint_matrices = extract_skeleton_joint_matrices(world);
    let fallback_joint_matrices = skeleton_joint_matrices.values().next().cloned();
    let mut material_handles = HashSet::new();
    let mut query = world.query::<(
        Entity,
        &SceneNodeId,
        &GlobalTransform,
        &MeshRef,
        Option<&MaterialRef>,
        Option<&Visible>,
    )>();

    for (entity, node_id, global_transform, mesh_ref, material_ref, visible) in query.iter(world) {
        if visible.is_some_and(|visible| !visible.0) {
            continue;
        }

        let material = material_ref.map(|material| GpuMaterialHandle {
            uri: material.uri.clone(),
            material_index: material.material_index,
        });

        if let Some(material_ref) = material_ref {
            if material_handles.insert(material_ref.asset.clone()) {
                if let Some(descriptor) = asset_database.material(&material_ref.asset) {
                    render_world.materials.push(RenderMaterialData {
                        handle: GpuMaterialHandle {
                            uri: material_ref.uri.clone(),
                            material_index: material_ref.material_index,
                        },
                        uniforms: MaterialUniforms {
                            base_color_factor: descriptor.base_color_factor,
                            metallic_factor: descriptor.metallic_factor,
                            roughness_factor: descriptor.roughness_factor,
                            occlusion_strength: descriptor.occlusion_strength,
                            _pad0: 0.0,
                            emissive_factor: descriptor.emissive_factor,
                            _pad1: 0.0,
                        },
                    });
                }
            }
        }

        render_world.push_instance(RenderInstance {
            node_id: node_id.0.clone(),
            world_transform: global_transform.0,
            mesh: GpuMeshHandle {
                uri: mesh_ref.uri.clone(),
                primitive_index: mesh_ref.primitive_index,
            },
            material,
            visible: true,
            layer_mask: None,
            joint_matrices: skeleton_joint_matrices
                .get(&entity)
                .cloned()
                .or_else(|| fallback_joint_matrices.clone()),
        });
    }
}

fn extract_skeleton_joint_matrices(world: &mut World) -> HashMap<Entity, Vec<Mat4>> {
    let skeletons: Vec<(Entity, Vec<Entity>, Vec<Mat4>)> = {
        let mut query = world.query::<(Entity, &Skeleton)>();
        query
            .iter(world)
            .map(|(entity, skeleton)| {
                (
                    entity,
                    skeleton.joint_entities.clone(),
                    skeleton.inverse_bind_matrices.clone(),
                )
            })
            .collect()
    };

    skeletons
        .into_iter()
        .map(|(entity, joint_entities, inverse_bind_matrices)| {
            let matrices = joint_entities
                .iter()
                .enumerate()
                .map(|(index, joint_entity)| {
                    let joint_global = world
                        .get::<GlobalTransform>(*joint_entity)
                        .map(|transform| transform.0)
                        .unwrap_or(Mat4::IDENTITY);
                    let inverse_bind = inverse_bind_matrices
                        .get(index)
                        .copied()
                        .unwrap_or(Mat4::IDENTITY);
                    joint_global * inverse_bind
                })
                .collect();
            (entity, matrices)
        })
        .collect()
}

fn extract_lights(world: &mut World, render_world: &mut RenderWorld) {
    let mut query = world.query::<(&SceneNodeId, &GlobalTransform, &Light, Option<&Visible>)>();
    for (node_id, global_transform, light, visible) in query.iter(world) {
        if visible.is_some_and(|visible| !visible.0) {
            continue;
        }

        let (kind, inner_cone, outer_cone) = match light.kind {
            LightKind::Directional => (RenderLightKind::Directional, None, None),
            LightKind::Point => (RenderLightKind::Point, None, None),
            LightKind::Spot {
                inner_cone,
                outer_cone,
            } => (RenderLightKind::Spot, Some(inner_cone), Some(outer_cone)),
        };

        render_world.lights.push(RenderLightData {
            node_id: node_id.0.clone(),
            kind,
            world_transform: global_transform.0,
            color: light.color,
            intensity: light.intensity,
            range: None,
            inner_cone,
            outer_cone,
        });
    }
}

fn extract_cameras(
    world: &mut World,
    fallback_camera: &CameraParams,
    render_world: &mut RenderWorld,
) {
    let mut query = world.query::<(&SceneNodeId, &GlobalTransform, &Camera, Option<&Visible>)>();
    for (node_id, global_transform, camera, visible) in query.iter(world) {
        if visible.is_some_and(|visible| !visible.0) {
            continue;
        }

        render_world.push_camera(
            RenderCameraData {
                node_id: Some(node_id.0.clone()),
                view: global_transform.0.inverse(),
                projection: projection_matrix(camera),
                position: global_transform.0.transform_point3(Vec3::ZERO),
                near: camera.near,
                far: camera.far,
            },
            render_world.active_camera_index.is_none(),
        );
    }

    if render_world.cameras.is_empty() {
        render_world.push_camera(
            RenderCameraData {
                node_id: None,
                view: fallback_camera.view_matrix(),
                projection: fallback_camera.projection_matrix(16.0 / 9.0),
                position: fallback_camera.position,
                near: fallback_camera.near,
                far: fallback_camera.far,
            },
            true,
        );
    }
}

fn projection_matrix(camera: &Camera) -> Mat4 {
    match camera.projection {
        CameraProjection::Perspective { fov, aspect_ratio } => {
            Mat4::perspective_rh(fov, aspect_ratio, camera.near, camera.far)
        }
        CameraProjection::Orthographic { xmag, ymag } => {
            Mat4::orthographic_rh(-xmag, xmag, -ymag, ymag, camera.near, camera.far)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use neko_runtime_scene::asset_database::{AssetDescriptor, AssetHandle, MaterialDescriptor};
    use neko_runtime_scene::components::{NodeName, Transform};

    #[test]
    fn extract_render_world_copies_simulation_data_without_mutating_ecs() {
        let mut simulation = World::new();
        simulation.insert_resource(SceneRevision(3));

        let mesh_handle = AssetHandle::for_mesh("model.glb", 0);
        let material_handle = AssetHandle::for_material("model.glb", 1);
        let mut database = AssetDatabase::default();
        let mut material = MaterialDescriptor::new(material_handle.clone());
        material.base_color_factor = [0.2, 0.3, 0.4, 1.0];
        material.metallic_factor = 0.7;
        database.insert_descriptor(AssetDescriptor::Material(material));

        simulation.spawn((
            SceneNodeId("mesh_node".to_string()),
            NodeName("Mesh".to_string()),
            Transform::default(),
            GlobalTransform(Mat4::from_translation(Vec3::new(1.0, 2.0, 3.0))),
            MeshRef {
                asset: mesh_handle,
                uri: "model.glb".to_string(),
                primitive_index: 0,
            },
            MaterialRef {
                asset: material_handle,
                uri: "model.glb".to_string(),
                material_index: 1,
            },
        ));

        simulation.spawn((
            SceneNodeId("light_node".to_string()),
            GlobalTransform(Mat4::IDENTITY),
            Light {
                kind: LightKind::Directional,
                color: Vec3::ONE,
                intensity: 2.0,
            },
        ));

        let mut render_world = RenderWorld::default();
        let stats = extract_render_world(
            &mut simulation,
            &database,
            &CameraParams::default(),
            &mut render_world,
        );

        assert_eq!(stats.instances, 1);
        assert_eq!(stats.lights, 1);
        assert_eq!(stats.materials, 1);
        assert_eq!(render_world.scene_revision, 3);
        assert_eq!(render_world.instances[0].node_id, "mesh_node");
        assert_eq!(
            render_world.materials[0].uniforms.base_color_factor,
            [0.2, 0.3, 0.4, 1.0]
        );
        assert!(simulation.get_resource::<SceneRevision>().is_some());
    }
}
