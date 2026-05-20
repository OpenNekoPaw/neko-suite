//! SceneService — implementation using runtime-scene crate
//!
//! Delegates live world access to SceneComputation and GPU work to renderer state.

use super::scene_computation::SceneComputation;
use super::scene_renderer::{
    SceneExportFrameQueue, SceneRenderRequest, SceneRenderSnapshot, SceneRenderer,
    SceneSnapshotWatch,
};
use crate::domain::FrameData;
use crate::encoder::encode_nv12_to_h264_iframe;
use crate::error::{Error, Result};
use crate::services::scene::ISceneService;
use neko_engine_gpu::GpuContext;
#[cfg(target_os = "macos")]
use neko_engine_gpu::RgbaToNv12TextureConverter;
use neko_engine_scene_renderer::{
    extract_render_world, CameraParams, ControlAckHealthSample, RenderExtractStats, RenderWorld,
    SceneRenderOutput, ViewportDescriptor, ViewportRenderGraphOutput,
};
use neko_engine_types::easing::EasingType;
use neko_engine_types::{
    FrameFormat, GpuFrameLease, GpuOutputHandle, GpuRenderPath, PipelineOutput,
    RenderFrameDiagnostics, VideoGpuFrame, VideoOutput,
};
use neko_runtime_media::encode_rgba_to_jpeg;
use neko_runtime_scene::access::{
    BeginModelingSession, CommitModelingSession, DataAccess, ProceduralSceneEntitySpec,
    SceneEntityFilter, SceneNodeMeshRef, SceneRenderExtractInput, SceneRenderExtraction,
    SceneRenderExtractor,
};
use neko_runtime_scene::animation_blend::SceneBlendLayerInfo;
use neko_runtime_scene::asset_database::{AssetDatabase, AssetHandle, MaterialDescriptorPatch};
use neko_runtime_scene::components::AnimationChannelInfo;
use neko_runtime_scene::exporter::{self, ExportNode};
use neko_runtime_scene::ik::IkChainInfo;
use neko_runtime_scene::procedural_mesh::ProceduralMesh;
use neko_runtime_scene::project::NkmProject;
use neko_runtime_scene::world::{AnimationClipInfo, SceneDelta, SceneSnapshot, SceneWorld};
use neko_runtime_scene::{
    BrushPatchApplyOutcome, ModelingSession, ModelingSessionStateDelta, TopologyChangeEvent,
    TopologyOperation, VertexBrushPatchMetadata,
};
use neko_runtime_scene::{SceneCommandAck, SceneCommandEnvelope};
use std::collections::{HashMap, VecDeque};
use std::path::Path;
use std::sync::{
    atomic::{AtomicU32, Ordering},
    Arc, Mutex, RwLock,
};
use std::time::{Duration, Instant};

const CONTROL_ACK_SAMPLE_CAPACITY: usize = 128;
#[cfg(target_os = "macos")]
const SCENE_STREAM_ENCODER_BRIDGE_CACHE_LIMIT: usize = 4;

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
        data: &mut impl DataAccess,
        asset_database: &AssetDatabase,
        camera: &CameraParams,
    ) -> SharedRenderExtract {
        let extraction = data.extract_render_world(
            SceneRenderExtractInput {
                asset_database,
                camera,
            },
            self,
        );
        let revision = extraction.revision;
        let extracted = self.revision != Some(revision);
        self.revision = Some(revision);
        self.stats = extraction.stats;
        self.render_world = extraction.render_world;
        if extracted {
            self.extract_count = self.extract_count.saturating_add(1);
        }
        SharedRenderExtract {
            revision,
            render_world: self.render_world.clone(),
            stats: self.stats,
            extracted,
        }
    }
}

impl SceneRenderExtractor<CameraParams> for SharedRenderExtractCache {
    type RenderWorld = RenderWorld;
    type Stats = RenderExtractStats;

    fn extract(
        &mut self,
        world: &mut bevy_ecs::world::World,
        input: SceneRenderExtractInput<'_, CameraParams>,
    ) -> SceneRenderExtraction<Self::RenderWorld, Self::Stats> {
        let revision = world
            .get_resource::<neko_runtime_scene::SceneRevision>()
            .map(|revision| revision.current())
            .unwrap_or_default();
        if self.revision != Some(revision) {
            self.stats = extract_render_world(
                world,
                input.asset_database,
                input.camera,
                &mut self.render_world,
            );
        }
        SceneRenderExtraction {
            revision,
            render_world: self.render_world.clone(),
            stats: self.stats,
        }
    }
}

/// Concrete scene service backed by bevy_ecs
pub struct SceneService {
    computation: SceneComputation,
    /// GPU context used for readback/capture helpers
    gpu_ctx: Option<Arc<GpuContext>>,
    /// Snapshot renderer and derived GPU cache (None if GPU unavailable)
    scene_renderer: Option<SceneRenderer>,
    /// Authoring asset descriptors used by export, Inspector, and GPU cache derivation
    asset_database: Mutex<AssetDatabase>,
    /// Runtime health metrics for the /v1/scenes/control ack path.
    control_ack_metrics: ControlAckMetrics,
    /// Shared render-only extraction reused by multiple viewports at the same scene revision.
    render_extract_cache: Mutex<SharedRenderExtractCache>,
    /// Latest extracted render snapshot for realtime preview consumers.
    realtime_snapshot_watch: SceneSnapshotWatch,
    /// Bounded complete-frame queue for export-style render consumers.
    export_frame_queue: SceneExportFrameQueue,
    /// CPU-side mesh cache for procedural meshes (needed for CSG lookups)
    procedural_meshes: Mutex<HashMap<String, ProceduralMesh>>,
    /// VRM face parameter presets (populated from NkmProject on load)
    face_params: Mutex<HashMap<String, f32>>,
    /// Editor camera override for viewport orbit controls.
    /// Read by the scene stream producer on each frame.
    editor_camera: RwLock<Option<CameraParams>>,
    /// Persistent macOS encoder bridge for realtime scene streams.
    #[cfg(target_os = "macos")]
    stream_encoder_bridges: Mutex<HashMap<String, RgbaToNv12TextureConverter>>,
}

impl SceneService {
    /// Create without GPU (scene management only, no rendering)
    pub fn new() -> Self {
        let (realtime_snapshot_watch, _snapshot_rx) =
            SceneSnapshotWatch::new(SceneRenderSnapshot::default());
        let computation = SceneComputation::new();
        let default_meshes = computation
            .data(|world| world.default_procedural_meshes().clone())
            .unwrap_or_default();
        Self {
            computation,
            gpu_ctx: None,
            scene_renderer: None,
            asset_database: Mutex::new(AssetDatabase::default()),
            control_ack_metrics: ControlAckMetrics::default(),
            render_extract_cache: Mutex::new(SharedRenderExtractCache::default()),
            realtime_snapshot_watch,
            export_frame_queue: SceneExportFrameQueue::bounded(),
            procedural_meshes: Mutex::new(default_meshes),
            face_params: Mutex::new(HashMap::new()),
            editor_camera: RwLock::new(None),
            #[cfg(target_os = "macos")]
            stream_encoder_bridges: Mutex::new(HashMap::new()),
        }
    }

    /// Create with GPU context (enables render_frame)
    pub fn with_gpu(ctx: Arc<GpuContext>) -> Self {
        let (realtime_snapshot_watch, _snapshot_rx) =
            SceneSnapshotWatch::new(SceneRenderSnapshot::default());
        let computation = SceneComputation::new();
        let default_meshes = computation
            .data(|world| world.default_procedural_meshes().clone())
            .unwrap_or_default();
        let scene_renderer = SceneRenderer::new(Arc::clone(&ctx));
        for (uri, mesh) in &default_meshes {
            if let Err(error) = scene_renderer.register_procedural_mesh(uri, 0, mesh) {
                tracing::warn!(
                    "Failed to register default scene mesh '{}' in GPU cache: {}",
                    uri,
                    error
                );
            }
        }
        Self {
            computation,
            gpu_ctx: Some(ctx),
            scene_renderer: Some(scene_renderer),
            asset_database: Mutex::new(AssetDatabase::default()),
            control_ack_metrics: ControlAckMetrics::default(),
            render_extract_cache: Mutex::new(SharedRenderExtractCache::default()),
            realtime_snapshot_watch,
            export_frame_queue: SceneExportFrameQueue::bounded(),
            procedural_meshes: Mutex::new(default_meshes),
            face_params: Mutex::new(HashMap::new()),
            editor_camera: RwLock::new(None),
            #[cfg(target_os = "macos")]
            stream_encoder_bridges: Mutex::new(HashMap::new()),
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
        self.computation.current_revision()
    }

    #[cfg(test)]
    pub fn latest_render_snapshot_generation(&self) -> u64 {
        self.realtime_snapshot_watch.latest_generation()
    }

    #[cfg(test)]
    pub fn pop_export_render_snapshot_generation(&self) -> Result<Option<u64>> {
        self.export_frame_queue
            .try_pop()
            .map(|snapshot| snapshot.map(|snapshot| snapshot.generation))
    }

    #[allow(dead_code)]
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
        self.computation.apply_scene_command_with_delta(envelope)
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
        self.computation
            .begin_modeling_session(BeginModelingSession {
                session_id,
                mesh_id,
                character_id,
                topology_mutable,
                before_hash,
            })
    }

    pub fn commit_modeling_session(
        &self,
        session_id: &str,
        operation: TopologyOperation,
        vertex_count_before: u32,
        vertex_count_after: u32,
    ) -> Result<(TopologyChangeEvent, Option<SceneDelta>)> {
        self.computation
            .commit_modeling_session(CommitModelingSession {
                session_id: session_id.to_string(),
                operation,
                vertex_count_before,
                vertex_count_after,
            })
    }

    pub fn cancel_modeling_session(
        &self,
        session_id: &str,
    ) -> Result<(ModelingSessionStateDelta, Option<SceneDelta>)> {
        self.computation.cancel_modeling_session(session_id)
    }

    pub fn apply_vertex_brush_patch(
        &self,
        patch: VertexBrushPatchMetadata,
    ) -> Result<BrushPatchApplyOutcome> {
        let outcome = self.computation.apply_vertex_brush_patch(patch)?;

        if let Some(renderer) = &self.scene_renderer {
            renderer.record_mesh_dirty_region(&outcome.dirty_region)?;
        }

        Ok(outcome)
    }

    #[cfg(test)]
    fn prepare_shared_extract_for_test(&self) -> Result<(u64, RenderExtractStats, bool, u64)> {
        let shared_extract = self.prepare_shared_extract(&CameraParams::default())?;
        let cache = self
            .render_extract_cache
            .lock()
            .map_err(|e| Error::Other(format!("Render extract cache lock poisoned: {}", e)))?;
        Ok((
            shared_extract.revision,
            shared_extract.stats,
            shared_extract.extracted,
            cache.extract_count,
        ))
    }

    fn prepare_shared_extract(&self, camera: &CameraParams) -> Result<SharedRenderExtract> {
        let asset_database = self
            .asset_database
            .lock()
            .map_err(|e| Error::Other(format!("Asset database lock poisoned: {}", e)))?;
        let mut cache = self
            .render_extract_cache
            .lock()
            .map_err(|e| Error::Other(format!("Render extract cache lock poisoned: {}", e)))?;
        let shared_extract = self
            .computation
            .data(|world| cache.prepare(world, &asset_database, camera))?;
        let render_snapshot = SceneRenderSnapshot {
            generation: shared_extract.revision,
            render_world: shared_extract.render_world.clone(),
        };
        self.realtime_snapshot_watch
            .publish(render_snapshot.clone())?;
        if self.export_frame_queue.try_push(render_snapshot).is_err() {
            let _ = self.export_frame_queue.try_pop()?;
            self.export_frame_queue.try_push(SceneRenderSnapshot {
                generation: shared_extract.revision,
                render_world: shared_extract.render_world.clone(),
            })?;
        }
        drop(asset_database);
        Ok(shared_extract)
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
        let scene_renderer = self
            .scene_renderer
            .as_ref()
            .ok_or_else(|| Error::Other("GPU not available for rendering".into()))?;

        if let Some(clip) = clip_name {
            self.computation
                .creative(|world| world.tick(clip, time))
                .map(|_| ())?;
        }

        let stored_camera = self.get_editor_camera();
        let default_camera = CameraParams::default();
        let camera = camera_override
            .or(stored_camera.as_ref())
            .unwrap_or(&default_camera);

        let shared_extract = self.prepare_shared_extract(camera)?;
        tracing::trace!(
            scene_revision = shared_extract.revision,
            extracted = shared_extract.extracted,
            instances = shared_extract.stats.instances,
            cameras = shared_extract.stats.cameras,
            lights = shared_extract.stats.lights,
            "Prepared shared scene RenderWorld extract"
        );

        scene_renderer.render(
            shared_extract.revision,
            SceneRenderRequest {
                snapshot: &shared_extract.render_world,
                camera,
                output_size,
                background_color,
                viewport_graph,
            },
        )
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

    pub fn render_scene_stream_gpu_output(
        &self,
        output_size: (u32, u32),
        camera_override: Option<&CameraParams>,
        background_color: Option<[f32; 4]>,
        pts_us: i64,
        duration_us: i64,
        frame_index: u64,
        viewport: &ViewportDescriptor,
        dropped_frames_since_last: u32,
    ) -> Result<PipelineOutput> {
        let frame = self.render_scene_stream_gpu_frame(
            output_size,
            camera_override,
            background_color,
            pts_us,
            duration_us,
            frame_index,
            viewport,
            dropped_frames_since_last,
        )?;
        Ok(PipelineOutput::Video(VideoOutput::GpuFrame(frame)))
    }

    #[cfg(target_os = "macos")]
    fn render_scene_stream_gpu_frame(
        &self,
        output_size: (u32, u32),
        camera_override: Option<&CameraParams>,
        background_color: Option<[f32; 4]>,
        pts_us: i64,
        duration_us: i64,
        frame_index: u64,
        viewport: &ViewportDescriptor,
        dropped_frames_since_last: u32,
    ) -> Result<VideoGpuFrame> {
        let render_started = Instant::now();
        let output = self.render_frame_internal(
            None,
            0.0,
            output_size,
            camera_override,
            background_color,
            Some((viewport, ViewportRenderGraphOutput::RealtimeStream)),
        )?;
        let render_time_ms = render_started.elapsed().as_secs_f32() * 1000.0;
        let pool_snapshot = self
            .scene_renderer
            .as_ref()
            .map(|renderer| renderer.render_target_pool_snapshot());
        let ctx = self
            .gpu_ctx
            .as_ref()
            .ok_or_else(|| Error::Other("GPU not available for scene stream".to_string()))?;
        let bridge_key = scene_stream_encoder_bridge_key(
            viewport,
            output.width,
            output.height,
            viewport.color_space.nv12_matrix_id(),
        );
        let mut bridges = self.stream_encoder_bridges.lock().map_err(|e| {
            Error::Other(format!("Scene stream encoder bridge lock poisoned: {}", e))
        })?;
        if !bridges.contains_key(&bridge_key)
            && bridges.len() >= SCENE_STREAM_ENCODER_BRIDGE_CACHE_LIMIT
        {
            prune_scene_stream_encoder_bridges(&mut bridges, &viewport.viewport_id);
        }
        let converter = match bridges.get_mut(&bridge_key) {
            Some(converter) => converter,
            None => {
                bridges.insert(
                    bridge_key.clone(),
                    RgbaToNv12TextureConverter::new(Arc::clone(ctx))?,
                );
                bridges.get_mut(&bridge_key).ok_or_else(|| {
                    Error::Other("Scene stream encoder bridge unavailable".to_string())
                })?
            }
        };
        let convert_started = Instant::now();
        let (gpu_handle, backing_owner, convert_stats) = converter
            .convert_to_encoder_handle_with_owner(
                &output.color_view,
                output.width,
                output.height,
                viewport.color_space.nv12_matrix_id(),
            )?;
        let convert_time_ms = convert_started.elapsed().as_secs_f32() * 1000.0;

        Ok(VideoGpuFrame {
            lease: GpuFrameLease::with_keepalive(gpu_handle, backing_owner),
            pts: pts_us,
            duration: duration_us,
            frame_index,
            width: output.width,
            height: output.height,
            diagnostics: Some(RenderFrameDiagnostics {
                render_path: GpuRenderPath::GpuZeroCopy,
                iosurface_creations: convert_stats.iosurface_creations,
                texture_allocations: pool_snapshot
                    .map(|snapshot| snapshot.texture_allocations)
                    .unwrap_or_default(),
                render_time_ms,
                convert_time_ms,
                encode_time_ms: 0.0,
                gpu_wait_time_ms: convert_stats.gpu_wait_time_ms,
                dropped_frames_since_last,
                queue_depth: pool_snapshot
                    .map(|snapshot| snapshot.active_leases as u32)
                    .unwrap_or_default(),
            }),
        })
    }

    #[cfg(not(target_os = "macos"))]
    fn render_scene_stream_gpu_frame(
        &self,
        _output_size: (u32, u32),
        _camera_override: Option<&CameraParams>,
        _background_color: Option<[f32; 4]>,
        _pts_us: i64,
        _duration_us: i64,
        _frame_index: u64,
        _viewport: &ViewportDescriptor,
        _dropped_frames_since_last: u32,
    ) -> Result<VideoGpuFrame> {
        Err(Error::UnsupportedCapability(format!(
            "scene GPU stream output is not implemented on {}",
            std::env::consts::OS
        )))
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
        diagnostics: None,
    }
}

#[cfg(target_os = "macos")]
fn scene_stream_encoder_bridge_key(
    viewport: &ViewportDescriptor,
    width: u32,
    height: u32,
    color_space: u32,
) -> String {
    format!(
        "{}:{}x{}:{}",
        viewport.viewport_id, width, height, color_space
    )
}

#[cfg(target_os = "macos")]
fn prune_scene_stream_encoder_bridges(
    bridges: &mut HashMap<String, RgbaToNv12TextureConverter>,
    active_viewport_id: &str,
) {
    let stale_key = bridges
        .keys()
        .find(|key| !key.starts_with(active_viewport_id))
        .cloned()
        .or_else(|| bridges.keys().next().cloned());
    if let Some(key) = stale_key {
        bridges.remove(&key);
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
        let (load_result, snapshot) = self
            .computation
            .creative(|world| {
                let load_result = world.load_model(path)?;
                let snapshot = world.get_snapshot();
                Ok::<_, neko_runtime_scene::loader::LoadError>((load_result, snapshot))
            })?
            .map_err(|e| Error::Other(format!("Failed to load model: {}", e)))?;
        {
            let mut database = self
                .asset_database
                .lock()
                .map_err(|e| Error::Other(format!("Asset database lock poisoned: {}", e)))?;
            *database = load_result.asset_database;
        }
        {
            let mut meshes = self
                .procedural_meshes
                .lock()
                .map_err(|e| Error::Other(format!("Procedural meshes lock poisoned: {}", e)))?;
            meshes.clear();
        }

        if let Some(renderer) = &self.scene_renderer {
            if let Err(e) = renderer.load_gltf(path) {
                tracing::warn!("Failed to load GPU assets for {}: {}", path.display(), e);
            }
        }

        Ok(snapshot)
    }

    fn get_snapshot(&self) -> Result<SceneSnapshot> {
        self.computation.creative(|world| world.get_snapshot())
    }

    fn update_transform(
        &self,
        node_id: &str,
        position: [f32; 3],
        rotation: [f32; 4],
        scale: [f32; 3],
    ) -> Result<()> {
        self.computation
            .creative(|world| {
                world.update_transform(
                    node_id,
                    glam::Vec3::from(position),
                    glam::Quat::from_array(rotation),
                    glam::Vec3::from(scale),
                )
            })?
            .map_err(Error::Other)
    }

    fn tick(&self, clip_name: &str, time: f32) -> Result<SceneDelta> {
        self.computation
            .creative(|world| world.tick(clip_name, time))
    }

    fn get_animation_clips(&self) -> Result<Vec<AnimationClipInfo>> {
        self.computation
            .creative(|world| world.get_animation_clips())
    }

    fn create_shape(&self, params: serde_json::Value) -> Result<SceneSnapshot> {
        let shape_params: neko_runtime_scene::procedural::ShapeParams =
            serde_json::from_value(params)
                .map_err(|e| Error::Other(format!("Invalid shape params: {}", e)))?;
        let mesh = neko_runtime_scene::procedural::generate_shape(&shape_params);
        let uri = format!("procedural://shape_{}", uuid::Uuid::new_v4());

        if let Some(renderer) = &self.scene_renderer {
            if let Err(e) = renderer.register_procedural_mesh(&uri, 0, &mesh) {
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

        self.computation.data(|world| {
            world.spawn_procedural(ProceduralSceneEntitySpec {
                uri,
                label: "Shape".to_string(),
            });
            world.get_snapshot()
        })
    }

    fn create_text_mesh(&self, params: serde_json::Value) -> Result<SceneSnapshot> {
        let text_params: neko_runtime_scene::text_mesh::TextMeshParams =
            serde_json::from_value(params)
                .map_err(|e| Error::Other(format!("Invalid text mesh params: {}", e)))?;
        let mesh = neko_runtime_scene::text_mesh::generate_text_mesh(&text_params)
            .map_err(|e| Error::Other(format!("Text mesh generation failed: {}", e)))?;
        let uri = format!("procedural://text_{}", uuid::Uuid::new_v4());

        if let Some(renderer) = &self.scene_renderer {
            if let Err(e) = renderer.register_procedural_mesh(&uri, 0, &mesh) {
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

        self.computation.data(|world| {
            world.spawn_procedural(ProceduralSceneEntitySpec {
                uri,
                label: "Text".to_string(),
            });
            world.get_snapshot()
        })
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

        let (uri_a, uri_b) = self.computation.data(|world| {
            Ok::<_, Error>((
                world.mesh_uri(entity_a).map_err(Error::Other)?,
                world.mesh_uri(entity_b).map_err(Error::Other)?,
            ))
        })??;

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

        if let Some(renderer) = &self.scene_renderer {
            if let Err(e) = renderer.register_procedural_mesh(&uri, 0, &result_mesh) {
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

        self.computation.data(|world| {
            world.spawn_procedural(ProceduralSceneEntitySpec {
                uri,
                label: "CSG".to_string(),
            });
            world.get_snapshot()
        })
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

    fn capture_display_frame(
        &self,
        clip_name: Option<&str>,
        time: f32,
        output_size: (u32, u32),
        camera_override: Option<&CameraParams>,
        background_color: Option<[f32; 4]>,
        quality: u8,
    ) -> Result<FrameData> {
        SceneService::capture_display_frame(
            self,
            clip_name,
            time,
            output_size,
            camera_override,
            background_color,
            quality,
        )
    }

    fn capture_h264_keyframe(
        &self,
        output_size: (u32, u32),
        camera_override: Option<&CameraParams>,
        background_color: Option<[f32; 4]>,
        quality: u32,
        pts_us: i64,
        duration_us: i64,
        viewport: &ViewportDescriptor,
    ) -> Result<FrameData> {
        SceneService::capture_h264_keyframe(
            self,
            output_size,
            camera_override,
            background_color,
            quality,
            pts_us,
            duration_us,
            viewport,
        )
    }

    fn render_scene_stream_gpu_output(
        &self,
        output_size: (u32, u32),
        camera_override: Option<&CameraParams>,
        background_color: Option<[f32; 4]>,
        pts_us: i64,
        duration_us: i64,
        frame_index: u64,
        viewport: &ViewportDescriptor,
        dropped_frames_since_last: u32,
    ) -> Result<PipelineOutput> {
        SceneService::render_scene_stream_gpu_output(
            self,
            output_size,
            camera_override,
            background_color,
            pts_us,
            duration_us,
            frame_index,
            viewport,
            dropped_frames_since_last,
        )
    }

    fn set_editor_camera(&self, camera: CameraParams) {
        SceneService::set_editor_camera(self, camera);
    }

    fn get_editor_camera(&self) -> Option<CameraParams> {
        SceneService::get_editor_camera(self)
    }

    fn control_ack_health_sample(&self, render_backlog_frames: u32) -> ControlAckHealthSample {
        SceneService::control_ack_health_sample(self, render_backlog_frames)
    }

    fn current_revision(&self) -> Result<u64> {
        SceneService::current_revision(self)
    }

    fn apply_scene_command_with_delta(
        &self,
        envelope: SceneCommandEnvelope,
    ) -> Result<(Vec<SceneCommandAck>, Option<SceneDelta>)> {
        SceneService::apply_scene_command_with_delta(self, envelope)
    }

    fn begin_modeling_session(
        &self,
        session_id: String,
        mesh_id: String,
        character_id: Option<String>,
        topology_mutable: bool,
        before_hash: String,
    ) -> Result<(ModelingSession, Option<SceneDelta>)> {
        SceneService::begin_modeling_session(
            self,
            session_id,
            mesh_id,
            character_id,
            topology_mutable,
            before_hash,
        )
    }

    fn commit_modeling_session(
        &self,
        session_id: &str,
        operation: TopologyOperation,
        vertex_count_before: u32,
        vertex_count_after: u32,
    ) -> Result<(TopologyChangeEvent, Option<SceneDelta>)> {
        SceneService::commit_modeling_session(
            self,
            session_id,
            operation,
            vertex_count_before,
            vertex_count_after,
        )
    }

    fn cancel_modeling_session(
        &self,
        session_id: &str,
    ) -> Result<(ModelingSessionStateDelta, Option<SceneDelta>)> {
        SceneService::cancel_modeling_session(self, session_id)
    }

    fn apply_vertex_brush_patch(
        &self,
        patch: VertexBrushPatchMetadata,
    ) -> Result<BrushPatchApplyOutcome> {
        SceneService::apply_vertex_brush_patch(self, patch)
    }

    fn export_glb(&self) -> Result<Vec<u8>> {
        let (snapshot, serialized) = self.computation.data(|world| {
            (
                world.get_snapshot(),
                world.serialize_entities(SceneEntityFilter::Export),
            )
        })?;

        let export_refs: HashMap<_, _> = serialized
            .export_refs
            .into_iter()
            .map(|export_ref| (export_ref.node_id.clone(), export_ref))
            .collect();
        let export_nodes: Vec<ExportNode> = snapshot
            .nodes
            .iter()
            .map(|node| {
                let export_ref = export_refs.get(&node.id);
                ExportNode {
                    snapshot: node.clone(),
                    mesh_uri: export_ref.and_then(|value| value.mesh_uri.clone()),
                    material_handle: export_ref.and_then(|value| value.material_handle.clone()),
                    light: export_ref.and_then(|value| value.light.clone()),
                    camera: export_ref.and_then(|value| value.camera.clone()),
                }
            })
            .collect();

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

        let clips_ref = if serialized.animation_clips.is_empty() {
            None
        } else {
            Some(serialized.animation_clips.as_slice())
        };
        let fp_ref = if fp.is_empty() { None } else { Some(&*fp) };

        exporter::export_glb(&export_nodes, &pm, &asset_database, clips_ref, fp_ref)
            .map_err(|e| Error::Other(format!("GLB export failed: {}", e)))
    }

    fn save_project(&self, path: &str, editor_state: serde_json::Value) -> Result<()> {
        let (snapshot, node_mesh_map) = self.computation.data(|world| {
            let snapshot = world.get_snapshot();
            let serialized = world.serialize_entities(SceneEntityFilter::Project);
            (snapshot, serialized.node_mesh_map)
        })?;

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

        let default_meshes = self.computation.creative(|world| {
            world.restore_snapshot(&project.scene_snapshot);
            world.default_procedural_meshes().clone()
        })?;

        // Restore procedural meshes and re-register in GPU cache
        {
            let mut pm = self
                .procedural_meshes
                .lock()
                .map_err(|e| Error::Other(format!("Procedural meshes lock poisoned: {}", e)))?;
            *pm = project.procedural_meshes.clone();
            pm.extend(default_meshes);

            if let Some(renderer) = &self.scene_renderer {
                for (uri, mesh) in &*pm {
                    if let Err(e) = renderer.register_procedural_mesh(uri, 0, mesh) {
                        tracing::warn!("Failed to re-register mesh '{}' in GPU cache: {}", uri, e);
                    }
                }
            }
        }

        let mesh_refs: Vec<SceneNodeMeshRef> = project
            .node_mesh_map
            .iter()
            .map(|(node_id, mesh_uri)| SceneNodeMeshRef {
                node_id: node_id.clone(),
                mesh_uri: mesh_uri.clone(),
                primitive_index: 0,
            })
            .collect();
        self.computation
            .data(|world| world.insert_mesh_refs(&mesh_refs))?;

        // Restore face params for VRM export
        {
            let mut fp = self
                .face_params
                .lock()
                .map_err(|e| Error::Other(format!("Face params lock poisoned: {}", e)))?;
            *fp = project.face_params.clone();
        }

        let final_snapshot = self.computation.creative(|world| world.get_snapshot())?;
        Ok((final_snapshot, project.editor_state))
    }

    fn get_keyframe_tracks(&self, clip_name: &str) -> Result<Vec<AnimationChannelInfo>> {
        self.computation
            .creative(|world| world.get_keyframe_tracks(clip_name))?
            .map_err(Error::Other)
    }

    fn add_keyframe(
        &self,
        clip_name: &str,
        node_id: &str,
        property: &str,
        timestamp: f32,
        values: Vec<f32>,
    ) -> Result<String> {
        self.computation
            .creative(|world| world.add_keyframe(clip_name, node_id, property, timestamp, values))?
            .map_err(Error::Other)
    }

    fn remove_keyframe(&self, clip_name: &str, keyframe_id: &str) -> Result<()> {
        self.computation
            .creative(|world| world.remove_keyframe(clip_name, keyframe_id))?
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
        self.computation
            .creative(|world| {
                world.update_keyframe(clip_name, keyframe_id, timestamp, values, easing)
            })?
            .map_err(Error::Other)
    }

    fn create_clip(&self, name: &str, duration: f32) -> Result<()> {
        self.computation
            .creative(|world| world.create_clip(name, duration))?
            .map_err(Error::Other)
    }

    fn crossfade_animation(
        &self,
        clip_name: &str,
        fade_duration: f32,
        loop_anim: bool,
    ) -> Result<()> {
        self.computation
            .creative(|world| world.crossfade_animation(clip_name, fade_duration, loop_anim))?
            .map_err(Error::Other)
    }

    fn set_blend_weight(&self, clip_name: &str, weight: f32) -> Result<()> {
        self.computation
            .creative(|world| world.set_blend_weight(clip_name, weight))?
            .map_err(Error::Other)
    }

    fn get_blend_state(&self) -> Result<Vec<SceneBlendLayerInfo>> {
        self.computation.creative(|world| world.get_blend_state())
    }

    fn create_ik_chain(
        &self,
        root_joint: &str,
        end_effector: &str,
        solver: &str,
        iterations: u32,
        tolerance: f32,
    ) -> Result<String> {
        self.computation
            .creative(|world| {
                world.create_ik_chain(root_joint, end_effector, solver, iterations, tolerance)
            })?
            .map_err(Error::Other)
    }

    fn remove_ik_chain(&self, chain_id: &str) -> Result<()> {
        self.computation
            .creative(|world| world.remove_ik_chain(chain_id))?
            .map_err(Error::Other)
    }

    fn set_ik_target(
        &self,
        chain_id: &str,
        position: [f32; 3],
        rotation: Option<[f32; 4]>,
        pole: Option<[f32; 3]>,
    ) -> Result<()> {
        self.computation
            .creative(|world| world.set_ik_target(chain_id, position, rotation, pole))?
            .map_err(Error::Other)
    }

    fn set_ik_enabled(&self, chain_id: &str, enabled: bool) -> Result<()> {
        self.computation
            .creative(|world| world.set_ik_enabled(chain_id, enabled))?
            .map_err(Error::Other)
    }

    fn get_ik_chains(&self) -> Result<Vec<IkChainInfo>> {
        self.computation.creative(|world| world.get_ik_chains())
    }

    fn set_visible(&self, node_id: &str, visible: bool) -> Result<()> {
        self.computation
            .creative(|world| world.set_visible(node_id, visible))?
            .map_err(Error::Other)
    }

    fn set_morph_weights(&self, node_id: &str, weights: Vec<f32>) -> Result<()> {
        self.computation
            .creative(|world| world.set_morph_weights(node_id, weights))?
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
        let mat_ref = self
            .computation
            .creative(|world| world.get_material_ref(node_id))?
            .map_err(Error::Other)?;

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
        if let Some(renderer) = &self.scene_renderer {
            renderer.update_material_uniforms(
                &uri,
                mat_idx,
                base_color,
                metallic,
                roughness,
                emissive,
                occlusion_strength,
            )?;
        }

        Ok(())
    }

    fn delete_node(&self, node_id: &str) -> Result<()> {
        self.computation
            .creative(|world| world.delete_node(node_id))?
            .map_err(Error::Other)
    }
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
    fn shared_render_extract_updates_snapshot_watch_and_bounded_export_queue() {
        let service = SceneService::new();

        assert_eq!(service.latest_render_snapshot_generation(), 0);
        let first = service.prepare_shared_extract_for_test().unwrap();
        assert_eq!(service.latest_render_snapshot_generation(), first.0);
        assert_eq!(
            service.pop_export_render_snapshot_generation().unwrap(),
            Some(first.0)
        );
        assert_eq!(
            service.pop_export_render_snapshot_generation().unwrap(),
            None
        );

        let _ = service.prepare_shared_extract_for_test().unwrap();
        let _ = service.prepare_shared_extract_for_test().unwrap();
        assert_eq!(
            service.pop_export_render_snapshot_generation().unwrap(),
            Some(first.0)
        );
        assert_eq!(
            service.pop_export_render_snapshot_generation().unwrap(),
            None
        );
    }

    #[test]
    fn service_export_glb_uses_engine_evaluated_animation_pose() {
        use serde_json::json;

        let service = SceneService::new();
        let snapshot = service
            .create_shape(json!({
                "type": "cube",
                "width": 1.0,
                "height": 1.0,
                "depth": 1.0
            }))
            .unwrap();
        let node_id = snapshot.nodes[0].id.clone();
        service.create_clip("Move", 1.0).unwrap();
        service
            .add_keyframe("Move", &node_id, "translation", 0.0, vec![0.0, 0.0, 0.0])
            .unwrap();
        service
            .add_keyframe("Move", &node_id, "translation", 1.0, vec![1.0, 0.0, 0.0])
            .unwrap();

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
