# ADR：预览子系统 —— 分层架构与全景支持

- **状态**：提议中
- **日期**：2026-05-13
- **作者**：Claude（架构师）
- **范围**：engine-kernel（preview/）、runtime-media、host-http（routes/preview_*.rs）、host-api
- **父文档**：[adr-engine-interface-pipeline-decoupling](./adr-engine-interface-pipeline-decoupling.md)
- **前置条件**：
  - PR6a/PR6b：无硬依赖——CPU 分析逻辑下沉和路由迁移不涉及 GPU 或 PipelineSink。可在 P0 完成后任意时间落地。
  - PR6c（PanoramicRenderer）：[adr-engine-gpu-budget](./adr-engine-gpu-budget.md)（GPU permit 以 Transcode 优先级获取）
  - P3-PR4（全景视频流 + Scene/Puppet Provider）：[adr-engine-pipeline-sink](./adr-engine-pipeline-sink.md)（StreamSink 消费 PanoramicRenderer 输出）+ PR6c

---

## 背景

文件预览（缩略图、文档渲染、scene 快照、全景图/视频）存在三个架构问题：没有统一的预览入口（每个扩展实现自己的预览逻辑），预览不能污染 GPU 热路径（PDF 渲染或 EPUB 页面不应和 60fps 的 timeline composite 争抢资源），已有代码的职责散落在 HTTP 路由层（当前 `host-http/routes/preview_asset.rs` 和 `preview_file.rs` 包含了文件元数据检测、变体生成和 token 化文件服务，全部在 HTTP 路由层，绕过了 ActionRouter）。

本 ADR 将预览能力重组为三层架构：runtime-media 领域层（无 GPU 的文件分析）、engine-kernel 编排层（PreviewProviderRegistry + PanoramicRenderer）、host-http 传输层（token 注册 + Range 文件服务）。

---

## 7B.1 问题

文件预览（缩略图、文档渲染、scene 快照、全景图/视频）存在三个架构问题：

1. **没有统一入口** —— 每个扩展实现自己的预览逻辑；如果不知道是哪一个扩展在处理某种文件类型，就无法预览
2. **预览不能污染 GPU 热路径** —— PDF 渲染或 EPUB 页面不应该和 60fps 的 timeline composite 争抢资源
3. **已有代码的职责散落** —— 当前 `host-http/routes/preview_asset.rs` 和 `preview_file.rs` 包含了文件元数据检测（GPANO/HDR）、变体生成（thumbnail/proxy/FOV 裁切）和 token 化文件服务，全部在 HTTP 路由层，绕过了 ActionRouter

## 7B.2 当前实现分析

已有的 preview asset 系统（`host-http/routes/`）做了三件事：

| 职责 | 当前位置 | 目标位置 | 理由 |
|------|----------|----------|------|
| GPANO XMP 检测、投影推断、宽高比启发式 | `preview_asset.rs` | **runtime-media** | 纯 CPU 文件分析，与 `probe()` 同类 |
| `.nkmeta.json` sidecar 读写 | `preview_asset.rs` | **runtime-media** | 文件元数据持久化，无 GPU |
| thumbnail/proxy 生成（resize、HDR tone-map） | `preview_asset.rs` | **runtime-media** | CPU 图片处理 |
| FOV 裁切（等距柱状→透视投影） | `preview_asset.rs`（CPU） | **engine-kernel PanoramicRenderer**（GPU） | 图片和视频共用的投影渲染，应在 GPU 执行 |
| PreviewManifest 构建 + provider 编排 | `preview_file.rs` | **engine-kernel PreviewProviderRegistry** | 服务层编排 |
| token 注册 + Range 文件服务 + EPUB 解压 | `preview_file.rs` | **host-http（保留）** | 传输层关注点 |

**核心判断**：GPANO 检测和图片变体生成是**媒体分析能力**，不是预览编排能力。runtime-media 的定位是"无 GPU 的媒体领域逻辑"（probe/diff/subtitle/JPEG），这些正好吻合。PreviewProviderRegistry 只做 provider 调度，不持有分析逻辑。

**路由迁移**：当前 `/v1/preview/assets/*` 的 6 个 JSON 端点绕过了 ActionRouter（见 §1.1 路由一致性规则），应迁移到 `previews` controller group：

| 当前 HTTP 路由 | 目标 ActionRouter | `id` 参数 |
|---------------|-------------------|-----------|
| `POST /v1/preview/assets` | `previews:register-asset` | — |
| `POST /v1/preview/assets/:id/variants` | `previews:request-variant` | asset_id |
| `PUT /v1/preview/assets/:id/metadata` | `previews:update-metadata` | asset_id |
| `DELETE /v1/preview/assets/:id` | `previews:unregister` | asset_id |
| `POST /v1/preview/register` | `previews:register-token` | — |
| `DELETE /v1/preview/unregister/:token` | `previews:unregister-token` | token |

迁移后的收益：

- **N-API 通道**：TS 扩展可通过 `dispatch()` 同进程调用，无需 HTTP 往返
- **插件拦截**：PluginActivationHandler 可介入预览操作
- **统一中间件**：logging/auth/rate-limit 自动覆盖
- **API 一致性**：所有 JSON 命令走同一条路径，TS 侧 `EngineClient` 的 6 个方法从 HTTP 调用迁移到 `dispatch()` 调用

保留为直接 HTTP 路由（传输层协议，不是 JSON 命令）：

- `GET /v1/preview/file/:token` —— Range(206) 二进制文件服务
- `GET /v1/preview/epub/:token/*path` —— EPUB 按需 ZIP 解压

## 7B.3 三层架构

```
┌─────────────────────────────────────────────────────────────────┐
│  host-http（传输层）                                              │
│  preview_file.rs：token 注册 + Range(206) 文件服务 + EPUB 解压   │
│  ← 保留现有代码，不做业务逻辑                                    │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│  engine-kernel（编排层）                                          │
│                                                                  │
│  PreviewProviderRegistry                                         │
│  ├── ImagePreviewProvider    → runtime-media 分析 + PanoramicRenderer（FOV裁切） │
│  ├── VideoPreviewProvider    → HwAccelDecoder + PanoramicRenderer + StreamSink   │
│  ├── AudioPreviewProvider    → 纯音频流                                          │
│  ├── ScenePreviewProvider    → SceneRenderer 快照                                │
│  ├── PuppetPreviewProvider   → PuppetRenderer 快照                               │
│  └── DocumentPreviewProvider → runtime-media 解析                                │
│                                                                  │
│  PanoramicRenderer（gpu/panoramic_renderer.rs）                   │
│  单个 wgsl shader：equirectangular → rectilinear 投影            │
│  输入: GPU texture + PanoramaViewState（yaw/pitch/fov）          │
│  输出: VideoGpuFrame                                             │
│  无 ECS 依赖，图片 FOV 裁切和全景视频流共用                      │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│  runtime-media（领域层，无 GPU）                                  │
│  ├── image_analysis.rs  ← GPANO XMP 检测、投影推断、宽高比启发式 │
│  ├── image_variant.rs   ← thumbnail/proxy 生成、HDR tone-map     │
│  ├── sidecar.rs         ← .nkmeta.json 读写                      │
│  └── 已有：probe / diff / subtitle / jpeg                        │
└──────────────────────────────────────────────────────────────────┘
```

## 7B.4 PanoramicRenderer —— 全景投影 GPU 渲染

全景图和全景视频的关键差异在于 GPU 需求：

| | 全景图 | 全景视频 |
|---|---|---|
| 解码 | CPU 图片解码 | GPU HwAccelDecoder（60fps） |
| 投影渲染 | GPU（FOV 裁切） | GPU（逐帧等距柱状→透视） |
| 输出 | StaticImage（终点 readback） | MediaStream（H.264 流） |
| 检测 | GPANO + 启发式 → runtime-media | GPANO + 启发式 → runtime-media |

`PanoramicRenderer` 是一个轻量 GPU 渲染器（`engine-kernel/src/gpu/panoramic_renderer.rs`），只包含一个 wgsl shader（等距柱状→透视采样） + fullscreen quad：

- **输入**：equirectangular GPU texture + `PanoramaViewState`（yaw/pitch/roll/fov/exposure/toneMapping）
- **输出**：`VideoGpuFrame`（与 SceneRenderer/PuppetRenderer 输出类型一致）
- **无 ECS 依赖**：不需要 bevy_ecs World，只是一个 GPU texture 变换
- **双重用途**：
  - 全景视频流：`HwAccelDecoder → PanoramicRenderer → StreamSink`（实时 60fps）
  - 图片 FOV 裁切：`decode → upload → PanoramicRenderer → readback`（替代当前 preview_asset.rs 的 CPU 实现）

**HDR 支持**：PanoramicRenderer 接收 `toneMapping` 参数（ACES/Reinhard/Filmic），在 shader 中完成色调映射。这比 CPU tone-map 质量更高且速度更快。runtime-media 仍负责 HDR 文件检测和元数据提取，但 tone-map 渲染交给 GPU。

## 7B.5 PreviewProviderRegistry 设计

`PreviewProviderRegistry` 维护 `PreviewProvider` 列表，运行在 GPU 热路径之外（单独的线程池或异步 runtime）。

**PreviewProvider** trait：每个 provider 声明支持的文件扩展名 / MIME 类型，提供 `generate_preview(request) -> Result<PreviewArtifact>`。

**PreviewRequest** 包含：file_path、max_width/height、可选 page（多页文档）、可选 time（媒体 seek 位置）、可选 view_state（全景视角）。

**PreviewArtifact**（不属于 PipelineOutput，是预览子系统独立的输出模型）：

- `MediaStream`：返回现有流基础设施使用的 stream ID（video/audio/全景视频）
- `StaticImage`：缩略图、渲染页面、快照、全景 FOV 裁切
- `TextDocument`：文本文档内容
- `HtmlDocument`：受沙箱约束的 HTML（用于 webview 富文档预览）
- `ModelScene`：3D scene handle（用于通过 SceneRenderer 做交互式预览）

## 7B.6 内建 Provider

| 提供者                    | 扩展名                          | 输出                                                       | 依赖                                               |
| ------------------------- | ------------------------------- | ---------------------------------------------------------- | -------------------------------------------------- |
| `ImagePreviewProvider`    | .png/.jpg/.webp/.tiff/.hdr/.exr | `StaticImage`（decode + resize / FOV 裁切）                | runtime-media（分析）+ PanoramicRenderer（FOV 裁切）|
| `VideoPreviewProvider`    | .mp4/.mov/.mkv/.webm            | `MediaStream`（全景流）或 `StaticImage`（poster frame）    | HwAccelDecoder + PanoramicRenderer + StreamSink    |
| `AudioPreviewProvider`    | .mp3/.wav/.flac/.ogg            | `MediaStream`（纯音频流）                                  | 无 GPU                                             |
| `ScenePreviewProvider`    | .gltf/.glb/.vrm/.nkm            | `ModelScene`（SceneRenderer 快照）                         | SceneRenderer（GPU）                               |
| `PuppetPreviewProvider`   | .nkp/.moc3                      | `ModelScene` 或 `StaticImage`                              | PuppetRenderer（GPU）                              |
| `DocumentPreviewProvider` | .pdf/.epub/.docx                | `StaticImage` 或 `HtmlDocument`                            | runtime-media（CPU）                               |

CPU 预览路径仍然适用于音频、图片（非全景 thumbnail/proxy）和文档。全景投影渲染、视频、scene 和 puppet 预览必须在 GPU 上执行；如果所需 GPU 路径不可用，provider 必须快速失败，而不是改用 CPU 渲染。

**全景路径决策树**：

```
文件注册 → runtime-media.analyze_projection(file)
  ├── 非全景 → ImagePreviewProvider 走 CPU resize（thumbnail/proxy）
  └── 全景 →
      ├── 图片 → decode → GPU upload → PanoramicRenderer → readback（FOV 裁切 StaticImage）
      └── 视频 → HwAccelDecoder → PanoramicRenderer → StreamSink（实时 MediaStream）
                 视角变化 → 更新 PanoramaViewState → PanoramicRenderer 重渲染（无需重新解码）
```

## 7B.7 与热路径隔离

```
Timeline Stream（60fps，GPU 热路径）：
  GpuExportPipeline → VideoOutput::GpuFrame → StreamSink → WebSocket
  ↑ 绝不被 preview 阻塞

Preview（按需，独立线程池）：
  PreviewProviderRegistry.generate_preview(request)
    → VideoPreviewProvider：全景视频走 PanoramicRenderer + StreamSink；普通视频提供 MediaStream 或 poster frame
    → ImagePreviewProvider：全景图走 PanoramicRenderer + 终点 readback；普通图走 CPU resize
    → ScenePreviewProvider：加载 scene，通过 SceneRenderer 渲染一帧，返回 StaticImage
    → PuppetPreviewProvider：通过 PuppetRenderer 渲染一帧，返回 StaticImage
    → DocumentPreviewProvider：在 CPU 上解析/渲染页面，返回 StaticImage 或 HtmlDocument
```

需要 GPU 的 preview provider（VideoPreviewProvider 全景流、ImagePreviewProvider FOV 裁切、ScenePreviewProvider、PuppetPreviewProvider）会在 `PipelinePriority::Transcode` 下获取 `GpuBudgetController` permit；如果交互式管线承压，它们会最先被暂停或限流。

## 7B.8 实施优先级

### P2-PR6a：runtime-media 吸收 CPU 预览分析逻辑（约 200 行）

**变更文件**：

- 新增：`runtime-media/src/image_analysis.rs` —— GPANO XMP 检测、投影推断、宽高比启发式（从 `preview_asset.rs` 迁入）
- 新增：`runtime-media/src/image_variant.rs` —— thumbnail/proxy 生成、HDR 检测（从 `preview_asset.rs` 迁入）
- 新增：`runtime-media/src/sidecar.rs` —— `.nkmeta.json` 读写（从 `preview_asset.rs` 迁入）
- 修改：`host-http/src/routes/preview_asset.rs` —— 删除业务逻辑，改为调用 runtime-media
- 保留：`host-http/src/routes/preview_file.rs` —— token 注册 + Range 文件服务（传输层，不迁移）

**能力**：preview asset 的 CPU 分析逻辑从 HTTP 路由层下沉到领域层，可被 PreviewProviderRegistry 和其他服务复用。

### P2-PR6b：PreviewsController + PreviewProviderRegistry + 路由迁移（约 250 行）

**变更文件**：

- 新增：`engine-kernel/src/preview/provider.rs` —— `PreviewProvider` trait + `PreviewProviderRegistry` + `PreviewArtifact`
- 新增：`engine-kernel/src/preview/providers/image.rs` —— `ImagePreviewProvider`（委托 runtime-media）
- 新增：`engine-kernel/src/preview/providers/document.rs` —— `DocumentPreviewProvider`（委托 runtime-media）
- 新增：`host-api/src/controllers/previews.rs` —— `PreviewsController`，7 个 action（register-asset / request-variant / update-metadata / unregister / register-token / unregister-token / generate）
- 修改：`host-api/src/router.rs` —— ActionRouter 注册第 19 个 controller group `previews`
- 修改：`host-http/src/routes/mod.rs` —— 删除 6 个 JSON 端点的直接 HTTP 路由（保留 GET 文件服务路由）
- 修改：TS `EngineClient.ts` —— 6 个 preview 方法从 HTTP 调用迁移到 `dispatch()` / `dispatch_action()` 调用

**能力**：统一的文件预览入口；preview 操作通过 ActionRouter 走 N-API + 插件拦截 + 统一中间件。

### P2-PR6c：PanoramicRenderer + 全景图 FOV 裁切升级（约 150 行）

**变更文件**：

- 新增：`engine-kernel/src/gpu/panoramic_renderer.rs` —— wgsl equirectangular → rectilinear shader + fullscreen quad
- 修改：`engine-kernel/src/preview/providers/image.rs` —— 全景图 FOV 裁切从 CPU 升级到 PanoramicRenderer

**能力**：全景图 FOV 裁切走 GPU 快路径，质量和速度显著提升。

### P3-PR4：全景视频流 + Video/Scene/Puppet Provider（约 250 行）

**变更文件**：

- 新增：`engine-kernel/src/preview/providers/video.rs` —— `VideoPreviewProvider`（普通视频 poster frame + 全景视频 PanoramicRenderer + StreamSink）
- 新增：`engine-kernel/src/preview/providers/scene.rs` —— `ScenePreviewProvider`（SceneRenderer 快照）
- 新增：`engine-kernel/src/preview/providers/puppet.rs` —— `PuppetPreviewProvider`（PuppetRenderer 快照）
- 修改：`host-http/src/routes/preview_asset.rs` —— 全景视频流路径接入 PanoramicRenderer

**能力**：全景视频实时流式预览（HwAccelDecoder → PanoramicRenderer → StreamSink）；scene/puppet 统一通过 PreviewProviderRegistry 入口预览。

---

## 设计决策

| 决策                                                         | 理由                                                                                                                    | 备选方案                                                                              |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 预览分析逻辑放 runtime-media，而不是 engine-kernel           | GPANO 检测、投影推断、图片变体生成都是无 GPU 的文件分析，与 `probe()`/`diff()`/`subtitle` 同类；runtime-media 的定位就是"无 GPU 媒体领域逻辑" | 放在 engine-kernel PreviewProviderRegistry 内（把编排和分析混在一起）；放在 SceneService（增加已过胖的 service 的耦合） |
| PanoramicRenderer 独立于 SceneRenderer/PuppetRenderer       | 等距柱状投影只需一个 fragment shader + fullscreen quad，不需要 ECS/PBR/SpriteBatch；独立渲染器保持最小依赖                | 放在 SceneRenderer 内（引入不必要的 bevy_ecs 依赖）；放在 GpuExportPipeline（它是 compositor 不是 renderer）           |
| 全景图和全景视频共用 PanoramicRenderer                       | equirect→rectilinear 投影变换对图片和视频完全相同，只是输入来源不同（CPU decode vs GPU decode）                            | 图片和视频各实现一套投影（重复 shader 代码）                                                                           |
| ActionRouter `group:action` 而非 RESTful 嵌套路径           | 双传输统一（N-API 无 URL 路径概念）；单点插件拦截；领域动词（probe/capture/composite）不是 CRUD；TS 客户端 80 处复用统一 `dispatch()` | 迁移到 RESTful 路径（N-API/HTTP 两套 API 分裂；插件拦截需 Tower middleware + N-API hook 两层；TS 客户端每端点独立 fetch） |

---

## 风险与缓解

| 风险                             | 影响                                  | 缓解措施                                                                                                                                                          |
| -------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preview GPU 操作与热路径争用     | 全景 FOV 裁切或 scene 快照消耗 GPU 时间片，影响 timeline 预览帧率 | Preview provider 在 `PipelinePriority::Transcode` 下获取 `GpuBudgetController` permit；交互式管线承压时最先被暂停或限流 |
| 路由迁移破坏 TS 客户端           | 6 个 preview HTTP 端点迁移到 ActionRouter 后，EngineClient 调用方式变化 | TS 侧 6 个方法同步迁移为 `dispatch()` 调用；迁移期间可保留 HTTP 端点作为临时 alias |

---

## 验证

**P2-PR6a（runtime-media 吸收 CPU 预览分析）**：

- GPANO 检测、投影推断、thumbnail/proxy 生成的单元测试在 runtime-media 中通过
- `host-http/routes/preview_asset.rs` 不再包含业务逻辑（只做委托调用）
- 已有预览功能行为不变

**P2-PR6b（PreviewsController + PreviewProviderRegistry + 路由迁移）**：

- 6 个 JSON 端点通过 ActionRouter `previews:*` action 可达
- N-API `dispatch()` 调用与 HTTP 调用产生相同结果
- TS `EngineClient` 的 preview 方法迁移到 `dispatch()` 调用后功能不变
- `GET /v1/preview/file/:token` 和 `GET /v1/preview/epub/:token/*path` 仍正常工作

**P2-PR6c（PanoramicRenderer + 全景图 FOV 裁切升级）**：

- 全景图 FOV 裁切输出与 CPU 实现视觉一致（允许 GPU 精度差异）
- PanoramicRenderer 在 GpuBudgetController 管理下不影响 timeline 热路径
- HDR 全景图 tone-mapping 质量优于 CPU 实现

**P3-PR4（全景视频流 + Video/Scene/Puppet Provider）**：

- 全景视频实时流式预览可在 webview 中查看
- 视角变化（yaw/pitch/fov）实时更新，无需重新解码
- scene/puppet 通过 PreviewProviderRegistry 生成预览快照
