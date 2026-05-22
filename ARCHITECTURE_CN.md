# 系统架构总览

> **Lang:** [English](./ARCHITECTURE.md) | 中文

> 本文档是 Neko Suite 的架构入口。详细的架构决策（ADR）见 [docs/architecture/](./docs/architecture/) 和 [docs/](./docs/)。

---

## 系统定位

Neko Suite 是深度集成于 VS Code 的创意工作套件，核心挑战是在 VS Code 的安全沙箱约束下，提供媒体处理、GPU 渲染等重计算能力，同时维持编辑器的响应性。

**解决方案**：Rust Sidecar 进程 + 双进程通信模型。

---

## 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        VS Code 进程                              │
│                                                                 │
│  ┌──────────────────────────────────────────────┐              │
│  │              Extension Host (Node.js)         │              │
│  │                                              │              │
│  │  neko-engine ext  neko-cut ext  neko-agent ext  ...         │
│  │       │                │               │                    │
│  └───────┼────────────────┼───────────────┼────────────────────┘
│          │ N-API          │ postMessage   │ postMessage         │
│          │         ┌──────┼───────────────┼──────┐             │
│          │         │      Webview (Browser)       │             │
│          │         │  neko-cut UI  neko-agent UI  │             │
│          │         └──────────────────────────────┘             │
└──────────┼──────────────────────────────────────────────────────┘
           │ 统一 HTTP/WebSocket (axum, 单端口)
┌──────────▼──────────────────────────────────────────────────────┐
│                   neko-engine (Rust Sidecar)                    │
│                                                                 │
│  engine-kernel:   wgpu GPU · FFmpeg 编解码 · 动画 · GPU Skinning · 导出 · 缓存 │
│  runtime-scene:  3D 场景 ECS（bevy_ecs + glTF/VRM + IK + Blend）  │
│  runtime-puppet: 2D Native Puppet ECS（Bone2D + BlendShape + MOC3 导入兼容）│
│  host-http:   axum HTTP/WebSocket 服务（统一端口）             │
│  host-napi:   Node.js N-API 绑定                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## 通信模式

### 1. Extension Host ↔ Webview：postMessage IPC

```
Webview (React)          Extension Host (Node.js)
     │                          │
     │─── postMessage ──────────▶│  处理请求（文件 IO、VSCode API）
     │◀── postMessage ───────────│  返回结果
```

Webview 运行在浏览器沙箱中，**无法直接访问文件系统或 VS Code API**，必须通过消息协议代理。消息类型定义在 `@neko/shared` 的 `types/message.ts`。

### 2. Extension Host ↔ Rust Engine：统一 HTTP/WS（EngineClient）

```
Extension Host
     │
     └─ EngineClient (@neko/neko-client, 零 vscode 依赖)
          │
          ├─ HTTP POST /v1/dispatch  →  host-http  →  engine-kernel
          │  适用：同步命令（probe、waveform、diff、extractFrame、effects）
          │
          └─ WebSocket /v1/streams/:id  →  host-http  →  engine-kernel
             适用：流式传输（H.264 推流、PCM 解码、控制命令）
```

**架构要点**：
- **统一端口**：所有扩展共享一个 neko-engine Sidecar 进程和统一端口
- **端口发现**：`vscode.commands.executeCommand('neko.engine.ensureFrameServer')` → `{ port }`
- **EngineClient 位置**：`@neko/neko-client`（非 neko-engine 子包），零 vscode 依赖
- **便捷方法**：`probe()`, `waveform()`, `diff()`, `extractFrame()`, `listEffects()`, `applyEffect()` 等

### 2.1 统一文件访问：二进制源文件由 Engine 读取

媒体、文档、模型、木偶、字幕和 Agent 附件等本地二进制源文件统一通过 `neko-engine` 的 File Access 合同处理：

```
Extension Host
  └─ EngineClient.registerFile({ filePath, purpose })
       └─ host-api FileAccessRegistry：canonicalize + allowed roots + symlink escape 检查
            └─ 返回 opaque token / size / MIME / URL

Webview / Extension
  ├─ GET /v1/files/:token                 # Range / full file
  ├─ GET /v1/files/:token/entries/*path   # EPUB/CBZ/ZIP entry
  └─ GET /v1/files/:token/resources/*path # glTF/VRM 相邻资源

Engine Action
  └─ sourceRef: { token } 或 { path }      # 在 Rust 内解析并打开文件
```

兼容别名（`/v1/preview/file/:token`, `/v1/preview/epub/:token/*path`, `source: string`）仍保留，但新增代码应优先使用 `sourceRef` 与 `EngineClient` 的 file access helper。

允许 Extension 继续读取：项目 JSON CustomDocument（`.nkv/.nkm/.nkp/.nka/.nks`）、workspace settings、preferences、sidecar text、lyrics、测试 fixture 和用户选择的生成/导出写入。禁止 Extension/Webview 重新实现媒体/模型/木偶/文档/字幕源二进制读取或 base64 转发。

### 3. Webview ↔ Rust Engine：WebSocket 直连（流媒体）

```
Webview (H264StreamClient / AudioStreamClient)
     │ WebSocket
     ▼
neko-engine axum WebSocket 端点
     │
     ▼
engine-kernel decoder → GPU 解码帧 → H.264 NAL / PCM Float32
```

流媒体走 WebSocket 绕过 Extension Host，避免帧数据在 Node.js 层多次拷贝。

---

## 包依赖图

```
@neko/proto (IDL 唯一来源)
     ↓ 生成
@neko/shared (neko-types)    ←── 所有包依赖（Logger/i18n/Theme/Errors，零内部依赖）
@neko/neko-client            ←── EngineClient + 流媒体客户端（零内部依赖）
     ↑
neko-engine/host-napi      ←── N-API 绑定（独立编译）
     ↑
neko-engine/extension        ←── 唯一 Sidecar 管理 + 统一 HTTP/WS 服务器
     ↑ (通过 EngineClient HTTP/WS 通信)
neko-preview  →  @neko/neko-client
neko-cut      →  @neko/neko-client + neko-tools + neko-preview
neko-agent    →  @neko/neko-client + neko-tools + neko-preview
neko-tools    →  @neko/neko-client
neko-canvas   →  neko-engine + neko-tools + neko-preview
neko-model    →  neko-engine + @neko/neko-client + neko-tools + neko-preview
neko-sketch   →  neko-engine + @neko/neko-client + @neko/shared
neko-story    →  @neko-story/parser + @neko/shared
neko-assets   →  @neko/asset + @neko/shared
```

---

## 核心数据流

### 视频播放流

```
用户点击播放
  │
  ▼
Extension Host
  └── PreviewService / MediaService
        └── EngineClient.createStream() → HTTP POST /v1/dispatch
              └── 硬件解码 → H.264 NAL 流 (WebSocket /v1/streams/:id)
                    │
                    ▼
Webview H264StreamClient
      └── WebCodecs VideoDecoder
            └── Canvas 渲染帧
```

音频播放使用同一条 Engine-first 原则，但 Webview 侧消费的是 `AudioStreamClient`
和 PCM Web Audio 输出。调用方必须显式传递媒体类型语义：音频文件走 audio
探测与 audio stream，视频文件走 video 探测并按需附加 audio stream，不能让
Webview 组件自己猜测文件路径或绕过 `@neko/neko-client`。

Canvas 中同一资产在 inline 节点和 overlay 预览之间切换时，播放事实由
Canvas Webview 的 playback store 统一协调：运行时 surface id、当前时间和
handoff 请求不写入 `.nkc`，Extension Host 只负责按消息启动/停止 Engine
stream 和释放资源。

### 视频导出流

```
用户触发导出
  │
  ▼
Extension Host
  └── ExportService
        └── EngineClient.dispatch() → HTTP POST /v1/dispatch
              ├── GPU 渲染管线 (wgpu compositor + EffectDispatcher)
              ├── 硬件编码 (VideoToolbox/NVENC/VAAPI)
              └── 音视频混流 → .mp4 文件
```

### 分镜创作流水线（Script → Canvas → Cut）

```
neko-story 剧本（.fountain）
  │
  ├── 路径 A：机械式（import_script_to_canvas 工具）
  │     └── createStoryboardPayload(mode=mechanical) → ~lineSpan/10 ShotNodes
  │
  ├── 路径 B：语义式（story → agent → canvas 流水线）
  │     └── ScriptIndex（稳定 sceneId + 元数据）
  │           → GenerateScenePlan / GenerateShotPlan（确定性规划器）
  │           → neko-agent parseStoryboard（IStructuredStoryPlanner 优先）
  │           → importStoryboardToCanvas 流水线阶段
  │           → NekoCanvasAPI.storyboard.import(mode=semantic)
  │
  ├── 路径 F：完整视频创作（neko.story.startVideoCreation → flowF）
  │     └── parseStoryboard → importStoryboardToCanvas → generatePrompts
  │           → generatePilot → batchGenerate → qualityGate → arrangeOnTimeline
  │
  ▼
neko-canvas
  ├── GenerationPromptPanel
  │     └── neko.agent.buildPrompt（中文描述 → 结构化英文 prompt）
  │     └── neko.agent.generateForNode → BatchGenerationScheduler
  │           └── platform.media.generateImage → waitForTask → fetch base64
  │                 └── ShotNode.generatedImage 更新
  ├── GalleryNode（候选多视图 layout：三视图/四视图/九宫格）
  ├── 7 Canvas MCP Tools（canvas_list/get/update/create_node +
  │   generate_image/batch + set_project_generation_config）
  └── 导出：neko.cut.importStoryboard
          │ postMessage → webview
          ▼
    neko-cut 时间线（ShotNode → VideoClip 轨道段）
```

**共享分镜工具** (`@neko/shared/utils/storyboardPlanner.ts`):
- `createStoryboardPayload()` — 从 `ScriptIndex` 构建 `CanvasStoryboardPayload`（机械式或语义式）
- `applyStoryboardPayloadToCanvas()` — 将 payload 应用到 canvas API，创建场景/镜头节点

**Canvas 节点类型全览**（@neko/shared `types/canvas.ts`）：

| 节点类型 | 用途 |
|---------|------|
| `shot` | 分镜帧（ShotScale + GeneratedImageVersion[] + 候选导航）|
| `scene` | 场景横向容器（SceneGroupNode，按场景聚合 ShotNode）|
| `gallery` | 多视图画廊（5 种 layout + costumeLabel + @引用 + 批量生图）|
| `script` | 剧本节点（TOC 目录 + getScriptIndex → 点击跳转 SceneGroupNode）|
| `document` | 文档节点（PDF/DOCX/EPUB 封面缩略图 + openDocument → vscode.open）|
| `model` | AI 模型节点（reference/workflow 双模式 + checkModelInstalled）|
| `canvas-embed` | 嵌套画布引用（P3 规划中，.nkc 缩略图 + 双击打开）|

### AI Agent 工作流

```
用户自然语言输入
  │
  ▼ UserPromptSubmit hooks（Shell，动态注入上下文）
  │
  ▼
Webview 对话 UI
  │ postMessage（普通消息 / /slash-command）
  ▼
Extension Host
  ├── SlashCommandHandler — 解析 /command，应用 SkillInjection 到 AgentSession
  └── AgentManager — 每个会话独立 AgentRunner，LRU 最多 10 个实例
        │
        ▼
  AgentSession（Extension + CLI 统一抽象）
  │  system prompt = base + [累积注入的 Skill 提示词]  ← Session 级，永久写入，见下方注①
  │
  ▼  PreToolUse hooks 串联（Shell → TS PermissionHooks）
  │
  AgentExecutor（ReAct 循环）
  │  工具列表 = ToolInjectionManager.getToolsForTurn()  ← 每 turn 重算，见下方注②
  │              ├── always layer：核心工具（Read/Write/Bash/Grep + 元工具）
  │              │                 + alwaysActive ToolSets 的工具
  │              └── dynamic layer：手动激活的 ToolSets 的工具
  │                                 （LLM 调用 ActivateToolSet / Skill 自动联动）
  │
  ├── Claude / OpenAI API（流式，@neko/platform LLM 路由）
  └── 工具调用 → ToolRegistry.execute()
        └── 时间线工具 → EngineClient → neko-engine 时间线变更
```

**三套注入机制对比**（重要，勿混淆）：

| 机制 | 实现位置 | 注入时机 | 是否可撤销 | 上下文感知 |
|------|---------|---------|-----------|-----------|
| **① Skill 系统提示词** | `applySkillInjection()` 追加到 `_history[0]` | Session 级一次性写入 | ❌ 无删除路径 | ❌ 不受 token 预算管控 |
| **② ToolSet 工具列表** | `getToolsForTurn()` 每次重算 | 每 turn 动态计算 | ✅ 实时激活/停用 | ✅ always/dynamic 双层 token 预算 |
| **③ ContextItem** | `ContextManager`（MemoryHooks 使用） | 每 turn 注入为独立消息 | ✅ LRU 淘汰 | ✅ 三层 size budget（turn/session/persistent）|

> **注①**：`applySkillInjection()` 直接 mutate `_history[0].content`，多次调用（多个 slash command）会累积追加，无上限。`compressContext()` 不压缩 `_history[0]`，系统提示词可能随会话线性增长。唯一重置路径：`configure({ systemPrompt })` 整体替换。
>
> **注②**：`SkillService.clearActiveSkill()` 会停用关联 ToolSets（②），但**不会**从 `_history[0]` 移除已注入的提示词文本（①）。两套机制的生命周期不对称。

**neko-agent 内部三子系统**：

| 子系统 | 组件 | 职责 |
|--------|------|------|
| **Tool** | ToolRegistry, ToolCategoryRegistry, ToolInjectionManager, ToolGroupRegistry | 工具注册/执行/分层注入/集合管理 |
| **Skill** | SkillRegistry, SkillService, SkillMatcher, SkillInjector, ToolGuard | 技能发现/应用/提示词注入/工具守卫 |
| **Hook** | PermissionHooks, MemoryHooks, ValidationHooks, SettingsHookLoader | TS 进程内拦截 + Shell 外部钩子串联 |

**概念职责边界**：
- `Tool` = 原子能力（执行函数）
- `ToolSet` = 工具可见性模块（按需激活，减少 token）
- `Skill` = 行为模式（system prompt + 可选工具守卫 + 关联 ToolSets）
- `Hook` = 执行拦截（Shell 外部与 TS 内部串联执行）
- `SlashCommand` = 用户触发的工作流（`/slash-command` → 注入 Skill 提示词）

---

## 关键架构决策（ADR）

| 领域 | 文档 | 核心决策 |
|------|------|---------|
| 统一引擎架构 | [adr-unified-engine.md](./docs/adr-unified-engine.md) | EngineClient HTTP dispatch 统一所有 Engine 调用，端口从 3 降为 1 |
| 横切关注点 | [architecture/adr-cross-cutting-concerns.md](./docs/architecture/adr-cross-cutting-concerns.md) | Logger/i18n/Theme/Error 统一在 @neko/shared，三层隔离 |
| AI Agent 架构 | [plans/2026-03-10-neko-agent-skill-tool-refactor-design.md](./docs/plans/2026-03-10-neko-agent-skill-tool-refactor-design.md) | ToolSet/Skill/Hook 三子系统职责划分；Shell hooks 桥接到 PermissionHooks；Skill 联动激活 ToolSets |
| 媒体流传输 | [diff.md §4.1](./docs/diff.md) | H.264 + PCM 流式传输，非逐帧提取 |
| Diff 并行化 | [diff.md §六](./docs/diff.md) | SSIM‖PSNR 并行 + 早期波形 + 消息队列去阻塞 |
| 跨语言架构 | [architecture/cross-language-architecture.md](./docs/architecture/cross-language-architecture.md) | Rust 引擎为数据模型权威，TS 仅负责 UI |
| 共享包设计 | [architecture/shared-packages-design.md](./docs/architecture/shared-packages-design.md) | @neko/shared 通过子路径分层导出 |
| 资产管理 | [architecture/asset-management-design.md](./docs/architecture/asset-management-design.md) | 统一 AssetManifest + Handler 注册表模式 |
| 3D 能力 | *已内化* | bevy_ecs 独立 crate + runtime-scene + R3F 前端；GPU Skinning（双管线 skinned/non-skinned）；FABRIK/CCD/TwoBone IK 求解器；动画混合/Crossfade |
| 2D 能力 | *已内化* | neko-sketch（绘画）+ neko-puppet（`.nkp` v2 native Bone2D + BlendShape 骨骼动画，独立子插件）；runtime-puppet（bevy_ecs native 2D puppet runtime + MOC3/Live2D 导入转换兼容）；`.nkentity` v2 `puppet-bone` 绑定；Agent/资产/导出首版；WS 实时流供 neko-live |
| Live Compositor | [architecture/adr-unified-viewport-protocol.md](./docs/architecture/adr-unified-viewport-protocol.md) | neko-live 通过 `ViewportShell` 消费引擎 Live Compositor H.264 合成流；设备只暴露授权 `sourceRef`，本地 R3F/Puppet/canvas 路径仅作为 non-authoritative fallback |
| 角色编辑 | *已内化* | 2D/3D 捏脸、动作调整、绘制、建模能力评估；标准面部参数模板（3D 22 参数 / 2D 32 参数）；共享关键帧时间线；.nkm 项目格式；IK 骨骼交互编辑 |
| 面板放置策略 | [architecture/panel-placement.md](./docs/architecture/panel-placement.md) | 编辑器绑定面板内嵌 Webview，全局面板用 VSCode 原生容器；消除侧栏幽灵数据冲突 |
| 外部设备访问 | [architecture/device-access.md](./docs/architecture/device-access.md) | Webview 沙箱限制硬件 API，通过 neko-engine Rust sidecar 代理设备 I/O（cpal/nokhwa/midir/gilrs） |
| Engine 插件化（RFC） | [architecture/engine-plugin-rfc.md](./docs/architecture/engine-plugin-rfc.md) | 能力插件化而非内核插件化；优先开放 shader/model/format/device/exporter/connector 等受控扩展点；市场负责分发，Engine Host 负责激活 |
| Engine Runtime 分层 | [architecture/engine-runtime-layering.md](./docs/architecture/engine-runtime-layering.md) | runtime 按包拆分、默认共用一个 Host 应用；Video/2D/3D/Docs/Device/ML 维持单宿主；Game/Sim/XR 未来按需要升格独立 sidecar |
| 创作上下文压缩 | [architecture/creative-context-compression.md](./docs/architecture/creative-context-compression.md) | 7 级优先级语义分类压缩：用户消息永久保留，创作决策/版本锚点/迭代链/资产状态/审美偏好分层摘要 |
| 消融实验框架 | [architecture/ablation-experiment-framework.md](./docs/architecture/ablation-experiment-framework.md) | AblationToggles → AgentSessionConfig 映射 + MetricsHooks 指标采集，零侵入现有子系统 |
| Agent 媒体架构 | [architecture/agent-media-architecture.md](./docs/architecture/agent-media-architecture.md) | Story 分镜职责边界；Agent 自足性；GeneratedAsset 磁盘存储 + JSON 引用；DragDropBroker 跨插件传递；Send-to-Agent 统一协议（文件级+内容级，零 base64）；MediaPreprocessor 自动缩放/抽帧 |
| Story-Agent-Canvas 职责 | [architecture/story-agent-canvas-boundary.md](./docs/architecture/story-agent-canvas-boundary.md) | Agent-first 架构下的职责收敛：story 负责剧本事实与审阅入口，agent 负责编排，canvas 负责正式分镜工作台；定义轻量分镜表的目标、字段和非目标 |
| 统一文件访问 | [architecture/engine-file-access.md](./docs/architecture/engine-file-access.md) | FileAccessRegistry + `/v1/files/*` + `sourceRef`，二进制源文件由 Engine 读取，Extension 仅保留项目 JSON/设置/sidecar 等文本语义 |
| 文档预览 | [architecture/document-preview.md](./docs/architecture/document-preview.md) | PDF/EPUB/CBZ/DOCX 自建预览器；瀑布流虚拟滚动 + 双栏模式；Webview 直连 neko-engine HTTP（无 postMessage 中继）；epub.js fetchForEpub 替代 XHR |
| 路径体系 | *已内化* | 项目文件只存相对路径 + `${VAR}/path`；PathResolver(@neko/shared L0) 统一解析；Rust ProjectContext(resolve/validate)；EngineClient/PreviewFileServer 自动展开变量；变量来源: neko/settings.json（Git 跟踪）+ .neko/settings.local.json（gitignore）|

---

## EditOperation 指令系统

所有编辑器共享统一的 `EditOperation` 抽象（定义在 `@neko/shared` 的 `operations/`），实现操作级别的 undo/redo、AI 集成和审计追踪。

```
Webview (用户操作)
  │
  ├─ 构建 EditOperation（type + payload + before + meta）
  ├─ 应用到本地状态（applyOperation）
  ├─ 记录到 undo 栈（invertOperation 生成逆操作）
  └─ postMessage('operationApplied', operation)
        │
        ▼
Extension Host
  ├─ 增量更新内存缓存（applyOperation）
  ├─ 触发 dirty 事件（onDidChangeCustomDocument）
  └─ 可选：转发给 AI Agent 分析
```

**操作域覆盖**：

| 编辑器 | 操作前缀 | 接入方式 |
|--------|---------|---------|
| neko-cut | `track.*` / `element.*` | editorStore 内置 dispatch |
| neko-audio | `audio.effect.*` / `audio.marker.*` | audioProjectStore（dispatch + undo/redo） |
| neko-canvas | `canvas.node.*` / `canvas.connection.*` | canvasOperationStore 桥接层 |
| neko-sketch | `sketch.layer.*` / `sketch.stroke.*` | sketchOperationStore 桥接层 |

---

## 设计原则

**SOLID 驱动**：每个模块单一职责，面向接口编程，通过依赖注入解耦。

**权威来源单一**：
- 类型契约：`@neko/proto`（.proto IDL）
- 共享基础设施：`@neko/shared`（Logger/i18n/Theme/Errors，三层隔离）
- 引擎通信：`@neko/neko-client`（EngineClient + 流媒体客户端，零 vscode 依赖）
- 计算逻辑：`neko-engine`（Rust，TS 层不重复计算逻辑）

**双进程隔离**：每个扩展分 `extension/`（Node.js Host）和 `webview/`（Browser）两层，通过 postMessage 通信。

**渐进式架构**：Extension Pack 模式，各扩展可独立安装，按需激活。

---

## 架构红线（宿主隔离）

> **背景**：当前主线是 VS Code 集成（覆盖 90% AI 创作场景），未来可能演进为独立专业 IDE（Neko Studio：Native overlay HDR、多视口、OpenXR、零拷贝 GPU）。为避免未来切换宿主时被迫 fork 或大规模重构，下列红线**自现在起对所有 PR 强制生效**。

### 三层宿主隔离模型

```
Layer 3: 前端宿主（可替换）
  ├─ VS Code Extension (主线 P0)：Webview 沙箱 + SDR + P3 + WebCodecs
  └─ Neko Studio (未来)         ：Native window + HDR + 多视口 + OpenXR
        │
        ▼
Layer 2: 客户端 SDK（@neko/neko-client，宿主无关）
  • EngineClient / 流媒体客户端 / detectCapabilities
  • 零 vscode / 零 electron / 零 tauri 依赖
        │
        ▼
Layer 1: 引擎（neko-engine，SSOT，宿主无关）
  • 完整能力始终可用（HDR/10bit/EXR/Rgba16Float）
  • 独立进程，host-cli 已支持脱离 VSCode 运行
```

### 红线清单（违反即阻断 PR）

| # | 红线 | 反例 | 正例 |
|---|------|------|------|
| **R1** | 引擎不感知宿主 | `fn render_for_vscode_webview()` | `fn render(output: OutputFormat, color_pipeline: ColorPipeline)` |
| **R2** | `@neko/neko-client` 不依赖 vscode/electron/tauri | `import * as vscode from 'vscode'` | 通过参数注入端口/能力 |
| **R3** | 引擎能力不为宿主限制阉割 | 因 VSCode 不显示 HDR 就删掉 HEVC Main10 编码 | 引擎保留全格式，宿主按 capabilities 选择 |
| **R4** | 显示路径与导出路径解耦 | 预览精度限制导出精度 | VSCode 预览 SDR + 导出 HEVC Main10 母版 |
| **R5** | Webview 组件不直接调用 `vscode.*` | `acquireVsCodeApi().postMessage(...)` 散落各处 | 封装 `HostBridge` 适配层，组件用抽象接口 |
| **R6** | 文件路径走 PathResolver | `vscode.workspace.fs.readFile()` 跨层使用 | `PathResolver`（@neko/shared L0）+ 适配层翻译 |
| **R7** | 显示能力走 `HostCapabilities` 抽象 | 组件 `if (isVSCode)` 硬编码 | `if (capabilities.display.colorSpaces.includes('rec2100-pq'))` |

### HostCapabilities 契约（关键抽象）

`@neko/neko-client/src/host-capabilities.ts` 暴露统一能力描述，所有"宿主能让我做什么"的判断都走这一层：

```typescript
interface HostCapabilities {
  readonly hostType: 'vscode-webview' | 'electron-native' | 'tauri-native' | 'browser';
  readonly display: {
    colorSpaces: ('srgb' | 'display-p3' | 'rec2100-pq' | 'rec2100-hlg')[];
    bitDepth: 8 | 10 | 16;
    maxLuminance: number;  // nits
  };
  readonly codec: {
    h264: boolean; h265Main10: boolean;
    av1_8bit: boolean; av1_10bit: boolean;
  };
  readonly windowing: {
    nativeOverlay: boolean; multiViewport: boolean; openXR: boolean;
  };
  readonly fileIO: {
    streamingRead: boolean;       // VSCode 必须走 engine HTTP
    largeFileLimit: number;       // VSCode webview 全量加载限制
  };
}
```

VSCode Webview 与未来 Studio 的能力差异通过**不同 `HostCapabilities` 实现**披露，引擎和组件代码不变。

### 三契约（显示 / 数据 / 导出）

| 契约 | 边界 | VSCode 当前 | 未来 Studio |
|------|------|------------|------------|
| **显示契约** | webview 显示端 | 8bit sRGB / display-p3 | + 10bit HDR (rec2100-pq/hlg) |
| **数据契约** | 引擎内部 + 项目文件 | `Rgba16Float` 全保留 | 同 |
| **导出契约** | 用户导出路径 | 全格式（HEVC Main10 / EXR / ProRes） | 同 |

**核心原则**：显示精度限制不能传染到数据精度和导出精度。VSCode 用户在 SDR 预览下编辑 HDR 内容并导出 HDR 母版,迁移到 Studio 是**纯增量**，不丢历史项目。

### 演进路线（路线图，非承诺）

| 阶段 | 时间窗 | 内容 | 触发条件 |
|------|-------|------|---------|
| 阶段 1 | 现在 - 6mo | VSCode 主线：H.264 SDR + P3 广色域 + tone-mapping + HostCapabilities 抽象 | — |
| 阶段 2 | 6-12mo | 专业能力埋点：XR 桌面预览 / 高级 PBR / 调色基础 | 阶段 1 商业化验证 |
| 阶段 3 | 12-24mo | Neko Studio 独立 IDE（Tauri/Electron）：Native HDR + 多视口 + OpenXR | 阶段 2 付费意愿验证 |
| 阶段 4 | 可选 | Neko Cloud(Web) / iPad 版本 | 战略需要 |

**关键不变量**：阶段 3 的 Studio 与 VSCode 共用同一个 Rust engine、同一个 EngineClient，**只是新的 Layer 3 实现**。

---

## 技术栈一览

| 层级 | 技术选型 | 理由 |
|------|---------|------|
| Frontend | React 18 + Zustand + Tailwind + Vite | 生态成熟，Slice 模式便于测试 |
| Extension | VS Code Extension API + TypeScript + esbuild | 平台要求 |
| Media Engine | Rust + wgpu + FFmpeg + axum + tokio | 零 GC、跨平台 GPU、成熟编解码 |
| AI | Vercel AI SDK + Claude/OpenAI + MCP | 多模型抽象，流式响应 |
| Protocol | Protobuf IDL（手动维护） | 跨语言类型契约 |
| Streaming | H.264 + PCM over WebSocket | 低延迟，浏览器原生支持（WebCodecs） |
| Build | pnpm 10 + Turborepo 2 | Monorepo 并行构建 |
| Testing | Vitest v4.0.18 + cargo test | 覆盖 TS 和 Rust 两端，统一覆盖率阈值 |

---

## 扩展激活依赖链

```
neko-engine ◀── neko-preview ◀── neko-cut
                              ◀── neko-agent
                              ◀── neko-canvas ◀── neko-sketch
neko-tools  ◀── neko-cut
            ◀── neko-agent
```

`neko-engine` 是所有媒体处理扩展的基础，必须最先激活。所有扩展通过 `EngineClient`（`@neko/neko-client`）与 neko-engine 的统一 HTTP/WS 端口通信。

---

## 跨扩展 AI 联动

Neko Suite 各扩展通过两种机制协同：**Exported API**（类型安全的双向调用）和 **VSCode 命令总线**（松耦合的单向触发）。

### 通信模式

```
neko-canvas / neko-cut / neko-story
  │
  ├─ [模式 A] vscode.extensions.getExtension<T>(id).exports
  │     → 直接调用类型化 API（NekoCanvasAPI / NekoCutAPI / NekoStoryAPI）
  │
  └─ [模式 B] vscode.commands.executeCommand('neko.agent.*', payload)
        → 命令总线 IPC（松耦合，neko-agent 未安装时静默失败）
```

### Exported API 契约（`@neko/shared/types/extension-api.ts`）

| 扩展 | 导出类型 | 关键命名空间 |
|------|---------|-------------|
| neko-canvas | `NekoCanvasAPI & ISkillProvider` | `asset` / `canvas` / `storyboard` / `nodes` / `events` |
| neko-cut | `NekoCutAPI & ISkillProvider` | `timeline` / `ai` |
| neko-story | `NekoStoryAPI` | `parseScript` / `convertToTimeline` / `getScriptIndex` / `getCharacterRegistry` / `resolveCharacter` / `generateScenePlans` / `generateShotPlan` |
| neko-auth | `NekoAuthAPI` | `getSession` / `onDidChangeSession` |

### 跨扩展命令协议

neko-agent 注册以下命令供其他扩展调用，命令未注册时静默 no-op：

| 命令 | 调用方 | 功能 |
|------|-------|------|
| `neko.agent.generateForNode` | neko-canvas `BatchGenerationScheduler` | 触发平台媒体服务生图，返回 `{ dataUrl: string }` |
| `neko.agent.reportGenerationProgress` | neko-canvas `BatchGenerationScheduler` | 将生成进度广播至 Agent Chat Webview |
| `neko.agent.registerSlashCommands` | neko-canvas / neko-cut 等 | 向 Agent 聊天面板注册 `/slash` 命令 |
| `neko.agent.internalChat` | 任意扩展 | 复用已配置的 LLM 服务进行推理 |
| `neko.agent.sendContext` | neko-canvas / neko-story | 注入上下文 payload（AgentContextChip UI + story-selection / canvas-selection）|
| `neko.agent.startPipeline` | neko-story | 启动流水线流程（flowF 等），传入结构化参数（source、importToCanvas、eventCommand）|
| `neko.agent.buildPrompt` | neko-canvas `GenerationPromptPanel` | 中文场景描述 → 结构化英文 prompt（含角色/景别/情绪）|
| `neko.story.applyInlineDiff` | neko-agent | 对剧本文件应用 WorkspaceEdit（接受/拒绝确认）|
| `neko.story.startVideoCreation` | 用户 / neko-story | 从当前剧本场景启动标准视频创作流程（flowF）|
| `neko.story.handlePipelineEvent` | neko-agent pipeline | 将流水线事件回写到 StorySceneStateStore，用于状态跟踪 |
| `neko.canvas.importStoryboard` | neko-story / neko-agent | 将 `CanvasStoryboardPayload` 导入活动画布，创建场景/镜头节点 |

### ISkillProvider — 技能发现接口

实现了 `ISkillProvider` 的扩展，其 `getSkills()` 会被 neko-agent 的 `ListPluginSkills` 工具聚合并暴露给 LLM：

```typescript
// @neko/shared
interface ISkillProvider {
  getSkills(): readonly SkillDef[];
}
interface SkillDef {
  id: string;
  name: string;
  description: string;       // LLM 可读的能力描述
  icon?: string;             // VSCode codicon
  command: string;           // 执行该能力的 VSCode 命令 ID
  tags?: readonly string[];  // 用于过滤（'generation' | 'export' | ...）
}
```

当前实现了 `ISkillProvider` 的扩展：

| 扩展 | Skills |
|------|--------|
| neko-canvas | `batch-generate` / `export-storyboard` / `generate-selected` |
| neko-cut | `generate-video-clip` / `transcribe-audio` |

### 生图数据流（Canvas → Agent → Platform）

```
BatchGenerationScheduler（Extension Host）
  │
  ├─ callAgent()
  │     └─ executeCommand('neko.agent.generateForNode', { nodeId, prompt, ratio, ... })
  │                │
  │                ▼ neko-agent Extension Host
  │           platform.media.generateImage({ prompt, ratio, count })
  │                │
  │                ▼ @neko/platform → AI 媒体服务（Replicate / ComfyUI / ...）
  │           platform.media.waitForTask(taskId, timeout=3min)
  │                │
  │                ▼ fetch(output.url) → base64
  │           return { dataUrl: 'data:image/png;base64,...' }
  │
  ├─ reportToAgent(task, status)
  │     └─ executeCommand('neko.agent.reportGenerationProgress', { nodeId, taskId, status, total })
  │                │
  │                ▼ chatViewProvider.postMessage({ type: 'generationProgress', ... })
  │                      → Chat Webview 实时进度卡片
  │
  └─ onProgress('done', dataUrl)
        → Webview postMessage → ShotNode 更新生成图片
```
