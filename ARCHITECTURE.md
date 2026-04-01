# 系统架构总览

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
│  native-core:   wgpu GPU · FFmpeg 编解码 · 动画 · 导出 · 缓存    │
│  native-scene:  3D 场景 ECS（bevy_ecs + glTF/VRM loader）        │
│  native-puppet: 2D 骨骼 ECS（bevy_ecs + inox2d + bevy_animation）│
│  native-http:   axum HTTP/WebSocket 服务（统一端口）             │
│  native-napi:   Node.js N-API 绑定                              │
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
          ├─ HTTP POST /v1/dispatch  →  native-http  →  native-core
          │  适用：同步命令（probe、waveform、diff、extractFrame、effects）
          │
          └─ WebSocket /v1/streams/:id  →  native-http  →  native-core
             适用：流式传输（H.264 推流、PCM 解码、控制命令）
```

**架构要点**：
- **统一端口**：所有扩展共享一个 neko-engine Sidecar 进程和统一端口
- **端口发现**：`vscode.commands.executeCommand('neko.engine.ensureFrameServer')` → `{ port }`
- **EngineClient 位置**：`@neko/neko-client`（非 neko-engine 子包），零 vscode 依赖
- **便捷方法**：`probe()`, `waveform()`, `diff()`, `extractFrame()`, `listEffects()`, `applyEffect()` 等

### 3. Webview ↔ Rust Engine：WebSocket 直连（流媒体）

```
Webview (H264StreamClient / AudioStreamClient)
     │ WebSocket
     ▼
neko-engine axum WebSocket 端点
     │
     ▼
native-core decoder → GPU 解码帧 → H.264 NAL / PCM Float32
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
neko-engine/native-napi      ←── N-API 绑定（独立编译）
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
| 3D 能力 | [architecture/3d-capability-analysis.md](./docs/architecture/3d-capability-analysis.md) | bevy_ecs 独立 crate + native-scene + R3F 前端，不用 Bevy 全框架 |
| 2D 能力 | [architecture/2d-capability-analysis.md](./docs/architecture/2d-capability-analysis.md) | native-puppet（bevy_ecs + inox2d + bevy_animation），替代 Spine/Live2D；WS 实时流供 neko-live |
| 面板放置策略 | [architecture/panel-placement.md](./docs/architecture/panel-placement.md) | 编辑器绑定面板内嵌 Webview，全局面板用 VSCode 原生容器；消除侧栏幽灵数据冲突 |
| 外部设备访问 | [architecture/device-access.md](./docs/architecture/device-access.md) | Webview 沙箱限制硬件 API，通过 neko-engine Rust sidecar 代理设备 I/O（cpal/nokhwa/midir/gilrs） |
| 创作上下文压缩 | [architecture/creative-context-compression.md](./docs/architecture/creative-context-compression.md) | 7 级优先级语义分类压缩：用户消息永久保留，创作决策/版本锚点/迭代链/资产状态/审美偏好分层摘要 |
| 消融实验框架 | [architecture/ablation-experiment-framework.md](./docs/architecture/ablation-experiment-framework.md) | AblationToggles → AgentSessionConfig 映射 + MetricsHooks 指标采集，零侵入现有子系统 |

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
| neko-canvas | `NekoCanvasAPI & ISkillProvider` | `asset` / `canvas` / `nodes` / `events` |
| neko-cut | `NekoCutAPI & ISkillProvider` | `timeline` / `ai` |
| neko-story | `NekoStoryAPI` | `parseScript` / `convertToTimeline` / `getScriptIndex` |
| neko-auth | `NekoAuthAPI` | `getSession` / `onDidChangeSession` |

### 跨扩展命令协议

neko-agent 注册以下命令供其他扩展调用，命令未注册时静默 no-op：

| 命令 | 调用方 | 功能 |
|------|-------|------|
| `neko.agent.generateForNode` | neko-canvas `BatchGenerationScheduler` | 触发平台媒体服务生图，返回 `{ dataUrl: string }` |
| `neko.agent.reportGenerationProgress` | neko-canvas `BatchGenerationScheduler` | 将生成进度广播至 Agent Chat Webview |
| `neko.agent.registerSlashCommands` | neko-canvas / neko-cut 等 | 向 Agent 聊天面板注册 `/slash` 命令 |
| `neko.agent.internalChat` | 任意扩展 | 复用已配置的 LLM 服务进行推理 |

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
