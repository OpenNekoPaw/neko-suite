# neko-engine MVC 分层架构重构方案

> 使用 MVC 分层架构重构 native-core 和 native-api，同时避免 native-napi、native-cli、native-http 直接调用 native-core，而是由 native-api 中转。优先实现 timeline、video、audio、task、nodes 等相关功能，scenes、canvas 等作为未来开发计划。
>
> 本文档与 [refactor.md](./refactor.md)（统一接口层方案）互补：refactor.md 定义了统一路由规范和接口分组，本文档聚焦 **native-core 和 native-api 内部的 MVC 分层设计**。

---

## 1. 现状诊断

### 1.1 当前架构问题

```
native-napi (114KB media_processor.rs) ──直接调用──→ native-core (扁平导出 60+ 符号)
native-cli  (runner.rs)                ──直接调用──→ native-core
frame_server (内嵌 HTTP 路由)          ──混合在──→ native-core 内部
```

**核心问题：native-core 是一个"大泥球"，缺乏内部分层。**

| 问题 | 现象 | 根因 |
|------|------|------|
| **数据模型重复** | `JviTypes`（jvi/types.rs）和 `ExportTypes`（export/types.rs）定义了两套几乎相同的时间线数据结构 | 缺少统一的领域模型层 |
| **业务逻辑散落** | ExportService 同时管理 Job 状态机、GPU 管线编排、音频混流、系统监控、进度广播 | 缺少 Service 层拆分，单一职责违反 |
| **路由与核心耦合** | frame_server/server.rs 内嵌 export/probe/extract/cache 的 HTTP 路由 | 表现层（路由）混入核心库 |
| **扁平化导出** | lib.rs 通过 `pub use` 导出 60+ 符号，模块边界被抹平 | 外部消费者看到的是无层次的 API 表面 |
| **状态管理分散** | DecoderPool、TexturePool、KeyframeLruCache 各自管理生命周期 | 缺少统一的资源/会话管理 |

### 1.2 ExportService 职责过载分析

当前 `ExportService`（export/service.rs, 695 行）承担了过多职责：

```
ExportService
├── Job 状态机管理（Pending → Initializing → Encoding → Muxing → Finalizing → Completed）
├── GPU 管线初始化（GpuExportPipeline + GpuContext）
├── 音频混流编排（AudioMixer）
├── 异步编码管线（AsyncExportPipeline）
├── 进度计算与广播（broadcast channel）
├── 系统资源监控（SystemMonitor）
├── 性能统计收集（FrameStatsCollector）
├── 平台特定逻辑（macOS zero-copy IOSurface vs CPU fallback）
└── 外部进程调用（ffmpeg 音频 mux）
```

**这是典型的 God Object 反模式**，需要通过 MVC 分层拆解。

### 1.3 双重数据模型问题

```
JVI 数据模型 (jvi/types.rs)          Export 数据模型 (export/types.rs)
─────────────────────────            ─────────────────────────────────
ProjectData                          TimelineData
├── Vec<JviTrack>                    ├── duration: f64
│   ├── JviElement::Media            ├── Vec<TrackData>
│   ├── JviElement::Audio            │   ├── TrackType (Video/Audio/Text/Effect)
│   ├── JviElement::Text             │   └── Vec<ElementData>
│   ├── JviElement::Shape            │       ├── ElementData::Media
│   └── JviElement::Subtitle         │       ├── ElementData::Text
├── Resolution                       │       └── ElementData::Audio
└── ProjectDefaults                  └── (无 Shape/Subtitle)

问题：JviLoader 通过 JviConverter 将 JVI → Export 类型，两套模型字��高度重叠但不完全一致。
```

---

## 2. MVC 分层设计

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                    View Layer (接入层)                     │
│  native-napi │ native-cli │ native-http │ extension      │
│  (JS 桥接)    │ (命令行)    │ (REST/WS)   │ (VSCode)      │
└──────────────┬──────────────────────────────────────────┘
               │ ActionRequest / ActionResponse
               ▼
┌─────────────────────────────────────────────────────────┐
│                 Controller Layer (native-api)             │
│  ActionRouter → GroupController → 编排 Service 调用       │
│  SessionManager │ ResourceRegistry │ ProgressReporter     │
└──────────────┬──────────────────────────────────────────┘
               │ 调用 Service trait 接口
               ▼
┌─────────────────────────────────────────────────────────┐
│                  Model Layer (native-core)                │
│                                                          │
│  ┌─ Domain Models ──────────────────────────────────┐    │
│  │ Timeline │ Track │ Element │ Transform │ Audio    │    │
│  │ MediaInfo │ KeyframeIndex │ ExportJob │ ...       │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│  ┌─ Service Traits ─────────────────────────────────┐    │
│  │ IVideoService │ IAudioService │ ITimelineService  │    │
│  │ IExportService │ INodeService │ ITaskService      │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│  ┌─ Service Impls ──────────────────────────────────┐    │
│  │ VideoService │ AudioService │ TimelineService     │    │
│  │ ExportService │ NodeService │ TaskService         │    │
│  └──────────────┬───────────────────────────────────┘    │
│                 │ 调用 Infrastructure                     │
│  ┌─ Infrastructure ─────────────────────────────────┐    │
│  │ gpu/ │ decoder/ │ encoder/ │ audio/ │ monitor/    │    │
│  │ keyframe_cache/ │ preview/ │ telemetry/           │    │
│  └──────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

### 2.2 各层职责

| 层 | 包 | 职责 | 不做什么 |
|----|-----|------|----------|
| **View** | native-napi, native-cli, native-http | 协议适配（JS/CLI/HTTP → ActionRequest）、序列化/反序列化 | 不含业务逻辑、不直接调用 native-core |
| **Controller** | native-api | 请求路由、Service 编排、会话管理、资源注册、进度聚合 | 不含 GPU/编解码等底层操作 |
| **Model** | native-core | 领域模型定义、业务逻辑实现、基础设施封装 | 不含路由/协议/序列化 |

### 2.3 依赖方向（严格单向）

```
View → Controller → Model

禁止：View → Model（必须经过 Controller）
禁止：Model → Controller（通过 trait 回调/事件解耦）
禁止：Controller → Infrastructure（通过 Service trait 间接访问）
```

---

## 3. Model 层设计（native-core 重构）

### 3.1 目录结构

```
native-core/src/
├── lib.rs                  # 仅导出 domain + services 公开接口
│
├── domain/                 # 领域模型（纯数据，无副作用）
│   ├── mod.rs
│   ├── timeline.rs         # Timeline, Track, Element, TrackType
│   ├── media.rs            # MediaInfo, VideoStream, AudioStream, SubtitleStream
│   ├── transform.rs        # Transform, Position, Scale, Rotation, Anchor
│   ├── audio.rs            # AudioProperties, AudioCodecInfo, WaveformData
│   ├── effects.rs          # EffectParams, BlendMode, TransitionType
│   ├── animation.rs        # Keyframe, KeyframeTrack, Easing, AnimatableValue
│   ├── keyframe_index.rs   # KeyframeInfo, VideoCodecType, IdrIndex
│   ├── export.rs           # ExportSettings, ExportJob, ExportState, ExportProgress
│   ├── resource.rs         # ResourceId, ResourceHandle, ResourceType
│   └── error.rs            # 统一错误类型
│
├── services/               # 业务逻辑（trait 定义 + 实现）
│   ├── mod.rs
│   ├── traits/             # Service trait 接口定义
│   │   ├── mod.rs
│   │   ├── video.rs        # IVideoService
│   │   ├── audio.rs        # IAudioService
│   │   ├── timeline.rs     # ITimelineService
│   │   ├── export.rs       # IExportService
│   │   ├── node.rs         # INodeService
│   │   └── task.rs         # ITaskService
│   ├── video.rs            # VideoService impl
│   ├── audio.rs            # AudioService impl
│   ├── timeline.rs         # TimelineService impl
│   ├── export.rs           # ExportService impl（瘦身后）
│   ├── node.rs             # NodeService impl
│   └── task.rs             # TaskService impl
│
├── infra/                  # 基础设施（GPU、编解码、IO）
│   ├── mod.rs
│   ├── gpu/                # 现有 gpu/ 模块（保持不变）
│   ├── decoder/            # 现有 decoder/ 模块
│   ├── encoder/            # 现有 encoder/ 模块
│   ├── audio/              # 现有 audio/ 模块
│   ├── keyframe_cache/     # 现有 keyframe_cache/ 模块
│   ├── preview/            # 现有 preview/ 模块
│   ├── monitor/            # 现有 monitor/ 模块
│   ├── telemetry/          # 现有 telemetry/ 模块
│   └── jvi/                # JVI 加载器（转换为 domain 模型）
│
└── (删除 frame_server/)    # HTTP 路由迁移到 native-http
```

### 3.2 统一领域模型

合并 JVI 和 Export 的双重数据模型为单一领域模型：

```rust
// domain/timeline.rs — 统一时间线模型

/// Track type classification
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TrackType {
    Video,
    Audio,
    Text,
    Effect,
    Subtitle,  // 从 JVI 模型补全
    Shape,     // 从 JVI 模型补全
}

/// A timeline represents a complete editing project
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Timeline {
    pub duration: f64,
    pub resolution: Resolution,
    pub fps: f64,
    pub tracks: Vec<Track>,
    pub defaults: Option<ProjectDefaults>,
}

/// A track contains ordered elements of the same type
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Track {
    pub id: String,
    pub track_type: TrackType,
    pub elements: Vec<Element>,
    pub muted: bool,
    pub locked: bool,
}

/// An element is a clip on the timeline
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Element {
    pub id: String,
    pub element_type: ElementType,
    pub start_time: f64,
    pub duration: f64,
    pub trim_start: f64,
    pub trim_end: f64,
    pub transform: Transform,
    pub opacity: f64,
    pub blend_mode: BlendMode,
    pub effects: Vec<EffectParams>,
    pub animations: Vec<KeyframeTrack>,
}

/// Element-specific data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ElementType {
    Media(MediaElementData),
    Audio(AudioElementData),
    Text(TextElementData),
    Shape(ShapeElementData),
    Subtitle(SubtitleElementData),
}

/// Media element (video/image)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaElementData {
    pub source_path: String,
    pub resource_id: Option<ResourceId>,
    pub audio: Option<AudioProperties>,
}
```

```rust
// domain/transform.rs — 统一变换模型

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transform {
    pub position: Position,
    pub scale: Scale,
    pub rotation: f64,
    pub anchor: Anchor,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Position {
    pub x: f64,  // normalized 0.0..1.0
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Scale {
    pub x: f64,  // 1.0 = 100%
    pub y: f64,
}

impl Transform {
    /// Convert normalized coordinates to pixel coordinates for GPU pipeline
    pub fn to_pixel_coords(&self, canvas_width: u32, canvas_height: u32) -> PixelTransform {
        PixelTransform {
            x: (self.position.x * canvas_width as f64) as i32,
            y: (self.position.y * canvas_height as f64) as i32,
            width: (self.scale.x * canvas_width as f64) as u32,
            height: (self.scale.y * canvas_height as f64) as u32,
            rotation: self.rotation,
        }
    }
}
```

```rust
// domain/export.rs — 导出任务模型

/// Export job state machine
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ExportState {
    Pending,
    Initializing,
    Encoding,
    Muxing,
    Finalizing,
    Completed,
    Paused,      // 新增：支持暂停
    Cancelled,
    Error,
}

/// Export job — pure data, no behavior
#[derive(Debug, Clone)]
pub struct ExportJob {
    pub job_id: String,
    pub state: ExportState,
    pub timeline: Timeline,
    pub settings: ExportSettings,
    pub output_path: String,
    pub progress: ExportProgress,
    pub metadata: Option<ExportMetadata>,
}

/// Export progress — pure data
#[derive(Debug, Clone, Default)]
pub struct ExportProgress {
    pub current_frame: u64,
    pub total_frames: u64,
    pub elapsed_ms: u64,
    pub estimated_remaining_ms: u64,
    pub stats: Option<ExportStats>,
}

impl ExportProgress {
    pub fn ratio(&self) -> f64 {
        if self.total_frames > 0 {
            self.current_frame as f64 / self.total_frames as f64
        } else {
            0.0
        }
    }
}
```

### 3.3 Service Trait 定义

每个 Service trait 对应 refactor.md 中的一个 Group，定义纯业务接口：

```rust
// services/traits/video.rs

#[async_trait]
pub trait IVideoService: Send + Sync {
    /// Probe media file metadata
    async fn probe(&self, source: &Path) -> Result<MediaInfo>;

    /// Capture a single frame at given time
    async fn capture(&self, source: &Path, time: f64, opts: CaptureOptions) -> Result<FrameData>;

    /// Extract frame range or subtitles
    async fn extract(&self, source: &Path, opts: ExtractOptions) -> Result<ExtractResult>;

    /// Get IDR keyframe index list
    async fn keyframes(&self, source: &Path) -> Result<Vec<KeyframeInfo>>;

    /// Generate audio waveform data from video
    async fn waveform(&self, source: &Path, opts: WaveformOptions) -> Result<WaveformData>;

    /// Generate proxy file for preview editing
    async fn proxy(&self, source: &Path, opts: ProxyOptions) -> Result<ProxyResult>;
}
```

```rust
// services/traits/timeline.rs

#[async_trait]
pub trait ITimelineService: Send + Sync {
    /// Composite a single frame from timeline at given time
    async fn composite(&self, timeline: &Timeline, time: f64, opts: CompositeOptions)
        -> Result<FrameData>;

    /// Start a real-time preview stream, returns session handle
    async fn start_stream(&self, timeline: &Timeline, opts: StreamOptions)
        -> Result<StreamSession>;

    /// Stop a preview stream
    async fn stop_stream(&self, session_id: &str) -> Result<()>;

    /// Playback control signals (operate on existing stream session)
    async fn pause(&self, session_id: &str) -> Result<()>;
    async fn resume(&self, session_id: &str) -> Result<()>;
    async fn set_speed(&self, session_id: &str, rate: f64) -> Result<()>;
    async fn set_loop(&self, session_id: &str, region: LoopRegion) -> Result<()>;

    /// Keyframe-cached seek within a stream session
    async fn seek_keyframe(&self, session_id: &str, target_time: f64)
        -> Result<KeyframeSeekResult>;
}
```

```rust
// services/traits/export.rs

/// Export service — only manages export job lifecycle
/// GPU pipeline orchestration delegated to ExportPipelineOrchestrator
#[async_trait]
pub trait IExportService: Send + Sync {
    /// Start an export job, returns job_id
    async fn start(&self, timeline: Timeline, settings: ExportSettings, output: &str)
        -> Result<String>;

    /// Subscribe to progress updates for a job
    fn subscribe(&self, job_id: &str) -> Result<ProgressReceiver>;
}
```

```rust
// services/traits/task.rs

/// Task service — unified lifecycle management for all async jobs
#[async_trait]
pub trait ITaskService: Send + Sync {
    /// Query task progress
    async fn probe(&self, task_id: &str) -> Result<TaskProgress>;

    /// Pause a running task
    async fn pause(&self, task_id: &str) -> Result<()>;

    /// Resume a paused task
    async fn resume(&self, task_id: &str) -> Result<()>;

    /// Cancel and cleanup a task
    async fn cancel(&self, task_id: &str, cleanup: bool) -> Result<()>;

    /// List all active tasks
    async fn list(&self) -> Result<Vec<TaskSummary>>;
}
```

```rust
// services/traits/audio.rs

#[async_trait]
pub trait IAudioService: Send + Sync {
    /// Probe audio file metadata
    async fn probe(&self, source: &Path) -> Result<AudioInfo>;

    /// Extract audio data
    async fn extract(&self, source: &Path, opts: AudioExtractOptions) -> Result<AudioData>;

    /// Generate waveform peaks
    async fn waveform(&self, source: &Path, opts: WaveformOptions) -> Result<WaveformData>;
}
```

```rust
// services/traits/node.rs

pub trait INodeService: Send + Sync {
    /// Health check — GPU availability, codec support
    fn health(&self) -> HealthStatus;

    /// Resource metrics — CPU/GPU/RAM/VRAM usage
    fn metric(&self) -> ResourceSnapshot;
}
```

### 3.4 ExportService 拆分

将当前的 God Object ExportService 拆分为职责单一的组件：

```
当前 ExportService (695 行, 9 个职责)
    │
    ▼ 拆分为
┌─────────────────────────────────────────────────┐
│ ExportService (services/export.rs)               │
│ 职责：Job 生命周期管理 + 状态机                    │
│ 依赖：ExportPipelineOrchestrator, ITaskService   │
└──────────────┬──────────────────────────────────┘
               │ 委托
┌──────────────▼──────────────────────────────────┐
│ ExportPipelineOrchestrator (infra 内部)           │
│ 职责：GPU 管线 + 编码 + 音频混流的编排             │
│ 依赖：GpuExportPipeline, AsyncExportPipeline,    │
│       AudioMixer, FrameStatsCollector            │
└──────────────┬──────────────────────────────────┘
               │ 使用
┌──────────────▼──────────────────────────────────┐
│ 现有 Infrastructure 模块（不变）                   │
│ GpuContext, HwAccelDecoder, HwAccelEncoder,      │
│ AudioMixer, SystemMonitor, ...                   │
└─────────────────────────────────────────────────┘
```

```rust
// services/export.rs — 瘦身后的 ExportService

pub struct ExportService {
    orchestrator: Arc<ExportPipelineOrchestrator>,
    task_manager: Arc<dyn ITaskService>,
}

#[async_trait]
impl IExportService for ExportService {
    async fn start(
        &self,
        timeline: Timeline,
        settings: ExportSettings,
        output: &str,
    ) -> Result<String> {
        let job_id = generate_job_id();
        let total_frames = timeline.total_frames(settings.fps);

        // Register as a managed task
        let task = self.task_manager.register(TaskConfig {
            id: job_id.clone(),
            task_type: TaskType::Export,
            total_units: total_frames,
        }).await?;

        // Delegate pipeline execution to orchestrator
        let orchestrator = Arc::clone(&self.orchestrator);
        let task_handle = task.handle();

        tokio::task::spawn_blocking(move || {
            orchestrator.execute(timeline, settings, output, task_handle)
        });

        Ok(job_id)
    }

    fn subscribe(&self, job_id: &str) -> Result<ProgressReceiver> {
        self.task_manager.subscribe(job_id)
    }
}
```

### 3.5 JVI 加载器适配

JviLoader 改为输出统一领域模型，消除双重数据模型：

```
当前：JVI File → JviLoader → JviTypes → JviConverter → ExportTypes
重构：JVI File → JviLoader → domain::Timeline（统一模型）
```

```rust
// infra/jvi/loader.rs（重构后）

impl JviLoader {
    /// Load .jvi file and convert to unified domain model
    pub fn load(path: &Path) -> Result<Timeline> {
        let raw: JviRawProject = serde_json::from_reader(File::open(path)?)?;
        Self::convert_to_domain(raw)
    }

    fn convert_to_domain(raw: JviRawProject) -> Result<Timeline> {
        Ok(Timeline {
            duration: raw.duration,
            resolution: Resolution {
                width: raw.resolution.width,
                height: raw.resolution.height,
            },
            fps: raw.fps.unwrap_or(30.0),
            tracks: raw.tracks.into_iter()
                .map(Self::convert_track)
                .collect::<Result<Vec<_>>>()?,
            defaults: raw.defaults.map(Self::convert_defaults),
        })
    }
}
```

### 3.6 lib.rs 导出重构

从扁平化 60+ 符号改为分层导出：

```rust
// native-core/src/lib.rs（重构后）

// Public API: domain models + service traits
pub mod domain;
pub mod services;

// Internal: infrastructure (not directly accessible by Controller)
pub(crate) mod infra;

// Re-export commonly used types for convenience
pub use domain::{Timeline, Track, Element, MediaInfo, ExportSettings, ExportJob};
pub use services::traits::*;

// Service factory — Controller 通过此函数获取 Service 实例
pub fn create_services(config: EngineConfig) -> Result<ServiceContainer> {
    ServiceContainer::new(config)
}

/// Dependency injection container
pub struct ServiceContainer {
    pub video: Arc<dyn IVideoService>,
    pub audio: Arc<dyn IAudioService>,
    pub timeline: Arc<dyn ITimelineService>,
    pub export: Arc<dyn IExportService>,
    pub task: Arc<dyn ITaskService>,
    pub node: Arc<dyn INodeService>,
}
```

---

## 4. Controller 层设计（native-api）

### 4.1 目录结构

```
native-api/src/
├── lib.rs                  # 公开 EngineApi 入口
├── engine.rs               # EngineApi — 顶层门面，持有 ServiceContainer
├── router.rs               # ActionRouter — {group}:{action} 分发
├── registry.rs             # ResourceRegistry — ID ↔ 句柄映射 + 路径补偿
├── session.rs              # SessionManager — 多窗口会话隔离
├── progress.rs             # ProgressReporter — 统一进度聚合与广播
├── controllers/
│   ├── mod.rs
│   ├── video.rs            # VideoController — 编排 IVideoService
│   ├── audio.rs            # AudioController — 编排 IAudioService
│   ├── timeline.rs         # TimelineController — 编排 ITimelineService
│   ├── export.rs           # ExportController — 编排 IExportService + ITaskService
│   ├── task.rs             # TaskController — 编排 ITaskService
│   └── node.rs             # NodeController — 编排 INodeService
└── types.rs                # ActionRequest, ActionResponse（复用 refactor.md 定义）
```

### 4.2 EngineApi — 顶层门面

```rust
// native-api/src/engine.rs

use native_core::{create_services, EngineConfig, ServiceContainer};

/// Top-level API facade — single entry point for all View layers
pub struct EngineApi {
    services: ServiceContainer,
    router: ActionRouter,
    registry: ResourceRegistry,
    sessions: SessionManager,
}

impl EngineApi {
    pub async fn new(config: EngineConfig) -> Result<Self> {
        let services = create_services(config)?;
        let registry = ResourceRegistry::new();
        let sessions = SessionManager::new();
        let router = ActionRouter::new(&services, &registry, &sessions);

        Ok(Self { services, router, registry, sessions })
    }

    /// Unified dispatch — all View layers call this single method
    pub async fn dispatch(&self, request: ActionRequest) -> ActionResponse {
        self.router.route(request).await
    }

    /// Direct service access — for View layers that need typed APIs
    /// (e.g., native-napi streaming sessions)
    pub fn video(&self) -> &dyn IVideoService { self.services.video.as_ref() }
    pub fn audio(&self) -> &dyn IAudioService { self.services.audio.as_ref() }
    pub fn timeline(&self) -> &dyn ITimelineService { self.services.timeline.as_ref() }
    pub fn export(&self) -> &dyn IExportService { self.services.export.as_ref() }
    pub fn task(&self) -> &dyn ITaskService { self.services.task.as_ref() }
    pub fn node(&self) -> &dyn INodeService { self.services.node.as_ref() }
}
```

### 4.3 ActionRouter — 请求分发

```rust
// native-api/src/router.rs

/// Route {group}:{action} to the appropriate controller method
pub struct ActionRouter {
    video: VideoController,
    audio: AudioController,
    timeline: TimelineController,
    export: ExportController,
    task: TaskController,
    node: NodeController,
}

impl ActionRouter {
    pub async fn route(&self, req: ActionRequest) -> ActionResponse {
        match req.group.as_str() {
            "videos"    => self.video.handle(req).await,
            "audios"    => self.audio.handle(req).await,
            "timelines" => self.timeline.handle(req).await,
            "tasks"     => self.task.handle(req).await,
            "nodes"     => self.node.handle(req).await,
            // Future: canvas, scenes, models
            _ => ActionResponse::error(req.id, "UNKNOWN_GROUP", "Unknown resource group"),
        }
    }
}
```

### 4.4 Controller 示例 — VideoController

Controller 的职责是：解析请求参数 → 调用 Service → 包装响应。不含业务逻辑。

```rust
// native-api/src/controllers/video.rs

pub struct VideoController {
    service: Arc<dyn IVideoService>,
    registry: Arc<ResourceRegistry>,
}

impl VideoController {
    pub async fn handle(&self, req: ActionRequest) -> ActionResponse {
        match req.action.as_str() {
            "probe"     => self.handle_probe(req).await,
            "capture"   => self.handle_capture(req).await,
            "extract"   => self.handle_extract(req).await,
            "keyframes" => self.handle_keyframes(req).await,
            "waveform"  => self.handle_waveform(req).await,
            "proxy"     => self.handle_proxy(req).await,
            _ => ActionResponse::error(req.id, "UNKNOWN_ACTION", "Unknown video action"),
        }
    }

    async fn handle_probe(&self, req: ActionRequest) -> ActionResponse {
        // 1. Resolve resource (ID-first, path-fallback)
        let source = self.registry.resolve_source(&req)?;

        // 2. Delegate to service (pure business logic)
        match self.service.probe(&source).await {
            Ok(info) => ActionResponse::ok(req.id, serde_json::to_value(info).unwrap()),
            Err(e) => ActionResponse::from_error(req.id, e),
        }
    }

    async fn handle_capture(&self, req: ActionRequest) -> ActionResponse {
        let source = self.registry.resolve_source(&req)?;
        let time = req.option_f64("time").unwrap_or(0.0);
        let opts = CaptureOptions::from_request(&req);

        match self.service.capture(&source, time, opts).await {
            Ok(frame) => ActionResponse::ok(req.id, serde_json::to_value(frame).unwrap()),
            Err(e) => ActionResponse::from_error(req.id, e),
        }
    }

    // ... other handlers follow the same pattern
}
```

### 4.5 Controller 示例 — TimelineController（含信令编排）

```rust
// native-api/src/controllers/timeline.rs

pub struct TimelineController {
    service: Arc<dyn ITimelineService>,
    export_service: Arc<dyn IExportService>,
    sessions: Arc<SessionManager>,
}

impl TimelineController {
    pub async fn handle(&self, req: ActionRequest) -> ActionResponse {
        match req.action.as_str() {
            "composite" => self.handle_composite(req).await,
            "stream"    => self.handle_stream(req).await,
            "export"    => self.handle_export(req).await,
            // Playback control signals — require active stream session
            "pause"     => self.handle_signal(req, |s, sid| s.pause(sid)).await,
            "resume"    => self.handle_signal(req, |s, sid| s.resume(sid)).await,
            "speed"     => self.handle_speed(req).await,
            "loop"      => self.handle_loop(req).await,
            "keyframe"  => self.handle_keyframe_seek(req).await,
            _ => ActionResponse::error(req.id, "UNKNOWN_ACTION", "Unknown timeline action"),
        }
    }

    /// Generic signal handler — validates session then delegates
    async fn handle_signal<F, Fut>(&self, req: ActionRequest, f: F) -> ActionResponse
    where
        F: FnOnce(Arc<dyn ITimelineService>, &str) -> Fut,
        Fut: std::future::Future<Output = Result<()>>,
    {
        let session_id = match req.session_id.as_deref() {
            Some(id) => id,
            None => return ActionResponse::error(req.id, "MISSING_SESSION", "session_id required"),
        };

        // Validate session exists
        if !self.sessions.exists(session_id) {
            return ActionResponse::error(req.id, "SESSION_NOT_FOUND", "Stream session not found");
        }

        match f(Arc::clone(&self.service), session_id).await {
            Ok(()) => ActionResponse::ok(req.id, serde_json::json!({ "state": "ok" })),
            Err(e) => ActionResponse::from_error(req.id, e),
        }
    }

    async fn handle_export(&self, req: ActionRequest) -> ActionResponse {
        let timeline = req.parse_body::<Timeline>()?;
        let settings = ExportSettings::from_request(&req);
        let output = req.option_str("output").unwrap_or_default();

        match self.export_service.start(timeline, settings, &output).await {
            Ok(job_id) => ActionResponse::ok(req.id, serde_json::json!({
                "job_id": job_id,
                "status": "started"
            })),
            Err(e) => ActionResponse::from_error(req.id, e),
        }
    }
}
```

### 4.6 ResourceRegistry — 资源管理

设计详见 [refactor.md §3.4](./refactor.md#34-资源管理id-优先路径补偿)，此处补充 Controller 层的使用方式：

```rust
// native-api/src/registry.rs

impl ResourceRegistry {
    /// Resolve source path from ActionRequest
    /// Priority: ID hit → path fallback → error
    pub fn resolve_source(&self, req: &ActionRequest) -> Result<PathBuf> {
        // Try ID first
        if let Some(handle) = self.handles.get(&req.id) {
            return Ok(handle.source_path().to_path_buf());
        }
        // Path fallback
        if let Some(source) = &req.source {
            let path = PathBuf::from(source);
            self.register_path(&req.id, &path);
            return Ok(path);
        }
        Err(Error::ResourceNotFound(req.id.clone()))
    }
}
```

### 4.7 SessionManager — 会话隔离

```rust
// native-api/src/session.rs

/// Manages isolated sessions for concurrent multi-window usage
pub struct SessionManager {
    sessions: DashMap<String, Session>,
}

pub struct Session {
    pub id: String,
    pub created_at: Instant,
    pub resources: Vec<ResourceId>,  // session-scoped resources
    pub streams: Vec<String>,        // active stream IDs
}

impl SessionManager {
    pub fn create(&self, session_id: &str) -> &Session { /* ... */ }
    pub fn exists(&self, session_id: &str) -> bool { /* ... */ }
    pub fn destroy(&self, session_id: &str) { /* cleanup all session resources */ }
}
```

### 4.8 ProgressReporter — 统一进度

```rust
// native-api/src/progress.rs

/// Aggregates progress from multiple sources into unified stream
pub struct ProgressReporter {
    subscribers: DashMap<String, Vec<broadcast::Sender<ActionResponse>>>,
}

impl ProgressReporter {
    /// Subscribe to progress updates for a specific task
    pub fn subscribe(&self, task_id: &str) -> broadcast::Receiver<ActionResponse> { /* ... */ }

    /// Report progress (called by TaskService)
    pub fn report(&self, task_id: &str, progress: TaskProgress) { /* ... */ }
}
```

---

## 5. View 层设计（接入层适配）

### 5.1 核心原则

所有 View 层遵循同一模式：**协议适配 → EngineApi.dispatch() → 响应序列化**。

```
View 层代码量目标：
├── native-napi: 114KB → ~25KB（纯类型转换 + bridge）
├── native-cli:  保持精简（参数解析 + dispatch）
└── native-http: 纯路由映射（axum handler → dispatch）
```

### 5.2 native-napi 重构

```rust
// native-napi/src/bridge.rs

use napi::*;
use napi_derive::napi;
use native_api::EngineApi;

/// Thin bridge: JS types → ActionRequest → EngineApi → ActionResponse → JS types
#[napi]
pub struct NativeEngine {
    api: Arc<EngineApi>,
}

#[napi]
impl NativeEngine {
    #[napi(factory)]
    pub async fn create(config: JsEngineConfig) -> Result<Self> {
        let config = EngineConfig::from(config);
        let api = EngineApi::new(config).await
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        Ok(Self { api: Arc::new(api) })
    }

    /// Generic dispatch — for dynamic action routing
    #[napi]
    pub async fn dispatch(&self, request: JsActionRequest) -> Result<JsActionResponse> {
        let req = ActionRequest::from(request);
        let resp = self.api.dispatch(req).await;
        Ok(JsActionResponse::from(resp))
    }

    /// Typed convenience methods — for frequently used operations
    #[napi]
    pub async fn probe_media(&self, path: String) -> Result<JsMediaInfo> {
        let info = self.api.video().probe(Path::new(&path)).await
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        Ok(JsMediaInfo::from(info))
    }

    #[napi]
    pub async fn extract_frame(
        &self, source: String, time: f64, quality: Option<u32>,
    ) -> Result<Buffer> {
        let opts = CaptureOptions { quality: quality.unwrap_or(85), ..Default::default() };
        let frame = self.api.video().capture(Path::new(&source), time, opts).await
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        Ok(Buffer::from(frame.data))
    }

    // ... other typed convenience methods
}
```

**兼容策略**：保留现有 NAPI 函数签名作为 `#[deprecated]` 包装，内部转发到 `NativeEngine`：

```rust
// native-napi/src/compat.rs — transitional compatibility layer

#[napi]
#[deprecated(note = "Use NativeEngine.probe_media() instead")]
pub async fn probe_media(path: String) -> Result<JsMediaInfo> {
    let engine = get_global_engine().await?;
    engine.probe_media(path).await
}
```

### 5.3 native-cli 重构

```rust
// native-cli/src/runner.rs（重构后）

use native_api::EngineApi;

pub struct Runner {
    api: EngineApi,
}

impl Runner {
    pub async fn new() -> Result<Self> {
        let api = EngineApi::new(EngineConfig::default()).await?;
        Ok(Self { api })
    }

    pub async fn run(&self, cmd: Command) -> Result<()> {
        match cmd {
            Command::Probe(args) => {
                let info = self.api.video().probe(&args.input).await?;
                match args.format {
                    OutputFormat::Json => println!("{}", serde_json::to_string_pretty(&info)?),
                    OutputFormat::Text => print_media_info(&info),
                }
            }
            Command::Extract(args) => {
                let opts = CaptureOptions {
                    quality: args.quality,
                    width: args.width,
                    height: args.height,
                    ..Default::default()
                };
                let frame = self.api.video().capture(&args.input, args.time, opts).await?;
                std::fs::write(&args.output, &frame.data)?;
            }
            Command::Export(args) => {
                let timeline = JviLoader::load(&args.jvi_file)?;
                let settings = ExportSettings::from_cli_args(&args);
                let job_id = self.api.export().start(timeline, settings, &args.output).await?;

                // Poll progress until done
                self.poll_progress(&job_id).await?;
            }
            Command::Serve(args) => {
                // Start HTTP server (native-http)
                native_http::start_server(self.api.clone(), args.port).await?;
            }
        }
        Ok(())
    }
}
```

### 5.4 native-http 重构

```rust
// native-http/src/routes/mod.rs

use axum::{Router, Json, extract::State};
use native_api::EngineApi;

pub fn build_router(api: Arc<EngineApi>) -> Router {
    Router::new()
        // Assets
        .route("/v1/videos/:id::action", post(handle_video))
        .route("/v1/audios/:id::action", post(handle_audio))
        .route("/v1/images/:id::action", post(handle_image))
        // Compositions
        .route("/v1/timelines/:id::action", post(handle_timeline))
        // Infrastructure
        .route("/v1/nodes/:id::action", post(handle_node))
        .route("/v1/tasks/:id::action", post(handle_task))
        // WebSocket streaming
        .route("/v1/stream", get(handle_ws_stream))
        .with_state(api)
}

/// Generic handler — all REST routes follow the same pattern
async fn handle_video(
    State(api): State<Arc<EngineApi>>,
    Path((id, action)): Path<(String, String)>,
    Json(body): Json<serde_json::Value>,
) -> Json<ActionResponse> {
    let req = ActionRequest {
        group: "videos".to_string(),
        id,
        action,
        source: body.get("source").and_then(|v| v.as_str()).map(String::from),
        session_id: body.get("session_id").and_then(|v| v.as_str()).map(String::from),
        options: body.get("options").cloned().unwrap_or_default(),
    };
    Json(api.dispatch(req).await)
}
```

### 5.5 View 层对比

| View | 输入协议 | 调用方式 | 输出协议 |
|------|---------|---------|---------|
| **native-napi** | JS 对象 (napi) | `EngineApi.dispatch()` 或 typed methods | JS 对象 (napi) |
| **native-cli** | CLI args (clap) | `EngineApi.video().probe()` 等 typed calls | stdout (text/json) |
| **native-http** | HTTP JSON (axum) | `EngineApi.dispatch()` | HTTP JSON |
| **extension** | postMessage | 通过 native-napi 间接调用 | postMessage |

---

## 6. 实施计划

### 6.1 分阶段迁移策略

采用**绞杀者模式（Strangler Fig）**：新代码在 MVC 结构中编写，旧代码逐步迁移，两者共存直到迁移完成。

### Phase 1: 建立 domain 层 + Service traits

**目标**：定义统一领域模型和 Service 接口，不改动现有实现。

**任务：**
1. 在 native-core 中创建 `domain/` 目录，定义统一数据模型
   - 合并 JVI + Export 双重模型为 `domain::Timeline`
   - 提取 `domain::MediaInfo`、`domain::Transform`、`domain::ExportJob` 等
2. 在 native-core 中创建 `services/traits/` 目录，定义 6 个 Service trait
   - P0: `IVideoService`, `ITimelineService`, `IExportService`, `ITaskService`
   - P1: `IAudioService`, `INodeService`
3. 现有代码不变，domain 和 traits 作为新增模块

**验证**：`cargo build --workspace` 通过，无功能变更。

### Phase 2: 实现 Service 层（P0 优先）

**目标**：在 `services/` 中实现 P0 Service，内部调用现有 infra 模块。

**任务：**
1. 实现 `VideoService`（封装 decoder/probe/extract/keyframe_cache）
2. 实现 `TimelineService`（封装 gpu/compositor + preview/pipeline）
3. 拆分 ExportService → `ExportService`（Job 管理）+ `ExportPipelineOrchestrator`（管线编排）
4. 实现 `TaskService`（统一任务生命周期管理，从 ExportService 提取）
5. 实现 `ServiceContainer` 工厂

**验证**：为每个 Service 编写单元测试，Mock infra 依赖。

### Phase 3: 构建 Controller 层（native-api）

**目标**：创建 native-api 包，实现 EngineApi + ActionRouter + Controllers。

**任务：**
1. 创建 `packages/native-api/` crate
2. 实现 `EngineApi`（门面）、`ActionRouter`（分发）、`ResourceRegistry`（资源管理）
3. 实现 6 个 Controller（video/audio/timeline/export/task/node）
4. 实现 `SessionManager` 和 `ProgressReporter`

**验证**：集成测试直接调用 `EngineApi.dispatch()`，覆盖所有 group:action 组合。

### Phase 4: 迁移 View 层

**目标**：将 native-napi/cli/http 改为通过 native-api 中转。

**任务：**
1. native-napi：新增 `NativeEngine` 类，内部调用 `EngineApi`
   - 保留旧函数签名标记 `#[deprecated]`，内部转发
   - 目标：`media_processor.rs` 从 114KB 降至 ~25KB
2. native-cli：`Runner` 改为调用 `EngineApi`
3. 从 native-core 提取 frame_server HTTP 路由到 native-http
4. extension 层通过新 native-napi 接口接入

**兼容策略**：旧 NAPI 函数签名保留一个版本周期，标记 deprecated。

### Phase 5: 清理与优化

**目标**：删除旧代码路径，优化 lib.rs 导出。

**任务：**
1. 删除 native-core 中的 `frame_server/` HTTP 路由代码（已迁移到 native-http）
2. 重构 `lib.rs` 导出：从扁平 60+ 符号改为 `domain` + `services` 分层导出
3. 删除 `export/types.rs` 中与 `domain/` 重复的类型定义
4. 删除 `jvi/types.rs` 中与 `domain/` 重复的类型定义（JviLoader 直接输出 domain 模型）
5. 删除 native-napi 中的 deprecated 兼容函数

**验证**：全量测试通过，`cargo build --workspace` 无 warning。

### 6.2 优先级矩阵

| 模块 | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Phase 5 |
|------|---------|---------|---------|---------|---------|
| **domain models** | ✅ 定义 | — | — | — | 清理旧类型 |
| **IVideoService** | ✅ trait | ✅ impl | ✅ controller | ✅ napi bridge | — |
| **ITimelineService** | ✅ trait | ✅ impl | ✅ controller | ✅ napi bridge | — |
| **IExportService** | ✅ trait | ✅ impl + 拆分 | ✅ controller | ✅ napi bridge | — |
| **ITaskService** | ✅ trait | ✅ impl | ✅ controller | ✅ napi bridge | — |
| **IAudioService** | ✅ trait | P1 impl | P1 controller | P1 bridge | — |
| **INodeService** | ✅ trait | P1 impl | P1 controller | P1 bridge | — |
| **canvas/scenes** | — | — | 预留接口 | — | 未来实现 |

### 6.3 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| domain 模型与现有 infra 类型不兼容 | Phase 1 仅新增，不改现有类型；Phase 2 通过 `From` trait 桥接 |
| Service 层引入额外性能开销 | Service 是薄封装，热路径（GPU 管线）仍直接调用 infra，无额外拷贝 |
| native-napi 兼容性断裂 | 保留旧函数签名一个版本周期，标记 deprecated，内部转发到新接口 |
| ExportService 拆分导致状态一致性问题 | TaskService 作为唯一状态源，ExportService 通过 TaskHandle 更新进度 |
| 多 Service 间循环依赖 | ServiceContainer 统一注入，Service 间通过 trait 引用，无直接依赖 |
| frame_server 迁移期间功能中断 | Phase 4 先在 native-http 中实现新路由，验证通过后再删除 native-core 中的旧路由 |

---

## 7. 与 refactor.md 的关系

| 维度 | refactor.md | mvc-refactor.md（本文档） |
|------|-------------|--------------------------|
| **关注点** | 统一路由规范、接口分组、请求/响应契约 | native-core 和 native-api 内部的 MVC 分层 |
| **定义了什么** | `v1/{group}/{id}:{action}` 路由、各 group 的 action 列表、传输架构 | domain 模型、Service trait、Controller 编排、View 适配 |
| **互补关系** | 本文档的 Controller 层实现 refactor.md 定义的路由规范 | refactor.md 的接口分组对应本文档的 Service trait |

**映射关系：**

```
refactor.md 的 Group     →  mvc-refactor.md 的 Service trait + Controller
─────────────────────        ──────────────────────────────────────────────
videos                   →  IVideoService + VideoController
audios                   →  IAudioService + AudioController
timelines                →  ITimelineService + TimelineController
tasks                    →  ITaskService + TaskController
nodes                    →  INodeService + NodeController
canvas (预留)            →  ICanvasService (未来)
scenes (预留)            →  ISceneService (未来)
```

---

## 8. 硬件抽象层（HAL）设计

### 8.1 现状分析

当前 GPU 跨平台能力参差不齐：

| 组件 | macOS | Linux | Windows | 抽象质量 |
|------|-------|-------|---------|---------|
| GPU 上下文 | Metal | Vulkan | DX12 | ✅ 优秀（wgpu 已抽象） |
| 纹理导入 | IOSurface | DMA-BUF | D3D11 | ✅ 良好（Nv12TextureImporter 门面） |
| NV12 渲染 | ✅ | ✅ | ✅ | ✅ 优秀（纯 wgpu） |
| RGBA↔NV12 | ✅ | ✅ | ✅ | ✅ 优秀（wgpu compute shader） |
| 硬件解码 | VideoToolbox | VAAPI | D3D11VA | ✅ 良好（Decoder trait） |
| 硬件编码 | VideoToolbox | ❌ CPU 回退 | ❌ CPU 回退 | ❌ 差（仅 macOS GPU 路径） |
| GPU 管线模式 | ZeroCopy | Hybrid | Hybrid | ⚠️ 一般（编译期硬编码） |
| 纹理导出 | IOSurface | ❌ 缺失 | ❌ 缺失 | ❌ 差（无跨平台 trait） |
| 合成器 | ✅ | ✅ | ✅ | ✅ 优秀（纯 wgpu） |

**核心差距**：解码侧已有良好抽象，编码侧（GPU→编码器的零拷贝传输）仅 macOS 实现，Linux/Windows 被迫 CPU 回退。

### 8.2 五大抽象缺口

| # | 缺口 | 现象 | 影响 |
|---|------|------|------|
| 1 | **无跨平台 GPU 编码路径** | `encode_frame_gpu()` 仅 macOS 实现，Linux/Windows 返回 Error | Linux/Windows 导出性能损失 30-50%（CPU 回退） |
| 2 | **GpuTextureHandle 是 cfg 枚举** | 每个消费者都需 `#[cfg]` 匹配变体 | 新增平台需修改所有 match 点 |
| 3 | **无 GPU 导出 trait** | macOS IOSurface 导出硬编码在 `macos_export.rs` | 无法扩展到 Linux DMA-BUF / Windows D3D11 导出 |
| 4 | **管线模式编译期决定** | `detect_pipeline_mode()` 用 `#[cfg]` 而非运行时检测 | 无法利用 Linux VAAPI 编码等运行时能力 |
| 5 | **硬件编码器检测脆弱** | Linux 检查 `/dev/nvidia0` 文件，Windows 检查 DLL 名 | 误判率高，无法检测实际编码能力 |

### 8.3 HAL 架构设计

在 `infra/` 层引入硬件抽象层，将平台特定代码隔离在 trait 实现之后：

```
infra/
├── hal/                        # 【新增】硬件抽象层
│   ├── mod.rs                  # HAL trait 定义 + 平台工厂
│   ├── traits.rs               # 核心 trait：GpuTextureHandle, GpuImporter, GpuExporter, HwEncoder
│   ├── capabilities.rs         # 运行时能力检测
│   ├── platform/
│   │   ├── mod.rs              # 平台分发
│   │   ├── macos.rs            # macOS: IOSurface import/export, VideoToolbox encode
│   │   ├── linux.rs            # Linux: DMA-BUF import/export, VAAPI encode
│   │   └── windows.rs          # Windows: D3D11 import/export, D3D11VA/NVENC encode
│   └── testing.rs              # Mock 实现，用于单元测试
│
├── gpu/                        # 现有 GPU 模块（消费 HAL trait）
├── decoder/                    # 现有解码器（消费 HAL trait）
├── encoder/                    # 现有编码器（消费 HAL trait）
└── ...
```

### 8.4 核心 Trait 定义

#### 8.4.1 GpuTextureHandle — 替代 cfg 枚举

```rust
// infra/hal/traits.rs

/// Platform-agnostic GPU texture handle
/// Replaces the current cfg-gated GpuTextureHandle enum
pub trait GpuTextureHandle: Send + Sync + std::fmt::Debug {
    /// Handle type identifier for downcasting
    fn handle_type(&self) -> HandleType;

    /// Raw pointer to platform-specific handle (for FFI)
    fn as_raw(&self) -> usize;

    /// Texture dimensions
    fn dimensions(&self) -> (u32, u32);

    /// Pixel format
    fn pixel_format(&self) -> PixelFormat;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HandleType {
    VideoToolbox,   // macOS: IOSurface-backed CVPixelBuffer
    Vaapi,          // Linux: VASurface
    DmaBuf,         // Linux: DMA-BUF fd
    D3d11,          // Windows: ID3D11Texture2D
    Cuda,           // Linux/Windows: CUdeviceptr
    Cpu,            // Fallback: CPU buffer
}

/// Type-safe downcast to platform-specific handle
pub trait AsHandle<T> {
    fn as_handle(&self) -> Option<&T>;
}
```

平台实现示例：

```rust
// infra/hal/platform/macos.rs

#[cfg(target_os = "macos")]
pub struct VideoToolboxHandle {
    pub pixel_buffer: usize,   // CVPixelBufferRef
    pub io_surface: usize,     // IOSurfaceRef
    pub width: u32,
    pub height: u32,
}

#[cfg(target_os = "macos")]
impl GpuTextureHandle for VideoToolboxHandle {
    fn handle_type(&self) -> HandleType { HandleType::VideoToolbox }
    fn as_raw(&self) -> usize { self.io_surface }
    fn dimensions(&self) -> (u32, u32) { (self.width, self.height) }
    fn pixel_format(&self) -> PixelFormat { PixelFormat::Nv12 }
}
```

```rust
// infra/hal/platform/linux.rs

#[cfg(target_os = "linux")]
pub struct VaapiHandle {
    pub surface_id: u32,
    pub display: usize,       // VADisplay
    pub width: u32,
    pub height: u32,
}

#[cfg(target_os = "linux")]
pub struct DmaBufHandle {
    pub fd: i32,              // DMA-BUF file descriptor
    pub stride: u32,
    pub offset: u32,
    pub width: u32,
    pub height: u32,
}
```

#### 8.4.2 GpuImporter — 统一纹理导入

```rust
// infra/hal/traits.rs

/// Import platform GPU texture into wgpu texture
/// Replaces scattered macos_import/linux_import/windows_import
pub trait GpuImporter: Send + Sync {
    /// Import NV12 texture handle into wgpu textures (Y + UV planes)
    fn import_nv12(
        &self,
        ctx: &GpuContext,
        handle: &dyn GpuTextureHandle,
    ) -> Result<ImportedNv12Texture>;

    /// Supported handle types for this importer
    fn supported_types(&self) -> &[HandleType];
}

/// Imported NV12 texture pair (platform-agnostic output)
pub struct ImportedNv12Texture {
    pub y_texture: wgpu::Texture,
    pub uv_texture: wgpu::Texture,
    pub width: u32,
    pub height: u32,
    pub color_space: ColorSpace,
}
```

#### 8.4.3 GpuExporter — 统一纹理导出（填补最大缺口）

```rust
// infra/hal/traits.rs

/// Export wgpu texture to platform GPU handle for encoder consumption
/// This is the BIGGEST missing abstraction — currently only macOS has this
pub trait GpuExporter: Send + Sync {
    /// Export RGBA texture to platform-specific handle for encoder
    fn export_for_encode(
        &self,
        ctx: &GpuContext,
        texture: &wgpu::Texture,
        width: u32,
        height: u32,
    ) -> Result<Box<dyn GpuTextureHandle>>;

    /// Whether this exporter supports zero-copy to encoder
    fn supports_zero_copy(&self) -> bool;

    /// Export NV12 data to platform handle (for encoders that accept NV12)
    fn export_nv12(
        &self,
        ctx: &GpuContext,
        nv12_data: &Nv12FrameData,
    ) -> Result<Box<dyn GpuTextureHandle>>;
}
```

平台实现：

```rust
// infra/hal/platform/macos.rs

#[cfg(target_os = "macos")]
pub struct MacOsGpuExporter;

#[cfg(target_os = "macos")]
impl GpuExporter for MacOsGpuExporter {
    fn export_for_encode(&self, ctx: &GpuContext, texture: &wgpu::Texture, w: u32, h: u32)
        -> Result<Box<dyn GpuTextureHandle>>
    {
        // Extract Metal texture → create IOSurface → wrap in VideoToolboxHandle
        // (existing logic from macos_export.rs)
        let io_surface = extract_iosurface_from_metal(ctx, texture)?;
        Ok(Box::new(VideoToolboxHandle {
            pixel_buffer: create_cv_pixel_buffer(io_surface)?,
            io_surface,
            width: w,
            height: h,
        }))
    }

    fn supports_zero_copy(&self) -> bool { true }

    fn export_nv12(&self, ctx: &GpuContext, nv12: &Nv12FrameData)
        -> Result<Box<dyn GpuTextureHandle>>
    {
        // IOSurface lock → direct memory write → VideoToolboxHandle
        // (existing partial zero-copy logic)
        todo!()
    }
}
```

```rust
// infra/hal/platform/linux.rs

#[cfg(target_os = "linux")]
pub struct LinuxGpuExporter;

#[cfg(target_os = "linux")]
impl GpuExporter for LinuxGpuExporter {
    fn export_for_encode(&self, ctx: &GpuContext, texture: &wgpu::Texture, w: u32, h: u32)
        -> Result<Box<dyn GpuTextureHandle>>
    {
        // Extract Vulkan image → export as DMA-BUF fd → wrap in DmaBufHandle
        // TODO(P1): implement Vulkan → DMA-BUF export
        let fd = export_vulkan_to_dmabuf(ctx, texture)?;
        Ok(Box::new(DmaBufHandle { fd, stride: w * 4, offset: 0, width: w, height: h }))
    }

    fn supports_zero_copy(&self) -> bool {
        // Runtime check: does the Vulkan driver support VK_EXT_external_memory_dma_buf?
        check_vulkan_dmabuf_support()
    }

    fn export_nv12(&self, _ctx: &GpuContext, _nv12: &Nv12FrameData)
        -> Result<Box<dyn GpuTextureHandle>>
    {
        // TODO(P2): VAAPI surface from DMA-BUF
        Err(Error::NotSupported("Linux NV12 export not yet implemented"))
    }
}
```

#### 8.4.4 HwEncoderAdapter — 统一硬件编码

```rust
// infra/hal/traits.rs

/// Hardware encoder that accepts GPU texture handles
/// Replaces the current macOS-only encode_frame_gpu()
pub trait HwEncoderAdapter: Send + Sync {
    /// Encode a frame from GPU texture handle (zero-copy path)
    fn encode_gpu_frame(
        &self,
        handle: &dyn GpuTextureHandle,
        pts: i64,
    ) -> Result<EncodedPacket>;

    /// Whether this encoder can accept the given handle type
    fn accepts_handle_type(&self, handle_type: HandleType) -> bool;

    /// Encoder capabilities
    fn capabilities(&self) -> EncoderCapabilities;
}

#[derive(Debug, Clone)]
pub struct EncoderCapabilities {
    pub hw_type: HwEncoderType,
    pub supported_codecs: Vec<VideoCodec>,
    pub supports_zero_copy: bool,
    pub max_resolution: (u32, u32),
    pub accepted_handle_types: Vec<HandleType>,
}
```

### 8.5 运行时能力检测

替代当前的编译期 `#[cfg]` 硬编码和脆弱的文件检测：

```rust
// infra/hal/capabilities.rs

/// Runtime platform capability detection
/// Replaces compile-time #[cfg] pipeline mode selection
pub struct PlatformCapabilities {
    pub gpu_import: Vec<HandleType>,
    pub gpu_export: Vec<HandleType>,
    pub hw_decoders: Vec<HwAccelType>,
    pub hw_encoders: Vec<EncoderCapabilities>,
    pub zero_copy_encode: bool,
    pub pipeline_mode: PipelineMode,
}

impl PlatformCapabilities {
    /// Detect capabilities at runtime
    pub fn detect(ctx: &GpuContext) -> Self {
        let mut caps = Self::default();

        // Detect GPU import capabilities (already working on all platforms)
        caps.gpu_import = Self::detect_import_capabilities(ctx);

        // Detect GPU export capabilities (the key gap to fill)
        caps.gpu_export = Self::detect_export_capabilities(ctx);

        // Detect hardware encoders using proper API queries
        caps.hw_encoders = Self::detect_hw_encoders();

        // Determine pipeline mode based on actual capabilities
        caps.pipeline_mode = if caps.zero_copy_encode {
            PipelineMode::ZeroCopy
        } else if !caps.gpu_export.is_empty() {
            PipelineMode::Hybrid  // GPU export but CPU encode
        } else {
            PipelineMode::CpuReadback
        };

        caps
    }

    fn detect_hw_encoders() -> Vec<EncoderCapabilities> {
        let mut encoders = Vec::new();

        #[cfg(target_os = "macos")]
        {
            // VideoToolbox is always available on macOS
            encoders.push(EncoderCapabilities {
                hw_type: HwEncoderType::VideoToolbox,
                supported_codecs: vec![VideoCodec::H264, VideoCodec::H265, VideoCodec::ProRes],
                supports_zero_copy: true,
                max_resolution: (8192, 8192),
                accepted_handle_types: vec![HandleType::VideoToolbox],
            });
        }

        #[cfg(target_os = "linux")]
        {
            // Query VAAPI capabilities via libva API
            if let Some(caps) = query_vaapi_capabilities() {
                encoders.push(caps);
            }
            // Query NVENC via NVIDIA API
            if let Some(caps) = query_nvenc_capabilities() {
                encoders.push(caps);
            }
        }

        #[cfg(target_os = "windows")]
        {
            // Query D3D11VA capabilities
            if let Some(caps) = query_d3d11va_capabilities() {
                encoders.push(caps);
            }
            // Query NVENC via NVIDIA API
            if let Some(caps) = query_nvenc_capabilities() {
                encoders.push(caps);
            }
        }

        encoders
    }
}
```

### 8.6 HAL 工厂 — 平台分发

```rust
// infra/hal/mod.rs

/// Create platform-specific HAL implementations
pub struct HalFactory;

impl HalFactory {
    /// Create the best available GPU importer for this platform
    pub fn create_importer() -> Box<dyn GpuImporter> {
        #[cfg(target_os = "macos")]
        { Box::new(platform::macos::MacOsGpuImporter) }
        #[cfg(target_os = "linux")]
        { Box::new(platform::linux::LinuxGpuImporter) }
        #[cfg(target_os = "windows")]
        { Box::new(platform::windows::WindowsGpuImporter) }
    }

    /// Create the best available GPU exporter for this platform
    pub fn create_exporter(ctx: &GpuContext) -> Box<dyn GpuExporter> {
        #[cfg(target_os = "macos")]
        { Box::new(platform::macos::MacOsGpuExporter) }
        #[cfg(target_os = "linux")]
        {
            if platform::linux::LinuxGpuExporter::is_available(ctx) {
                Box::new(platform::linux::LinuxGpuExporter)
            } else {
                Box::new(CpuFallbackExporter)
            }
        }
        #[cfg(target_os = "windows")]
        {
            if platform::windows::WindowsGpuExporter::is_available(ctx) {
                Box::new(platform::windows::WindowsGpuExporter)
            } else {
                Box::new(CpuFallbackExporter)
            }
        }
    }

    /// Create hardware encoder adapter
    pub fn create_hw_encoder(
        caps: &PlatformCapabilities,
        codec: VideoCodec,
    ) -> Box<dyn HwEncoderAdapter> {
        // Select best encoder based on runtime capabilities
        for encoder_caps in &caps.hw_encoders {
            if encoder_caps.supported_codecs.contains(&codec) {
                return Self::instantiate_encoder(encoder_caps);
            }
        }
        Box::new(CpuFallbackEncoder::new(codec))
    }
}

/// CPU fallback exporter — always available, no zero-copy
struct CpuFallbackExporter;

impl GpuExporter for CpuFallbackExporter {
    fn export_for_encode(&self, ctx: &GpuContext, texture: &wgpu::Texture, w: u32, h: u32)
        -> Result<Box<dyn GpuTextureHandle>>
    {
        // GPU readback to CPU buffer
        let data = ctx.read_texture_to_cpu(texture, w, h)?;
        Ok(Box::new(CpuHandle { data, width: w, height: h }))
    }

    fn supports_zero_copy(&self) -> bool { false }

    fn export_nv12(&self, _ctx: &GpuContext, nv12: &Nv12FrameData)
        -> Result<Box<dyn GpuTextureHandle>>
    {
        Ok(Box::new(CpuHandle {
            data: nv12.to_bytes(),
            width: nv12.width,
            height: nv12.height,
        }))
    }
}
```

### 8.7 消费者改造 — GPU 管线使用 HAL

改造前（散落的 `#[cfg]`）：

```rust
// 当前 export/gpu_export_pipeline.rs — 平台逻辑散落在业务代码中
#[cfg(target_os = "macos")]
let (nv12_data, gpu_handle, timing) = {
    match gpu_pipeline.process_frame_to_iosurface_timed(time, bg) {
        Ok(result) => (result.data, result.gpu_handle, result.timing),
        Err(e) => {
            let result = gpu_pipeline.process_frame_to_nv12_timed(time, bg)?;
            (result.data, result.gpu_handle, result.timing)
        }
    }
};
#[cfg(not(target_os = "macos"))]
let (nv12_data, gpu_handle, timing) = {
    let result = gpu_pipeline.process_frame_to_nv12_timed(time, bg)?;
    (result.data, result.gpu_handle, result.timing)
};
```

改造后（通过 HAL trait 统一）：

```rust
// 重构后 — 业务代码无平台分支
fn process_frame(&self, time: f64, bg: [f64; 4]) -> Result<ProcessedFrame> {
    // 1. GPU composite (platform-agnostic, pure wgpu)
    let rgba_texture = self.compositor.composite(time, bg)?;

    // 2. RGBA → NV12 conversion (platform-agnostic, wgpu compute shader)
    let nv12_data = self.nv12_converter.convert(&rgba_texture)?;

    // 3. Export for encoder (HAL dispatches to platform-specific path)
    let gpu_handle = self.exporter.export_nv12(&self.ctx, &nv12_data)?;

    // 4. Encode (HAL dispatches to platform-specific encoder)
    if self.hw_encoder.accepts_handle_type(gpu_handle.handle_type()) {
        // Zero-copy path: GPU handle → HW encoder directly
        self.hw_encoder.encode_gpu_frame(gpu_handle.as_ref(), pts)?
    } else {
        // Fallback: CPU readback → SW/HW encode
        let cpu_data = nv12_data.to_bytes();
        self.sw_encoder.encode_frame(&cpu_data, pts)?
    }
}
```

### 8.8 跨平台数据流对比

```
改造后统一管线：

Decode:
  FFmpeg HW Decode → dyn GpuTextureHandle → dyn GpuImporter → wgpu::Texture (NV12)
                     (平台无关接口)          (平台分发)         (统一输出)

Process (纯 wgpu，所有平台一致):
  wgpu::Texture (NV12) → Nv12Renderer → wgpu::Texture (RGBA) → Compositor → wgpu::Texture (RGBA)

Encode:
  wgpu::Texture (RGBA) → RgbaToNv12 → dyn GpuExporter → dyn GpuTextureHandle → dyn HwEncoderAdapter
                          (纯 wgpu)    (平台分发)         (平台无关接口)          (平台分发)

  macOS:  MacOsGpuExporter → IOSurface → VideoToolboxEncoder (零拷贝)
  Linux:  LinuxGpuExporter → DMA-BUF   → VaapiEncoder (零拷贝, P1 实现)
  Windows: WindowsGpuExporter → D3D11  → D3d11Encoder (零拷贝, P2 实现)
  Fallback: CpuFallbackExporter → CPU  → FFmpeg SW Encode
```

### 8.9 HAL 实施计划

| Phase | 任务 | 优先级 |
|-------|------|--------|
| **HAL-1** | 定义 4 个核心 trait（GpuTextureHandle, GpuImporter, GpuExporter, HwEncoderAdapter） | P0 |
| **HAL-2** | 实现 PlatformCapabilities 运行时检测，替代编译期 `#[cfg]` 管线模式 | P0 |
| **HAL-3** | 迁移 macOS 现有代码到 HAL trait 实现（macos_import/export → MacOsGpuImporter/Exporter） | P0 |
| **HAL-4** | 实现 CpuFallbackExporter + CpuFallbackEncoder（保证所有平台可用） | P0 |
| **HAL-5** | 改造 ExportPipelineOrchestrator 消费 HAL trait，消除业务代码中的 `#[cfg]` | P0 |
| **HAL-6** | 实现 Linux DMA-BUF 导出（LinuxGpuExporter） | P1 |
| **HAL-7** | 实现 Linux VAAPI 编码适配（VaapiEncoderAdapter） | P1 |
| **HAL-8** | 实现 Windows D3D11 导出（WindowsGpuExporter） | P2 |
| **HAL-9** | 实现 Windows D3D11VA/NVENC 编码适配 | P2 |
| **HAL-10** | 编写 MockGpuExporter/MockHwEncoder 用于单元测试 | P0 |

### 8.10 HAL 与 MVC 的关系

```
Controller (native-api)
    │
    ▼ 调用 Service trait
Model - Service Layer
    │
    ▼ 调用 Infrastructure
Model - Infrastructure
    │
    ▼ 通过 HAL trait 访问硬件
Model - HAL (infra/hal/)
    │
    ├── GpuImporter    → 平台纹理导入
    ├── GpuExporter    → 平台纹理导出
    ├── HwEncoderAdapter → 平台硬件编码
    └── PlatformCapabilities → 运行时能力检测
```

HAL 位于 MVC 的 Model 层最底部，是 Infrastructure 的子层。Service 层不直接使用 HAL trait，而是通过 Infrastructure 模块（gpu/encoder/decoder）间接消费。这保证了：

- **Service 层**：纯业务逻辑，不感知平台差异
- **Infrastructure 层**：通过 HAL trait 访问硬件，消除 `#[cfg]` 散落
- **HAL 层**：集中管理所有平台特定代码，新增平台只需实现 trait
