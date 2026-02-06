# neko-engine 接口重构方案

> 基于当前 neko-engine 代码库现状分析，设计统一接口层重构方案。

---

## 1. 现状分析

### 1.1 当前目录结构

```
neko-engine/
├── packages/
│   ├── native-core/       # Rust 核心库 (76 .rs 文件)
│   │   ├── gpu/           # wgpu 上下文、纹理合成、NV12、特效、转场、模糊
│   │   ├── decoder/       # 硬件解码器、零拷贝管线
│   │   ├── encoder/       # 硬件编码器、异步导出管线
│   │   ├── export/        # GPU 导出管线、音视频混流
│   │   ├── animation/     # 关键帧、缓动、时间轴
│   │   ├── audio/         # 音频编解码、混音
│   │   ├── frame_server/  # HTTP/WS 帧服务 + 导出 API + 媒体探测 + H.264 流推送
│   │   ├── keyframe_cache/# 关键帧缓存、IDR 扫描
│   │   ├── media_service/ # 媒体探测、字幕提取、JPEG 编码
│   │   ├── preview/       # 预览管线
│   │   ├── monitor/       # 系统监控 (GPU/CPU)
│   │   ├── telemetry/     # 性能追踪 (Tracy)
│   │   └── jvi/           # JVI 项目格式加载
│   ├── native-napi/       # N-API 绑定 (Node.js ↔ Rust)
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── media_processor.rs  # 114KB，所有 NAPI 函数集中于此
│   │       └── types.rs            # 55KB，所有 JS 类型定义
│   ├── native-cli/        # CLI 工具 (clap)
│   │   └── src/
│   │       ├── main.rs
│   │       ├── args.rs
│   │       └── runner.rs
│   └── extension/         # VSCode 扩展集成
│       └── src/
│           ├── extension.ts
│           └── mediaEngine/
│               ├── MediaEngineManager.ts
│               ├── NativeMediaEngine.ts   # 28KB，直接调用 native-napi
│               └── export/
├── neko-types (sibling)   # 共享 TS 类型 (227 文件)
│   └── src/types/mediaEngine/  # 引擎相关类型定义
```

### 1.2 核心问题

| 问题 | 现象 | 影响 |
|------|------|------|
| **NAPI 层膨胀** | `media_processor.rs` 114KB 单文件，承载全部 N-API 绑定 | 难以维护，职责不清 |
| **缺少统一接口层** | native-napi 直接映射 native-core 内部结构 | 接入层（CLI/HTTP/NAPI）各自重复适配逻辑 |
| **HTTP 路由散落** | frame_server 内嵌 export/probe/extract/cache 路由 | HTTP 接口与核心逻辑耦合 |
| **extension 直接耦合 NAPI** | NativeMediaEngine.ts 直接调用 native-napi 函数 | 无法切换到 HTTP 模式 |
| **无统一资源管理** | 各模块独立管理句柄（decoder pool、texture pool、encoder session） | 资源生命周期分散，无法统一回收 |

---

## 2. 重构目标结构

```
neko-engine/packages/
├── native-core/        # Rust 核心库 (不变)
│   └── (现有模块保持不变)
│
├── native-api/         # 【新增】统一接口层 (Rust)
│   └── src/
│       ├── lib.rs
│       ├── registry.rs       # 资源注册表：ID ↔ 句柄映射 + 路径补偿
│       ├── session.rs        # 会话管理：多窗口并发隔离
│       ├── router.rs         # 动作路由：{group}/{id}:{action} 分发
│       ├── groups/
│       │   ├── mod.rs
│       │   ├── videos.rs     # :probe, :capture, :extract, :stream, :transcode, :waveform, :proxy, :keyframes
│       │   ├── audios.rs     # :probe, :extract, :stream, :waveform
│       │   ├── images.rs     # :probe, :capture
│       │   ├── models.rs     # :probe, :capture, :stream (预留)
│       │   ├── timelines.rs  # :composite, :stream, :export, :pause, :resume, :speed, :loop, :keyframe
│       │   ├── canvas.rs     # :composite, :capture, :export (预留)
│       │   ├── scenes.rs     # :composite, :capture, :stream (预留)
│       │   ├── nodes.rs      # :health, :metric
│       │   └── tasks.rs      # :probe, :pause, :resume, :cancel
│       └── types.rs          # 统一请求/响应类型
│
├── native-napi/        # N-API 绑定 → 转发到 native-api
│   └── src/
│       ├── lib.rs
│       └── bridge.rs         # 薄桥接层：JS 类型 ↔ native-api 类型
│
├── native-cli/         # CLI → 转发到 native-api
│   └── src/
│       ├── main.rs
│       ├── args.rs
│       └── runner.rs         # 调用 native-api 统一接口
│
├── native-http/        # 【新增】HTTP/WS 服务 → 转发到 native-api
│   └── src/
│       ├── lib.rs
│       ├── server.rs         # axum 服务启动
│       ├── routes/
│       │   ├── mod.rs
│       │   ├── assets.rs     # /v1/videos, /v1/audios, /v1/images
│       │   ├── compositions.rs # /v1/timelines, /v1/canvas, /v1/scenes
│       │   ├── infra.rs      # /v1/nodes, /v1/tasks
│       │   └── streaming.rs  # WebSocket 帧推送
│       └── middleware.rs     # CORS、日志、认证
│
├── types/              # 【新增】共享 Rust 类型 (从 native-core 提取)
│   └── src/
│       ├── lib.rs
│       ├── request.rs        # 统一请求结构
│       ├── response.rs       # 统一响应结构
│       ├── media.rs          # 媒体信息类型
│       ├── effects.rs        # 特效参数类型
│       └── error.rs          # 统一错误类型
│
└── extension/          # VSCode 扩展 → 通过 native-napi 接入
    └── src/
        ├── extension.ts
        └── mediaEngine/
            ├── MediaEngineManager.ts
            └── NativeMediaEngine.ts    # 调用 native-napi
```

### 2.1 依赖关系

```
extension ──→ native-napi ──→ native-api ──→ native-core
                                  ↑
native-cli ───────────────────────┤
                                  ↑
native-http ──────────────────────┘
                                  ↑
types ←───────────────────────────┘ (所有包共享)
```

### 2.2 各包职责

| 包 | 职责 | 依赖 |
|---|---|---|
| **types** | 统一请求/响应/错误类型定义 | 无 |
| **native-core** | GPU 处理、编解码、特效渲染等核心计算 | types |
| **native-api** | 统一接口层：资源注册、会话管理、动作路由 | types, native-core |
| **native-napi** | 薄桥接：JS 类型转换 + 调用 native-api | types, native-api |
| **native-http** | HTTP/WS 服务：REST 路由 + 流式推送（独立 server 端部署） | types, native-api |
| **native-cli** | 命令行工具：参数解析 + 调用 native-api | types, native-api |
| **extension** | VSCode 集成：生命周期管理 + N-API 直连 | native-napi |

---

## 3. 统一接口规范

### 3.1 路由规范

```
v1/{group}/{id}:{action}
```

- **group**: 资源分组（videos, audios, images, timelines, nodes, tasks...）
- **id**: 资源标识符（首次调用时由 registry 分配，后续复用）
- **action**: 操作动作（probe, capture, extract, stream, export, waveform, proxy, keyframes, keyframe, pause, resume, speed, loop, cancel...）

### 3.2 接口分组

#### A. 媒体资产组 (Atomic Assets)

处理单一类型的原始素材。不同分组在 Rust 后端对应不同的解码与句柄管理模块。

| 分组 (Group) | 适用对象 | 核心动作 (:action) | 参数示例 |
|---|---|---|---|
| `videos` | MP4, MOV, MKV | `:probe`, `:capture`, `:extract`, `:stream`, `:transcode`, `:waveform`, `:proxy`, `:keyframes` | `time`, `keyframe_only`, `format` |
| `audios` | MP3, WAV, PCM | `:probe`, `:extract`, `:stream`, `:waveform` | `sample_rate`, `peaks_per_second` |
| `images` | JPG, PNG, PSD | `:probe`, `:capture` | `scale`, `format: "webp"` |
| `models` | OBJ, GLTF, FBX | `:probe`, `:capture`, `:stream` | `camera_pos`, `fov`, `lighting` |

**新增动作说明：**

| 动作 | 适用分组 | 用途 | 参数示例 |
|---|---|---|---|
| `:waveform` | `videos`, `audios` | 生成音频波形数据，用于时间轴波形可视化。波形计算耗时，需独立动作异步生成 | `peaks_per_second: 100`, `channel: 0`, `format: "json"\|"binary"` |
| `:proxy` | `videos` | 为 4K/8K 素材生成低分辨率代理文件，并在 Registry 中建立原片↔代理的逻辑绑定 | `resolution: "720p"`, `codec: "h264"`, `bitrate: "2M"` |
| `:keyframes` | `videos` | 获取视频 IDR 关键帧列表，返回所有可随机访问点的时间戳和帧索引。用于时间轴关键帧标记、seek 优化、缩略图生成位置计算 | `start_time: 0.0`, `end_time: null`, `max_count: null` |

> **`:proxy` vs `:transcode` 的区别**：`:transcode` 是通用转码，产出独立文件；`:proxy` 语义上绑定原片，Registry 自动维护 `original_id ↔ proxy_id` 映射，编辑时透明切换。

**与现有代码的映射：**

```
videos:probe    → native-core/media_service/probe.rs (probe_media_info)
videos:capture  → native-core/frame_server/extract.rs + gpu/compositor.rs
videos:extract  → native-napi/media_processor.rs (extract_frame, decode_frame)
videos:stream   → native-core/frame_server/server.rs (WS H.264 推流)
videos:transcode→ native-core/encoder/pipeline.rs (AsyncExportPipeline)
videos:waveform → native-core/audio/decoder.rs (decode_audio_frame → peak extraction)
videos:proxy    → native-core/encoder/pipeline.rs (低分辨率转码 + registry 绑定)
audios:probe    → native-core/audio/decoder.rs (AudioDecoder::get_info)
audios:extract  → native-core/audio/decoder.rs (decode_audio_frame)
audios:waveform → native-core/audio/decoder.rs (decode_audio_frame → peak extraction)
images:probe    → native-core/media_service/probe.rs (复用)
images:capture  → native-core/media_service/jpeg_encoder.rs
videos:keyframes→ native-core/keyframe_cache/scanner.rs (IdrScanner::scan_idr_frames)
                  + native-core/keyframe_cache/service.rs (get_or_scan_idr_frames, IDR 列表内存缓存)
```

> **`:keyframes` vs `:probe` 的区别**：`:probe` 返回媒体元信息（时长、分辨率、编码器等），不含帧级别数据；`:keyframes` 返回帧级别的 IDR 列表，数据量大（1 小时视频可能有 1800+ 个 IDR 帧），需要独立动作。IDR 列表首次扫描后缓存在 `idr_indices` 内存中，后续调用直接返回。

#### B. 逻辑合成组 (Compositions)

处理描述性的工程文件。此类资源不含原始媒体，而是通过渲染引擎将多个 assets 组合输出。

| 分组 (Group) | 适用对象 | 核心动作 (:action) | 说明 |
|---|---|---|---|
| `timelines` | 视频剪辑工程 | `:composite`, `:stream`, `:export`, `:pause`, `:resume`, `:speed`, `:loop`, `:keyframe` | 时间轴驱动，多轨音视频混合 |
| `canvas` | 平面设计/海报 | `:composite`, `:capture`, `:export` | 层级驱动，矢量图形、文字与图片叠加 |
| `scenes` | 3D 场景描述 | `:composite`, `:capture`, `:stream` | 空间驱动，处理模型间的位置、光影关系 |

**新增动作说明（回放信令控制）：**

在 `:stream` 建立的实时回放会话中，以下信令动作用于精细控制回放行为：

| 动作 | 适用分组 | 用途 | 参数示例 |
|---|---|---|---|
| `:pause` | `timelines` | 暂停当前回放流，冻结在当前帧 | — |
| `:resume` | `timelines` | 恢复已暂停的回放流 | — |
| `:speed` | `timelines` | 设置倍速播放，支持慢放、快进、倒放 | `rate: 2.0`（2x 快进）, `rate: -1.0`（倒放） |
| `:loop` | `timelines` | 设置片段循环回放区间 | `in: 10.0`, `out: 15.5`, `count: 3\|"infinite"` |
| `:keyframe` | `timelines` | 关键帧缓存 seek：查找最近的已缓存 IDR 帧，加速 seek 操作。引擎内部自动管理缓存预热，上层无需手动 warmup | `target_time: 35.5` |

> **信令 vs 独立请求**：`:pause`/`:resume`/`:speed`/`:loop`/`:keyframe` 是对已建立的 `:stream` 会话的控制信令，通过 `session_id` 关联到目标流。它们不创建新资源，而是修改现有流的播放状态。

**传输架构（双通道分离）：**

`:stream` 的帧流和信令走不同通道，根据接入方式有两种模式：

| 模式 | 帧流通道 (H.264 binary) | 信令通道 (seek/pause/speed/keyframe) |
|------|------------------------|---------------------------|
| **Extension (NAPI)** | 本地 WS (`ws://127.0.0.1:PORT`)，复用 frame_server WS 端点，单向推帧 | postMessage → NAPI 同步调用 |
| **Server (HTTP)** | WS 连接，双向复用 | 同一 WS 连接发送 JSON 信令 |

Extension 双通道架构：

```
┌─────────────────┐   ws://127.0.0.1:PORT/stream  ┌──────────────────┐
│  Webview         │ ←─────────────────────────────│  frame_server    │
│                 │   H.264 帧流 (binary)          │  (native-core)   │
│  WebCodecs      │                               │                  │
│  Canvas         │                               │  WS 端点: /stream│
│                 │   postMessage                  │        ↑         │
│                 │ ──────────────→ Ext Host ──→ NAPI     │         │
│                 │ ←────────────── Ext Host ←── NAPI     │         │
│                 │   信令 (seek/pause/speed/keyframe) │                  │
└─────────────────┘                               └──────────────────┘
```

> **为什么帧流和信令分离？**
> - H.264 帧流数据量大（1080p@30fps ≈ 8Mbps），必须走 WS 直连绕过 postMessage IPC 瓶颈
> - 信令是低频小数据（≤200 bytes，≤30次/秒），走 NAPI 延迟更低（<0.5ms vs WS roundtrip 2-5ms）
> - Seek/Scrub 场景下 NAPI 同步调用可直接覆盖上一次 seek，天然去重，无乱序问题
> - WS 帧推送复用 native-core/frame_server 现有能力，本地仅 1 个 server，无需额外启动独立 WS 服务

**与现有代码的映射：**

```
timelines:composite → native-core/gpu/compositor.rs (TextureCompositor)
timelines:stream    → native-core/frame_server/server.rs (WS 端点) + preview/pipeline.rs (PreviewPipeline)
timelines:export    → native-core/export/gpu_export_pipeline.rs (AsyncExportPipeline)
timelines:pause     → native-core/preview/pipeline.rs (PreviewPipeline::pause)
timelines:resume    → native-core/preview/pipeline.rs (PreviewPipeline::resume)
timelines:speed     → native-core/preview/pipeline.rs (PreviewPipeline::set_playback_rate)
timelines:loop      → native-core/preview/pipeline.rs (PreviewPipeline::set_loop_region)
timelines:keyframe  → native-core/keyframe_cache/service.rs (seek_to_keyframe → cache.find_nearest_keyframe)
                      自动预热：seek 完成后异步调用 warmup_source() 预热目标位置前后 IDR 帧
```

#### C. 系统运维组 (Infrastructure)

处理本地 App 的算力节点与异步任务管理。

| 分组 (Group) | 适用对象 | 核心动作 (:action) | 说明 |
|---|---|---|---|
| `nodes` | 本地渲染引擎 | `:health`, `:metric` | 监控 GPU/CPU 占用、渲染 FPS |
| `tasks` | 异步任务队列 | `:probe`, `:pause`, `:resume`, `:cancel` | 任务进度查询、暂停/恢复/终止异步任务 |

**新增动作说明：**

| 动作 | 适用分组 | 用途 | 参数示例 |
|---|---|---|---|
| `:pause` | `tasks` | 暂停正在执行的渲染/导出/转码任务（释放 GPU 资源给其他应用） | — |
| `:resume` | `tasks` | 恢复已暂停的任务，从断点继续 | — |
| `:cancel` | `tasks` | 彻底终止任务，清理未完成的临时文件和中间产物 | `cleanup: true\|false` |

> **`:cancel` vs 原 `:stop`**：原方案中的 `:stop` 语义模糊（是暂停还是终止？）。现拆分为 `:pause`（可恢复）和 `:cancel`（不可恢复 + 清理），语义更明确。

**与现有代码的映射：**

```
nodes:health  → native-core/monitor/system_monitor.rs (SystemMonitor)
nodes:metric  → native-core/monitor/system_monitor.rs (ResourceSnapshot)
tasks:probe   → native-core/export/service.rs (ExportService 进度查询)
tasks:pause   → native-core/export/service.rs (ExportService::pause)
tasks:resume  → native-core/export/service.rs (ExportService::resume)
tasks:cancel  → native-core/export/service.rs (ExportService::cancel + 临时文件清理)
```

### 3.3 统一请求/响应契约

#### 请求格式

```json
// POST /v1/{group}/{id}:{action}
{
  "source": "/path/to/media.mp4",   // 路径兜底：ID 失效时自动重载
  "session_id": "window_01",         // 会话管理：支持多窗口并发流
  "options": {                       // 差异化参数（按 action 不同）
    "time": 10.5,
    "quality": "high"
  }
}
```

#### 响应格式

```json
// 成功
{
  "id": "res_abc123",
  "status": "ok",
  "data": { ... }
}

// 流式（export/stream 类动作）
{
  "id": "res_abc123",
  "status": "processing",
  "progress": { "ratio": 0.45, "frames_done": 135, "frames_total": 300 }
}

// 信令确认（pause/resume/speed/loop 类动作）
// Extension 模式：NAPI 同步返回；Server 模式：WS JSON 帧回复
{
  "id": "res_abc123",
  "status": "ok",
  "data": { "state": "paused", "session_id": "window_01" }
}

// 波形数据
{
  "id": "res_abc123",
  "status": "ok",
  "data": {
    "sample_rate": 48000,
    "channels": 2,
    "peaks_per_second": 100,
    "duration": 120.5,
    "peaks": [[0.12, -0.08, 0.45, ...], [0.10, -0.06, 0.42, ...]]
  }
}

// 代理文件
{
  "id": "res_abc123",
  "status": "ok",
  "data": {
    "proxy_id": "res_proxy_456",
    "original_id": "res_abc123",
    "proxy_path": "/cache/proxies/abc123_720p.mp4",
    "resolution": "1280x720",
    "codec": "h264"
  }
}

// 关键帧列表 (videos:keyframes)
{
  "id": "res_abc123",
  "status": "ok",
  "data": {
    "codec_type": "h264",
    "total_count": 150,
    "keyframes": [
      { "frame_index": 0, "timestamp": 0.0, "pts": 0, "nal_type": 5, "width": 1920, "height": 1080 },
      { "frame_index": 60, "timestamp": 2.0, "pts": 180000, "nal_type": 5, "width": 1920, "height": 1080 }
    ]
  }
}

// 关键帧缓存 seek (timelines:keyframe)
{
  "id": "res_abc123",
  "status": "ok",
  "data": {
    "cache_hit": true,
    "keyframe_timestamp": 34.0,
    "keyframe_pts": 1020000,
    "keyframe_frame_index": 1020,
    "frames_to_decode": 45,
    "prefetch_status": "warming_up"
  }
}

// 错误
{
  "id": "res_abc123",
  "status": "error",
  "error": { "code": "DECODE_FAILED", "message": "..." }
}
```

### 3.4 资源管理：ID 优先，路径补偿

```
Invoke(id, source?)
  ├─ id 命中内存句柄 → 极速返回
  ├─ id 未命中 + source 存在 → 静默挂载 → 分配新 id → 返回结果
  └─ id 未命中 + source 缺失 → 返回 RESOURCE_NOT_FOUND 错误
```

对应 native-api 中的 `registry.rs` 设计：

```rust
// native-api/src/registry.rs
pub struct ResourceRegistry {
    handles: DashMap<ResourceId, ResourceHandle>,
    path_index: DashMap<PathBuf, ResourceId>,
}

impl ResourceRegistry {
    /// Resolve resource by ID with path fallback
    pub fn resolve(&self, id: &ResourceId, source: Option<&Path>) -> Result<ResourceHandle> {
        // ID hit → fast path
        if let Some(handle) = self.handles.get(id) {
            return Ok(handle.clone());
        }
        // Path fallback → silent mount
        if let Some(path) = source {
            if let Some(existing_id) = self.path_index.get(path) {
                return self.resolve(existing_id.value(), None);
            }
            let handle = self.mount(path)?;
            self.register(id.clone(), handle.clone());
            return Ok(handle);
        }
        Err(Error::ResourceNotFound(id.clone()))
    }
}
```

### 3.5 工业级补全接口

为达到 Premiere / DaVinci 级别的交互体验，在基础 CRUD 接口之上补全以下 3 个维度的接口：

#### D. 资产辅助类：波形与代理 (Proxies & Waveforms)

编辑器时间轴需要精确的音频波形可视化，4K/8K 素材需要代理文件保证流畅编辑。

```
用户拖入 4K 素材
  ├─ videos:probe     → 获取媒体信息
  ├─ videos:waveform  → 异步生成波形数据 → 时间轴渲染波形
  └─ videos:proxy     → 异步生成 720p 代理 → Registry 绑定原片↔代理
       └─ 编辑时自动使用代理，导出时切回原片
```

**Registry 代理绑定机制：**

```rust
// native-api/src/registry.rs (扩展)
pub struct ResourceRegistry {
    handles: DashMap<ResourceId, ResourceHandle>,
    path_index: DashMap<PathBuf, ResourceId>,
    proxy_map: DashMap<ResourceId, ResourceId>,  // original → proxy
}

impl ResourceRegistry {
    /// Resolve with proxy preference for preview
    pub fn resolve_for_preview(&self, id: &ResourceId) -> Result<ResourceHandle> {
        // Prefer proxy for preview, fallback to original
        if let Some(proxy_id) = self.proxy_map.get(id) {
            if let Ok(handle) = self.resolve(proxy_id.value(), None) {
                return Ok(handle);
            }
        }
        self.resolve(id, None)
    }

    /// Resolve original for export (bypass proxy)
    pub fn resolve_for_export(&self, id: &ResourceId) -> Result<ResourceHandle> {
        self.resolve(id, None)
    }
}
```

#### E. 交互实时类：信号控制 (Control Signals)

实时回放流需要精细的播放控制，超越简单的 seek。

```
timelines:stream (建立回放流)
  ├─ timelines:pause   → 冻结当前帧
  ├─ timelines:resume  → 恢复播放
  ├─ timelines:speed   → 倍速 (0.25x ~ 4x) / 倒放 (-1x)
  └─ timelines:loop    → 片段循环 (in/out 点 + 次数)
```

**信令传输方式（按接入模式区分）：**

| 接入模式 | 信令通道 | 说明 |
|----------|---------|------|
| **Extension (NAPI)** | Webview → postMessage → Extension Host → NAPI → Rust | 同步调用，延迟 <0.5ms，seek 天然去重。帧流复用 frame_server WS 端点 |
| **Server (HTTP)** | WS JSON 信令帧，复用帧流连接 | 双向复用，延迟 2-5ms |

Extension 模式信令示例（postMessage）：
```json
// Webview → Extension Host
{ "type": "stream:speed", "sessionId": "window_01", "params": { "rate": 2.0 } }
{ "type": "stream:loop", "sessionId": "window_01", "params": { "in": 10.0, "out": 15.5, "count": "infinite" } }
{ "type": "stream:keyframe", "sessionId": "window_01", "params": { "target_time": 35.5 } }
```

Server 模式信令示例（WS JSON 帧）：
```json
// Client → Server (复用帧流 WS 连接)
{ "signal": "speed", "session_id": "window_01", "params": { "rate": 2.0 } }
{ "signal": "loop", "session_id": "window_01", "params": { "in": 10.0, "out": 15.5, "count": "infinite" } }
{ "signal": "keyframe", "session_id": "window_01", "params": { "target_time": 35.5 } }
```

#### F. 异步任务类：生命周期管理 (Job Lifecycle)

导出/转码/波形生成等长时间任务需要完整的生命周期控制。

```
任务状态机：
  pending → running → completed
                   ↘ paused → running (resume)
                   ↘ cancelled (清理临时文件)

tasks:probe   → 查询进度 { ratio, frames_done, frames_total, eta_seconds }
tasks:pause   → 暂停任务（释放 GPU 给其他应用）
tasks:resume  → 从断点恢复（GOP 边界对齐）
tasks:cancel  → 终止 + 清理临时文件
```

#### G. 关键帧索引与缓存 (Keyframe Index & Cache)

视频编辑器的 seek 性能直接决定用户体验。H.264/H.265 视频只能从 IDR 帧开始解码，seek 到任意位置需要先找到最近的 IDR 帧再逐帧解码到目标帧。关键帧索引和缓存机制将这一过程从 O(n) 优化到 O(1)。

**两个动作的分工：**

| 动作 | 所属分组 | 职责 | 数据层级 |
|------|---------|------|---------|
| `videos:keyframes` | 媒体资产组 | 获取单个视频文件的 IDR 帧列表（纯索引数据） | 文件级 |
| `timelines:keyframe` | 逻辑合成组 | 在回放流中执行缓存 seek（NV12 帧数据 + 自动预热） | 会话级 |

**典型工作流：**

```
用户导入视频素材
  └─ videos:probe       → 获取媒体信息
  └─ videos:keyframes   → 获取 IDR 列表 → 时间轴标记关键帧位置（UI 渲染）

用户开始编辑，建立预览流
  └─ timelines:stream   → 建立回放会话
       └─ 引擎内部自动调用 warmup，预热 playhead 附近 IDR 帧的 NV12 数据

用户拖动时间轴 seek 到 35.5s
  └─ timelines:keyframe → seek(target_time=35.5)
       ├─ 缓存命中 → 返回 34.0s 的缓存帧信息 → 仅需解码 45 帧到目标
       ├─ 缓存未命中 → 返回最近 IDR 位置 → 从 IDR 开始解码
       └─ 后台自动预热 → 异步缓存 35.5s 前后的 IDR 帧 NV12 数据
```

**自动预热策略（上层无需手动 warmup）：**

引擎在以下时机自动管理关键帧缓存，上层只需调用 `:keyframe` seek：

| 触发时机 | 自动行为 |
|---------|---------|
| `videos:probe` 或 `videos:keyframes` 被调用 | 后台异步扫描 IDR 列表，缓存到 `idr_indices` 内存 |
| `timelines:stream` 建立回放流 | 根据 playhead 位置自动预热前后 N 个 IDR 帧的 NV12 数据 |
| `timelines:keyframe` seek 完成 | 异步预热目标位置附近的 IDR 帧（滑动窗口策略） |
| playhead 持续播放 | 提前预热即将到达的 IDR 帧，淘汰远离 playhead 的缓存（LRU） |

**缓存架构（两级缓存）：**

```
L1: IDR 索引缓存 (idr_indices: HashMap<String, Vec<KeyframeInfo>>)
    ├─ 存储：帧索引、时间戳、PTS、NAL 类型（轻量，每帧 ~64 bytes）
    ├─ 生命周期：首次扫描后常驻内存，直到 clear_source()
    └─ 用途：videos:keyframes 查询、timelines:keyframe seek 定位

L2: NV12 帧数据缓存 (KeyframeLruCache)
    ├─ 存储：解码后的 NV12 原始帧数据（重量，1080p 每帧 ~3MB）
    ├─ 容量：512MB 内存限制 + 200 帧数量限制，LRU 自动淘汰
    └─ 用途：timelines:keyframe seek 命中时直接返回，跳过解码
```

> **为什么不合并为一个动作？** `videos:keyframes` 是无状态的文件级查询，可在素材导入时批量调用，结果可持久化；`timelines:keyframe` 是有状态的会话级操作，依赖 `:stream` 会话和 NV12 缓存，两者生命周期和使用场景完全不同。

---

## 4. 重构步骤

### Phase 1: 提取 types 包

**目标**：将散落在 native-core 和 native-napi 中的公共类型提取到独立 crate。

**具体任务：**
1. 创建 `packages/types/` crate，`Cargo.toml` 仅依赖 `serde`
2. 从 `native-core/src/error.rs` 提取统一错误类型 → `types/src/error.rs`
3. 定义统一请求/响应结构 → `types/src/request.rs`, `types/src/response.rs`
   - `ActionRequest { group, id, action, source, session_id, options }`
   - `ActionResponse { id, status, data, progress, error }`
4. 从 `native-napi/src/types.rs` (55KB) 中提取与 JS 无关的纯数据类型
   - 媒体信息 → `types/src/media.rs`
   - 特效参数 → `types/src/effects.rs`
5. native-core 和 native-napi 改为依赖 types crate

**验证**：`cargo build --workspace` 通过，现有测试不回归。

### Phase 2: 构建 native-api 统一接口层

**目标**：在 native-core 之上建立统一的动作路由和资源管理。

**具体任务：**
1. 创建 `packages/native-api/` crate，依赖 `types` + `native-core`
2. 实现 `ResourceRegistry`（资源注册表 + ID/路径双索引 + LRU 淘汰）
3. 实现 `SessionManager`（多窗口会话隔离，session_id → 独立资源作用域）
4. 实现 `ActionRouter`（`{group}:{action}` → handler 分发）
5. 逐个实现 groups handler，按优先级：
   - P0: `videos` (probe/capture/extract/stream/waveform/keyframes) — 覆盖当前 80% 使用场景
   - P0: `timelines` (composite/stream/export + pause/resume/speed/loop/keyframe 信令) — 覆盖导出与回放流程
   - P0: `tasks` (probe/pause/resume/cancel) — 覆盖任务生命周期管理
   - P1: `audios` (probe/extract/waveform)
   - P1: `nodes` (health/metric)
   - P1: `videos:proxy` — 代理文件生成（依赖 registry 原片↔代理绑定）
   - P2: `images`, `canvas`, `scenes`, `models` — 预留接口

**验证**：为每个 group handler 编写集成测试，直接调用 native-api 层。

### Phase 3: 重构 native-napi 为薄桥接

**目标**：将 native-napi 从 114KB 的巨型文件瘦身为纯类型转换层。

**具体任务：**
1. 新增 `bridge.rs`，定义 `From<JsType> for ApiType` 双向转换
2. 将 `media_processor.rs` 中的每个 NAPI 函数改为：
   - 接收 JS 参数 → 转换为 `ActionRequest` → 调用 `native-api` → 转换响应回 JS
3. 保留 `types.rs` 中的 JS 类型定义（NAPI 宏需要），但删除业务逻辑
4. 目标：`media_processor.rs` 从 114KB 降至 ~20KB（纯桥接代码）

**兼容策略**：保留现有 NAPI 函数签名不变，内部实现改为转发。

### Phase 4: 抽取 native-http

**目标**：将 frame_server 中的 HTTP 路由逻辑独立为 native-http 包。

**具体任务：**
1. 创建 `packages/native-http/` crate，依赖 `types` + `native-api` + `axum`
2. 从 `native-core/frame_server/server.rs` 提取 HTTP 路由到 native-http：
   - `export_routes` → `native-http/src/routes/compositions.rs`
   - `probe_routes` → `native-http/src/routes/assets.rs`
   - `extract_routes` → `native-http/src/routes/assets.rs`
   - `keyframe_cache_routes` → `native-http/src/routes/assets.rs`
3. native-http 的路由 handler 统一调用 `native-api::ActionRouter`
4. native-core 的 frame_server 保留 WS 帧推送能力（H.264 流端点），供 extension Webview 直连
5. native-http 的 `streaming.rs` 复用 frame_server 的 WS 帧推送逻辑，供 server 端部署

> **本地仅 1 个 server**：extension 模式下，frame_server 通过 NAPI 启动，同时提供 WS 帧推送（Webview 直连）和内部服务。native-http 是独立部署包，不在 extension 本地启动。

**验证**：启动 native-http 服务，用 curl 验证所有 REST 端点。

### Phase 5: extension 接入重构

**目标**：extension 层通过 native-napi 直连 native-api，瘦身现有 NativeMediaEngine。

**具体任务：**
1. 将现有 `NativeMediaEngine.ts` (28KB) 重构，内部调用改为转发到 native-napi 的统一桥接接口
2. `MediaEngineManager` 管理 NativeMediaEngine 生命周期
3. 实现帧流双通道架构：
   - Extension Host 通过 NAPI 调用 `startFrameServer()` → Rust 启动 frame_server → 返回 `port`
   - Extension Host 将 `ws://127.0.0.1:{port}/stream` 传给 Webview
   - Webview 通过 WS 接收 H.264 帧流 → WebCodecs 解码 → Canvas 渲染
   - 信令（seek/pause/speed/loop/keyframe）走 postMessage → Extension Host → NAPI → Rust
4. Webview CSP 配置允许本地 WS 连接：`connect-src ws://127.0.0.1:*`
5. Extension 销毁时通过 NAPI 调用 `stopFrameServer()` 释放端口

---

## 5. 现有 NAPI API 到统一接口的映射

下表列出当前 `native-napi/index.d.ts` 暴露的所有 API 及其在新架构中的归属：

| 现有 NAPI API | 统一接口映射 | Group:Action |
|---|---|---|
| `probeMedia(path)` | `videos/{id}:probe` | videos:probe |
| `extractFrame(source, time, quality, format)` | `videos/{id}:capture` | videos:capture |
| `compositeFrame(request)` | `timelines/{id}:composite` | timelines:composite |
| `extractAllSubtitles(path)` | `videos/{id}:extract` (type=subtitles) | videos:extract |
| `encodeJpeg(rgba, w, h, quality)` | `images/{id}:capture` (format=jpeg) | images:capture |
| `MediaProcessor.create()` | 内部实现，不直接暴露 | — |
| `MediaProcessor.decodeFrame()` | `videos/{id}:extract` (type=frame) | videos:extract |
| `MediaProcessor.decodeFrameRange()` | `videos/{id}:extract` (type=range) | videos:extract |
| `MediaProcessor.applyEffects()` | `videos/{id}:capture` (with effects) | videos:capture |
| `MediaProcessor.applyBlur/Sharpen/...()` | `videos/{id}:capture` (with effects) | videos:capture |
| `MediaProcessor.applyTransition()` | `timelines/{id}:composite` (with transition) | timelines:composite |
| `MediaProcessor.encodeVideoFrame()` | `videos/{id}:transcode` | videos:transcode |
| `MediaProcessor.getGpuInfo()` | `nodes/{id}:health` | nodes:health |
| `MediaProcessor.detectHwAccel()` | `nodes/{id}:health` | nodes:health |
| `VideoEncoderSession` | `videos/{id}:transcode` (stateful) | videos:transcode |
| `AudioDecoderSession` | `audios/{id}:extract` (stateful) | audios:extract |
| `AudioEncoderSession` | `audios/{id}:transcode` | audios:transcode |
| `MuxerSession` | `timelines/{id}:export` (内部) | timelines:export |
| `CompositorSession` | `timelines/{id}:composite` (内部) | timelines:composite |
| `AnimationSession` | `timelines/{id}:composite` (with animation) | timelines:composite |
| `ExportPipelineSession` | `timelines/{id}:export` | timelines:export |
| `FrameServerSession` | `native-http` 服务 | — |
| `FrameServerWithExportSession` | `native-http` 服务 | — |

**补全接口映射（新增）：**

| 新增接口 | 统一接口映射 | Group:Action |
|---|---|---|
| (新增) 音频波形生成 | `videos/{id}:waveform` / `audios/{id}:waveform` | videos:waveform / audios:waveform |
| (新增) 代理文件生成 | `videos/{id}:proxy` | videos:proxy |
| (新增) 回放暂停 | `timelines/{id}:pause` | timelines:pause |
| (新增) 回放恢复 | `timelines/{id}:resume` | timelines:resume |
| (新增) 倍速/倒放 | `timelines/{id}:speed` | timelines:speed |
| (新增) 循环回放 | `timelines/{id}:loop` | timelines:loop |
| (新增) 任务暂停 | `tasks/{id}:pause` | tasks:pause |
| (新增) 任务恢复 | `tasks/{id}:resume` | tasks:resume |
| (新增) 任务终止+清理 | `tasks/{id}:cancel` | tasks:cancel |
| (新增) 关键帧列表 | `videos/{id}:keyframes` | videos:keyframes |
| (新增) 关键帧缓存 seek | `timelines/{id}:keyframe` | timelines:keyframe |

---

## 6. 风险与约束

| 风险 | 缓解措施 |
|------|----------|
| native-core 内部模块重构范围过大 | Phase 1-2 不改动 native-core 内部，仅在其上层封装 |
| NAPI 绑定重构导致现有功能回归 | Phase 3 保留现有函数签名，内部改为转发，现有测试全量回归 |
| models/canvas/scenes 尚无实现 | groups 中预留接口定义，handler 返回 `NotImplemented` |
| types 提取可能引入编译依赖问题 | Phase 1 先做最小提取（error + request/response），逐步扩展 |
| 有状态 Session 类（Encoder/Decoder）难以映射到无状态 REST | Session 类在 native-api 内部管理，REST 通过 session_id 关联 |
| 波形生成对长音频耗时过长 | `:waveform` 作为异步任务执行，支持 `tasks:probe` 查询进度；支持分段增量返回 |
| 代理文件磁盘占用膨胀 | Registry 维护代理文件索引，配合 LRU 策略自动清理过期代理 |
| 回放信令与流会话的生命周期耦合 | 信令动作校验 `session_id` 有效性，会话断开时自动清理播放状态 |
| 任务暂停/恢复的断点续传一致性 | Encoder/Decoder 需支持 checkpoint 机制，`:resume` 从最后完成的 GOP 边界恢复 |
| 本地 frame_server 端口冲突 | 动态分配端口（port=0 由 OS 分配），NAPI 返回实际端口号给 Extension Host |
| Webview CSP 限制 WS 连接 | Webview 创建时配置 `connect-src ws://127.0.0.1:*`，仅允许本地回环 |
| frame_server 生命周期泄漏 | Extension dispose 时必须调用 `stopFrameServer()`，Rust 侧注册 drop guard 兜底 |
| IDR 扫描对长视频耗时 | 首次 `videos:keyframes` 扫描可能耗时 100ms-1s（取决于文件大小），结果缓存在 `idr_indices` 内存中，后续调用 <1ms。超长视频（>2h）考虑异步扫描 + 进度回调 |
| 关键帧缓存内存占用 | NV12 缓存默认 512MB 上限 + 200 帧数量限制，LRU 自动淘汰。1080p 每帧 ~3MB，4K 每帧 ~12MB，需根据目标分辨率调整配置 |
| 自动预热与用户操作竞争 GPU | 预热解码在后台异步执行，优先级低于前台 seek/播放。高 GPU 负载时自动降低预热并发度 |
