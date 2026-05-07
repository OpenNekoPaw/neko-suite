//! SceneService — implementation using runtime-scene crate
//!
//! Wraps BevySceneWorld with Mutex for thread-safe access.
//! Optionally holds PbrRenderer + AssetCache for GPU rendering.

use super::scene_command_queue::SceneCommandQueue;
use crate::domain::FrameData;
use crate::encoder::encode_nv12_to_h264_iframe;
use crate::error::{Error, Result};
use crate::gpu::scene_renderer::{
    extract_render_world, AssetCache, CameraParams, ControlAckHealthSample, PbrRenderer,
    RenderExtractStats, RenderWorld, SceneRenderOutput, ViewportDescriptor,
    ViewportRenderGraphOutput,
};
use crate::gpu::GpuContext;
use crate::media_service::encode_rgba_to_jpeg;
use crate::services::scene::ISceneService;
use neko_engine_types::easing::EasingType;
use neko_engine_types::FrameFormat;
use neko_runtime_scene::animation_blend::SceneBlendLayerInfo;
use neko_runtime_scene::asset_database::{AssetDatabase, AssetHandle, MaterialDescriptorPatch};
use neko_runtime_scene::components::{
    AnimationChannelInfo, Camera, GlobalTransform, Light, MaterialRef, MeshRef, NodeName,
    SceneNodeId, Transform,
};
use neko_runtime_scene::exporter::{self, ExportNode};
use neko_runtime_scene::ik::IkChainInfo;
use neko_runtime_scene::procedural_mesh::ProceduralMesh;
use neko_runtime_scene::project::NkmProject;
use neko_runtime_scene::world::{
    AnimationClipInfo, BevySceneWorld, SceneDelta, SceneSnapshot, SceneWorld,
};
use neko_runtime_scene::{
    ensure_scene_control_resources, extract_scene_delta, SceneCommandAck, SceneCommandAckStatus,
    SceneCommandEnvelope, SceneRevision,
};
use neko_runtime_scene::{
    BrushPatchApplyOutcome, ModelingSession, ModelingSessionManager, ModelingSessionStateDelta,
    TopologyChangeEvent, TopologyOperation, VertexBrushPatchMetadata,
};
use std::collections::{HashMap, VecDeque};
use std::path::Path;
use std::sync::{
    atomic::{AtomicU32, Ordering},
    Arc, Mutex, RwLock,
};
use std::time::{Duration, Instant};

const CONTROL_ACK_SAMPLE_CAPACITY: usize = 128;

#[derive(Debug, Default)]
struct ControlAckMetrics {
    pending: AtomicU32,
    samples_ms: Mutex<VecDeque<f32>>,
}

impl ControlAckMetrics {
    fn start_sample(&self) -> ControlAckSampleGuard<'_> {
        self.pending.fetch_add(1, Ordering::Relaxed);
        ControlAckSampleGuard {
            metrics: self,
            started_at: Instant::now(),
        }
    }

    fn record_sample(&self, elapsed: Duration) {
        self.pending.fetch_sub(1, Ordering::Relaxed);
        if let Ok(mut samples) = self.samples_ms.lock() {
            if samples.len() == CONTROL_ACK_SAMPLE_CAPACITY {
                samples.pop_front();
            }
            samples.push_back(elapsed.as_secs_f32() * 1000.0);
        }
    }

    fn health_sample(&self, render_backlog_frames: u32) -> ControlAckHealthSample {
        let ack_p95_ms = self.ack_p95_ms();
        ControlAckHealthSample {
            ack_p95_ms,
            pending_command_acks: self.pending.load(Ordering::Relaxed),
            render_backlog_frames,
        }
    }

    fn ack_p95_ms(&self) -> f32 {
        let Ok(samples) = self.samples_ms.lock() else {
            return ControlAckHealthSample::ACK_P95_BUDGET_MS + 1.0;
        };
        if samples.is_empty() {
            return 0.0;
        }
        let mut values: Vec<f32> = samples.iter().copied().collect();
        values.sort_by(|left, right| left.total_cmp(right));
        let index = ((values.len() as f32 * 0.95).ceil() as usize).saturating_sub(1);
        values[index]
    }
}

struct ControlAckSampleGuard<'a> {
    metrics: &'a ControlAckMetrics,
    started_at: Instant,
}

impl Drop for ControlAckSampleGuard<'_> {
    fn drop(&mut self) {
        self.metrics.record_sample(self.started_at.elapsed());
    }
}

#[derive(Debug, Default)]
struct SharedRenderExtractCache {
    revision: Option<u64>,
    render_world: RenderWorld,
    stats: RenderExtractStats,
    extract_count: u64,
}

#[derive(Debug, Clone)]
struct SharedRenderExtract {
    revision: u64,
    render_world: RenderWorld,
    stats: RenderExtractStats,
    extracted: bool,
}

impl SharedRenderExtractCache {
    fn prepare(
        &mut self,
        world: &mut bevy_ecs::world::World,
        asset_database: &AssetDatabase,
        camera: &CameraParams,
    ) -> SharedRenderExtract {
        let revision = world
            .get_resource::<SceneRevision>()
            .map(|revision| revision.current())
            .unwrap_or_default();
        if self.revision == Some(revision) {
            return SharedRenderExtract {
                revision,
                render_world: self.render_world.clone(),
                stats: self.stats,
                extracted: false,
            };
        }

        self.stats = extract_render_world(world, asset_database, camera, &mut self.render_world);
        self.revision = Some(revision);
        self.extract_count = self.extract_count.saturating_add(1);
        SharedRenderExtract {
            revision,
            render_world: self.render_world.clone(),
            stats: self.stats,
            extracted: true,
        }
    }
}

/// Concrete scene service backed by bevy_ecs
pub struct SceneService {
    world: Mutex<BevySceneWorld>,
    /// GPU context used for readback/capture helpers
    gpu_ctx: Option<Arc<GpuContext>>,
    /// PBR renderer (None if GPU unavailable)
    renderer: Option<Mutex<PbrRenderer>>,
    /// GPU asset cache (None if GPU unavailable)
    asset_cache: Option<Mutex<AssetCache>>,
    /// Authoring asset descriptors used by export, Inspector, and GPU cache derivation
    asset_database: Mutex<AssetDatabase>,
    /// Serial scene command validator/apply queue
    command_queue: Mutex<SceneCommandQueue>,
    /// Runtime health metrics for the /v1/scenes/control ack path.
    control_ack_metrics: ControlAckMetrics,
    /// Shared render-only extraction reused by multiple viewports at the same scene revision.
    render_extract_cache: Mutex<SharedRenderExtractCache>,
    /// CPU-side mesh cache for procedural meshes (needed for CSG lookups)
    procedural_meshes: Mutex<HashMap<String, ProceduralMesh>>,
    /// VRM face parameter presets (populated from NkmProject on load)
    face_params: Mutex<HashMap<String, f32>>,
    /// Editor camera override for viewport orbit controls.
    /// Read by the scene stream producer on each frame.
    editor_camera: RwLock<Option<CameraParams>>,
}

impl SceneService {
    /// Create without GPU (scene management only, no rendering)
    pub fn new() -> Self {
        Self {
            world: Mutex::new(BevySceneWorld::new()),
            gpu_ctx: None,
            renderer: None,
            asset_cache: None,
            asset_database: Mutex::new(AssetDatabase::default()),
            command_queue: Mutex::new(SceneCommandQueue::default()),
            control_ack_metrics: ControlAckMetrics::default(),
            render_extract_cache: Mutex::new(SharedRenderExtractCache::default()),
            procedural_meshes: Mutex::new(HashMap::new()),
            face_params: Mutex::new(HashMap::new()),
            editor_camera: RwLock::new(None),
        }
    }

    /// Create with GPU context (enables render_frame)
    pub fn with_gpu(ctx: Arc<GpuContext>) -> Self {
        let (renderer, material_bgl) = PbrRenderer::new(Arc::clone(&ctx));
        let asset_cache = AssetCache::new(Arc::clone(&ctx), material_bgl);

        Self {
            world: Mutex::new(BevySceneWorld::new()),
            gpu_ctx: Some(Arc::clone(&ctx)),
            renderer: Some(Mutex::new(renderer)),
            asset_cache: Some(Mutex::new(asset_cache)),
            asset_database: Mutex::new(AssetDatabase::default()),
            command_queue: Mutex::new(SceneCommandQueue::default()),
            control_ack_metrics: ControlAckMetrics::default(),
            render_extract_cache: Mutex::new(SharedRenderExtractCache::default()),
            procedural_meshes: Mutex::new(HashMap::new()),
            face_params: Mutex::new(HashMap::new()),
            editor_camera: RwLock::new(None),
        }
    }
}

impl SceneService {
    pub fn set_editor_camera(&self, camera: CameraParams) {
        if let Ok(mut guard) = self.editor_camera.write() {
            *guard = Some(camera);
        }
    }

    pub fn get_editor_camera(&self) -> Option<CameraParams> {
        self.editor_camera.read().ok().and_then(|g| g.clone())
    }

    pub fn current_revision(&self) -> Result<u64> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;
        let ecs = world.ecs_world_mut();
        ensure_scene_control_resources(ecs);
        Ok(ecs.resource::<SceneRevision>().current())
    }

    pub fn apply_scene_command(
        &self,
        envelope: SceneCommandEnvelope,
    ) -> Result<Vec<SceneCommandAck>> {
        let (acks, _) = self.apply_scene_command_with_delta(envelope)?;
        Ok(acks)
    }

    pub fn apply_scene_command_with_delta(
        &self,
        envelope: SceneCommandEnvelope,
    ) -> Result<(Vec<SceneCommandAck>, Option<SceneDelta>)> {
        let _ack_sample = self.control_ack_metrics.start_sample();
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;
        let mut queue = self
            .command_queue
            .lock()
            .map_err(|e| Error::Other(format!("Scene command queue lock poisoned: {}", e)))?;

        let acks = queue.apply(world.ecs_world_mut(), envelope);
        let applied_seq = acks
            .iter()
            .rev()
            .find(|ack| ack.status == SceneCommandAckStatus::Applied)
            .map(|ack| ack.applied_seq);
        let delta = applied_seq.map(|seq| extract_scene_delta(world.ecs_world_mut(), Some(seq)));

        Ok((acks, delta))
    }

    pub fn control_ack_health_sample(&self, render_backlog_frames: u32) -> ControlAckHealthSample {
        self.control_ack_metrics
            .health_sample(render_backlog_frames)
    }

    pub fn begin_modeling_session(
        &self,
        session_id: String,
        mesh_id: String,
        character_id: Option<String>,
        topology_mutable: bool,
        before_hash: String,
    ) -> Result<(ModelingSession, Option<SceneDelta>)> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;
        let ecs = world.ecs_world_mut();
        ensure_scene_control_resources(ecs);
        if !ecs.contains_resource::<ModelingSessionManager>() {
            ecs.insert_resource(ModelingSessionManager::default());
        }
        let session = ecs
            .resource_mut::<ModelingSessionManager>()
            .begin(
                session_id,
                mesh_id,
                character_id,
                topology_mutable,
                before_hash,
            )
            .map_err(|error| Error::Other(error.to_string()))?;
        ecs.resource_mut::<SceneRevision>().advance();
        let delta = extract_scene_delta(ecs, None);
        Ok((session, Some(delta)))
    }

    pub fn commit_modeling_session(
        &self,
        session_id: &str,
        operation: TopologyOperation,
        vertex_count_before: u32,
        vertex_count_after: u32,
    ) -> Result<(TopologyChangeEvent, Option<SceneDelta>)> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;
        let ecs = world.ecs_world_mut();
        ensure_scene_control_resources(ecs);
        let event = ecs
            .get_resource_mut::<ModelingSessionManager>()
            .ok_or_else(|| Error::Other("modeling session manager is not available".to_string()))?
            .commit(
                session_id,
                operation,
                vertex_count_before,
                vertex_count_after,
            )
            .map_err(|error| Error::Other(error.to_string()))?;
        ecs.resource_mut::<SceneRevision>().advance();
        let delta = extract_scene_delta(ecs, None);
        Ok((event, Some(delta)))
    }

    pub fn cancel_modeling_session(
        &self,
        session_id: &str,
    ) -> Result<(ModelingSessionStateDelta, Option<SceneDelta>)> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;
        let ecs = world.ecs_world_mut();
        ensure_scene_control_resources(ecs);
        let session = ecs
            .get_resource_mut::<ModelingSessionManager>()
            .ok_or_else(|| Error::Other("modeling session manager is not available".to_string()))?
            .cancel(session_id)
            .map_err(|error| Error::Other(error.to_string()))?;
        ecs.resource_mut::<SceneRevision>().advance();
        let delta = extract_scene_delta(ecs, None);
        Ok((session, Some(delta)))
    }

    pub fn apply_vertex_brush_patch(
        &self,
        patch: VertexBrushPatchMetadata,
    ) -> Result<BrushPatchApplyOutcome> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;
        let ecs = world.ecs_world_mut();
        if !ecs.contains_resource::<ModelingSessionManager>() {
            ecs.insert_resource(ModelingSessionManager::default());
        }
        let outcome = ecs
            .resource_mut::<ModelingSessionManager>()
            .apply_brush_patch(patch)
            .map_err(|error| Error::Other(error.to_string()))?;

        if let Some(cache_mutex) = &self.asset_cache {
            if let Ok(cache) = cache_mutex.lock() {
                cache.record_mesh_dirty_region(&outcome.dirty_region);
            }
        }

        Ok(outcome)
    }

    #[cfg(test)]
    fn prepare_shared_extract_for_test(&self) -> Result<(u64, RenderExtractStats, bool, u64)> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;
        let asset_database = self
            .asset_database
            .lock()
            .map_err(|e| Error::Other(format!("Asset database lock poisoned: {}", e)))?;
        let mut cache = self
            .render_extract_cache
            .lock()
            .map_err(|e| Error::Other(format!("Render extract cache lock poisoned: {}", e)))?;
        let shared_extract = cache.prepare(
            world.ecs_world_mut(),
            &asset_database,
            &CameraParams::default(),
        );
        Ok((
            shared_extract.revision,
            shared_extract.stats,
            shared_extract.extracted,
            cache.extract_count,
        ))
    }

    fn render_frame_internal(
        &self,
        clip_name: Option<&str>,
        time: f32,
        output_size: (u32, u32),
        camera_override: Option<&CameraParams>,
        background_color: Option<[f32; 4]>,
        viewport_graph: Option<(&ViewportDescriptor, ViewportRenderGraphOutput)>,
    ) -> Result<SceneRenderOutput> {
        let renderer_mutex = self
            .renderer
            .as_ref()
            .ok_or_else(|| Error::Other("GPU not available for rendering".into()))?;
        let cache_mutex = self
            .asset_cache
            .as_ref()
            .ok_or_else(|| Error::Other("GPU not available for rendering".into()))?;

        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;
        let renderer = renderer_mutex
            .lock()
            .map_err(|e| Error::Other(format!("Renderer lock poisoned: {}", e)))?;
        let cache = cache_mutex
            .lock()
            .map_err(|e| Error::Other(format!("Asset cache lock poisoned: {}", e)))?;

        if let Some(clip) = clip_name {
            world.tick(clip, time);
        }

        let stored_camera = self.get_editor_camera();
        let default_camera = CameraParams::default();
        let camera = camera_override
            .or(stored_camera.as_ref())
            .unwrap_or(&default_camera);

        let asset_database = self
            .asset_database
            .lock()
            .map_err(|e| Error::Other(format!("Asset database lock poisoned: {}", e)))?;
        let shared_extract = self
            .render_extract_cache
            .lock()
            .map_err(|e| Error::Other(format!("Render extract cache lock poisoned: {}", e)))?
            .prepare(
                world.ecs_world_mut(),
                &asset_database,
                &CameraParams::default(),
            );
        tracing::trace!(
            scene_revision = shared_extract.revision,
            extracted = shared_extract.extracted,
            instances = shared_extract.stats.instances,
            cameras = shared_extract.stats.cameras,
            lights = shared_extract.stats.lights,
            "Prepared shared scene RenderWorld extract"
        );
        drop(asset_database);
        drop(world);

        match viewport_graph {
            Some((descriptor, output)) => renderer.render_viewport_from_render_world(
                &shared_extract.render_world,
                &cache,
                camera,
                output_size,
                background_color,
                descriptor,
                output,
            ),
            None => renderer.render_from_render_world(
                &shared_extract.render_world,
                &cache,
                camera,
                output_size,
                background_color,
            ),
        }
        .map_err(|e| Error::Other(format!("PBR render failed: {}", e)))
    }

    pub fn capture_display_frame(
        &self,
        clip_name: Option<&str>,
        time: f32,
        output_size: (u32, u32),
        camera_override: Option<&CameraParams>,
        background_color: Option<[f32; 4]>,
        quality: u8,
    ) -> Result<FrameData> {
        let output = self.render_frame(
            clip_name,
            time,
            output_size,
            camera_override,
            background_color,
        )?;
        let ctx = self
            .gpu_ctx
            .as_ref()
            .ok_or_else(|| Error::Other("GPU not available for scene capture".to_string()))?;
        let rgba = ctx.read_texture_sync(&output.color_texture, output.width, output.height)?;
        let jpeg = encode_rgba_to_jpeg(&rgba, output.width, output.height, u32::from(quality))?;

        Ok(FrameData::new(
            jpeg,
            output.width,
            output.height,
            FrameFormat::Jpeg,
        ))
    }

    pub fn capture_h264_keyframe(
        &self,
        output_size: (u32, u32),
        camera_override: Option<&CameraParams>,
        background_color: Option<[f32; 4]>,
        quality: u32,
        pts_us: i64,
        duration_us: i64,
        viewport: &ViewportDescriptor,
    ) -> Result<FrameData> {
        let (width, height) = output_size;
        if width == 0 || height == 0 || width % 2 != 0 || height % 2 != 0 {
            return Err(Error::InvalidParameter(
                "H.264 scene stream requires non-zero even dimensions".to_string(),
            ));
        }

        let output = self.render_frame_internal(
            None,
            0.0,
            output_size,
            camera_override,
            background_color,
            Some((viewport, ViewportRenderGraphOutput::RealtimeStream)),
        )?;
        let ctx = self
            .gpu_ctx
            .as_ref()
            .ok_or_else(|| Error::Other("GPU not available for scene stream".to_string()))?;
        let rgba = ctx.read_texture_sync(&output.color_texture, output.width, output.height)?;
        let nv12 = rgba_to_nv12_bt709(&rgba, output.width, output.height)?;
        let h264 = encode_nv12_to_h264_iframe(&nv12, output.width, output.height, quality)?;

        Ok(pack_scene_h264_frame(
            h264,
            output.width,
            output.height,
            pts_us,
            duration_us,
        ))
    }
}

fn pack_scene_h264_frame(
    h264: Vec<u8>,
    width: u32,
    height: u32,
    pts_us: i64,
    duration_us: i64,
) -> FrameData {
    let mut data = Vec::with_capacity(8 + 8 + 1 + 8 + h264.len());
    data.extend_from_slice(&pts_us.to_le_bytes());
    data.extend_from_slice(&pts_us.to_le_bytes());
    data.push(1);
    data.extend_from_slice(&duration_us.to_le_bytes());
    data.extend_from_slice(&h264);

    FrameData {
        data,
        width,
        height,
        format: FrameFormat::H264,
        timestamp: pts_us as f64 / 1_000_000.0,
    }
}

fn rgba_to_nv12_bt709(rgba: &[u8], width: u32, height: u32) -> Result<Vec<u8>> {
    if width % 2 != 0 || height % 2 != 0 {
        return Err(Error::InvalidParameter(
            "NV12 conversion requires even dimensions".to_string(),
        ));
    }

    let width_usize = width as usize;
    let height_usize = height as usize;
    let expected = width_usize * height_usize * 4;
    if rgba.len() < expected {
        return Err(Error::InvalidParameter(format!(
            "RGBA data too small: expected {} bytes, got {}",
            expected,
            rgba.len()
        )));
    }

    let y_size = width_usize * height_usize;
    let mut nv12 = vec![0u8; y_size + y_size / 2];

    for y in 0..height_usize {
        for x in 0..width_usize {
            let offset = (y * width_usize + x) * 4;
            let (r, g, b) = (
                rgba[offset] as f32,
                rgba[offset + 1] as f32,
                rgba[offset + 2] as f32,
            );
            nv12[y * width_usize + x] = rgb_to_luma_bt709(r, g, b);
        }
    }

    for y in (0..height_usize).step_by(2) {
        for x in (0..width_usize).step_by(2) {
            let mut r_sum = 0.0;
            let mut g_sum = 0.0;
            let mut b_sum = 0.0;
            for dy in 0..2 {
                for dx in 0..2 {
                    let offset = ((y + dy) * width_usize + (x + dx)) * 4;
                    r_sum += rgba[offset] as f32;
                    g_sum += rgba[offset + 1] as f32;
                    b_sum += rgba[offset + 2] as f32;
                }
            }
            let u = rgb_to_chroma_u_bt709(r_sum / 4.0, g_sum / 4.0, b_sum / 4.0);
            let v = rgb_to_chroma_v_bt709(r_sum / 4.0, g_sum / 4.0, b_sum / 4.0);
            let uv_offset = y_size + (y / 2) * width_usize + x;
            nv12[uv_offset] = u;
            nv12[uv_offset + 1] = v;
        }
    }

    Ok(nv12)
}

fn clamp_u8(value: f32) -> u8 {
    value.round().clamp(0.0, 255.0) as u8
}

fn rgb_to_luma_bt709(r: f32, g: f32, b: f32) -> u8 {
    clamp_u8(16.0 + 0.1826 * r + 0.6142 * g + 0.0620 * b)
}

fn rgb_to_chroma_u_bt709(r: f32, g: f32, b: f32) -> u8 {
    clamp_u8(128.0 - 0.1006 * r - 0.3386 * g + 0.4392 * b)
}

fn rgb_to_chroma_v_bt709(r: f32, g: f32, b: f32) -> u8 {
    clamp_u8(128.0 + 0.4392 * r - 0.3989 * g - 0.0403 * b)
}

impl Default for SceneService {
    fn default() -> Self {
        Self::new()
    }
}

impl ISceneService for SceneService {
    fn load_model(&self, path: &Path) -> Result<SceneSnapshot> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;

        let load_result = world
            .load_model(path)
            .map_err(|e| Error::Other(format!("Failed to load model: {}", e)))?;
        {
            let mut database = self
                .asset_database
                .lock()
                .map_err(|e| Error::Other(format!("Asset database lock poisoned: {}", e)))?;
            database.merge(load_result.asset_database);
        }

        // Also load GPU assets if renderer is available
        if let Some(cache_mutex) = &self.asset_cache {
            let mut cache = cache_mutex
                .lock()
                .map_err(|e| Error::Other(format!("Asset cache lock poisoned: {}", e)))?;
            if let Err(e) = cache.load_gltf(path) {
                tracing::warn!("Failed to load GPU assets for {}: {}", path.display(), e);
            }
        }

        Ok(world.get_snapshot())
    }

    fn get_snapshot(&self) -> Result<SceneSnapshot> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;

        Ok(world.get_snapshot())
    }

    fn update_transform(
        &self,
        node_id: &str,
        position: [f32; 3],
        rotation: [f32; 4],
        scale: [f32; 3],
    ) -> Result<()> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;

        world
            .update_transform(
                node_id,
                glam::Vec3::from(position),
                glam::Quat::from_array(rotation),
                glam::Vec3::from(scale),
            )
            .map_err(Error::Other)
    }

    fn tick(&self, clip_name: &str, time: f32) -> Result<SceneDelta> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;

        Ok(world.tick(clip_name, time))
    }

    fn get_animation_clips(&self) -> Result<Vec<AnimationClipInfo>> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;

        Ok(world.get_animation_clips())
    }

    fn create_shape(&self, params: serde_json::Value) -> Result<SceneSnapshot> {
        let shape_params: neko_runtime_scene::procedural::ShapeParams =
            serde_json::from_value(params)
                .map_err(|e| Error::Other(format!("Invalid shape params: {}", e)))?;
        let mesh = neko_runtime_scene::procedural::generate_shape(&shape_params);
        let uri = format!("procedural://shape_{}", uuid::Uuid::new_v4());

        // Register in GPU asset cache if available
        if let Some(cache_mutex) = &self.asset_cache {
            let mut cache = cache_mutex
                .lock()
                .map_err(|e| Error::Other(format!("Asset cache lock poisoned: {}", e)))?;
            if let Err(e) = cache.register_procedural_mesh(&uri, 0, &mesh) {
                tracing::warn!("Failed to register procedural shape in GPU cache: {}", e);
            }
        }

        // Store CPU-side mesh for future CSG operations
        {
            let mut pm = self
                .procedural_meshes
                .lock()
                .map_err(|e| Error::Other(format!("Procedural meshes lock poisoned: {}", e)))?;
            pm.insert(uri.clone(), mesh);
        }

        // Spawn entity in ECS world
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;

        spawn_procedural_entity(world.ecs_world_mut(), &uri, "Shape");

        Ok(world.get_snapshot())
    }

    fn create_text_mesh(&self, params: serde_json::Value) -> Result<SceneSnapshot> {
        let text_params: crate::generators::text_mesh::TextMeshParams =
            serde_json::from_value(params)
                .map_err(|e| Error::Other(format!("Invalid text mesh params: {}", e)))?;
        let mesh = crate::generators::text_mesh::generate_text_mesh(&text_params)
            .map_err(|e| Error::Other(format!("Text mesh generation failed: {}", e)))?;
        let uri = format!("procedural://text_{}", uuid::Uuid::new_v4());

        // Register in GPU asset cache if available
        if let Some(cache_mutex) = &self.asset_cache {
            let mut cache = cache_mutex
                .lock()
                .map_err(|e| Error::Other(format!("Asset cache lock poisoned: {}", e)))?;
            if let Err(e) = cache.register_procedural_mesh(&uri, 0, &mesh) {
                tracing::warn!("Failed to register text mesh in GPU cache: {}", e);
            }
        }

        // Store CPU-side mesh for future CSG operations
        {
            let mut pm = self
                .procedural_meshes
                .lock()
                .map_err(|e| Error::Other(format!("Procedural meshes lock poisoned: {}", e)))?;
            pm.insert(uri.clone(), mesh);
        }

        // Spawn entity in ECS world
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;

        spawn_procedural_entity(world.ecs_world_mut(), &uri, "Text");

        Ok(world.get_snapshot())
    }

    fn csg_boolean(
        &self,
        entity_a: &str,
        entity_b: &str,
        operation: &str,
    ) -> Result<SceneSnapshot> {
        let op: neko_runtime_scene::csg::CsgOp = match operation {
            "union" => neko_runtime_scene::csg::CsgOp::Union,
            "difference" => neko_runtime_scene::csg::CsgOp::Difference,
            "intersection" => neko_runtime_scene::csg::CsgOp::Intersection,
            _ => {
                return Err(Error::Other(format!(
                    "Unknown CSG operation: {} (expected union/difference/intersection)",
                    operation
                )))
            }
        };

        // Look up MeshRef URIs from the ECS world
        let (uri_a, uri_b) = {
            let mut world = self
                .world
                .lock()
                .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;
            let ecs = world.ecs_world_mut();
            let ua = find_mesh_uri(ecs, entity_a)?;
            let ub = find_mesh_uri(ecs, entity_b)?;
            (ua, ub)
        };

        // Only support CSG on procedural meshes
        if !uri_a.starts_with("procedural://") {
            return Err(Error::Other(format!(
                "CSG only supported on procedural meshes, entity '{}' has URI '{}'",
                entity_a, uri_a
            )));
        }
        if !uri_b.starts_with("procedural://") {
            return Err(Error::Other(format!(
                "CSG only supported on procedural meshes, entity '{}' has URI '{}'",
                entity_b, uri_b
            )));
        }

        // Retrieve CPU-side meshes
        let pm = self
            .procedural_meshes
            .lock()
            .map_err(|e| Error::Other(format!("Procedural meshes lock poisoned: {}", e)))?;

        let mesh_a = pm.get(&uri_a).ok_or_else(|| {
            Error::Other(format!("No CPU mesh data for procedural URI '{}'", uri_a))
        })?;
        let mesh_b = pm.get(&uri_b).ok_or_else(|| {
            Error::Other(format!("No CPU mesh data for procedural URI '{}'", uri_b))
        })?;

        let result_mesh = neko_runtime_scene::csg::boolean_op(mesh_a, mesh_b, op);
        drop(pm);

        let uri = format!("procedural://csg_{}", uuid::Uuid::new_v4());

        // Register in GPU asset cache if available
        if let Some(cache_mutex) = &self.asset_cache {
            let mut cache = cache_mutex
                .lock()
                .map_err(|e| Error::Other(format!("Asset cache lock poisoned: {}", e)))?;
            if let Err(e) = cache.register_procedural_mesh(&uri, 0, &result_mesh) {
                tracing::warn!("Failed to register CSG result in GPU cache: {}", e);
            }
        }

        // Store CPU-side mesh
        {
            let mut pm = self
                .procedural_meshes
                .lock()
                .map_err(|e| Error::Other(format!("Procedural meshes lock poisoned: {}", e)))?;
            pm.insert(uri.clone(), result_mesh);
        }

        // Spawn entity in ECS world
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;

        spawn_procedural_entity(world.ecs_world_mut(), &uri, "CSG");

        Ok(world.get_snapshot())
    }

    fn render_frame(
        &self,
        clip_name: Option<&str>,
        time: f32,
        output_size: (u32, u32),
        camera_override: Option<&CameraParams>,
        background_color: Option<[f32; 4]>,
    ) -> Result<SceneRenderOutput> {
        self.render_frame_internal(
            clip_name,
            time,
            output_size,
            camera_override,
            background_color,
            None,
        )
    }

    fn export_glb(&self) -> Result<Vec<u8>> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;

        let snapshot = world.get_snapshot();

        // Build ExportNodes by querying MeshRef URIs from ECS
        let export_nodes: Vec<ExportNode> = {
            let ecs = world.ecs_world_mut();
            snapshot
                .nodes
                .iter()
                .map(|node| {
                    let (mesh_uri, material_handle, light, camera) =
                        if node.has_mesh || node.has_light || node.has_camera {
                            find_export_refs(ecs, &node.id).unwrap_or((None, None, None, None))
                        } else {
                            (None, None, None, None)
                        };
                    ExportNode {
                        snapshot: node.clone(),
                        mesh_uri,
                        material_handle,
                        light,
                        camera,
                    }
                })
                .collect()
        };

        // Query animation clips from ECS
        let animation_clips: Vec<neko_runtime_scene::components::AnimationClipData> = {
            let ecs = world.ecs_world_mut();
            let mut query = ecs.query::<&neko_runtime_scene::components::AnimationTarget>();
            query
                .iter(ecs)
                .flat_map(|target| target.clips.iter().cloned())
                .collect()
        };

        let pm = self
            .procedural_meshes
            .lock()
            .map_err(|e| Error::Other(format!("Procedural meshes lock poisoned: {}", e)))?;

        let fp = self
            .face_params
            .lock()
            .map_err(|e| Error::Other(format!("Face params lock poisoned: {}", e)))?;

        let asset_database = self
            .asset_database
            .lock()
            .map_err(|e| Error::Other(format!("Asset database lock poisoned: {}", e)))?;

        let clips_ref = if animation_clips.is_empty() {
            None
        } else {
            Some(animation_clips.as_slice())
        };
        let fp_ref = if fp.is_empty() { None } else { Some(&*fp) };

        exporter::export_glb(&export_nodes, &pm, &asset_database, clips_ref, fp_ref)
            .map_err(|e| Error::Other(format!("GLB export failed: {}", e)))
    }

    fn save_project(&self, path: &str, editor_state: serde_json::Value) -> Result<()> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;

        let snapshot = world.get_snapshot();

        // Build node_id → mesh_uri mapping from ECS
        let node_mesh_map: HashMap<String, String> = {
            let ecs = world.ecs_world_mut();
            let mut query = ecs.query::<(&SceneNodeId, &MeshRef)>();
            query
                .iter(ecs)
                .map(|(id, mesh_ref)| (id.0.clone(), mesh_ref.uri.clone()))
                .collect()
        };

        let pm = self
            .procedural_meshes
            .lock()
            .map_err(|e| Error::Other(format!("Procedural meshes lock poisoned: {}", e)))?;

        let fp = self
            .face_params
            .lock()
            .map_err(|e| Error::Other(format!("Face params lock poisoned: {}", e)))?;

        let project = NkmProject::from_scene(
            vec![], // TODO(P2): track source model paths
            pm.clone(),
            snapshot,
            node_mesh_map,
            editor_state,
            fp.clone(),
        );

        project
            .save(Path::new(path))
            .map_err(|e| Error::Other(format!("Project save failed: {}", e)))
    }

    fn load_project(&self, path: &str) -> Result<(SceneSnapshot, serde_json::Value)> {
        let project = NkmProject::load(Path::new(path))
            .map_err(|e| Error::Other(format!("Project load failed: {}", e)))?;

        // Restore scene world from snapshot
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;

        world.restore_snapshot(&project.scene_snapshot);

        // Restore procedural meshes and re-register in GPU cache
        {
            let mut pm = self
                .procedural_meshes
                .lock()
                .map_err(|e| Error::Other(format!("Procedural meshes lock poisoned: {}", e)))?;
            *pm = project.procedural_meshes.clone();

            if let Some(cache_mutex) = &self.asset_cache {
                let mut cache = cache_mutex
                    .lock()
                    .map_err(|e| Error::Other(format!("Asset cache lock poisoned: {}", e)))?;
                for (uri, mesh) in &*pm {
                    if let Err(e) = cache.register_procedural_mesh(uri, 0, mesh) {
                        tracing::warn!("Failed to re-register mesh '{}' in GPU cache: {}", uri, e);
                    }
                }
            }
        }

        // Re-add MeshRef components using the saved node_mesh_map
        {
            let ecs = world.ecs_world_mut();
            for (node_id, mesh_uri) in &project.node_mesh_map {
                let entity = {
                    let mut query = ecs.query::<(bevy_ecs::prelude::Entity, &SceneNodeId)>();
                    query
                        .iter(ecs)
                        .find(|(_, id)| id.0 == *node_id)
                        .map(|(e, _)| e)
                };
                if let Some(entity) = entity {
                    ecs.entity_mut(entity).insert(MeshRef {
                        asset: AssetHandle::for_mesh(mesh_uri, 0),
                        uri: mesh_uri.clone(),
                        primitive_index: 0,
                    });
                }
            }
        }

        // Restore face params for VRM export
        {
            let mut fp = self
                .face_params
                .lock()
                .map_err(|e| Error::Other(format!("Face params lock poisoned: {}", e)))?;
            *fp = project.face_params.clone();
        }

        let final_snapshot = world.get_snapshot();
        Ok((final_snapshot, project.editor_state))
    }

    fn get_keyframe_tracks(&self, clip_name: &str) -> Result<Vec<AnimationChannelInfo>> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;
        world.get_keyframe_tracks(clip_name).map_err(Error::Other)
    }

    fn add_keyframe(
        &self,
        clip_name: &str,
        node_id: &str,
        property: &str,
        timestamp: f32,
        values: Vec<f32>,
    ) -> Result<String> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;
        world
            .add_keyframe(clip_name, node_id, property, timestamp, values)
            .map_err(Error::Other)
    }

    fn remove_keyframe(&self, clip_name: &str, keyframe_id: &str) -> Result<()> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;
        world
            .remove_keyframe(clip_name, keyframe_id)
            .map_err(Error::Other)
    }

    fn update_keyframe(
        &self,
        clip_name: &str,
        keyframe_id: &str,
        timestamp: Option<f32>,
        values: Option<Vec<f32>>,
        easing: Option<EasingType>,
    ) -> Result<()> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;
        world
            .update_keyframe(clip_name, keyframe_id, timestamp, values, easing)
            .map_err(Error::Other)
    }

    fn create_clip(&self, name: &str, duration: f32) -> Result<()> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;
        world.create_clip(name, duration).map_err(Error::Other)
    }

    fn crossfade_animation(
        &self,
        clip_name: &str,
        fade_duration: f32,
        loop_anim: bool,
    ) -> Result<()> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;
        world
            .crossfade_animation(clip_name, fade_duration, loop_anim)
            .map_err(Error::Other)
    }

    fn set_blend_weight(&self, clip_name: &str, weight: f32) -> Result<()> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;
        world
            .set_blend_weight(clip_name, weight)
            .map_err(Error::Other)
    }

    fn get_blend_state(&self) -> Result<Vec<SceneBlendLayerInfo>> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;
        Ok(world.get_blend_state())
    }

    fn create_ik_chain(
        &self,
        root_joint: &str,
        end_effector: &str,
        solver: &str,
        iterations: u32,
        tolerance: f32,
    ) -> Result<String> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;
        world
            .create_ik_chain(root_joint, end_effector, solver, iterations, tolerance)
            .map_err(Error::Other)
    }

    fn remove_ik_chain(&self, chain_id: &str) -> Result<()> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;
        world.remove_ik_chain(chain_id).map_err(Error::Other)
    }

    fn set_ik_target(
        &self,
        chain_id: &str,
        position: [f32; 3],
        rotation: Option<[f32; 4]>,
        pole: Option<[f32; 3]>,
    ) -> Result<()> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;
        world
            .set_ik_target(chain_id, position, rotation, pole)
            .map_err(Error::Other)
    }

    fn set_ik_enabled(&self, chain_id: &str, enabled: bool) -> Result<()> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;
        world
            .set_ik_enabled(chain_id, enabled)
            .map_err(Error::Other)
    }

    fn get_ik_chains(&self) -> Result<Vec<IkChainInfo>> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;
        Ok(world.get_ik_chains())
    }

    fn set_visible(&self, node_id: &str, visible: bool) -> Result<()> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;
        world.set_visible(node_id, visible).map_err(Error::Other)
    }

    fn set_morph_weights(&self, node_id: &str, weights: Vec<f32>) -> Result<()> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;
        world
            .set_morph_weights(node_id, weights)
            .map_err(Error::Other)
    }

    fn set_face_params(&self, params: HashMap<String, f32>) -> Result<()> {
        let mut fp = self
            .face_params
            .lock()
            .map_err(|e| Error::Other(format!("Face params lock poisoned: {}", e)))?;
        *fp = params;
        Ok(())
    }

    fn get_face_params(&self) -> Result<HashMap<String, f32>> {
        let fp = self
            .face_params
            .lock()
            .map_err(|e| Error::Other(format!("Face params lock poisoned: {}", e)))?;
        Ok(fp.clone())
    }

    fn update_material(
        &self,
        node_id: &str,
        base_color: Option<[f32; 4]>,
        metallic: Option<f32>,
        roughness: Option<f32>,
        emissive: Option<[f32; 3]>,
        occlusion_strength: Option<f32>,
    ) -> Result<()> {
        // Read the material reference from the scene world
        let mat_ref = {
            let mut world = self
                .world
                .lock()
                .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;
            world.get_material_ref(node_id).map_err(Error::Other)?
        };

        let (uri, mat_idx) =
            mat_ref.ok_or_else(|| Error::Other(format!("Node '{}' has no material", node_id)))?;
        let material_handle = AssetHandle::for_material(&uri, mat_idx);

        {
            let mut database = self
                .asset_database
                .lock()
                .map_err(|e| Error::Other(format!("Asset database lock poisoned: {}", e)))?;
            database.update_material(
                material_handle,
                MaterialDescriptorPatch {
                    base_color_factor: base_color,
                    metallic_factor: metallic,
                    roughness_factor: roughness,
                    emissive_factor: emissive,
                    occlusion_strength,
                },
            );
        }

        // GPU cache is a derived runtime cache. Keep authoring update even when
        // GPU rendering is unavailable, then best-effort sync the cache.
        if let Some(cache_mutex) = &self.asset_cache {
            let cache = cache_mutex
                .lock()
                .map_err(|e| Error::Other(format!("Asset cache lock poisoned: {}", e)))?;
            cache
                .update_material_uniforms(
                    &uri,
                    mat_idx,
                    base_color,
                    metallic,
                    roughness,
                    emissive,
                    occlusion_strength,
                )
                .map_err(Error::Other)?;
        }

        Ok(())
    }

    fn delete_node(&self, node_id: &str) -> Result<()> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;
        world.delete_node(node_id).map_err(Error::Other)
    }
}

/// Spawn a new ECS entity for a procedural mesh with a unique node ID.
fn spawn_procedural_entity(ecs_world: &mut bevy_ecs::prelude::World, uri: &str, label: &str) {
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let idx = COUNTER.fetch_add(1, Ordering::Relaxed);

    let node_id = format!("procedural_{}_{}", label.to_lowercase(), idx);
    let name = format!("{} {}", label, idx);

    ecs_world.spawn((
        SceneNodeId(node_id),
        NodeName(name),
        Transform::default(),
        GlobalTransform::identity(),
        MeshRef {
            asset: AssetHandle::for_mesh(uri, 0),
            uri: uri.to_string(),
            primitive_index: 0,
        },
    ));
}

/// Look up the MeshRef URI for a given scene node ID.
fn find_mesh_uri(ecs_world: &mut bevy_ecs::prelude::World, node_id: &str) -> Result<String> {
    let mut query = ecs_world.query::<(&SceneNodeId, &MeshRef)>();

    for (scene_id, mesh_ref) in query.iter(ecs_world) {
        if scene_id.0 == node_id {
            return Ok(mesh_ref.uri.clone());
        }
    }

    Err(Error::Other(format!(
        "Entity '{}' not found or has no mesh",
        node_id
    )))
}

/// Look up export-relevant mesh and material asset handles for a scene node.
fn find_export_refs(
    ecs_world: &mut bevy_ecs::prelude::World,
    node_id: &str,
) -> Result<(
    Option<String>,
    Option<AssetHandle>,
    Option<Light>,
    Option<Camera>,
)> {
    let mut query = ecs_world.query::<(
        &SceneNodeId,
        Option<&MeshRef>,
        Option<&MaterialRef>,
        Option<&Light>,
        Option<&Camera>,
    )>();

    for (scene_id, mesh_ref, material_ref, light, camera) in query.iter(ecs_world) {
        if scene_id.0 == node_id {
            return Ok((
                mesh_ref.map(|mesh| mesh.uri.clone()),
                material_ref.map(|material| material.asset.clone()),
                light.cloned(),
                camera.cloned(),
            ));
        }
    }

    Err(Error::Other(format!("Entity '{}' not found", node_id)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use neko_runtime_scene::SceneCommandEvent;

    #[test]
    fn test_scene_service_new() {
        let service = SceneService::new();
        let snapshot = service.get_snapshot().unwrap();
        assert!(snapshot.nodes.is_empty());
    }

    #[test]
    fn test_scene_service_default() {
        let service = SceneService::default();
        let clips = service.get_animation_clips().unwrap();
        assert!(clips.is_empty());
    }

    #[test]
    fn control_ack_health_records_scene_command_path() {
        let service = SceneService::new();
        let envelope = SceneCommandEnvelope {
            seq: 1,
            base_revision: 0,
            transaction_id: None,
            phase: None,
            coalesce_key: None,
            event: SceneCommandEvent::SetVisibility {
                node_id: "missing-node".to_string(),
                visible: false,
            },
        };

        let _ = service.apply_scene_command_with_delta(envelope).unwrap();
        let health = service.control_ack_health_sample(0);

        assert_eq!(health.pending_command_acks, 0);
        assert!(health.ack_p95_ms <= ControlAckHealthSample::ACK_P95_BUDGET_MS);
        assert!(health.ack_path_is_healthy());
        assert!(health.render_backlog_is_healthy());
    }

    #[test]
    fn shared_render_extract_reuses_same_scene_revision_for_multiple_viewports() {
        let service = SceneService::new();

        let first = service.prepare_shared_extract_for_test().unwrap();
        let second = service.prepare_shared_extract_for_test().unwrap();

        assert_eq!(first.0, second.0);
        assert!(first.2);
        assert!(!second.2);
        assert_eq!(first.3, 1);
        assert_eq!(second.3, 1);
    }

    #[test]
    fn service_export_glb_uses_engine_evaluated_animation_pose() {
        use neko_runtime_scene::components::{
            AnimationChannel, AnimationClipData, AnimationProperty, AnimationTarget,
            GlobalTransform, NodeName, SceneNodeId, SceneRoot, Transform,
        };

        let service = SceneService::new();
        {
            let mut world = service.world.lock().unwrap();
            let ecs = world.ecs_world_mut();
            ecs.spawn((
                SceneNodeId("node_0".to_string()),
                NodeName("Animated Node".to_string()),
                Transform::default(),
                GlobalTransform::identity(),
            ));
            let clip = AnimationClipData {
                name: "Move".to_string(),
                duration: 1.0,
                channels: vec![AnimationChannel::from_flat(
                    "node_0".to_string(),
                    AnimationProperty::Translation,
                    &[0.0, 1.0],
                    &[0.0, 0.0, 0.0, 1.0, 0.0, 0.0],
                )],
            };
            ecs.spawn((SceneRoot, AnimationTarget { clips: vec![clip] }));
        }

        service.tick("Move", 0.25).unwrap();
        let glb = service.export_glb().unwrap();
        let root = parse_glb_json_for_service_test(&glb);

        assert_json_array_approx_for_service_test(
            &root["nodes"][0]["translation"],
            &[0.25, 0.0, 0.0],
        );
    }

    fn parse_glb_json_for_service_test(glb: &[u8]) -> serde_json::Value {
        let json_len = u32::from_le_bytes([glb[12], glb[13], glb[14], glb[15]]) as usize;
        let json_str = std::str::from_utf8(&glb[20..20 + json_len]).unwrap().trim();
        serde_json::from_str(json_str).unwrap()
    }

    fn assert_json_array_approx_for_service_test(value: &serde_json::Value, expected: &[f64]) {
        let array = value.as_array().expect("json array");
        assert_eq!(array.len(), expected.len());
        for (actual, expected) in array.iter().zip(expected) {
            let actual = actual.as_f64().expect("json number");
            assert!(
                (actual - expected).abs() < 1e-5,
                "expected {expected}, got {actual}"
            );
        }
    }
}
