//! Snapshot-based scene renderer.
//!
//! SceneRenderer consumes RenderWorld snapshots and owns GPU rendering state. It
//! intentionally does not import runtime-scene DataAccess or the live ECS World.

use std::sync::{Arc, Mutex};

use tokio::sync::{mpsc, watch};

use crate::error::{Error, Result};
use neko_engine_gpu::GpuContext;
use neko_engine_scene_renderer::{
    AssetCache, CameraParams, EnvironmentBackground, EnvironmentBackgroundSettings, PbrRenderer,
    RenderTargetPoolSnapshot, RenderWorld, SceneRenderOutput, ViewportDescriptor,
    ViewportRenderGraphOutput,
};

pub const SCENE_EXPORT_QUEUE_CAPACITY: usize = 1;

#[derive(Debug, Clone, Default)]
pub struct SceneRenderSnapshot {
    #[cfg_attr(not(test), allow(dead_code))]
    pub generation: u64,
    #[cfg_attr(not(test), allow(dead_code))]
    pub render_world: RenderWorld,
}

pub struct SceneSnapshotWatch {
    tx: watch::Sender<SceneRenderSnapshot>,
}

impl SceneSnapshotWatch {
    pub fn new(initial: SceneRenderSnapshot) -> (Self, watch::Receiver<SceneRenderSnapshot>) {
        let (tx, rx) = watch::channel(initial);
        (Self { tx }, rx)
    }

    pub fn publish(&self, snapshot: SceneRenderSnapshot) -> Result<()> {
        self.tx.send_replace(snapshot);
        Ok(())
    }

    #[allow(dead_code)]
    pub fn subscribe(&self) -> watch::Receiver<SceneRenderSnapshot> {
        self.tx.subscribe()
    }

    #[cfg(test)]
    pub fn latest_generation(&self) -> u64 {
        self.tx.borrow().generation
    }
}

pub struct SceneExportFrameQueue {
    tx: mpsc::Sender<SceneRenderSnapshot>,
    rx: Mutex<mpsc::Receiver<SceneRenderSnapshot>>,
    #[cfg(test)]
    capacity: usize,
}

impl SceneExportFrameQueue {
    pub fn bounded() -> Self {
        let (tx, rx) = mpsc::channel(SCENE_EXPORT_QUEUE_CAPACITY);
        Self {
            tx,
            rx: Mutex::new(rx),
            #[cfg(test)]
            capacity: SCENE_EXPORT_QUEUE_CAPACITY,
        }
    }

    #[cfg(test)]
    pub fn capacity(&self) -> usize {
        self.capacity
    }

    pub fn try_push(&self, snapshot: SceneRenderSnapshot) -> Result<()> {
        self.tx.try_send(snapshot).map_err(|error| match error {
            mpsc::error::TrySendError::Full(_) => {
                Error::Other("Scene export frame queue is full".to_string())
            }
            mpsc::error::TrySendError::Closed(_) => {
                Error::Other("Scene export frame queue closed".to_string())
            }
        })
    }

    pub fn try_pop(&self) -> Result<Option<SceneRenderSnapshot>> {
        let mut rx = self
            .rx
            .lock()
            .map_err(|_| Error::Other("Scene export frame queue lock poisoned".to_string()))?;
        match rx.try_recv() {
            Ok(snapshot) => Ok(Some(snapshot)),
            Err(mpsc::error::TryRecvError::Empty) => Ok(None),
            Err(mpsc::error::TryRecvError::Disconnected) => {
                Err(Error::Other("Scene export frame queue closed".to_string()))
            }
        }
    }
}

pub struct SceneRenderRequest<'a> {
    pub snapshot: &'a RenderWorld,
    pub camera: &'a CameraParams,
    pub output_size: (u32, u32),
    pub background_color: Option<[f32; 4]>,
    pub environment_background: Option<&'a EnvironmentBackground>,
    pub viewport_graph: Option<(&'a ViewportDescriptor, ViewportRenderGraphOutput)>,
}

pub struct SceneRenderer {
    renderer: Mutex<PbrRenderer>,
    asset_cache: Mutex<AssetCache>,
    generation: SceneRenderGenerationTracker,
}

#[derive(Debug, Default)]
struct SceneRenderGenerationTracker {
    last_generation: Mutex<Option<u64>>,
}

impl SceneRenderGenerationTracker {
    #[cfg(test)]
    fn should_render(&self, generation: u64) -> bool {
        self.last_generation
            .lock()
            .map(|last| *last != Some(generation))
            .unwrap_or(true)
    }

    fn record(&self, generation: u64) -> Result<()> {
        let mut last = self
            .last_generation
            .lock()
            .map_err(|_| Error::Other("SceneRenderer generation lock poisoned".to_string()))?;
        *last = Some(generation);
        Ok(())
    }
}

impl SceneRenderer {
    pub fn new(ctx: Arc<GpuContext>) -> Self {
        let (renderer, material_bgl) = PbrRenderer::new(Arc::clone(&ctx));
        let asset_cache = AssetCache::new(ctx, material_bgl);
        Self {
            renderer: Mutex::new(renderer),
            asset_cache: Mutex::new(asset_cache),
            generation: SceneRenderGenerationTracker::default(),
        }
    }

    pub fn load_gltf(&self, path: &std::path::Path) -> Result<()> {
        let mut cache = self
            .asset_cache
            .lock()
            .map_err(|e| Error::Other(format!("Asset cache lock poisoned: {}", e)))?;
        cache
            .replace_gltf(path)
            .map_err(|error| Error::Other(error.to_string()))
    }

    pub fn register_procedural_mesh(
        &self,
        uri: &str,
        primitive_index: usize,
        mesh: &neko_runtime_scene::procedural_mesh::ProceduralMesh,
    ) -> Result<()> {
        let mut cache = self
            .asset_cache
            .lock()
            .map_err(|e| Error::Other(format!("Asset cache lock poisoned: {}", e)))?;
        cache
            .register_procedural_mesh(uri, primitive_index, mesh)
            .map_err(|error| Error::Other(error.to_string()))
    }

    pub fn record_mesh_dirty_region(
        &self,
        dirty_region: &neko_runtime_scene::modeling_session::MeshDirtyRegion,
    ) -> Result<()> {
        let cache = self
            .asset_cache
            .lock()
            .map_err(|e| Error::Other(format!("Asset cache lock poisoned: {}", e)))?;
        cache.record_mesh_dirty_region(dirty_region);
        Ok(())
    }

    pub fn update_material_uniforms(
        &self,
        uri: &str,
        material_index: usize,
        base_color: Option<[f32; 4]>,
        metallic: Option<f32>,
        roughness: Option<f32>,
        emissive: Option<[f32; 3]>,
        occlusion_strength: Option<f32>,
    ) -> Result<()> {
        let cache = self
            .asset_cache
            .lock()
            .map_err(|e| Error::Other(format!("Asset cache lock poisoned: {}", e)))?;
        cache
            .update_material_uniforms(
                uri,
                material_index,
                base_color,
                metallic,
                roughness,
                emissive,
                occlusion_strength,
            )
            .map_err(Error::Other)
    }

    pub fn create_environment_background(
        &self,
        width: u32,
        height: u32,
        rgba_data: &[u8],
        settings: EnvironmentBackgroundSettings,
    ) -> Result<EnvironmentBackground> {
        let renderer = self
            .renderer
            .lock()
            .map_err(|e| Error::Other(format!("Renderer lock poisoned: {}", e)))?;
        renderer
            .create_environment_background(width, height, rgba_data, settings)
            .map_err(|e| Error::Other(format!("Environment background upload failed: {}", e)))
    }

    pub fn render(
        &self,
        generation: u64,
        request: SceneRenderRequest<'_>,
    ) -> Result<SceneRenderOutput> {
        let renderer = self
            .renderer
            .lock()
            .map_err(|e| Error::Other(format!("Renderer lock poisoned: {}", e)))?;
        let cache = self
            .asset_cache
            .lock()
            .map_err(|e| Error::Other(format!("Asset cache lock poisoned: {}", e)))?;
        let output = match request.viewport_graph {
            Some((descriptor, graph_output)) => renderer.render_viewport_from_render_world(
                request.snapshot,
                &cache,
                request.camera,
                request.output_size,
                request.background_color,
                request.environment_background,
                descriptor,
                graph_output,
            ),
            None => renderer.render_from_render_world_with_environment(
                request.snapshot,
                &cache,
                request.camera,
                request.output_size,
                request.background_color,
                request.environment_background,
            ),
        }
        .map_err(|e| Error::Other(format!("PBR render failed: {}", e)))?;
        self.record_generation(generation)?;
        Ok(output)
    }

    pub fn render_target_pool_snapshot(&self) -> RenderTargetPoolSnapshot {
        self.renderer
            .lock()
            .map(|renderer| renderer.render_target_pool_snapshot())
            .unwrap_or_default()
    }

    fn record_generation(&self, generation: u64) -> Result<()> {
        self.generation.record(generation)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn watch_snapshots_keep_latest_generation() {
        let (watch, rx) = SceneSnapshotWatch::new(SceneRenderSnapshot::default());
        watch
            .publish(SceneRenderSnapshot {
                generation: 2,
                render_world: RenderWorld::default(),
            })
            .unwrap();
        assert_eq!(rx.borrow().generation, 2);
        assert_eq!(rx.borrow().render_world.draw_list.len(), 0);
    }

    #[test]
    fn export_queue_is_bounded_to_one_frame() {
        let queue = SceneExportFrameQueue::bounded();
        assert_eq!(queue.capacity(), SCENE_EXPORT_QUEUE_CAPACITY);
        queue
            .try_push(SceneRenderSnapshot {
                generation: 1,
                render_world: RenderWorld::default(),
            })
            .unwrap();

        let err = queue
            .try_push(SceneRenderSnapshot {
                generation: 2,
                render_world: RenderWorld::default(),
            })
            .unwrap_err();
        assert!(err.to_string().contains("queue is full"));

        let popped = queue.try_pop().unwrap().unwrap();
        assert_eq!(popped.generation, 1);
    }

    #[test]
    fn renderer_generation_guard_skips_repeated_snapshot() {
        let tracker = SceneRenderGenerationTracker::default();
        assert!(tracker.should_render(1));
        tracker.record(1).unwrap();
        assert!(!tracker.should_render(1));
        assert!(tracker.should_render(2));
    }
}
