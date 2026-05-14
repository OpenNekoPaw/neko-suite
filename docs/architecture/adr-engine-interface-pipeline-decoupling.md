# ADR：neko-engine 接口与管线解耦

- **状态**：提议中
- **日期**：2026-05-12
- **作者**：Claude（架构师）
- **范围**：neko-engine（engine-kernel / host-api / host-http / runtime-ml / host-napi）
- **前置条件**：[adr-four-layer-contract](./adr-four-layer-contract.md)、[adr-engine-four-layer-audit](./adr-engine-four-layer-audit.md)、[engine-plugin-rfc](./engine-plugin-rfc.md)

---

## 背景

neko-engine 是一个 Rust sidecar 进程，为整个 neko-suite 提供 GPU 渲染、编解码、音频 DSP 与 ML 推理能力。完成对 17+ 个 controller、6 条流通道、3 条 GPU 热路径、3 个效果子系统、插件基础设施和 ML 运行时的审计后，识别出以下系统性耦合问题：

1. **PreviewPipeline 把编码焊死在 GPU 合成路径里** —— 目前唯一的输出方式是预编码 H.264，导致无法复用 GPU 合成结果用于截图、muxer 导出或其他编码器。
2. **EffectDispatcher 采用硬编码字符串匹配** —— 12+ 个分支路由到 3 个 processor；未知效果会退回到 CPU 往返路径（`apply_custom_tex_fallback`）；插件注册的 shader 无法走快速的 texture-to-texture 路径。
3. **ML 推理依赖文件 I/O** —— `IMlService` 以文件路径作为输入和输出，既不能接收 GPU texture，也不能产出 GPU texture；无法把 AI 放大/降噪作为管线效果使用。
4. **音频 DSP 工厂是硬编码的** —— `create_effect()` 硬编码匹配 16 种内建类型；未知类型已返回 `Err`（不是早期版本中的静默 `Gain(0.0)` 直通）。核心问题是插件音频效果没有注册入口，且新增效果类型仍需修改 match 分支（OCP 违反）。
5. **插件基础设施结构完整但尚未接线** —— `PluginManager`、manifest、治理门禁和审计都已存在；`PluginActivationHandler` 还没有实现；插件能力没有流入效果注册表。
6. **GPU 资源争用未受控** —— 所有并发管线共享一个 `Arc<GpuContext>`；没有优先级、没有预算、GPU 过载时也没有暂停/限流路径。

**决策**：将引擎拆成可组合的层次 —— **输出适配器**（PipelineSink）、**效果注册表**（统一能力模型）、**GPU 预算控制** 和 **ML 桥接** —— 同时保留 zero-copy 的 GPU 热路径。视频帧、3D 场景渲染和 puppet 渲染都属于 GPU-only 目标路径：如果平台无法提供所需的 zero-copy 或原生句柄能力，就快速失败，而不是回退到 CPU 渲染或 CPU 编码。

### 范围说明

本文档是一份 **umbrella ADR**，覆盖 9 个 Part 的全局视图。建议实施时按以下方式拆分为独立子 ADR：

| 子 ADR | 对应本文 Part | 核心聚焦 |
|--------|-------------|----------|
| PipelineSink + StreamSink/SnapshotSink | Part III + 3.4 | 管线输出解耦 + GPU-only 规则 |
| GpuEffect Registry + Audio Factory | Part V | 效果系统 OCP 改造 + 插件桥接 |
| Dual API (CreativeAccess + DataAccess) + Scene 拆分 | Part IX + VIII.3-8.4 | ECS 双抽象 + 计算-渲染分离 |
| GPU Budget Controller | Part IV | 并发管线资源管理 |
| PuppetRenderer + WS 命令协议 | Part VIII.CP2-CP4 | 2D 骨骼 GPU 渲染 + 控制平面对齐 |

**P0 分为两个子阶段**：

- **P0a**（IO + 效果）：PipelineSink + StreamSink/SnapshotSink + CPU fallback 消除 + GpuEffect registry。这是最小可交付底座——解耦管线输出和效果派发，不触及 ECS 层。
- **P0b**（ECS 抽象）：Dual API trait 定义 + SceneComputation/SceneRenderer 拆分 + 消除 `ecs_world_mut()` 逃逸口。依赖 P0a 中 PipelineOutput 类型定义（SceneRenderer 产出 `VideoGpuFrame`），但可在 P0a 的 PipelineSink PR 合入后立即开始。

P0a 和 P0b 的 PR 在 PipelineSink 合入后可并行推进。PreviewProviderRegistry、PuppetRenderer、GPU Budget 在 P2 推进。

---

## 第一部分：接口架构审计

### 1.1 IPC 与 WebSocket 的分工

引擎在这里强制保持清晰分工：

| 通道     | 传输方式                                                           | 方向             | 用途                             |
| -------- | ------------------------------------------------------------------ | ---------------- | -------------------------------- |
| 控制流   | N-API `dispatch()`/`dispatch_action()` 或 HTTP POST `/v1/dispatch` | TS → Engine → TS | 变更、查询、一次性命令           |
| 数据流   | WebSocket `/v1/{group}/stream` 或 `/v1/streams/:id`                | Engine → TS      | 连续帧（H.264、PCM、fMP4、事件） |
| 文件服务 | HTTP GET `/v1/preview/file/:token`                                 | Engine → TS      | Range(206) 二进制下载、EPUB 按需解压 |

**路由一致性规则**：

| 类型 | 路由方式 | 判断标准 | 示例 |
|------|----------|----------|------|
| JSON 命令/响应 | ActionRouter `{group}:{action}` | 输入输出都是 JSON | `videos:probe`、`previews:register-asset` |
| WebSocket 实时流 | 直接 HTTP 路由 | 长连接、二进制帧 | `/v1/streams/:id`、`/v1/scenes/control` |
| 文件下载 | 直接 HTTP 路由 | Range(206)、二进制下载 | `/v1/preview/file/:token` |

> **当前违规**：`/v1/preview/assets/*` 的 6 个 POST/PUT/DELETE 端点返回 JSON，但绕过了 ActionRouter。应迁移到 `previews` controller group（见 §7B.2）。

**ActionRouter**（`host-api/src/router.rs`）会把 `ActionRequest { group, action, id, options, body }` 分发到 18 个 controller（目标 19 个，含 `previews`）：

```
videos(15) | audios(20) | timelines(14) | streams(14) | effects(5) | models(7)
images(6) | documents(4) | scenes(8) | puppets(8) | cameras(4) | midi(4)
gamepad(3) | canvas(3) | color-correction(3) | nodes(3) | tasks(2) | plugins(7)
previews(7) ← 目标状态，从直接 HTTP 路由迁入
```

**流基础设施**（`services/impls/stream_loop.rs`）：

- `ActiveStreams`：所有流类型共用的全局注册表（按 `StreamId` 存放的 `HashMap`）
- `PlaybackState`：包含 paused、speed、loop_region、seek_to、timeline_update、config_update 的 watch channel
- `StreamPlaybackDelegate`：所有服务都把播放控制委托给它
- `WallClockPacer`：sleep/spin 混合的帧节奏控制（亚毫秒精度）
- `SpeedResampler`（`audio/dsp/speed_resampler.rs`）：线性插值变速重采样器（无音高保持），用于单轨流和多轨混音中的非整数速度播放
- `create_stream_channels()`：生成 broadcast(64) + CancellationToken + watch 的工厂
- 二进制帧格式：`pack_h264_frame()` = `[pts:i64][dts:i64][is_keyframe:u8][duration:i64][NAL]`；`pack_pcm_f32le_stream_frame()` = `[pts_us:i64][duration_us:i64][sample_rate:u32][channels:u16][PCM f32le]`

**音频流速度感知机制**：

- 单轨流（`AudioService::start_stream()`）：速度变化时，使用 `SpeedResampler` 对解码缓冲区重采样；seek 后施加 5ms 淡入斜坡（48kHz × 5ms = 240 samples），避免音频突变；残余缓冲区累积用于非整数速度下的对齐
- 多轨混音（`audio_mix_stream.rs`）：`MixdownConfig` 支持热更新 + ACK 确认模式（通过 `MixdownUpdateAck` channel）；非整数速度时，累积多个源缓冲区至目标时长后统一重采样；EOF 时进入空闲等待（`MixStreamIdleWake::Seek` 或 `::MixdownUpdate`），避免 busy-wait
- Pacer 在 pause→resume 时自动重置，防止恢复播放后产生时钟漂移

**为什么不迁移到 RESTful 路径规则**：

ActionRouter 的 `group:action` 平坦派发是刻意的架构选择，不应迁移到 REST 嵌套资源路径。量化依据：EngineClient 中 80 处 `this.dispatch()` 调用走 ActionRouter，仅 10 处直接 `fetch()` 调用（health 1 + monitor 1 + preview/file 8）用于非 JSON 场景。

| 维度 | ActionRouter `group:action` | RESTful 嵌套路径 | 判定 |
|------|---------------------------|------------------|------|
| **双传输统一** | N-API `dispatch()` 和 HTTP `POST /v1/dispatch` 共享同一个 `ActionRequest` 结构 | N-API 无 URL 路径概念，无法表达 `GET /v1/videos/:id`；必须为 N-API 和 HTTP 维护两套 API | ActionRouter 胜出 |
| **插件拦截** | `ActionRouter::route()` 是唯一汇聚点，PluginManager 拦截只需一层 hook | REST 路由分散到几十个独立 handler，需 Tower middleware；N-API 通道仍无 middleware 概念 | ActionRouter 胜出 |
| **领域语义** | action 是领域动词（`probe`/`capture`/`composite`/`stream`/`diff`），自然表达命令模式 | REST 动词是 CRUD 语义；媒体引擎操作（转码、合成、流推送）不是资源增删改查，强行映射产生语义扭曲 | ActionRouter 胜出 |
| **TS 客户端** | 统一 `dispatch(req)` 方法，80 处调用复用一个接口 | 每个端点需独立 URL 构造 + HTTP 方法 + 参数映射（如 preview 的 4 个独立 fetch），维护量翻倍 | ActionRouter 胜出 |
| **REST 兼容** | HTTP 层已提供 `POST /v1/:group/:id/:action` 作为 REST-like 入口，最终仍转换为 ActionRequest 进入 ActionRouter | — | 已有折中方案 |

> **结论**：ActionRouter 为命令式媒体引擎提供了双传输统一、单点拦截和领域语义三重优势。HTTP 层的 `POST /v1/:group/:id/:action` 已经提供 REST-like 便利性而不牺牲内核统一性。直连 HTTP 只用于 WebSocket 流和文件下载——这两者天然不适合 request/response JSON 通道。

### 1.2 项目文件支持

| 格式             | 加载器                          | EditOperation                            | 流                 |
| ---------------- | ------------------------------- | ---------------------------------------- | ------------------ |
| `.nkv`（视频）   | `JviLoader::load()` → Timeline  | 完整支持（三级：P0/P1/P2，共 15 个操作） | timeline 流 + 导出 |
| `.nka`（音频）   | 来自 TS 的 `MixdownConfig`      | 无（无状态，项目状态由 TS 持有）         | mix 流 + mix 导出  |
| `.nkm`（3D）     | runtime-scene 中的 `NkmProject` | 无（基于 ECS）                           | scene 流           |
| `.nkp`（puppet） | runtime-puppet 的 INP 加载器    | 无（基于 ECS）                           | puppet 流          |

**关键不对称性**：`.nkv` 具备引擎侧项目状态和 EditOperation；其他格式的状态都在 TS 侧，由引擎作为无状态执行器。

### 1.3 EditOperation 系统

`.nkv` 的增量变更分为三层优先级：

| 优先级       | 操作数 | 延迟  | 示例                                                             |
| ------------ | ------ | ----- | ---------------------------------------------------------------- |
| P0（瞬时）   | 3      | <1ms  | element.update、track.toggle、element.toggle                     |
| P1（快速）   | 4      | <5ms  | track.update、element.splitKeepLeft/Right、project.update        |
| P2（结构性） | 8      | <50ms | element.add/remove/move/splitAt、track.add/remove/reorder、batch |

通过 `stream:applyOperation`（StreamController 402-436 行）→ `timeline_service.apply_operation_to_stream()` → 运行中的 stream loop 热更新来执行。

### 1.4 音频接口结论

音频创建**不需要**新的 controller 类型。`audios` controller（20 个 action）已经覆盖单文件操作；项目级编排（`MixdownConfig`）是无状态的。新的能力（automation、bus routing、按片段效果）只需要扩展 `MixdownConfig` 字段，不需要扩展 controller 面。细节见 [adr-audio-workstation-evolution.md](./adr-audio-workstation-evolution.md)。

---

## 第二部分：管线架构审计

### 2.1 三条 GPU 热路径（Zero-Copy）

**路径 A —— 时间线预览流**（最热路径，约 60fps）：

```
HwAccelDecoder.decode_next_gpu()
  → Nv12GpuTexture { handle: VideoToolbox { io_surface } }
  → Nv12TextureImporter (Metal → wgpu texture import)
  → TextureCompositor (multi-layer GPU composite + blend modes + transforms)
  → EffectDispatcher (per-element GPU effects, ping-pong)
  → RgbaToNv12Converter (GPU color space)
  → IOSurfaceBackingStore (GPU → IOSurface, zero-copy)
  → HwAccelEncoder.encode_frame_gpu(io_surface_handle)
  → CVPixelBuffer wrap (zero-copy, no memcpy)
  → VideoToolbox H.264 encode
  → broadcast → WebSocket
```

**路径 B —— 单文件视频流**（约 60fps）：

```
HwAccelDecoder.decode_next_gpu()
  → Nv12GpuTexture
  → HwAccelEncoder.encode_frame_gpu(pixel_buffer)
  → VideoToolbox encode
  → broadcast → WebSocket
```

**路径 C —— 导出**（离线，质量优先）：

```
GpuExportPipeline.process_frame_to_iosurface_timed()
  → IOSurface handle (usize)
  → AsyncExportPipeline.submit_composited(CompositedFrame { gpu_handle })
  → Compose worker (Arc<GpuContext>)
  → Muxer output
```

**约束**：任何把 CPU readback 插入这些路径的解耦方式，都会造成 **5-10 倍性能退化**（GPU→CPU 拷贝 + 管线停顿）。

**GPU 驻留规则**（目标状态）：

- 实时视频帧、3D 场景渲染和 puppet 渲染都是 GPU-only 目标路径。
- 热路径不得使用 `GPU → CPU → GPU`、GPU 渲染后 CPU 编码，或纯 CPU 渲染作为兼容性退路。
- 如果平台无法提供所需的原生 GPU handle 或编码器输入，引擎返回 `UnsupportedCapability` 并停止操作。
- CPU 路径仍适用于音频 DSP、图片/文档预览、解析、调度、元数据、序列化，以及显式的终点 readback。
- 终点 readback 只允许用于截图、缩略图、高质量预览帧、分析缓冲区等终点产物；它不是流式播放或导出的 fallback。
- 低端设备兼容不是这些 GPU 驻留路径的设计目标。

**当前平台差距**（必须在 P0 消除）：

| 平台 | 当前状态 | 目标 |
|------|----------|------|
| macOS | IOSurface zero-copy（符合目标） | 保持 |
| macOS 导出 | IOSurface 失败时 fallback 到 `process_frame_to_nv12_timed()` + CPU readback（带 warn 日志） | 返回 `Err` + 向调用方报告 `UnsupportedCapability` |
| 非 macOS | `process_frame_to_nv12()` + CPU readback 作为主路径 | 实现平台原生 zero-copy（Vulkan external memory / DMA-BUF / D3D11 shared texture）或返回 `UnsupportedCapability` |

消除 CPU fallback 的 PR 在实施计划 P0 阶段追踪（见 §P0-PR4）。

### 2.2 GpuExportPipeline —— 输出无关核心

`GpuExportPipeline`（`export/gpu_export_pipeline.rs`）是共享 GPU compositor。它的公开 API 已经与输出形式解耦：

| 方法                           | 输出                                    | Zero-Copy      |
| ------------------------------ | --------------------------------------- | -------------- |
| `process_frame()`              | `TextureCompositeResult`（GPU texture） | 是             |
| `process_frame_to_cpu()`       | `Vec<u8>`（RGBA bytes）                 | 否（readback） |
| `process_frame_to_nv12()`      | `Vec<u8>`（NV12 bytes）                 | 否（readback） |
| `process_frame_to_iosurface()` | `usize`（IOSurface handle）             | 是（macOS）    |

内部链路：`HwAccelDecoder[N] → Nv12TextureImporter → TextureCompositor → RgbaToNv12Converter → EffectDispatcher`

### 2.3 PreviewPipeline —— 编码内嵌导致的耦合点

`PreviewPipeline`（`preview/pipeline.rs`）封装了 `GpuExportPipeline` + `HwAccelEncoder`：

```rust
pub fn render_frame_timed(&mut self, time: f64, bg: [f32; 4])
    -> Result<(Vec<PreviewFrame>, GpuPipelineTiming, u64)> {
    result = self.gpu_pipeline.process_frame_to_iosurface_timed(time, bg)?;
    packets = self.encoder.encode_frame_gpu(result.gpu_handle, pts)?;  // 已焊死在这里
    Ok((packets.map(PreviewFrame::from), timing, encode_ns))
}
```

编码器被硬编码在管线内部，调用者无法在不先编码的情况下取得 GPU 合成结果。

### 2.4 音频管线 —— 已经解耦

`AudioMixdown`（`services/audio_mixdown.rs`）已经与输出形式无关：

```rust
pub fn mix_buffer(&mut self, time: f64) -> Result<MixdownBuffer>;
```

返回 `MixdownBuffer`（f32 PCM）。调用方决定后续动作：流式输出（pack + broadcast）、导出（mux）或分析。这里没有耦合点。

**速度变化处理**：音频速度变化由调用方在 mix 输出之后处理，不侵入 `AudioMixdown` 本身：

- 整数速度（1x）：`mix_buffer()` 直接输出，pack 后发送
- 非整数速度：调用方累积多个 `mix_buffer()` 结果至目标时长，然后通过 `SpeedResampler` 统一重采样到输出 buffer 大小。重采样器是无状态的纯函数（线性插值），不持有跨帧缓冲
- `MixdownConfig` 热更新通过 watch channel + ACK 确认模式实现：调用方检测到 config 序列号变化后，`mixdown.update_config()` 应用新配置，并重初始化 pacer/resampler/buffer_size，通过 `MixdownUpdateAck` channel 向请求方发送确认

这个设计保持了 `AudioMixdown` 的输出无关性——速度重采样、热更新 ACK、淡入处理都在调用方（stream loop）层面完成。

### 2.5 共享基础设施组件

预览、导出和流式播放共享 10 个组件，粒度过厚，不适合拆成独立进程：

| 组件                                            | 使用方                   |
| ----------------------------------------------- | ------------------------ |
| `GpuExportPipeline`                             | 时间线流、导出、截图     |
| `HwAccelDecoder`（池：最多 16 个，每文件 2 个） | 所有视频路径             |
| `HwAccelEncoder`（池：最多 4 个）               | 预览、导出、转码         |
| `AudioMixdown`                                  | mix 流、时间线音频、导出 |
| `StreamRegistry`（ActiveStreams）               | 所有流类型               |
| `WallClockPacer`                                | 所有实时流               |
| `PlaybackState`（watch channel）                | 所有流类型               |
| `GpuContext`（Arc，共享 wgpu device）           | 所有 GPU 路径            |
| `IOSurfaceBackingStore`                         | macOS zero-copy 路径     |
| `EffectDispatcher`                              | 时间线合成、导出         |
| `SpeedResampler`                                | 单轨流、多轨混音         |
| `PanoramicRenderer`（目标状态）                 | 全景图 FOV 裁切、全景视频流 |

---

## 子 ADR 索引

本 umbrella ADR 已拆分为 6 个独立子 ADR，每个子 ADR 自含完整设计、实施计划和验证标准。下面各 Part 的详细设计请参阅对应子 ADR。

| # | 子 ADR | 对应本文 Part | 核心聚焦 | P 阶段 | 前置条件 |
|---|--------|-------------|----------|--------|----------|
| 1 | [PipelineSink](./adr-engine-pipeline-sink.md) | Part III + §2.1 | 管线输出解耦 + GPU-only 规则 + StreamSink/SnapshotSink | P0a（PR1+PR2+PR7） | 无（基础） |
| 2 | [GpuEffect Registry](./adr-engine-effect-registry.md) | Part V | 效果系统 OCP 改造 + AudioEffectFactory + 插件桥接 + ML 集成 | P0a-PR6 + P1 + P2-PR5 | 无硬依赖（与子 ADR 1 共享 GPU-only 原则） |
| 3 | [Dual API + Scene 拆分](./adr-engine-dual-api-scene-split.md) | Part IX + VIII(Scene) | CreativeAccess + DataAccess 双抽象 + 计算-渲染分离 | P0b（PR3+PR4a+PR4b+PR5） | 子 ADR 1（PipelineOutput 类型） |
| 4 | [GPU Budget Controller](./adr-engine-gpu-budget.md) | Part IV | 并发管线资源管理 + 帧时间反馈 | P2-PR1 | 子 ADR 1 |
| 5 | [PuppetRenderer + WS 命令](./adr-engine-puppet-renderer.md) | Part VIII(Puppet) | wgpu SpriteBatch + WebSocket 命令协议 | P2（PR3+PR4）+ P3-PR1 | PR3 无依赖；PR4 依赖子 ADR 1 + 4 |
| 6 | [预览子系统 + PanoramicRenderer](./adr-engine-preview-subsystem.md) | §7B | 三层预览架构 + PanoramicRenderer + PreviewProviderRegistry | P2（PR6a+PR6b+PR6c）+ P3-PR4 | PR6a/6b 无依赖；PR6c 依赖子 ADR 4 |

### 跨子 ADR 排序约束

```
P0a（IO + 效果，~500 行）:
  子ADR 1: PR1 PipelineSink+StreamSink → PR2 SnapshotSink → PR7 CPU fallback 消除
  子ADR 2: PR6 GpuEffect HashMap
  ── PR1 和 PR6 可并行（GpuEffect 不依赖 PipelineOutput 类型） ──

P0b（ECS 抽象，~600 行，PR1 合入后启动）:
  子ADR 3: PR3 Dual API Trait → PR4a SceneComputation → PR4b SceneRenderer → PR5 消除 ecs_world_mut()
  ── PR3 依赖 PR1 的 PipelineOutput 类型定义；PR3 系列可与 PR6 并行 ──

P1（插件接线 + 音频注册表，~410 行）:
  子ADR 2: PR1 AudioEffectFactory → PR2 PluginActivationHandler → PR3 EffectCapability+TS → PR4 ML 离线
  ── 删除 P0 临时 feature flag（在 P1-PR1 中） ──

P2（GPU Budget + Puppet + Preview + Effect 优化，~1400 行）:
  子ADR 4: PR1 GpuBudgetController
  子ADR 1: PR2 MuxerSink
  子ADR 5: PR3 Puppet WS Command（无 GPU 依赖，可与 PR1 并行） → PR4 PuppetRenderer
  子ADR 2: PR5 EffectDispatcher 成本+in-place
  子ADR 6: PR6a runtime-media 吸收 → PR6b PreviewProviderRegistry → PR6c PanoramicRenderer
  ── PR6a/PR6b 无 GPU 依赖，可与 PR1 并行；PR1 先于 PR4/PR6c；PR3 可与 PR1 并行 ──

P3（高级合成，~820 行，延期）:
  子ADR 5: PR1 Puppet H.264+导出
  子ADR 2: PR2 ML GPU Bridge → PR3 Transition as GpuEffect
  子ADR 6: PR4 全景视频+Scene/Puppet Provider
```

---

> **以下为已迁移到子 ADR 的 Part 概要引用。完整设计请查阅对应子 ADR。**

### Part III 概要：PipelineSink（→ [子 ADR 1](./adr-engine-pipeline-sink.md)）

PreviewPipeline 把编码焊死在 GPU 合成路径里。PipelineSink trait 将管线输出解耦为 5 种 sink（StreamSink / MuxerSink / PreviewSink / SnapshotSink / AudioSink），同时保留 zero-copy GPU 热路径。GpuFrameLease RAII 包装替代裸 usize handle。

### Part IV 概要：GPU Budget Controller（→ [子 ADR 4](./adr-engine-gpu-budget.md)）

所有并发管线共享一个 `Arc<GpuContext>`，无优先级/预算/限流。GpuBudgetController 基于多信号帧时间 EMA 反馈，按 Interactive > Export > Transcode 优先级管理并发。GPU 过载时暂停 Transcode（不做 CPU fallback）。

### Part V 概要：效果系统解耦（→ [子 ADR 2](./adr-engine-effect-registry.md)）

EffectDispatcher 硬编码 12+ match 分支（OCP 违反）；音频 DSP 工厂硬编码 16 种类型（OCP 违反）；ML 推理只支持文件 I/O。GpuEffect trait + HashMap 替代 match；AudioEffectFactory 注册表；统一 EffectRegistry 能力查询；ML 三阶段集成（A 离线 → B GPU bridge → C 实时）。

### Part VIII 概要：Puppet/Scene 计算-渲染-IO 分离（→ [子 ADR 3](./adr-engine-dual-api-scene-split.md) + [子 ADR 5](./adr-engine-puppet-renderer.md)）

SceneService 混合计算和渲染（两把 Mutex 依次锁住）；Puppet 没有引擎 GPU 渲染路径。拆分为 SceneComputation（tick+extract）+ SceneRenderer（从 RenderWorld 快照渲染），新增 PuppetRenderer（wgpu SpriteBatch）产出 VideoGpuFrame。Puppet 输入从 REST 升级为 WebSocket command envelope（复用 SceneCommandEnvelope 模式）。

### Part IX 概要：Dual API（→ [子 ADR 3](./adr-engine-dual-api-scene-split.md)）

SceneService 有 18 个 `ecs_world_mut()` 逃逸口——不是 bug，而是 OOP 抽象无法表达的合法操作。Dual API（CreativeAccess OOP 面向用户 + DataAccess ECS 面向数据）形式化两种访问模式，消除所有逃逸口。trait 放在 runtime-scene/runtime-puppet（不是 engine-types，避免引入 glam/bevy_ecs 依赖）。

### §7B 概要：预览子系统（→ [子 ADR 6](./adr-engine-preview-subsystem.md)）

文件预览缺乏统一入口、预览不能污染 GPU 热路径、已有代码职责散落在 HTTP 路由层。三层架构：host-http（传输层）→ engine-kernel PreviewProviderRegistry（编排层）→ runtime-media（领域层）。PanoramicRenderer（单个 wgsl shader）共用于全景图 FOV 裁切和全景视频流。6 个内建 Provider。

---

## 第六部分：解耦后的组合场景

| 场景                      | 之前                                 | 之后                                                |
| ------------------------- | ------------------------------------ | --------------------------------------------------- |
| 插件 shader + 内建效果    | Plugin → CPU fallback（慢 10-50 倍） | Plugin → 同一条 `GpuEffect` 快路径                  |
| AI 放大 + 色彩校正        | 在管线里做不到                       | 阶段 A：先预处理再渲染；阶段 B：导出时走 GPU bridge |
| 通过插件提供新的音频效果  | 做不到                               | 通过激活处理器调用 `AudioEffectFactory.register()`  |
| 从 GPU 合成结果生成截图   | 先编码 H.264 再解码                  | `SnapshotSink` 直接读取 GPU texture                 |
| 替代编码器（AV1/HEVC）    | PreviewPipeline 中硬编码 H.264       | `StreamSink` 使用不同编码器                         |
| GPU 合成 → 分析工具       | 做不到                               | 自定义 `PipelineSink` 接收 `VideoOutput::GpuFrame`  |
| transition 与 effect 交错 | 只能顺序 pass                        | 注册表中的 `GpuTransitionEffect`（P3）              |
| 插件提供的 ML 模型        | 做不到                               | `PluginKind::Model` → `ModelRegistry.register()`    |
| 全景图 FOV 裁切           | CPU 实现，散落在 HTTP 路由层          | `PanoramicRenderer` GPU shader，质量和速度显著提升  |
| 全景视频实时预览          | 做不到                               | `HwAccelDecoder → PanoramicRenderer → StreamSink`   |
| 统一文件预览入口          | 各扩展自行实现，绕过 ActionRouter    | `PreviewProviderRegistry` + `preview:generate` action |

---

## 第七部分：解耦后的架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                      控制层                                          │
│  host-api / host-http / host-napi                                    │
└────────────────────────────┬────────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────────┐
│                      契约层（engine-types）                          │
│  PipelineOutput | VideoOutput | AudioOutput | PreviewArtifact        │
│  EffectCapability | GpuOutputHandle | FrameData                      │
└────────────────────────────┬────────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────────┐
│                      治理层                                          │
│  EffectRegistry (GpuEffect | AudioEffect | MlModel | Transition)     │
│  GpuBudgetController (frame-time EMA + priority)                     │
│  PluginManager + PluginActivationHandler                             │
│  PreviewProviderRegistry                                             │
└────────────────────────────┬────────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────────┐
│                      计算层                                          │
│  runtime-scene (BevySceneWorld)  │  runtime-puppet (BevyPuppetWorld)  │
│  runtime-media (probe/分析/变体) │  runtime-ml (ONNX inference)      │
│  AudioMixdown + DSP EffectChain  │  HwAccelDecoder pool              │
│  SpeedResampler                  │  Video timeline state             │
└────────────────────────────┬────────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────────┐
│                      渲染与处理层                                    │
│  GpuExportPipeline (GPU composite + effects)                         │
│  SceneRenderer (PBR, from RenderWorld snapshot)                       │
│  PuppetRenderer (SpriteBatch, from DeformedMeshes)                   │
│  PanoramicRenderer (equirect→rectilinear shader, no ECS)             │
│  AudioMixdown.mix_buffer() → f32 PCM                                 │
│                                                                      │
│  输出: VideoOutput::GpuFrame | AudioOutput::PcmF32                   │
└────────────────────────────┬────────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────────┐
│                      输出层（PipelineSink）                          │
│                                                                      │
│  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌──────────┐ ┌─────────┐  │
│  │StreamSink│ │MuxerSink │ │PreviewSink│ │SnapshotSk│ │AudioSink│  │
│  │H.264→WS  │ │MP4/MOV   │ │RGBA/JPEG  │ │oneshot   │ │PCM→WS   │  │
│  └──────────┘ └──────────┘ └───────────┘ └──────────┘ └─────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

**视频热路径**（zero-copy，60fps）：

```
HwAccelDecoder → GPU texture → GpuExportPipeline → VideoOutput::GpuFrame
  → StreamSink: encode_frame_gpu(IOSurface) → pack_h264_frame → broadcast → WebSocket
```

**音频路径**（CPU，低延迟）：

```
AudioDecoder → AudioMixdown → DSP EffectChain → AudioOutput::PcmF32
  → AudioSink: pack_pcm_f32le_stream_frame → broadcast → WebSocket
```

**预览路径**（按需，独立于热路径）：

```
PreviewProviderRegistry.generate_preview(file)
  → ImagePreviewProvider: decode + resize → PreviewArtifact::StaticImage
  → ImagePreviewProvider(全景): decode → GPU upload → PanoramicRenderer → readback → StaticImage
  → VideoPreviewProvider(全景): HwAccelDecoder → PanoramicRenderer → StreamSink → MediaStream
  → ScenePreviewProvider: load + render one frame → PreviewArtifact::StaticImage
  → VideoPreviewProvider: seek + decode one frame → PreviewArtifact::StaticImage
```

---

## 分阶段实施计划

**优先级轴线**：IO（PipelineSink）→ Dual API（OOP+ECS）→ ECS 层（计算-渲染拆分）→ GPU（预算 + Renderer）

各阶段的详细 PR 列表和变更文件见对应子 ADR。跨子 ADR 的排序约束见上方「跨子 ADR 排序约束」章节。

| 阶段 | 范围 | 预估规模 | 子 ADR |
|------|------|----------|--------|
| P0a | PipelineSink + GpuEffect 注册表 + CPU fallback 消除 | ~500 行 | 1 + 2 |
| P0b | Dual API + ECS 拆分（P0a PR1 合入后启动） | ~600 行 | 3 |
| P1 | 插件接线 + 音频注册表 + ML 离线 | ~410 行 | 2 |
| P2 | GPU Budget + MuxerSink + PuppetRenderer + Preview + Effect 优化 | ~1400 行 | 1 + 2 + 4 + 5 + 6 |
| P3 | Puppet H.264 + ML GPU Bridge + Transition + 全景视频 | ~820 行（延期） | 2 + 5 + 6 |

---

## 关键设计决策

| 决策                                                         | 理由                                                                                                                    | 备选方案                                                                              |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 编码放在 Sink，而不是 Pipeline                               | 保留 zero-copy GPU 路径；可在不做 CPU 往返的情况下支持截图和替代编码器                                                  | 编码放在 Pipeline 中（当前做法——耦合导致无法复用）                                    |
| PipelineSink 保持同步，而不是异步                            | 60fps 热路径承受不起 Future 分配；需要异步 I/O 的 sink 使用内部有界 channel                                             | 异步 trait（每帧会因 Future boxing + waker 产生约 200ns 开销）                        |
| GpuEffect 用 HashMap，而不是 match                           | 符合 OCP；插件效果走同一条快路径                                                                                        | 继续 match 并不断增长分支（违反 OCP）                                                 |
| 未知效果返回错误，而不是静默直通                             | 音频里静默 `Gain(0.0)` 会掩盖 bug；视频里的 CPU fallback 会掩盖性能问题                                                 | 保留静默 fallback（会掩盖问题）                                                       |
| 只保留一个 EffectRegistry，而不是按领域拆分                  | 统一插件激活路径；TS 一次就能发现全部能力                                                                               | 每个领域单独注册表（插件接线重复）                                                    |
| GPU 预算基于帧时间反馈，而不是 GPU 利用率                    | wgpu 不提供 GPU 利用率指标；帧时间可直接通过已有 `GpuPipelineTiming` 观测                                               | 查询 GPU 利用率（wgpu 不支持）                                                        |
| GPU 预算是软控制器，而不是硬锁                               | wgpu Device/Queue 是线程安全的；硬锁会把所有 GPU 工作串行化                                                             | 给 GpuContext 套 Mutex（会杀死并发）                                                  |
| Dual API（CreativeAccess + DataAccess）                      | 形式化两种合法访问模式；消除 18 个 `ecs_world_mut()` 逃逸口；可在 Service 层做权限控制                                  | 一个包含全部方法的 trait（没有职责分离）；按场景拆成大量 typed query 方法（方法爆炸） |
| trait 放在 runtime-scene/runtime-puppet，而不是 engine-types | trait 使用 Vec3/Quat（glam）+ World（bevy_ecs）；把它们加进 engine-types 会破坏零依赖保证。runtime crate 已经有这些依赖 | 放在 engine-types（需要 glam+bevy_ecs）；新建 runtime-core crate（P0 不需要）         |
| 先做 Dual API，再做计算-渲染拆分                             | 拆分会物理隔离两个 API 消费者；先定义 API 才能保证拆分边界正确                                                          | 先拆分再补 API（有接口边界错误风险）                                                  |
| 通过 RenderWorld 快照并发，而不是 RwLock                     | bevy_ecs 的 `World::query()` 需要 `&mut`；快照提取已存在；无需改 ECS 就能解耦 tick/render                               | RwLock（bevy_ecs 不为此设计）；真正并发查询（需要修改 bevy_ecs）                      |
| 先做 ML 阶段 A（离线），再做阶段 B（GPU bridge）             | 阶段 A 今天就能做，不改架构；阶段 B 需要平台特定 GPU 互操作                                                             | 直接跳到阶段 B（风险高，还会卡在 ONNX IOBinding）                                     |
| 预览分析逻辑放 runtime-media，而不是 engine-kernel           | GPANO 检测、投影推断、图片变体生成都是无 GPU 的文件分析，与 `probe()`/`diff()`/`subtitle` 同类；runtime-media 的定位就是"无 GPU 媒体领域逻辑" | 放在 engine-kernel PreviewProviderRegistry 内（把编排和分析混在一起）；放在 SceneService（增加已过胖的 service 的耦合） |
| PanoramicRenderer 独立于 SceneRenderer/PuppetRenderer       | 等距柱状投影只需一个 fragment shader + fullscreen quad，不需要 ECS/PBR/SpriteBatch；独立渲染器保持最小依赖                | 放在 SceneRenderer 内（引入不必要的 bevy_ecs 依赖）；放在 GpuExportPipeline（它是 compositor 不是 renderer）           |
| 全景图和全景视频共用 PanoramicRenderer                       | equirect→rectilinear 投影变换对图片和视频完全相同，只是输入来源不同（CPU decode vs GPU decode）                            | 图片和视频各实现一套投影（重复 shader 代码）                                                                           |
| ActionRouter `group:action` 而非 RESTful 嵌套路径           | 双传输统一（N-API 无 URL 路径概念）；单点插件拦截；领域动词（probe/capture/composite）不是 CRUD；TS 客户端 80 处复用统一 `dispatch()` | 迁移到 RESTful 路径（N-API/HTTP 两套 API 分裂；插件拦截需 Tower middleware + N-API hook 两层；TS 客户端每端点独立 fetch） |

---

## 风险与缓解

| 风险                             | 影响                                  | 缓解措施                                                                                                                                                          |
| -------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GpuEffect trait 开销相对直接调用 | vtable 分发每帧每个 effect 约增加 1ns | 相比 16ms 帧预算可以忽略；前后测量即可                                                                                                                            |
| 插件 shader 在注册时编译失败     | 阻塞插件激活                          | 注册时校验 WGSL；通过 PluginAuditor 报错                                                                                                                          |
| GPU 预算 controller 误判降级     | Transcode 被不必要地暂停或限流        | 使用带滞回的帧时间 EMA（持续高于 18ms 时暂停，低于 14ms 时恢复）；管线数量作为次级保护                                                                            |
| ML GPU bridge 平台碎片化         | macOS/Linux/Windows 需要不同互操作    | 阶段 A（离线）无需互操作即可覆盖 90% 场景                                                                                                                         |
| PipelineSink 同步 submit 阻塞    | 慢 sink 阻塞渲染循环                  | StreamSink 使用 `broadcast::Sender::send()`（落后 receiver 会被丢弃，不是 frame 被丢弃——符合现有模式）；MuxerSink 入队到有界 channel（通过 channel 容量施加背压） |

---

## 验证

各子 ADR 包含各自完整的验证标准。以下为全局验证要求：

**P0（PipelineSink + Dual API + ECS 拆分 + GpuEffect 注册表）**：

- timeline 预览流在重构前后输出相同的 H.264 结果（不要求 bit-exact，但要求视觉等价和时序一致）
- 通过 SnapshotSink 输出的 RGBA 合法，并与 `process_frame_to_cpu()` 输出一致
- 所有效果都通过 HashMap 查找命中（不再回退到 `apply_custom_tex_fallback`）
- SceneService 中 18 个 `ecs_world_mut()` 调用点全部迁移到类型化 DataAccess 调用
- `cargo test`（engine-kernel）通过；`pnpm test`（neko-cut）通过
- 性能：帧渲染时间在基线 5% 以内

**P1/P2/P3 验证标准**：见对应子 ADR。

**跨平台 GpuOutputHandle 测试策略**：

- macOS（主要开发环境）：使用 IOSurface zero-copy 路径做完整集成测试（CI：macOS runner）
- Linux/Windows：通过 fail-fast 能力测试验证在 zero-copy GPU input 不可用时返回 `UnsupportedCapability`；不走 CPU encode 路径
- 平台特定变体（`VaSurface`、`D3D11Texture`）只在对应 CI runner 可用时测试；通过 `#[cfg(test)]` + feature flags 门禁
- 所有 PipelineSink 实现都用终点 GPU handle 或 mock encoder 做平台无关单测；不再存在可注入的 `CpuFallback` 变体

---

## 开放问题（在实施前需要解决）

| #   | 问题                                                                                                                                                                          | 选项                                                                                                                                                                             | 推荐                                                                                             |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 1   | **PluginCapability ID**：在 manifest 中增加显式 `id` 字段，还是从 `"{plugin_id}.{capability_type}.{entry_stem}"` 派生？                                                       | A）在 manifest schema 中增加 `id: String`（对现有插件是破坏性变更） B）确定性派生（如果不同类型里 entry 同名，会有冲突风险）                                                     | A —— 显式 `id` 更清晰；现有插件没有 `id` 字段，所以迁移是增量式的（可选字段，并保留派生兜底）    |
| 2   | **Dual API 的强制级别**：编译期（分离 crate 边界）还是架构约定（code review + 模块可见性）？                                                                                  | A）trait 放在独立 crate，调用方只导入需要的 trait B）trait 放在 runtime crate，通过 typed DataAccess methods + `ecs_world_mut_raw()` 的 `pub(crate)` 可见性 + code review 来约束 | P0 选 B —— 编译器强制需要一个尚不存在的 `runtime-core` crate。若后续绕过点再次出现，可在 P2 回看 |
| 3   | **共享 trait crate（runtime-core）**：现在引入还是延后？                                                                                                                      | A）现在引入——可在 scene/puppet 间实现编译器级别的分离 B）延后——P0 作用域已经很大；每个 runtime crate 内放 trait 已足够                                                           | B —— 延后到 P2。若 puppet 和 scene 的 trait 分化明显，共享 crate 只会增加耦合，没有收益          |
| 4   | **Linux/Windows zero-copy 路径可行性**：`VaSurface` / `D3D11Texture` 是否能与当前 wgpu 后端稳定互操作？                                                                       | A）P2 前完成 spike：Linux 验证 Vulkan external memory fd + VA-API；Windows 验证 DX12/D3D11on12 interop B）直接保留 enum 占位并运行时失败                                         | A —— enum 可以先保留，但平台实现必须 feature-gated + `unimplemented!()`，P2 前完成技术验证       |
| 5   | **DataAccess 是否需要更强编译期隔离**：仅靠 typed methods + `pub(crate)` 是否足够？                                                                                           | A）保持 P0 方案：typed methods + RawWorldAccess deprecated/pub(crate) B）P2 引入 runtime-core 和分离 guard 类型，让 controller 根本无法命名 DataAccess                           | A 用于 P0；若逃逸口重新出现，P2 升级到 B                                                         |
| 6   | **GpuEffect 优化信号如何落地**：P0 已在 trait 中预留 `estimated_cost(...) -> u64 { 0 }` 和 `supports_in_place() -> bool { false }` 默认实现，P2 是否要求重型/可原地效果覆盖？ | A）保持默认值，只依赖观测帧时间和 ping-pong buffer B）P2 要求 blur、style、ML bridge 等重型效果覆盖成本估算，并让 color correction 等安全效果声明 in-place 支持                  | B —— P0 预留默认方法避免 breaking change；P2 再逐步补精确估算和 texture 分配优化                 |
