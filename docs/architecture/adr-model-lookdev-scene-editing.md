# ADR: Neko Model LookDev 与场景编辑控制完善方案

## 状态

Accepted (2026-05-30)

实施备注：2026-05-30 已落地 E0-E4 / P0-P4 主要切片，包括 Engine render mode 合同、Clay/Debug LookDev 控制、authored light CRUD、Engine-owned environment、typed selection query、Webview Route A 控制面、Extension `neko.model.useEnvironment` Engine-backed 路由，以及 `.nkm` authored light/environment 持久化闭环。P3.5 HDRI prefilter/cubemap cache 与 P4.5 更完整的 `.nkc` semantic region authoring 仍按本文后续阶段演进。

实施复盘：2026-06-02 修复 `neko-model` 相机/拖拽交互反馈卡顿。问题不是 GPU 渲染吞吐不足，而是 LookDev/场景控制实现曾把高频相机控制、H.264 stream profile、SceneControl ack 和 WebCodecs backpressure 混在同一慢路径里，导致用户拖拽后需要 2-3s 才看到最终画面。已通过 `0545643c fix(engine): apply viewport interaction stream profile` 和 `ae7027b4 fix(model): keep camera interaction on latest-only hot path` 修复：高频相机交互 fire-and-forget 发送 latest-only scene-control 更新，不等待 `viewportCameraAck`，不重启 H.264 stream；Engine 侧用短生命周期 `ViewportStreamInteractionProfile::Interactive` 将当前 stream runtime settings 切到 `GOP=1`，TTL 过期后恢复默认 GOP/码率；前端只在现有 `H264StreamClient` 上切换 backpressure 策略，并保留 WebCodecs 已接管的输出帧，避免硬解输出链路被“旧帧丢弃”饿死。

追加实测结论：强制 reset WebCodecs/VideoToolbox 队列会造成等待新 keyframe 的输出空窗，不作为优化方向。最终采用交互起点预热：pointerdown、wheel、keyboard camera action 立即发送当前 camera + `streamProfile: 'interactive'`，并将共享 `profileTtlMs` 调整为 2000ms，减少连续相机/灯光/slider 微调期间 `GOP=1` 与默认 GOP 往返重配。

画质复盘：2026-06-02 修复 `neko-model` 1080p 下人物边缘锯齿与 Retina/Webview 画面发糊问题。根因分为两类：Webview 过去按 CSS 尺寸请求 stream，DPR>1 时会把低于物理像素的 H.264 帧拉伸显示；Engine PBR forward 仍是 single-sample render target，人物外轮廓和高对比纹理边缘会产生几何锯齿。修复原则保持 Route A：Webview 只按物理像素请求/诊断 stream，不解析或重绘 mesh；Engine RenderGraph 在 realtime PBR/Clay 且 post-process 开启时对 1080p 级输出启用受控 1.5x SSAA，再在 post-process pass 下采样回最终 stream 尺寸。高 DPR/接近 4K 的输出只使用真实物理分辨率，不再叠加 SSAA，避免为清晰度牺牲 60fps 预算。

## 背景

`neko-model` 当前已经收敛到 Engine-only Route A：Webview 只播放 Engine H.264 实时视口，并提供控制面板、overlay、hit-test、gizmo 与本地预测。这个方向与 UE MetaHuman Creator 的核心模式一致：浏览器端不是第二套 3D 渲染器，而是 Engine 运行时视口的交互外壳。

用户在角色/模型编辑中自然会期待以下 LookDev 与场景编辑能力：

| 能力 | 当前状态 | 主要缺口 |
|---|---|---|
| 3D Mesh 展示 | 支持 | 通过 Engine stream 展示；Webview 不解析 mesh |
| 白模 / Clay 模式 | 支持 | Clay 是 Engine LookDev render mode，不写入材质槽；Webview 仅请求/显示状态。 |
| Mesh debug 展示 | 支持 | PBR、Clay、Wireframe、Normal、Depth、LightComplexity、ShadowAtlas 通过 Engine descriptor/frame metadata 对齐。 |
| 添加灯光 | 支持 | `node-add(kind='light')` 进入 Engine scene state，SceneDelta/snapshot 回传 light component。 |
| 删除灯光 / 节点 | 支持 | `node-remove` 默认 `cascade: false`，由 Engine ack/reject。 |
| 调整灯光位置 | 支持 | transform/visibility/light-update 统一走 SceneCommand，Inspector 只做命令控制面。 |
| 选中指定部位 | 支持分层候选 | typed selection query 覆盖 node、materialSlot、submesh、primitive、bone、morphControl、characterRegion；普通 GLB/VRM 不伪造语义区域。 |
| 背景 / 环境切换 | 支持 | environment-set/update/clear 进入 Engine scene state；资源通过 file token 或 asset handle。 |

本 ADR 设计一套完整的 Engine 与前端 UI 开发方案，使上述能力以契约优先、Engine 权威、可测试的方式落地。

## 关联 ADR

| 关联文档 | 关系 |
|---|---|
| [adr-3d-editor-rendering-architecture.md](./adr-3d-editor-rendering-architecture.md) | Route A 边界：可见 3D 内容只能来自 Engine stream |
| [adr-unified-viewport-protocol.md](./adr-unified-viewport-protocol.md) | ViewportShell、命令信封、overlay 与帧元数据对齐 |
| [adr-engine-dual-api-scene-split.md](./adr-engine-dual-api-scene-split.md) | Engine CreativeAccess/DataAccess 分工 |
| [adr-webview-layout-unification.md](./adr-webview-layout-unification.md) | Model Workbench 布局与右侧 Dock/StatusBar 职责 |
| [adr-ai-face-sculpting.md](./adr-ai-face-sculpting.md) | 角色 authoring、语义面部区域与 Agent 闭环编辑 |

## 决策

Neko Model 的 LookDev、灯光、环境与语义选择能力必须保持 **Engine 权威 + Webview 控制面**：

1. Webview 不重新引入 Three.js/R3F，不解析 glTF/VRM，不渲染可见 mesh fallback。
2. 白模、wireframe、normal、depth、灯光复杂度、背景和 IBL 都由 Engine render graph 或 scene state 决定。
3. Webview 只保存短生命周期 UI 状态；可导出、可 undo、可协作的状态必须进入 Engine scene / `.nkm` / `.nkc` 权威数据。
4. 所有写操作通过 `ViewportCommand` / `SceneCommand` 信封发送，携带 `seq`、`correlationId`、`baseRevision`，由 Engine ack/reject。
5. UI 以 UE MetaHuman 为参考：主视口沉浸式展示 Engine 帧，左侧/视口 HUD 放置模式切换，右侧 Dock 提供 Outliner 与 Inspector，语义部位选择使用 overlay 与 Inspector 联动。

## 架构原则

### 修改前三问

| 问题 | 决策 |
|---|---|
| 是否符合现有架构？ | 符合 Route A：Engine 是视觉真值，Webview 仅控制与 overlay。 |
| 如何进一步降低耦合？ | 通过 Proto/`@neko/shared` 合同、`EngineClient`、SceneCommand/ViewportCommand 隔离 UI 与 Rust ECS。 |
| 是否易于扩展与测试？ | 每个能力拆成独立合同、Engine handler、UI panel 和测试矩阵，可逐项落地。 |

### 五层分析

| 层 | 设计 |
|---|---|
| 职责 | Engine 负责渲染模式、材质 override、灯光、环境、拾取；Webview 负责控件、overlay、命令编排。 |
| 依赖 | Webview 依赖 `@neko/shared` 与 `@neko/neko-client`；Extension 只代理 VSCode 能力；Engine host-api/host-http 依赖 runtime-scene。 |
| 接口 | Proto/生成类型定义 viewport lookdev、light patch、environment patch、selection query/result。 |
| 扩展 | 新 render mode、light kind、environment source、semantic region 都通过注册表/枚举扩展，不侵入通用 ViewportShell。 |
| 测试 | 合同 serde parity、host parser、runtime scene mutation、render graph variant、Webview boundary/UI tests、Route A 禁止回归。 |

## 目标能力模型

```
┌──────────────────────────────────────────────────────────────┐
│ Webview                                                       │
│  LookDev HUD  Light Panel  Environment Panel  Selection UI    │
│       │          │              │                 │            │
│       └──────────┴──────────────┴─────────────────┘            │
│                         Viewport/Scene Command                 │
└───────────────────────────────┬──────────────────────────────┘
                                │ WebSocket / HTTP action
┌───────────────────────────────▼──────────────────────────────┐
│ host-http / host-api                                           │
│  parse + validate + ack/reject + revision gate                 │
└───────────────────────────────┬──────────────────────────────┘
                                │ typed runtime command
┌───────────────────────────────▼──────────────────────────────┐
│ runtime-scene                                                  │
│  Scene state: nodes, lights, environment, selection semantics   │
│  LookDev state: render mode, material override, helper passes   │
└───────────────────────────────┬──────────────────────────────┘
                                │ RenderWorld extraction
┌───────────────────────────────▼──────────────────────────────┐
│ engine-scene-renderer                                          │
│  PBR / Clay / Wireframe / Debug render graph -> H.264 stream    │
└──────────────────────────────────────────────────────────────┘
```

## 合同设计

### 1. Viewport LookDev 合同

现有 `EngineViewportDescriptor.renderMode` 已覆盖 `pbr`、`wireframe`、`unlit`、`normal`、`depth`、`lightComplexity`、`shadowAtlas`。新增方案不应把“白模”简单等同于 `unlit`，因为白模需要保留光照方向、AO/阴影感和材质粗糙度，适合建模检查。

建议扩展为：

```typescript
type EngineViewportRenderMode =
  | 'pbr'
  | 'clay'
  | 'wireframe'
  | 'unlit'
  | 'normal'
  | 'depth'
  | 'lightComplexity'
  | 'shadowAtlas';

interface EngineViewportLookDevSettings {
  renderMode: EngineViewportRenderMode;
  debugView?: EngineViewportDebugView;
  materialOverride?: {
    kind: 'none' | 'clay' | 'matcap';
    color?: EngineVec3;
    roughness?: number;
    metallic?: number;
    preserveAlpha?: boolean;
  };
  helperPassesEnabled?: boolean;
  showGrid?: boolean;
  showSkeleton?: boolean;
  showNormals?: boolean;
}
```

落地分两步：

| 阶段 | 方式 | 说明 |
|---|---|---|
| P0 | 通过 `startSceneRenderStream(ViewportDescriptor)` 重启 stream | 最少侵入；切换 PBR/Wireframe/Normal/Depth 时可接受短暂重连。 |
| P1 | 增加 `viewport-settings-update` 控制命令 | 不重启 stream 即可切换 helper/debug/clay；更接近 DCC/UE 编辑器体验。 |

P0 重启体验约束：

1. Webview 必须保留最后一帧作为占位，不在重连期间显示空白视口。
2. 切换命令发出后 250ms 内显示 pending badge，超过 1500ms 未拿到首帧显示可取消/重试状态。
3. Engine stream descriptor 必须回传实际生效的 `renderMode`，UI 只在首帧或 descriptor ack 后更新为目标模式。
4. 若重连失败，Webview 回滚到上一个已确认 render mode，并保留 selection/overlay 状态。

P0 的 stream restart 只适用于低频 LookDev 模式切换，不适用于相机 orbit、viewport drag、transform gizmo drag、灯光位置拖拽或连续 slider。高频交互必须走热路径：

1. Webview 先更新本地意图、overlay 或预测状态，并调用 `SceneControlSocket.sendViewportCameraLatest()` 或等价 latest-only hot update。
2. 高频相机更新默认不携带 `requestId`，Engine 应应用最新 camera，但不回发逐帧 `viewportCameraAck`。
3. 交互开始时 Webview 只调用 `H264StreamClient.updateBackpressurePolicy()` 切换前端 backpressure/latest-only 策略，不把 `streamProfile` 写入 React state，也不让 `startSceneRenderStream()` effect 重新执行。
4. Engine scene-control 可接收 `streamProfile: 'interactive'` 与 `profileTtlMs`，将当前 viewport stream profile 记入 Engine scene service；producer 每帧读取该 profile，并把 `interactive` 映射为 `h264_gop_size = 1`。
5. `GOP=1` 是交互期编码策略，不是 stream descriptor 生命周期策略；切换 GOP 允许短冷却，但不得等待常规 5s encoder reconfigure cooldown 才进入交互态。
6. 交互起点必须预热 Engine runtime profile：pointerdown、wheel 与 keyboard camera action 在真实 camera delta 前也要发送当前 camera + `streamProfile: 'interactive'`，避免等待第一批 move 后才切低延迟。
7. WebCodecs/VideoToolbox 已接收的旧帧不得在 JS 侧强行 suppress，也不得用 decoder reset/close/recreate 作为交互低延迟策略。latest-only 只影响后续 backpressure 和呈现层选择，避免固定硬解 output latency 被误判为可取消队列而造成输出饥饿。
8. 静止后由 TTL/idle timer 恢复默认 GOP/码率策略；恢复可以被短冷却平滑处理，但不能阻塞下一次交互进入 `interactive`。当前 `neko-model` 使用 2000ms shared TTL，减少连续微调期间的 encoder reconfigure 抖动。

此次问题的禁止回归项：

- `VideoViewport` 不得重新引入 `useState<ViewportStreamProfile>`、`h264SettingsForStreamProfile()` 或交互期 `gopSize: 1` descriptor 依赖。
- 相机/拖拽热路径不得 `await sceneControlSocket.updateViewportCamera()`，不得用 `cameraUpdateInFlightRef` / `pendingCameraUpdateRef` 串行等待 ACK。
- 高频交互不得触发 `destroy/startSceneRenderStream`。
- `H264StreamClient` 的 latest-only 模式不得删除已送入 WebCodecs 的 `decodeStartTimes` 并 suppress 后续 decoded frame，也不得在交互切入时 reset/close decoder。
- `ViewportOrbitControls` 的 pointerdown、wheel、keyboard camera action 必须触发 immediate interaction activity，用于预热 Engine runtime profile。

### 2. Light 合同

统一灯光节点以普通 scene node 表示，灯光组件由 `EngineLightPatch` 更新。新增/删除/修改都必须通过 scene command：

```typescript
type EngineLightKind = 'directional' | 'point' | 'spot' | 'area';

interface EngineLightPatch {
  nodeId: string;
  kind: EngineLightKind;
  color?: EngineVec3;
  intensity: number;
  range?: number;
  innerConeAngle?: number;
  outerConeAngle?: number;
  shadow?: {
    enabled: boolean;
    resolution?: number;
    bias?: number;
  };
}

type EngineSceneCommandType =
  | 'node-add'
  | 'node-remove'
  | 'transform'
  | 'visibility-set'
  | 'light-update'
  | 'environment-set'
  | 'environment-update'
  | 'environment-clear';
```

命令语义：

| 命令 | 载荷 | Engine 行为 |
|---|---|---|
| `node-add` | `{ kind: 'light', light, transform, name? }` | 创建 node + Light component + Transform，返回 nodeId 与 revision。 |
| `light-update` | `{ nodeId, light }` | 只修改 Light component，不改变 transform。 |
| `transform` | `{ nodeId, position, rotation, scale }` | 修改灯光位置/方向，复用现有 transform gizmo。 |
| `node-remove` | `{ nodeId, cascade? }` | 删除 light/node；若有 children 按策略 reject 或 cascade。 |
| `visibility-set` | `{ nodeId, visible }` | 控制灯光启用/禁用，同时影响 render world。 |

`node-remove` 的默认语义必须是 `cascade: false`。当目标 node 存在 children、animation binding、constraint、selection reference 或 authored character dependency 时，Engine 默认 reject 并返回结构化 diagnostic；只有显式 `cascade: true` 且调用方有清晰 UI 确认时才允许级联删除。Light tool 的普通删除按钮不得默认发送 cascade。

Engine 渲染器已有“无 authored light 时注入默认三点编辑灯”的逻辑。新增规则：一旦场景存在至少一个启用的用户灯光，默认编辑灯自动退出；用户可通过 LookDev preset 手动启用“Editor Light Rig”作为非持久辅助。

### 3. Environment / Background 合同

`EnvironmentPlacement` 当前存在于 TS 类型与 Webview store，但未成为 Engine render state。应升级为 Engine scene 环境组件：

```typescript
interface EngineEnvironmentPatch {
  environmentId: string;
  source: EngineAssetHandle;
  mode: 'skybox' | 'ibl' | 'background-and-ibl';
  rotationDeg: number;
  intensity: number;
  exposure: number;
  visibleAsBackground: boolean;
  backgroundColor?: EngineVec4;
}
```

新增命令：

| 命令 | 用途 |
|---|---|
| `environment-set` | 设置 HDRI/全景图作为 skybox、IBL 或二者。 |
| `environment-clear` | 清除 authored environment，回到默认 viewport 背景。 |
| `environment-update` | 调整旋转、强度、曝光、背景可见性。 |

资产读取必须走 Engine file access token 或 AssetDatabase handle；Webview 不直接读取本地 HDRI/图片二进制。

环境资源加载约束：

1. P3 初版只承诺 background color 与 LDR equirectangular panorama；HDRI prefilter、cubemap cache 和 specular IBL 作为 P3.5。
2. Engine 必须异步加载 environment 资源，加载期间保留上一套 environment 或默认背景，不阻塞 viewport command ack。
3. 单个环境源的默认软限制为 64 MiB；超过限制时 Engine 返回 `environment.resourceTooLarge` diagnostic，可由设置或显式用户确认放宽。
4. 加载超过 5000ms 未完成时返回 pending diagnostic，超过 15000ms 未完成时 UI 标记 timeout 并允许清除/重试；Engine 后台任务必须可取消。
5. equirectangular -> cubemap / irradiance / prefilter 处理应优先复用 engine preview/panorama 资源管线，避免在 scene renderer 内复制全景解析逻辑。

### 4. Selection / Part Picking 合同

当前 hit-test 以 node 为主。要达到 MetaHuman 式“选中指定部位”，需要把选择结果分层，而不是把所有选择都伪装成 node：

```typescript
type EngineSelectionKind =
  | 'node'
  | 'bone'
  | 'materialSlot'
  | 'submesh'
  | 'primitive'
  | 'characterRegion'
  | 'morphControl';

interface EngineSelectionTarget {
  kind: EngineSelectionKind;
  nodeId?: string;
  characterId?: string;
  boneId?: string;
  materialSlotId?: string;
  submeshId?: string;
  primitiveId?: string;
  regionId?: string;
  morphId?: string;
  hit?: {
    worldPosition: EngineVec3;
    worldNormal?: EngineVec3;
    depth?: number;
  };
}

interface EngineSelectionQuery {
  viewportId: string;
  x: number;
  y: number;
  mask?: EngineSelectionKind[];
  mode?: 'replace' | 'add' | 'toggle';
}
```

Engine hit-test 结果应按精度从高到低返回 candidates：

1. `characterRegion`：脸颊、鼻子、嘴、眼、下颌、额头、躯干等 authoring 区域。
2. `bone`：骨骼/IK 控制器。
3. `materialSlot` / `submesh` / `primitive`：材质与 mesh 结构。
4. `node`：场景树对象。

Webview 根据当前工具模式决定选择 mask。例如 Face 模式优先 `characterRegion`/`morphControl`，LookDev 模式优先 `materialSlot`/`light`/`node`，Pose 模式优先 `bone`。

## Engine 开发方案

### Phase E0: 合同与兼容层

1. 更新 `packages/neko-proto/scene.proto`，新增 `clay` render mode、lookdev settings、environment patch、selection target/query/result。
2. 重新生成 `packages/neko-types/src/generated/scene.engine.ts` 等 TS 类型。
3. 扩展 `EngineClient` 的 viewport descriptor 与 scene command 类型守卫。
4. 保留旧 `renderMode: 'unlit'` / `EnvironmentPlacement` 输入兼容，统一归一化到新合同。

### Phase E1: Render Graph / 白模 / Mesh Debug

1. 在 `engine-scene-renderer` 中新增 `ViewportRenderMode::Clay`。
2. Clay 模式使用统一中性材质 override，不读取原材质 base color/texture，但保留法线、几何、AO/SSAO、主光照与 tone mapping。
3. Wireframe、Normal、Depth、LightComplexity、ShadowAtlas 走 debug render graph variant，并输出明确的 frame metadata。
4. `scenes:stream` 回传实际生效的 `renderMode`、`lookDevSettings`、`qualityTier`，避免 UI 误显示。

### Phase E2: Light SceneCommand 闭环

1. 在 runtime-scene 增加 typed light node creation/update/remove API。
2. 在 `SceneCommandEvent` 增加 `AddNodeLight`、`UpdateLight`、`RemoveNode` 或等价 typed variant。
3. `host-http/src/routes/scene_control.rs` 支持解析 `node-add` light、`light-update`、`node-remove`。
4. SceneDelta 增加 light component 更新、删除和 revision 信息。
5. RenderWorld extraction 将 authored lights 投影到 renderer；处理 disabled/hidden light。

### Phase E3: Environment / Background 渲染

1. runtime-scene 持有 scene environment resource/component。
2. host-control 支持 `environment-set`、`environment-update`、`environment-clear`。
3. renderer 加载 equirectangular/HDRI 资源，生成 skybox 与 IBL 输入；P0 可先支持 LDR panorama/background color，P1 支持 HDR prefilter。
4. `scenes:capture` 与实时 stream 使用同一 environment state，确保截图/导出一致。

### Phase E3.5: HDRI Prefilter / Cubemap / IBL Stub

P3.5 不改变 Webview 边界：Webview 仍只提交 Engine file token 或 asset handle，不解析 `.hdr` / `.exr`，不生成 cubemap，也不做 PBR 采样。新增能力应拆成可复用的 Engine 资源转换层，供 SceneRenderer、Capture、PreviewProviderRegistry 与 panorama preview 共享。

建议新增的 Engine 内部接口：

```rust
pub struct EnvironmentResourceKey {
    pub source_id: String,
    pub source_revision: Option<String>,
    pub color_space: String,
    pub rotation_deg: f32,
    pub intensity: f32,
    pub exposure: f32,
    pub quality_tier: String,
}

pub struct PrefilteredEnvironment {
    pub equirectangular_texture: GpuTextureHandle,
    pub skybox_cubemap: GpuTextureHandle,
    pub irradiance_cubemap: GpuTextureHandle,
    pub specular_prefilter_mips: GpuTextureHandle,
    pub brdf_lut: GpuTextureHandle,
}

pub trait EnvironmentResourceCache {
    fn request_prefiltered_environment(
        &self,
        key: EnvironmentResourceKey,
    ) -> EnvironmentLoadTicket;
}
```

职责边界：

| 模块 | 职责 |
|---|---|
| `runtime-media` | 文件 probe、HDR/EXR 元数据、色彩空间和 panorama/equirectangular 判定。 |
| `engine-panoramic-renderer` | 复用 equirectangular 采样、曝光与 tone mapping shader 片段；继续保持无 ECS 依赖。 |
| `engine-scene-renderer` | 消费 `PrefilteredEnvironment`，在 PBR pass 中采样 skybox、irradiance、specular prefilter 与 BRDF LUT。 |
| `engine-kernel` | 管理 file token、异步任务、64 MiB 软限制、5s pending、15s timeout、取消、cache key 与 diagnostics。 |
| `host-http` / `neko-client` | 只传递 command、ack、delta diagnostics，不暴露本地绝对路径。 |

缓存与失效规则：

1. cache key 必须包含 source token/asset handle、文件 revision 或内容 hash、颜色空间、质量档、rotation/intensity/exposure；背景可见性只影响 draw，不应触发 prefilter 重算。
2. HDR decode 先支持 `.hdr` / `.exr` 到 float RGBA；LDR panorama 继续走 P3 的 RGBA8 background path，后续可复用同一 cubemap 转换。
3. equirectangular -> cubemap、irradiance convolution、specular mip prefilter、BRDF LUT 生成必须异步执行；SceneRenderer 使用上一套已完成 environment，禁止在 render frame 热路径同步阻塞。
4. 与 `adr-engine-preview-subsystem.md` 的 `PanoramicRenderer` 协调：共享 shader include、sampler/toneMapping 参数与 GPU texture upload helper，不把 PreviewProviderRegistry 的编排逻辑引入 SceneRenderer。
5. P3.5 第一版可以只暴露 `background-and-ibl` 的 diffuse irradiance；specular prefilter mip 和 reflection roughness sampling 可作为 P3.6，但接口需预留。

### Phase E4: Semantic Picking

1. hit-test 从 node-only 扩展为 candidates list。
2. runtime-scene 建立 `CharacterRegionRegistry`：region -> morph controls / material slots / bones / mesh primitives。
3. 对 `.nkc` 角色保存 region descriptor；普通 GLB/VRM 没有 region descriptor 时降级到 materialSlot/submesh/node。
4. projected bounds/gizmo anchor 支持非 node selection：bone、region、material slot 可返回 overlay anchor。

### Phase E5: Persistence / Undo / Agent

1. `.nkm` 保存 authored lights、environment、viewport lookdev preset。
2. `.nkc` 保存角色 region/morph/bone authoring 元信息。
3. Undo/redo 以 SceneCommand log 为准，覆盖灯光、环境、选择驱动的参数改动。
4. Agent 工具只调用同一合同：`setLookDevMode`、`addLight`、`updateLight`、`setEnvironment`、`selectCharacterRegion`。

## 前端 UI 开发方案

### 布局

沿用 Creative Workbench Shell：

```
┌─ Left Toolbar ─┬───────────────────────────┬─ Right Dock ─────┐
│ Save/Export    │ Engine VideoViewport       │ Outliner          │
│ Select Tool    │  HUD: LookDev segmented    │ Properties        │
│ Transform Tool │  HUD: Light/Env quick menu │ - Transform       │
│ Light Tool     │  Overlay: selection/gizmo  │ - Light           │
│ Env Tool       │                           │ - Environment     │
└────────────────┴──────── Timeline ─────────┴──────────────────┘
```

职责拆分：

| UI 区域 | 职责 |
|---|---|
| 左侧工具栏 | 选择、移动/旋转/缩放、灯光创建、环境入口、网格/辅助显示开关。 |
| Viewport HUD | PBR/Clay/Wireframe/Normal/Depth 快速切换；背景可见性；Editor Light Rig 开关。 |
| 右侧 Outliner | 节点、灯光、相机、角色、环境分组展示；支持可见性与选中。 |
| 右侧 Inspector | 根据 `EngineSelectionTarget.kind` 切换 Transform/Light/Material/Region/Bone/Environment 面板。 |
| StatusBar | Engine stream、render mode、selected target、scene revision、pending command 状态。 |

### LookDev UI

新增 `LookDevControls`：

| 控件 | 类型 | 命令 |
|---|---|---|
| PBR / Clay / Wireframe / Normal / Depth | segmented control + 图标 | P0 重启 stream；P1 `viewport-settings-update` |
| Helper passes | checkbox/toggle | viewport settings |
| Grid / Skeleton / Normals | toggle | viewport settings 或 overlay settings |
| Quality preview | icon button | `scenes:capture` 非交互 overlay |

视觉规则：

1. Clay 是独立模式，不命名为 “Unlit”。
2. Debug 模式显示轻量 badge，避免用户误以为导出也会变成 debug。
3. 切换中的 stream reconnect 要显示 pending 状态，不清空当前 selection。

### Light UI

新增 `LightInspectorPanel` 与 Light tool：

| 操作 | UI | 命令 |
|---|---|---|
| 添加 directional/point/spot | 左侧 Light tool 菜单 | `node-add(kind='light')` |
| 删除 light | Inspector danger button / Outliner context menu | `node-remove` |
| 移动/旋转 light | 复用 Transform gizmo | `transform` |
| 修改颜色 | color swatch | `light-update` |
| 修改强度/range/cone | slider/input | `light-update` |
| 启用阴影 | toggle | `light-update` |
| 可见性 | Outliner eye icon | `visibility-set` |

交互细节：

1. Directional light 的位置只作为 gizmo anchor，方向由 rotation 决定。
2. Point light 显示 range 圆/球 overlay。
3. Spot light 显示 cone overlay。
4. 删除前若 node 有 children 或被 animation 引用，Engine reject 并返回结构化 diagnostic。

### Environment UI

新增 `EnvironmentPanel`：

| 操作 | UI | 命令 |
|---|---|---|
| 选择 HDRI/全景/背景图 | VSCode file picker -> Engine file token | `environment-set` |
| 切换 Skybox / IBL / Both | segmented control | `environment-update` |
| 旋转 | dial/slider | `environment-update` |
| 强度/曝光 | slider/input | `environment-update` |
| 显示为背景 | toggle | `environment-update` |
| 清除 | icon button | `environment-clear` |

Extension 仍可保留 `neko.model.useEnvironment` 命令，但它应变成向 Engine 发送 environment command，而不是只 post 到 Webview store。

### Semantic Part Selection UI

新增 `SelectionMode`：

| 模式 | 优先 mask | Inspector |
|---|---|---|
| Object | node、submesh、materialSlot | Transform / Material |
| Face Region | characterRegion、morphControl | Face/Region controls |
| Bone/Pose | bone | Bone/IK |
| Light | node(light) | Light |
| Animation | node、bone、morphControl | Animation / Keyframe |
| Export/Inspect | node、materialSlot、environment | Read-only summary / export diagnostics |

Viewport overlay：

1. Engine 返回 candidates，Webview 显示 hover highlight 和可选中的 region outline。
2. 多候选重叠时，在光标旁显示小型 disambiguation menu。
3. Region 选择不改变 Engine mesh，只改变 selection state；后续 slider/drag 才产生 authoring command。

## 数据与持久化

| 数据 | 持久化位置 | 原因 |
|---|---|---|
| Authored lights | `.nkm` scene graph | 场景级资产，影响渲染/导出。 |
| Environment | `.nkm` scene settings | 场景 lookdev 与渲染输出一致。 |
| Viewport render mode | Webview state + optional `.nkm` editor state | 多数是编辑器显示偏好，不应默认影响资产语义。 |
| Clay material override preset | Editor settings 或 `.nkm` editor state | LookDev 辅助，不等于真实材质。 |
| Character regions | `.nkc` descriptor | 角色 authoring 语义，需随角色移动。 |
| Selection | transient Webview/Engine editor state | 不作为导出事实。 |

## 迁移策略

1. 旧 `.nkm` 无灯光时继续使用 Engine 默认三点编辑灯，视觉不破坏。
2. 第一次添加用户灯光后，场景进入 authored lighting 模式；默认编辑灯不持久化。
3. 旧 `EnvironmentPlacement` 只在 Webview 的状态恢复中使用；保存时转为 Engine environment scene settings。
4. 普通 GLB/VRM 没有 semantic region 时，只提供 node/material/submesh 选择；不伪造 MetaHuman 区域。
5. P4 之前的普通 mesh 选择不依赖 `.nkc`；materialSlot/submesh/primitive 的 picking 可先服务模型检查、材质编辑和导出诊断。

## 验收标准

| 能力 | 验收 |
|---|---|
| 白模 / Clay | 切换后 Engine stream 画面来自 clay render mode；Route A 检查确认未引入 Webview 3D renderer。 |
| Mesh debug | PBR/Wireframe/Normal/Depth/LightComplexity 切换稳定，frame metadata 与 UI badge 一致。 |
| 添加灯光 | 新 light 出现在 Outliner，影响 Engine 画面，SceneDelta 返回新 node/revision。 |
| 删除灯光 | 删除后 Outliner 与 Engine 画面同步；非法删除返回 reject diagnostic。 |
| 调整灯光 | Transform gizmo 改变 light direction/position；Light panel 改变 color/intensity/range。 |
| 背景切换 | HDRI/背景图由 Engine 渲染；capture 与 stream 一致。 |
| 选中部位 | 点击角色脸部区域返回 `characterRegion`，Inspector 显示区域相关 morph controls。 |
| 降级 | 无 region descriptor 的普通模型可降级到 materialSlot/submesh/node selection。 |

## 测试计划

### TypeScript / Webview

- `RouteABoundary.test.ts`：禁止 `three`、`@react-three/*`、Webview glTF 解析回归；新增 LookDev/Light/Environment UI 不破坏 Route A。
- `RouteABoundary.test.ts`：禁止高频相机/拖拽路径等待 `updateViewportCamera` ack、触发 stream lifecycle、或把 interaction profile 放进 React state。
- `SceneDocument.test.ts`：覆盖 `node-add` light、`node-remove`、`light-update`、`environment-*` command envelope。
- `modelStore.test.ts`：LookDev transient state、selection target、pending ack/reject 生命周期。
- `LookDevControls.test.tsx`：render mode 切换、pending/reconnect 状态、badge。
- `LightInspectorPanel.test.tsx`：颜色/强度/range/cone 输入归一化与命令生成。
- `EnvironmentPanel.test.tsx`：asset placement、mode/intensity/exposure、clear。
- `InteractionLayer.test.tsx`：selection candidates、mask、disambiguation menu。
- `StreamDescriptorClients.test.ts`：覆盖 `updateBackpressurePolicy()` 不重连，latest-only 不 suppress 已进入 WebCodecs 的硬解输出帧。
- `RouteABoundary.test.ts`：覆盖 interaction activity 在 pointerdown/wheel/key 起点使用 immediate hot path，并共享 `VIEWPORT_INTERACTION_PROFILE_TTL_MS`。
- `SceneControlSocket.test.ts`：覆盖 latest-only viewport camera message 默认无 `requestId`，但可显式携带 requestId 做调试。

### Engine / Rust

- `host-http` parser tests：`node-add(kind=light)`、`light-update`、`node-remove`、`environment-set/update/clear`。
- `host-http` parser tests：`viewportCamera` 可解析 `streamProfile` / `profileTtlMs`，无 `requestId` 时应用相机但不发送 ACK。
- `host-api` stream tests：`clay` render mode parse、descriptor response、quality scheduler 保留 render mode。
- `host-api` stream tests：`ViewportStreamInteractionProfile::Interactive` 将 runtime settings 映射到 `h264_gop_size = 1`，并绕过常规 5s reconfigure cooldown 进入交互态。
- `runtime-scene` tests：light CRUD、environment state、revision、SceneDelta。
- `engine-kernel` service tests：viewport interaction profile TTL 过期后恢复 `Default`。
- `engine-scene-renderer` tests：render graph variant selection、clay material override、debug view fallback。
- serde parity fixtures：Proto/TS/Rust 对 light/environment/selection/lookdev 合同一致。

### 集成与视觉验证

- 启动 Model Webview，切换 PBR/Clay/Wireframe/Normal/Depth，确认视频流非空且 overlay 不错位。
- 添加 point/spot/directional light，调整 transform 与 intensity，截图像素差异确认光照生效。
- 设置 environment background，确认 stream 与 `scenes:capture` 使用同一背景。
- 角色 region picking 测试：`.nkc` fixture 返回 region；普通 GLB fixture 降级到 node/material。

## 分阶段落地建议

| 阶段 | 范围 | 价值 | 风险 |
|---|---|---|---|
| P0 | UI 接入现有 renderMode：PBR/Wireframe/Unlit/Normal/Depth；stream 重启 | 快速获得 Mesh debug | 无 true clay，切换有重连 |
| P1 | Engine Clay 模式 + LookDevControls | 满足白模检查 | render graph/material override 需严测 |
| P2 | Light CRUD + Light Inspector | 完成灯光添加/删除/调整 | SceneCommand/SceneDelta 面扩大 |
| P3 | Environment Engine state + UI，先支持 background color + LDR panorama | 完成基础背景切换 | 不含 HDR prefilter/完整 IBL |
| P3.5 | HDRI prefilter + cubemap/IBL cache | 完成 lookdev 级环境光 | 需协调 preview/panorama 资源管线 |
| P4 | materialSlot/submesh/primitive picking | 不依赖 `.nkc` 的精细 mesh 检查 | 需要 renderer/runtime hit-test 增强 |
| P4.5 | Semantic selection target + `.nkc` region registry | 接近 MetaHuman 区域选择体验 | 需要 region descriptor schema |
| P5 | Undo/redo、Agent 工具、导出一致性 | 完整 authoring 闭环 | 跨模块验证范围大 |

## 风险与取舍

| 风险 | 缓解 |
|---|---|
| Clay 被误认为真实材质 | UI badge 与合同命名为 LookDev render mode，不写入 material slot。 |
| Stream 重启导致闪烁 | P0 接受；P1 用 `viewport-settings-update` 避免重连。 |
| 高频交互误走 LookDev/stream restart 慢路径 | 相机/拖拽/连续 slider 必须走 latest-only hot update；`streamProfile` 不进入 React effect 依赖；Route A 边界测试禁止回归。 |
| SceneControl ACK 堵塞视频反馈 | 高频相机更新默认无 `requestId`，Engine 应用但不逐帧 ACK；低频命令仍保留 ack/reject 语义。 |
| WebCodecs 硬解输出存在固定滞后 | 不再 suppress 已提交硬解的旧帧；latest-only 在呈现层保留最新帧，并用性能指标暴露 `decodeOutputLagFrames`。 |
| Environment 资源过大或加载过慢 | 异步加载、64 MiB 软限制、5s pending、15s timeout 与可取消任务。 |
| 灯光默认 rig 与 authored lights 混淆 | 明确区分 editor helper light 与 scene authored light，只有后者持久化。 |
| 语义区域选择依赖角色描述 | P4 先做 materialSlot/submesh/primitive；`.nkc` region 放到 P4.5。 |
| Environment 管线与 Panorama/Preview 重复 | equirectangular 解析、cubemap 和 prefilter cache 优先复用 engine preview/panorama 能力。 |
| UI 状态与 Engine 状态分叉 | 所有写命令等待 ack/SceneDelta；reject 时回滚 pending UI。 |
| 新增合同过宽 | 每个 patch 保持小接口，Light/Environment/Selection 分别测试和演进。 |

## 非目标

1. 不在 Webview 中实现 Three.js/R3F 预览或 fallback。
2. 不在本阶段实现完整路径追踪、Lumen/Nanite 等 UE 级渲染特性。
3. 不承诺任意 GLB/VRM 自动拥有 MetaHuman 式语义区域。
4. 不把 LookDev debug 模式写成最终导出材质。

## 结论

该方案把用户期待的“白模、Mesh debug、灯光编辑、背景切换、部位选择”全部纳入 Engine 权威链路，同时保持 Webview 作为控制面和 overlay 的定位。短期可以先通过现有 render mode 快速接入 Mesh debug；中期补齐 Clay、灯光和环境；长期通过 `.nkc` region descriptor 实现接近 UE MetaHuman 的语义部位选择与角色 authoring 体验。
