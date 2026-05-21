# ADR: 统一 Viewport 协议与场景合成

## 状态

Proposed (2026-05-20)

## 关联 ADR

- 上层依赖: [adr-2d3d-unified-engine.md](./adr-2d3d-unified-engine.md) — 共壳分核架构，L2 ECS 分核
- 上层依赖: [adr-webview-ui-design-system.md](./adr-webview-ui-design-system.md) — @neko/ui 包定位与共享组件策略
- 平行配合: [adr-2d-bone-blendshape-animation.md](./adr-2d-bone-blendshape-animation.md) — 2D 骨骼+BlendShape 运行时（PuppetController 消费方）
- 平行配合: [adr-3d-editor-rendering-architecture.md](./adr-3d-editor-rendering-architecture.md) — 3D 编辑器渲染（ModelController 消费方）
- 平行配合: [adr-engine-puppet-renderer.md](./adr-engine-puppet-renderer.md) — PuppetRenderer wgpu SpriteBatch + WS 命令
- 平行配合: [adr-engine-preview-subsystem.md](./adr-engine-preview-subsystem.md) — PreviewProviderRegistry + 三层预览架构
- 后续扩展: [adr-device-management.md](./adr-device-management.md) — neko-live 三层拆分（live 瘦身为场景合成器）

---

## 背景

### 三场景同构数据流

neko-suite 的三类编辑场景正在趋同为同一架构：后端引擎渲染场景并输出视频流，前端接收流画面并提供操作面板。

| 场景 | 引擎侧 | 当前前端 | 目标前端 |
|------|--------|---------|---------|
| 2D puppet | runtime-puppet → PuppetRenderer → H.264 | 正迁移到 VideoViewport | ViewportShell + PuppetController |
| 3D model | runtime-scene → SceneRenderer → H.264 | 已用 H.264 引擎流 | ViewportShell + ModelController |
| Live | runtime-puppet/scene → Compositor → H.264 | R3F/Three.js (~1.5K LOC) | ViewportShell + LiveController |

三个编辑器各自维护视频流接收、输入事件捕获、叠加层渲染、工具栏的独立实现，代码重复且交互体验不一致。

### 决策驱动因素

1. **一份视频管线**：H.264 解码 + Canvas 渲染 + 帧率控制写一次
2. **一致的交互体验**：缩放、平移、选择、Gizmo 操作三个编辑器手感一致
3. **neko-live 渲染冗余**：一旦 puppet/model 各有 engine-powered Live Mode，live 的 R3F 渲染全是低配重复
4. **协议碎片化**：puppet/model/live 与引擎的 WS 通信各有不同的命令格式，不利于统一工具链

---

## 决策

### 核心定位

> **统一 ViewportShell（视频流显示 + 输入捕获 + 叠加层）+ ViewportProtocol（命令信封），各编辑器通过 ISceneController 接口注入领域差异。neko-live 不自行渲染，仅作为场景合成器。**

### 分层架构

```
Layer 0 — @neko/shared (neko-types)
├── ViewportProtocol DTO     命令/事件信封类型定义（纯 TS 类型，零 DOM 依赖）
├── ISceneController         接口定义（纯 TS 接口）
└── OverlayDescriptor        叠加层描述类型

Layer 2 — @neko/ui (React + DOM)
├── ViewportShell            视频流显示 + 输入捕获 + 叠加层框架（React 组件）
├── OverlayRenderer          选区框 / 网格 / 标尺 / Gizmo（Canvas2D 叠加）
└── ViewportToolbar          缩放 / 网格 / 吸附 / 视图模式（React 组件）

Per-extension — 各编辑器实现 ISceneController
├── PuppetController         2D 骨骼拖拽 / BlendShape 滑块 / 洋葱皮
├── ModelController          3D 轨道相机 / IK 手柄 / 材质预览
└── LiveController           被动显示 / 场景切换 / 输出路由
```

**层级约束**：
- L0（neko-types）：纯类型、纯接口、零运行时依赖。ViewportProtocol DTO、ISceneController 接口、OverlayDescriptor 类型在此定义
- L2（@neko/ui）：React/DOM 运行时组件。ViewportShell、OverlayRenderer、ViewportToolbar 在此实现
- 各扩展仅依赖 L0 接口 + L2 组件，不相互依赖

---

## 设计要点

### 1. ViewportProtocol：命令信封

```typescript
// === L0: @neko/shared/types/viewport-protocol.ts ===

/** 前端 → 引擎 命令信封 */
interface ViewportCommand {
  /** 协议版本，用于前后端兼容协商 */
  protocolVersion: 1;
  /** 命令域：viewport 为共享操作，scene 为领域专属 */
  domain: 'viewport' | 'scene';
  /** 操作名称 */
  action: string;
  /** 场景实例 ID（同一编辑器可能有多个视口） */
  sceneId: string;
  /** 单调递增序号，用于请求-响应关联 */
  seq: number;
  /** 关联 ID，同一组交互共享（如一次拖拽的多个 move 事件） */
  correlationId: string;
  /** 客户端发送时间戳 (ms since epoch) */
  timestamp: number;
  /** 命令来源标识（区分用户交互 / Agent 工具 / 脚本回放） */
  source: 'user' | 'agent' | 'script';
  /** 基于的场景版本号（乐观并发——引擎侧若 current revision ≠ baseRevision 则拒绝或合并） */
  baseRevision?: number;
  /** 领域专属载荷 */
  payload: Record<string, unknown>;
}

/** 引擎 → 前端 事件信封 */
interface ViewportEvent {
  protocolVersion: 1;
  domain: 'viewport' | 'scene';
  event: string;
  sceneId: string;
  /** 响应对应的命令 seq（事件类消息为 0） */
  ackSeq: number;
  /** 引擎侧场景版本号（乐观并发控制） */
  revision: number;
  timestamp: number;
  /** 错误信息（仅失败时） */
  error?: { code: string; message: string };
  payload: Record<string, unknown>;
}

/** 帧元数据（随视频流 SEI/sideband 传输） */
interface ViewportFrameMeta {
  protocolVersion: 1;
  sceneId: string;
  revision: number;
  /** 视口变换矩阵（前端 overlay 坐标对齐用） */
  viewTransform: [number, number, number, number, number, number]; // 2D affine [a,b,c,d,tx,ty]
  /** 帧时间戳 */
  frameTimestamp: number;
}
```

**关键字段说明**：

| 字段 | 作用 |
|------|------|
| `protocolVersion` | 信封协议版本，V-1 contract test 固定为 `1`；后续破坏性变更通过版本协商处理 |
| `seq` | 单调递增，请求-响应关联；overlay 预测性渲染发出命令后可立即更新，收到 ackSeq 确认或回退 |
| `correlationId` | 一次拖拽的 pointerdown/move/up 共享同一 ID，引擎侧可批量处理/撤销 |
| `revision` | （ViewportEvent）引擎侧场景状态版本号，用于乐观并发——多个 Agent/用户同时编辑时检测冲突 |
| `baseRevision` | （ViewportCommand，可选）客户端发送命令时基于的场景版本号。引擎侧若 current revision ≠ baseRevision 则拒绝（返回 error）或尝试合并。viewport 域命令（pan/zoom/quality）无需携带；scene 域写命令必须携带 |
| `timestamp` | 延迟测量；前端可统计 command→event 往返延迟 |
| `source` | 区分用户交互 vs Agent 工具调用 vs 脚本回放，引擎侧可做权限/限流策略 |
| `error` | 引擎侧命令执行失败时返回，前端可回退 overlay 预测 |

### 2. `viewport` 域命令（全场景共享）

viewport 域命令分两类处理方式：

**Shell-local**（ViewportShell 直接处理，不经引擎往返）：

Shell-local 交互不要求发送给引擎，可由 ViewportShell 内部状态或 `ViewportLocalCommand` 处理；如果需要录制、同步或调试，也可以投影为 `ViewportCommand` 日志事件。只有 Engine-mediated viewport 命令和 `scene:*` 写命令必须通过 ViewportProtocol 信封进入引擎。

| 命令 | 说明 | 2D | 3D | Live |
|------|------|----|----|------|
| `viewport:pan` | 画布平移 | Y | Y | Y |
| `viewport:zoom` | 缩放 | Y | Y | Y |
| `viewport:resize` | 视口尺寸变化 | Y | Y | Y |
| `viewport:quality` | 流质量/帧率切换 | Y | Y | Y |

**Engine-mediated**（Shell 捕获输入，转发引擎处理，需引擎状态参与）：

| 命令 | 说明 | 2D | 3D | Live |
|------|------|----|----|------|
| `viewport:select` | 点击选择（引擎侧 hit test） | Y | Y | N |
| `viewport:marquee` | 框选 | Y | Y | N |
| `viewport:transform` | Gizmo 拖拽（平移/旋转/缩放） | Y | Y | N |
| `viewport:camera` | 相机控制 | 2D 约束 | 3D 轨道 | 固定 |

### 3. `scene` 域命令（领域专属）

由各 SceneController 自行定义和处理：

```
puppet 专有：
  scene:puppet:dragBone        { boneId, delta }
  scene:puppet:setBlendShape   { name, weight }
  scene:puppet:toggleOnionSkin { enabled }
  scene:puppet:setDriverWeight { driverId, weight }

model 专有：
  scene:model:setIKTarget             { chainId, position }
  scene:model:switchMaterialPreview   { mode }
  scene:model:setLightingPreset       { preset }

live 专有：
  scene:live:switchScene        { presetId }
  scene:live:setTrackingOverlay { visible }
  scene:live:setCompositorLayer { layerIndex, config }
```

前端信封格式直接映射到 Rust ActionRouter：共享的 `viewport_controller` + 领域专属的 `puppet_controller` / `scene_controller` / `compositor_controller`，前后端结构对称。

### 4. ISceneController 接口

```typescript
// === L0: @neko/shared/types/viewport-protocol.ts ===

interface ISceneController {
  readonly sceneType: '2d' | '3d' | 'live';

  // 输入事件 — ViewportShell 捕获后委托给 controller
  onPointerDown(e: ViewportPointerEvent): void;
  onPointerMove(e: ViewportPointerEvent): void;
  onPointerUp(e: ViewportPointerEvent): void;
  onWheel(e: ViewportWheelEvent): void;
  onKeyDown(e: ViewportKeyEvent): void;

  // 叠加层 — controller 告诉 OverlayRenderer 画什么
  getOverlays(): OverlayDescriptor[];

  // 工具栏扩展 — 在统一工具栏后追加领域按钮
  getToolbarExtensions(): ToolbarItem[];

  // 右键菜单
  getContextMenu(target: HitTestResult | null): MenuItem[];

  // 场景命令 — 处理 scene 域的引擎事件
  onSceneEvent(event: ViewportEvent): void;
}
```

ViewportShell 不需要知道具体场景类型：

```tsx
function ViewportShell({ controller, streamUrl }: ViewportShellProps) {
  const canvasRef = useVideoStream(streamUrl);

  const handlePointerDown = (e: React.PointerEvent) => {
    const ve = toViewportEvent(e, canvasRef);
    controller.onPointerDown(ve);
  };

  const overlays = controller.getOverlays();
  const extraTools = controller.getToolbarExtensions();

  return (
    <div onPointerDown={handlePointerDown} /* ... */>
      <canvas ref={canvasRef} />
      <OverlayRenderer overlays={overlays} />
      <ViewportToolbar extra={extraTools} />
    </div>
  );
}
```

### 5. neko-live 场景合成器

一旦 puppet 和 model 各自拥有 engine-powered Live Mode，neko-live 的 R3F 渲染（~1.5K LOC, 18 files）全是冗余。neko-live 的真正价值是多源合成 + 输出路由。

```
用户视角：
┌─────────────────────────────────────────┐
│  neko-live Webview                      │
│  ┌─────────────────────────┐            │
│  │   ViewportShell          │  场景列表  │
│  │   (H.264 composited)    │  输出设置  │
│  │                         │  OBS 控制  │
│  └─────────────────────────┘            │
└─────────────────────────────────────────┘

引擎侧 Compositor：
┌──────────────────────────────────────┐
│  Layer 0: Background (image/video)   │
│  Layer 1: PuppetScene (2D avatar)    │  ← runtime-puppet
│  Layer 2: SceneScene (3D model)      │  ← runtime-scene
│  Layer 3: Overlay (text/effects)     │
│                                      │
│  → GPU composite → H.264 encode →    │
└──────────────────────────────────────┘
```

neko-live 告诉引擎"把这些场景合成在一起"，接收一路视频流显示和转发（OBS 虚拟摄像头、RTMP 推流、录制）。不自行渲染任何 3D/2D 内容。

**直播延迟预算（本地）**：

| 环节 | 延迟 |
|------|------|
| 摄像头采集 | ~33ms (30fps) |
| Tracking 推理 | ~5-10ms |
| Bone2D+BlendShape CPU | ~0.3ms |
| GPU 合成+编码 | ~3-5ms |
| WebSocket 传输（本地） | ~1ms |
| 解码+显示 | ~3-5ms |
| **总计** | **~45-55ms** |

对比当前 R3F 方案（~40-50ms）没有显著增加延迟。GPU 合成替代 JS 多层渲染可能更快。

### 6. Overlay 预测性渲染

2D 编辑场景对交互延迟敏感（骨骼拖拽、顶点编辑需即时反馈）。视频流路径增加 ~5-10ms 往返，本地渲染 < 1ms。

**解法：overlay 预测 + 引擎确认**：

```
用户拖拽骨骼 →
  1. 前端 overlay 立即移动骨骼线框（纯 2D 线条，< 1ms）
  2. 同时发送 ViewportCommand { seq: 42, action: 'scene:puppet:dragBone', ... }
  3. 引擎处理 → 渲染新帧 → ViewportEvent { ackSeq: 42, revision: 103 }
  4. 新帧到达后，overlay 线框与视频流对齐
  5. 若 error 返回，overlay 回退到上次确认位置
```

用户感知：即时响应的骨骼线框 + 稍有延迟的纹理渲染。这和 3D 建模软件的 wireframe 拖拽体验一致。

**帧元数据坐标对齐**：引擎在每帧的 `ViewportFrameMeta` 中附带精确的 `viewTransform` 矩阵（2D 仿射变换），前端 overlay 用同一矩阵变换坐标，保证像素级对齐。

---

## 不变量

1. **协议 DTO 在 L0**：ViewportCommand/ViewportEvent/ViewportFrameMeta/ISceneController 类型定义在 @neko/shared（neko-types），零 DOM/React 依赖
2. **UI 组件在 L2**：ViewportShell/OverlayRenderer/ViewportToolbar 在 @neko/ui，依赖 React/DOM
3. **领域隔离**：各 SceneController 实现不相互依赖，不 import 其他扩展代码
4. **neko-live 不渲染**：neko-live 仅作为场景合成器，通过 ViewportShell 接收引擎合成流，不自行渲染 3D/2D 内容
5. **命令信封完备**：Engine-mediated viewport 命令和所有 `scene:*` 写命令走 ViewportProtocol 信封；命令携带 `protocolVersion/seq/correlationId/baseRevision?/timestamp/source`，事件携带 `protocolVersion/ackSeq/revision/timestamp/error?`，支持请求-响应关联和乐观并发
6. **overlay 坐标对齐**：引擎每帧元数据附带 viewTransform 矩阵，前端 overlay 使用同一矩阵变换坐标

---

## 迁移计划

### Phase V-1: 协议契约（~1 周，2 PR）

| PR | 内容 | 依赖 |
|----|------|------|
| V-1-PR1 | `@neko/shared/types/viewport-protocol.ts`：ViewportCommand / ViewportEvent / ViewportFrameMeta / ISceneController / OverlayDescriptor 类型定义 + contract test | — |
| V-1-PR2 | Rust `engine-types`：对应 ViewportCommand / ViewportEvent DTO + serde + 与 ActionRouter 信封对齐 | V-1-PR1 |

### Phase V0: ViewportShell 基础（~2 周，3 PR）

| PR | 内容 | 依赖 |
|----|------|------|
| V0-PR1 | `@neko/ui`：ViewportShell 组件（视频流接收 + 输入捕获 + SceneController 委托） | V-1-PR1 |
| V0-PR2 | `@neko/ui`：OverlayRenderer（Canvas2D 叠加层框架 + 坐标矩阵对齐 + 预测性渲染基础） | V0-PR1 |
| V0-PR3 | `@neko/ui`：ViewportToolbar（缩放/网格/吸附/视图模式 + 扩展点） | V0-PR1 |

### Phase V1: 各编辑器接入（~3 周，4 PR）

| PR | 内容 | 依赖 |
|----|------|------|
| V1-PR1 | Engine：viewport 域命令路由统一（ActionRouter 注册 viewport_controller） | V-1-PR2 |
| V1-PR2 | neko-model：ModelController 实现 + 从现有 VideoViewport 迁移到 ViewportShell | V0 + V1-PR1 |
| V1-PR3 | neko-puppet：PuppetController adapter 接入验收（PuppetController 自身由 2D bone ADR P2-PR2 实现，本 PR 仅做 ViewportShell 集成验证 + e2e 测试） | V0 + V1-PR1 + 2D bone ADR P2-PR2 |
| V1-PR4 | neko-live：LiveController 实现 + 删除 R3F 渲染代码 (~1.5K LOC) + 切换到 ViewportShell | V0 + device-management ADR |

### Phase V2: 引擎合成器（~2 周，2 PR）

| PR | 内容 | 依赖 |
|----|------|------|
| V2-PR1 | Engine：Compositor 多层 GPU 合成（background + puppet + scene + overlay → 单路 H.264） | V1-PR1 |
| V2-PR2 | neko-live：场景预设管理 + 输出路由（OBS virtual cam / RTMP / 录制） | V1-PR4, V2-PR1 |

**合计：~8 周，11 PR**

---

## 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| 2D 交互延迟 | 骨骼拖拽增加 ~5-10ms 往返 | overlay 预测性渲染（§6）；P2 验收指标：拖拽延迟 ≤ 16ms |
| 2D overlay 像素对齐 | 骨骼/顶点 overlay 与视频流需像素级对齐 | 引擎每帧 ViewportFrameMeta.viewTransform 矩阵 |
| 视频流管线故障域 | 编码器/WS/解码器任一环故障导致编辑器不可用 | CPU fallback 管线保留；静态截图 + overlay 退化模式 |
| neko-model 迁移成本 | 现有 VideoViewport 需要适配到 ViewportShell | neko-model 已有 H.264 流，迁移主要是组件替换而非架构变更 |
| 协议版本演进 | 新增命令字段时的前后兼容 | payload 为 `Record<string, unknown>` 天然可扩展；信封字段通过 `protocolVersion` 标记 |

---

## 与其他 ADR 的交互

| ADR | 交互方式 |
|-----|---------|
| 共壳分核 (adr-2d3d-unified-engine) | ViewportShell 是共壳在前端的投影——共享流显示和交互框架，领域差异由 SceneController 隔离 |
| 2D Bone+BlendShape (adr-2d-bone-blendshape) | PuppetController 消费 runtime-puppet 产出的视频流；overlay 预测性渲染是 2D 编辑的关键路径 |
| 3D Editor Rendering (adr-3d-editor-rendering) | ModelController 消费 runtime-scene 产出的视频流；现有 VideoViewport 迁移为 ViewportShell |
| Engine Preview Subsystem | PreviewProviderRegistry 的各 Provider 输出可接入 ViewportShell 显示 |
| Device Management / neko-live 拆分 | LiveController 消费 Compositor 合成流；TrackingService 共享化是 live 场景的前提 |
| Webview UI Design System | ViewportShell/OverlayRenderer/ViewportToolbar 是 @neko/ui 的核心组件族；协议 DTO 在 @neko/shared（L0），UI 组件在 @neko/ui（L2） |
| Engine Puppet Renderer | PuppetRenderer 的 WS 命令信封对齐 ViewportProtocol `scene:puppet:*` 命令格式 |

---

## 附录 A: 对各场景类型的优劣分析

### 对 3D 场景（neko-model）

**优势**：neko-model 已有 H.264 引擎流，迁移到 ViewportShell 主要是组件替换。统一后获得标准化工具栏、叠加层框架和多视口能力。

**风险**：3D 交互（轨道相机、IK 手柄）的 overlay 渲染需要 3D→2D 投影。已有 hit test 返回屏幕坐标的机制，overlay 在屏幕空间绘制即可。

### 对 2D 场景（neko-puppet）

**优势**：

| 收益 | 说明 |
|------|------|
| WYSIWYG 一致性 | 编辑预览与导出渲染由同一引擎产出，无双渲染器追赶问题 |
| 效果扩展零前端成本 | 模糊/辉光/粒子/后处理在引擎侧加一次，前端无需追加实现 |
| 消除前端渲染冗余 | 无需在 webview 维护网格变形/纹理映射/Draw order/混合模式的独立实现 |
| 2D-in-3D 前提 | Billboard/Flat Mesh/Layered Depth 均要求引擎渲染 2D，统一后放入 3D 无外观跳变 |
| 叠加层复用 | 网格、标尺、选区高亮、变换手柄与 3D 编辑器共享 |
| 多视口免费 | ViewportShell 支持分屏后 puppet 自动获得多视图 |

**风险**：

| 风险 | 影响 | 缓解 |
|------|------|------|
| 交互延迟 | 骨骼拖拽增加 ~5-10ms（本地渲染 < 1ms） | overlay 预测性渲染（§6）；验收指标 ≤ 16ms |
| 工程复杂度 | 5K 顶点场景启动完整视频管线是杀鸡用牛刀 | 换取架构一致性和长期效果扩展；CPU 简单场景编码延迟 < 2ms |
| 叠加层像素对齐 | 2D 像素级精确，亚像素偏差可见 | 引擎 ViewportFrameMeta.viewTransform 矩阵对齐 |
| 开发迭代速度 | 早期强制引擎流需 Rust 重编译 | 分阶段：Phase 0-1 本地渲染 → Phase P2 切换引擎流 |
| 故障域扩大 | 视频管线故障导致编辑器不可用 | CPU fallback + 静态截图退化模式 |
| 离线退化 | 引擎未启动时不可用 | 静态骨骼预览 fallback |

**分阶段切入**（对齐 2D bone ADR 迁移计划）：

```
2D bone Phase -1/P0: 本地 Canvas2D 渲染，快速迭代交互原型
2D bone Phase P1:    引擎 runtime-puppet 稳定，golden test 通过
本 ADR Phase V1-PR3: 切换到 ViewportShell + 引擎流，加 overlay 预测性渲染
```

### 对 Live 场景（neko-live）

**优势**：消灭 ~1.5K LOC R3F 冗余渲染代码（18 files）；live 输出与 puppet/model 编辑器预览画质完全一致；引擎 GPU 合成比 JS 多层渲染更快。

**风险**：依赖引擎 Compositor 实现（Phase V2）；直播场景对延迟敏感但 ~45-55ms 总延迟与当前方案持平。
