# ADR: Device Management — TS 侧统一设备客户端、neko-live 职责拆分与面板策略

## 状态

Proposed (2026-05-07)

## 背景

neko-suite 的创作工作流涉及多种外部设备：手柄（动画预览控制）、MIDI 控制器（关键帧/参数映射）、麦克风（录音/直播）、摄像头（动捕/直播）、手写板（绘画）、XR 设备（未来）。当前设备支持分布在两个层面：

### Rust 层（已完备）

`runtime-device` crate 提供了完整的硬件 I/O 抽象：

| 设备 | 实现 | 状态 |
|------|------|------|
| Gamepad | gilrs, 120Hz 轮询, broadcast channel | 生产就绪 |
| MIDI | midir, 回调驱动, broadcast channel | 生产就绪 |
| Mic | cpal, 实时录音 + RMS/peak 监控 | 生产就绪 |
| Camera | 占位, 接口已定义 | Stub |

服务 trait 在 `engine-kernel/src/services/`，HTTP/WS 暴露在 `host-api/controllers/` + `host-http/routes/`，架构合理。

### TS 层（缺失）

| 缺口 | 影响 |
|------|------|
| `@neko/shared` 无设备类型定义 | Rust/TS 类型不对齐，各扩展自定义 |
| 无统一设备客户端 | neko-audio 自己处理设备枚举，gamepad/MIDI 在 TS 无法消费 |
| 无设备状态聚合 | 热插拔/连接状态分散在各 controller，无统一事件源 |
| 无权限层 | 摄像头/XR 等敏感设备缺少用户授权确认 |

### neko-live 面板现状

neko-live 当前是**单个侧栏 WebviewView**，内部三个条件渲染分支：

```
LivePanelProvider (WebviewViewProvider)
└── App.tsx
    ├── avatarUrl === null     → EmptyState（引导 + 追踪预览）
    ├── avatarType === 'puppet' → PuppetViewer（Canvas 2D）
    ├── avatarType === 'vrm'   → Viewport3D（Three.js）
    └── TrackingPanel（底部控制栏，始终可见）
```

单 Zustand store，单 postMessage 通道，无路由、无页面栈。随着功能增长（场景合成、音频混音、推流），需要预判 UI 面积扩展路径。

### neko-live 渲染器重复问题

neko-live 内部存在显著的渲染器代码重复：

| 组件 | neko-live | 对应子包 | 重复度 |
|------|-----------|---------|--------|
| VRM 加载 + R3F 渲染 | `AvatarViewer.tsx` (109行) | neko-model `ModelLoader.tsx` (181行) | **~95% 相同** |
| Three.js 依赖 | three/R3F/drei/vrm 四件套 | 完全相同版本 | **100%** |
| Puppet Canvas 2D | `PuppetViewer.tsx` (133行, 极简) | neko-puppet `PuppetCanvas.tsx` (346行, 专业) | neko-live 是**劣化副本** |
| 追踪映射 | `vmcMapping.ts` + `puppetMapping.ts` | 不存在于其他子包 | **100% 仅在 neko-live** |

具体问题：

- **VRM 加载**：neko-live `AvatarViewer` 与 neko-model `ModelLoader` 使用完全相同的 `GLTFLoader + VRMLoaderPlugin` 模式，零共享代码
- **Puppet 渲染**：neko-live 的 `PuppetViewer` 是纯色填充的极简实现，缺少 neko-puppet `PuppetCanvas` 的纹理映射、混合模式（Normal/Multiply/Screen/Overlay/Add）、z_order 排序、DPI 处理、ImageBitmap 缓存等专业特性
- **追踪映射**：`vmcMapping`（ARKit → VRM 表情）和 `puppetMapping`（ARKit → Live2D 参数）仅存在于 neko-live，其他子包无法复用
- **VmcReceiver**：硬编码在 `LivePanelProvider` 中，无法被 neko-puppet/neko-model 消费

这导致用户体验割裂：在 neko-puppet 编辑骨骼动画时想用面捕预览，必须另开 neko-live、重新加载同一文件、在劣化渲染器中查看。

## 决策

### 1. TS 设备客户端放在 neko-client，不新建子包

设备管理不是独立用户功能域，是基础设施。`neko-client` 已经是 engine 通信的 TS 客户端（EngineClient + FMP4/PCM/SceneControl 流式协议），设备客户端是其自然延伸。

```
packages/neko-client/src/device/
├── types.ts              ← DeviceInfo / DeviceEvent / DeviceType
├── DeviceManager.ts      ← 统一发现 + 状态聚合 + 热插拔
├── GamepadClient.ts      ← gamepad:* API + WS 事件订阅
├── MidiClient.ts         ← midi:* API + WS 事件订阅
├── CameraClient.ts       ← cameras:* API
└── index.ts
```

类型定义提升到 `@neko/shared/types/device.ts`，与 Rust `engine-kernel/services/` 的 trait 对齐。

**不建议新建顶层子包** `neko-device`——治理开销不匹配收益。

### 2. 设备管理 UI 使用原生 VSCode 组件，不建 Webview

管理面（列表/连接/配置）交互频率低、数据简单，无需 Webview：

| VSCode 组件 | 用途 |
|-------------|------|
| TreeView (侧栏) | 设备列表 + 在线状态 |
| QuickPick | 设备选择（"选择 MIDI 输入端口"） |
| StatusBar | 当前活跃设备指示 |
| Notification | 热插拔提示 |

唯一需要 Webview 显示设备数据的场景是**调试可视化**（手柄摇杆实时位置、MIDI velocity 显示），归属 neko-tools 调试面板，不是设备管理职责。

### 3. 实时设备输入在 engine 进程内闭环，不经过 Webview

设备输入的**动作执行**发生在 engine 进程内（同进程 broadcast recv），Webview 只看渲染结果。

```
正确路径（控制信号）：
  Gamepad/MIDI → Rust runtime-device → broadcast → 同进程消费
  → engine 直接响应（渲染/音频触发）
  → 结果通过 H264/PCM 流推到 Webview 显示

错误路径（不要这样做）：
  Gamepad → WS → Extension Host → postMessage → Webview
  → postMessage → Extension → engine
```

### 4. 延迟分析

完整链路 engine → Webview tab：

| 跳数 | 环节 | 延迟 |
|------|------|------|
| 1 | 硬件 → Rust (polling/callback) | 0–8ms (gamepad) / <1ms (MIDI) |
| 2 | broadcast channel send/recv | <0.1ms |
| 3 | JSON 序列化 + WS 发送 | ~1ms |
| 4 | WS → Extension Host 接收 | ~1–2ms |
| 5 | postMessage → Webview | ~0.5–1ms |
| 6 | React 渲染周期 | ~16ms (60fps) |
| **合计** | | **~12–25ms** |

按场景判断：

| 场景 | 预算 | 实际 | 判定 |
|------|------|------|------|
| 手柄控制 3D 视角 | <100ms | 12–25ms | 可接受 |
| MIDI 触发动画关键帧 | <33ms | 5–15ms | 可接受 |
| MIDI 实时演奏出声 | <5ms | — | 不走 Webview，engine 内闭环 |
| 手写板绘画 | — | 0ms | 不走 engine，Webview PointerEvent 直接处理 |
| 摄像头预览 | <33ms | 已有 H264 流 | 已解决 |
| 设备管理操作 | <1s | <50ms | 无感 |

### 5. 手写板/Wacom 不走 engine

浏览器 PointerEvent 已携带 `pressure` / `tiltX` / `tiltY` / `twist`，Webview 中直接消费，无需 engine 代理。neko-sketch 当前方案正确。

### 6. neko-live 面板不需要统一页面管理

当前单面板 + 条件渲染的结构匹配现有功能范围，不引入路由或 tab 框架。

**增长路径使用 VSCode 原生多面板机制**：

```
阶段 1（当前）：
  侧栏 WebviewView ← LivePanelProvider
  足够，不动

阶段 2（场景合成时）：
  侧栏 WebviewView  ← 控制面板（精简为控制+状态）
  编辑器 CustomEditor ← 场景画布（.nklive → 全尺寸预览+合成）
  两个独立 Webview，共享 LiveSessionService（extension 层）

阶段 3（完整直播）：
  侧栏 WebviewView  ← 控制面板
  编辑器 CustomEditor ← 场景画布
  底部 WebviewView   ← 音频混音器（或复用 neko-audio）
  三个 Webview，通过 LiveSessionService 协调状态
```

**统一的是 extension 层的 session 状态，不是 Webview 层的页面**：

```
                ┌─────────────────────────┐
                │   LiveSessionService    │  ← 状态 SSOT，extension 层
                │ (追踪/场景/录制/设备)    │
                └────┬──────────┬─────────┘
                     │          │
          postMessage│          │postMessage
                     ▼          ▼
            ┌─────────┐  ┌───────────┐
            │  侧栏    │  │  编辑器   │   ← 各自独立 Webview
            │  控制面板 │  │  场景画布  │   ← 各自独立 store
            └─────────┘  └───────────┘
```

每个 Webview 只订阅关心的状态切片，不需要跨 Webview 的统一页面管理。

### 7. neko-live 职责拆分：拆服务层，不拆 UI 壳

neko-live 当前是一个混合体（追踪输入 + 重复渲染 + 录制 + 控制面板），应拆为三层：

```
┌─ 共享服务层（新）──────────────────────────────────────┐
│  TrackingService（VmcReceiver 提取为 extension 级服务）  │
│  对所有子包暴露 TrackingData 事件流                      │
└──────────────────────────────────────────────────────────┘
        ↓ 消费                         ↓ 消费
┌─ neko-puppet ─────────────┐  ┌─ neko-model ────────────────┐
│ + "Live Mode" 命令         │  │ + "Live Mode" 命令          │
│ 用自己的 PuppetCanvas 渲染  │  │ 用自己的 R3F 渲染           │
│ (346行专业渲染器)           │  │ (含 Gizmo/Grid/灯光)       │
│ + puppetMapping 迁入       │  │ + vmcMapping 迁入           │
└───────────────────────────┘  └─────────────────────────────┘
        ↓ 输出                         ↓ 输出
┌─ neko-live（瘦身后）──────────────────────────────────────┐
│ 不再自己渲染头像                                          │
│ 职责：场景合成 + 多源编排 + 录制/推流 + 控制面板            │
└──────────────────────────────────────────────────────────┘
```

#### 7.1 TrackingService 提取为共享服务

`VmcReceiver` 从 neko-live 的 `LivePanelProvider` 中提取，成为 extension 级共享服务：

- 任何子包通过 `vscode.commands.executeCommand('neko.tracking.start')` 启动追踪
- TrackingData 通过 `vscode.EventEmitter` 广播，消费者按需订阅
- neko-live、neko-puppet、neko-model 都是平等消费者

#### 7.2 Live Mode 归入消费者子包

neko-puppet 和 neko-model 各自增加 "Live Mode" 命令，用自己已有的渲染器驱动：

| 子包 | Live Mode 行为 | 渲染器 |
|------|---------------|--------|
| neko-puppet | 订阅 TrackingService → puppetMapping → 驱动 PuppetCanvas | Canvas 2D（346行，专业） |
| neko-model | 订阅 TrackingService → vmcMapping → 驱动 R3F 场景 | Three.js（含 Gizmo/Grid） |

用户工作流变为：在编辑器中点击 "Live Mode" 按钮，同一画布原地切换为面捕驱动，无需切换面板。

#### 7.3 neko-live 瘦身为场景合成器

neko-live 不再自己渲染头像，职责收缩为：

- **场景合成**：多头像编排（头像A + 头像B + 背景 + 字幕叠加 + 转场）
- **录制/推流**：CanvasRecorder + RecordingService + 未来推流
- **控制面板**：场景切换、录制控制、推流状态

单头像直播场景由 neko-puppet/neko-model 的 Live Mode 直接承载。

#### 7.4 组件迁移表

| 现 neko-live 组件 | 去向 | 理由 |
|-------------------|------|------|
| `VmcReceiver` + `osc-parser` | 提取为共享 extension 级 TrackingService | 多子包共享 |
| `vmcMapping.ts` | → neko-model | VRM 表情映射属于 3D 域 |
| `puppetMapping.ts` | → neko-puppet | Puppet 参数映射属于 2D 域 |
| `AvatarViewer.tsx` + `Viewport3D.tsx` | **删除** | neko-model 已有更完整版本 |
| `PuppetViewer.tsx` | **删除** | neko-puppet 已有专业版本 |
| `TrackingPanel.tsx` | 保留在 neko-live（精简为场景控制） | 场景合成控制 |
| `CanvasRecorder.ts` + `RecordingService.ts` | 保留在 neko-live | 录制是 live 独有职责 |
| `EmptyState.tsx` | 改为场景合成引导 | 职责变更 |
| `liveStore.ts` 追踪相关字段 | 各消费者自有 store | 解耦 |

#### 7.5 设备管理面板与 neko-live 面板的关系

**不合并**。两者职责不同：

| | 设备管理侧栏 (TreeView) | neko-live 面板 |
|---|---|---|
| 职责 | 设备发现 + 连接状态 | 场景合成 + 录制/推流 |
| 关注点 | "系统里有哪些设备" | "用哪个设备做这件事" |
| 交互频率 | 偶尔（插拔设备时） | 持续（直播全程） |

neko-live 面板通过 `DeviceManager` API 获取设备列表，在自己的工作流 UI 里嵌入设备选择下拉，不跳转到设备管理面板。

设备管理 TreeView 可提供跨面板命令（右键设备 → "Use in Neko Live"），通过 `vscode.commands` 协议通信。

#### 7.6 提前抽象：LiveSessionService

在场景合成需求到来之前，将追踪/场景/录制状态从 `LivePanelProvider` 提取到独立的 `LiveSessionService`，为多面板消费做准备。这是当前值得提前做的抽象，也是 TrackingService 提取的前置步骤。

## 优先级

### 设备管理

| 优先级 | 任务 | 说明 |
|--------|------|------|
| P1 | `@neko/shared/types/device.ts` | 设备类型定义，与 Rust kernel traits 对齐 |
| P1 | `neko-client/src/device/DeviceManager.ts` | 统一发现 + 事件聚合 + `onDeviceChange` |
| P2 | `GamepadClient` / `MidiClient` | 让 neko-puppet、neko-sketch 能用手柄/MIDI |
| P2 | `CameraClient` | 配合 Rust 侧 `camera.rs` 补完 |
| P3 | 设备管理 TreeView | 原生 VSCode 侧栏设备列表 |
| P3 | XR 设备客户端 | 等 `runtime-xr` ADR 实现后 |

### neko-live 职责拆分

| 优先级 | 任务 | 说明 |
|--------|------|------|
| P1 | `LiveSessionService` 提取 | 从 LivePanelProvider 解耦追踪/场景/录制状态 |
| P1 | `TrackingService` 提取 | VmcReceiver → extension 级共享服务 + 命令协议 |
| P1 | neko-puppet 加 Live Mode | 订阅 TrackingService + 迁入 `puppetMapping` |
| P1 | neko-model 加 Live Mode | 订阅 TrackingService + 迁入 `vmcMapping` |
| P2 | 删除 neko-live 重复渲染器 | 移除 AvatarViewer / PuppetViewer / Viewport3D |
| P2 | neko-live 改为场景合成器 | 多源输入 + 录制/推流，不再自渲染 |
| P3 | 共享 VRM loader 提取 | `@neko/shared` 消除 neko-model 剩余 VRM 加载重复 |

## 不变量

1. **Rust engine 是设备数据 SSOT** — TS 层不重复设备枚举/通信逻辑，只做客户端封装
2. **实时输入在 engine 内闭环** — 控制信号不经过 Webview 中转
3. **手写板通过 PointerEvent** — 不走 engine 路径
4. **设备管理用原生 VSCode UI** — 不为管理面建 Webview
5. **neko-live 页面由 VSCode 管** — 不自建路由/tab 框架，统一 session 状态而非页面
6. **渲染器不跨子包复制** — 各子包用自己的渲染器，neko-live 不重复实现 VRM/Puppet 渲染
7. **TrackingService 是共享服务** — 不绑定任何特定子包，所有消费者平等订阅
8. **设备管理面板与 neko-live 面板不合并** — 职责不同，通过 DeviceManager API + 命令协议协作

## 反模式

| # | 反模式 | 为什么错 | 正确做法 |
|---|--------|---------|---------|
| 1 | 新建 `neko-device` 顶层子包 | 设备管理是基础设施不是功能域，治理开销不匹配 | 放在 `neko-client/src/device/` |
| 2 | Webview 直接创建 WebSocket 到 engine | VSCode Webview 沙箱限制，无法发起网络连接 | Extension Host 代理 |
| 3 | 设备输入事件经 Webview 中转再回 engine | 多余两跳延迟 + 语义错误 | engine 进程内 broadcast 消费 |
| 4 | 为设备管理建 Webview 面板 | 交互频率低、数据简单，杀鸡用牛刀 | 原生 TreeView + QuickPick + StatusBar |
| 5 | neko-live 自建页面路由框架 | VSCode 已提供多面板机制 | 用 WebviewView + CustomEditor 组合 |
| 6 | 跨 Webview 共享 store 或同步状态 | Webview 进程隔离，共享 store 不可行 | Extension 层 LiveSessionService 做 SSOT |
| 7 | 手写板输入走 engine 代理 | 浏览器 PointerEvent 已携带全部数据，绕路无收益 | Webview 直接消费 PointerEvent |
| 8 | neko-live 保留自己的 VRM/Puppet 渲染器 | 与 neko-model/neko-puppet 95% 重复，且是劣化版本 | 删除，让消费者用自己的渲染器 |
| 9 | 跨 Webview 调用其他子包的渲染器 | 进程隔离，延迟高、耦合强 | 各子包自有 Live Mode，独立消费 TrackingService |
| 10 | 把场景合成也拆进 neko-puppet/neko-model | 场景合成是独立职责（多源编排），不属于单个编辑器 | 保留在 neko-live（瘦身后） |
| 11 | 现在就删除 neko-live | 场景合成 + 推流仍需要独立承载 | 瘦身而非删除 |
| 12 | 合并设备管理面板与 neko-live 面板 | 职责不同：设备发现 vs 创作工作流，合并逼用户跨面板操作 | 分开，通过 DeviceManager API + 命令协议协作 |

## 与既有 ADR 的关系

| ADR | 关系 |
|-----|------|
| [vscode-constraints.md](./vscode-constraints.md) | 遵循设备访问通过 engine sidecar 代理的约束 |
| [adr-xr-authoring-runtime-split.md](./adr-xr-authoring-runtime-split.md) | XR 设备客户端等该 ADR 实现后再加，归入 P3 |
| [adr-capability-protocol.md](./adr-capability-protocol.md) | 设备 API 是 engine 固有能力组（`devices:*`），不走 Capability 扩展协议 |
| [adr-asset-federation.md](./adr-asset-federation.md) | 录制产物（WebM/WAV）走 Asset Federation 管理，设备管理不涉及 |
| [adr-2d3d-unified-engine.md](./adr-2d3d-unified-engine.md) | 2D/3D 共壳分核设计；Live Mode 分别接入 puppet/model 渲染器，不新增渲染路径 |
| [adr-3d-editor-rendering-architecture.md](./adr-3d-editor-rendering-architecture.md) | neko-model R3F 渲染器承接 VRM Live Mode，不在 neko-live 重复 |
