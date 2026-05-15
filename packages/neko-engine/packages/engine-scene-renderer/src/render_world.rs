//! Render World data model for 3D scene rendering.
//!
//! Render World is derived from runtime-scene Simulation ECS data. It stores
//! render-only copies, GPU cache keys, and draw ordering data, but never stores
//! live ECS component references.

use crate::asset_cache::MaterialUniforms;
use glam::{Mat4, Vec3};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct GpuMeshHandle {
    pub uri: String,
    pub primitive_index: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct GpuMaterialHandle {
    pub uri: String,
    pub material_index: usize,
}

#[derive(Debug, Clone)]
pub struct RenderInstance {
    pub node_id: String,
    pub world_transform: Mat4,
    pub mesh: GpuMeshHandle,
    pub material: Option<GpuMaterialHandle>,
    pub visible: bool,
    pub layer_mask: Option<u32>,
    pub joint_matrices: Option<Vec<Mat4>>,
}

#[derive(Debug, Clone)]
pub struct DrawItem {
    pub instance_index: usize,
    pub sort_key: u64,
}

#[derive(Debug, Clone)]
pub struct RenderCameraData {
    pub node_id: Option<String>,
    pub view: Mat4,
    pub projection: Mat4,
    pub position: Vec3,
    pub near: f32,
    pub far: f32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RenderLightKind {
    Directional,
    Point,
    Spot,
}

#[derive(Debug, Clone)]
pub struct RenderLightData {
    pub node_id: String,
    pub kind: RenderLightKind,
    pub world_transform: Mat4,
    pub color: Vec3,
    pub intensity: f32,
    pub range: Option<f32>,
    pub inner_cone: Option<f32>,
    pub outer_cone: Option<f32>,
}

#[derive(Debug, Clone)]
pub struct RenderMaterialData {
    pub handle: GpuMaterialHandle,
    pub uniforms: MaterialUniforms,
}

#[derive(Debug, Clone, Default)]
pub struct RenderWorld {
    pub scene_revision: u64,
    pub instances: Vec<RenderInstance>,
    pub cameras: Vec<RenderCameraData>,
    pub active_camera_index: Option<usize>,
    pub lights: Vec<RenderLightData>,
    pub materials: Vec<RenderMaterialData>,
    pub draw_list: Vec<DrawItem>,
}

impl RenderWorld {
    pub fn clear_for_revision(&mut self, scene_revision: u64) {
        self.scene_revision = scene_revision;
        self.instances.clear();
        self.cameras.clear();
        self.active_camera_index = None;
        self.lights.clear();
        self.materials.clear();
        self.draw_list.clear();
    }

    pub fn push_instance(&mut self, instance: RenderInstance) -> usize {
        let instance_index = self.instances.len();
        let sort_key = build_draw_sort_key(&instance);
        self.instances.push(instance);
        self.draw_list.push(DrawItem {
            instance_index,
            sort_key,
        });
        instance_index
    }

    pub fn push_camera(&mut self, camera: RenderCameraData, active: bool) -> usize {
        let camera_index = self.cameras.len();
        self.cameras.push(camera);
        if active || self.active_camera_index.is_none() {
            self.active_camera_index = Some(camera_index);
        }
        camera_index
    }
}

fn build_draw_sort_key(instance: &RenderInstance) -> u64 {
    let material_hash = instance
        .material
        .as_ref()
        .map(|material| stable_hash(&material.uri) ^ material.material_index as u64)
        .unwrap_or_default();
    let mesh_hash = stable_hash(&instance.mesh.uri) ^ instance.mesh.primitive_index as u64;
    (material_hash & 0xffff_ffff) << 32 | (mesh_hash & 0xffff_ffff)
}

fn stable_hash(value: &str) -> u64 {
    let mut hash = 0xcbf2_9ce4_8422_2325_u64;
    for byte in value.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    hash
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mesh_handle() -> GpuMeshHandle {
        GpuMeshHandle {
            uri: "model.glb".to_string(),
            primitive_index: 0,
        }
    }

    #[test]
    fn render_world_tracks_instances_and_draw_list_without_ecs_refs() {
        let mut world = RenderWorld::default();
        world.clear_for_revision(7);

        let index = world.push_instance(RenderInstance {
            node_id: "node_1".to_string(),
            world_transform: Mat4::IDENTITY,
            mesh: mesh_handle(),
            material: Some(GpuMaterialHandle {
                uri: "model.glb".to_string(),
                material_index: 2,
            }),
            visible: true,
            layer_mask: Some(1),
            joint_matrices: None,
        });

        assert_eq!(world.scene_revision, 7);
        assert_eq!(index, 0);
        assert_eq!(world.instances[0].node_id, "node_1");
        assert_eq!(world.draw_list[0].instance_index, 0);
    }

    #[test]
    fn clear_for_revision_discards_derived_render_state() {
        let mut world = RenderWorld::default();
        world.push_instance(RenderInstance {
            node_id: "node_1".to_string(),
            world_transform: Mat4::IDENTITY,
            mesh: mesh_handle(),
            material: None,
            visible: true,
            layer_mask: None,
            joint_matrices: None,
        });

        world.clear_for_revision(8);

        assert_eq!(world.scene_revision, 8);
        assert!(world.instances.is_empty());
        assert!(world.draw_list.is_empty());
    }
}
