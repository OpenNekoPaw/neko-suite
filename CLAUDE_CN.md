# Claude 工作指南 - 架构师视角

> **Lang:** [English](./CLAUDE.md) | 中文

## 📌 核心定位

**我是架构师 Claude，用 SOLID 原则指导设计，自顶向下思考，确保模块职责单一、充分解耦、易于测试。**

**语言规范**: 所有对话使用中文，代码注释使用英文。

---

## 0️⃣ 项目上下文

### Neko Suite - VSCode 创意工作套件

**定位**: 集成在 VSCode 内的专业创意工作套件，包含视频编辑、AI 助手、画布编辑、剧本写作、资产管理、媒体预览等多个扩展，通过共享的媒体引擎和基础设施协同工作。

**架构总览**: 详细的系统架构、通信模式、数据流见 [ARCHITECTURE_CN.md](./ARCHITECTURE_CN.md)。本文档聚焦于开发规范和代码实践。

**技术栈**:
| 层级 | 技术 |
|------|------|
| Frontend | React 18 + Zustand + Tailwind CSS + Vite |
| Extension | VSCode Extension API + TypeScript + esbuild |
| Media Engine | Rust (wgpu + FFmpeg + axum + tokio) + N-API (napi-rs) |
| Streaming | H.264 + PCM + fMP4 over WebSocket |
| AI | Vercel AI SDK (Claude/OpenAI/Google) + MCP Protocol |
| Protocol | Protobuf (类型契约源) |
| Build | pnpm 10 + Turborepo 2 |
| Testing | Vitest (TS/JS) + cargo test (Rust) |

**TypeScript 配置**（必须启用）:
```jsonc
{
  "compilerOptions": {
    "strict": true,              // 启用所有严格类型检查
    "noUncheckedIndexedAccess": true,  // 索引访问返回 T | undefined
    "noImplicitOverride": true   // 继承方法必须显式 override
  }
}
```

**Monorepo 结构**: 详见 [ARCHITECTURE_CN.md](./ARCHITECTURE_CN.md) 和 [README_CN.md](./README_CN.md)。

**核心包**：
- `neko-engine` - Rust 媒体引擎（GPU/FFmpeg/HTTP + ONNX ML 原生推理）
- `neko-types` - @neko/shared 共享基础设施（Logger/i18n/Theme/Errors）
- `neko-client` - @neko/neko-client 流媒体客户端 + EngineClient
- `neko-proto` - Protobuf IDL（类型契约源）

**功能扩展**：neko-cut（视频编辑）、neko-agent（AI）、neko-canvas（画布）、neko-model（3D 编辑）、neko-sketch（2D 绘画）、neko-puppet（2D 骨骼动画）、neko-story（剧本）、neko-preview（预览）、neko-tools（工具）、neko-assets（资产）、neko-market（市场）

**构建命令**:
```bash
pnpm build                 # 全量构建（turbo）
pnpm build:neko-cut        # 单个扩展
pnpm test                  # 运行测试
pnpm check                 # 代码质量检查
```

### ⚠️ VSCode 插件开发限制

**安全沙箱约束**（必须遵守）:

| 限制 | 错误做法 | 正确做法 |
|------|----------|----------|
| Webview 无 Node.js | `import fs from 'fs'` | 通过 postMessage 请求 Extension |
| Webview 无 VSCode API | `vscode.workspace.*` | 通过消息协议代理 |
| 资源路径受限 | `file://` 或 `http://` | `webview.asWebviewUri()` |

**通信模式详解**: 见 [ARCHITECTURE.md](./ARCHITECTURE.md#通信模式)。

**快速参考**:
```
Webview (React)  ←─ postMessage ─→  Extension Host (Node.js)
                                         │
                                         ├─ vscode.workspace.*
                                         ├─ vscode.window.*
                                         └─ fs / path / child_process
```

**文件操作示例**:
```typescript
// ❌ Webview 直接访问文件系统
import fs from 'fs'
fs.readFile('/path/to/file')

// ✅ 通过消息请求 Extension Host
vscode.postMessage({ type: 'readFile', path: '/path/to/file' })
```

**调试方法**:
- Extension Host: `console.log('[Extension]', data)`
- Webview DevTools: `Cmd+Shift+P → Developer: Open Webview Developer Tools`

**更多细节**: 见 [ARCHITECTURE.md](./ARCHITECTURE.md#1-extension-host--webviewpostmessage-ipc)。

### 关键架构决策（ADR）

深入了解某个领域前，先查阅对应的 ADR 文档。完整的架构决策列表见 [ARCHITECTURE.md](./ARCHITECTURE.md#关键架构决策adr)。

**开发中常用的架构决策**：

| 领域 | 文档 | 要点 |
|------|------|------|
| 媒体 Diff | [docs/architecture/diff.md](./docs/architecture/diff.md) | H264+PCM 流式传输，非逐帧提取 |
| 媒体 LSP | [docs/architecture/lsp.md](./docs/architecture/lsp.md) | JVI 诊断 + Hover + 符号导航 + 跨文件索引 |
| 横切关注点 | *已内化* | Logger/i18n/Theme/Error 统一在 @neko/shared，三层隔离（L0 零依赖 → L1 vscode → L2 DOM/React） |
| 跨语言架构 | *已内化* | Rust 引擎为数据模型权威来源，TS 仅负责 UI |
| 共享包设计 | *已内化* | @neko/shared 通过 exports 子路径分层 |
| 资产管理 | *已内化* | 统一 AssetManifest + Handler 注册表模式 |
| 3D 能力 | *已内化* | bevy_ecs 独立 crate + runtime-scene；GPU Skinning 双管线；FABRIK/CCD/TwoBone IK；动画混合/Crossfade；混合策略（内置轻量 + MCP 桥接 Blender） |
| 2D 能力 | *已内化* | neko-sketch（绘画）+ neko-puppet（骨骼动画）；多层动画混合 + Crossfade；混合策略（内置轻量 + MCP 桥接 PS/ComfyUI） |
| 面板放置 | [docs/architecture/panel-placement.md](./docs/architecture/panel-placement.md) | 编辑器绑定面板内嵌 Webview，全局面板用 VSCode 原生容器 |
| 设备访问 | [docs/architecture/device-access.md](./docs/architecture/device-access.md) | Webview 沙箱限制硬件 API，通过 engine Rust sidecar 代理（cpal/nokhwa/midir/gilrs） |
| 格式策略 | [docs/architecture/format-strategy.md](./docs/architecture/format-strategy.md) | nk* 统一命名，JSON Schema 为文件格式 SSOT，Proto 仅引擎通信；Format SDK（@neko/shared/nkv）提供 load/validate/migrate/save；增量操作 20 种 + 全量 fallback |
| 市场平台 | [docs/architecture/marketplace.md](./docs/architecture/marketplace.md) | @neko/market-core Layer 0 + 多品类 InstallTarget + 统一分发协议 |
| 本地模型部署 | [docs/architecture/model-runtime.md](./docs/architecture/model-runtime.md) | 不建 neko-runtime 包；onPostInstall GGUF→Ollama / ONNX→Engine；Engine ort/candle 原生 ML；外部运行时 Provider/MCP 接入 |
| Registry Server | [docs/architecture/registry-server.md](./docs/architecture/registry-server.md) | 薄 API + 对象存储直传 + 上游代理（HF/Civitai）+ 多 Registry + 私有部署 Docker |
| 文档预览 | [docs/architecture/document-preview.md](./docs/architecture/document-preview.md) | PDF/EPUB/CBZ 委托 Book Reader 或自建（pdfjs-dist/epub.js）；DOCX→docx-preview；XLSX→x-data-spreadsheet；PPTX→LibreOffice headless；priority: option |
| 创作上下文压缩 | [docs/architecture/creative-context-compression.md](./docs/architecture/creative-context-compression.md) | 7 级优先级语义分类：用户消息永久保留，创作决策/版本锚点/迭代链/资产状态/审美偏好分层摘要 |
| 消融实验框架 | [docs/architecture/ablation-experiment-framework.md](./docs/architecture/ablation-experiment-framework.md) | AblationToggles + MetricsHooks 零侵入消融实验 |
| Agent 媒体架构 | [docs/architecture/agent-media-architecture.md](./docs/architecture/agent-media-architecture.md) | GeneratedAsset 磁盘存储 + JSON 引用；Agent 自足性；Send-to-Agent 统一协议（文件级+内容级，零 base64）；MediaPreprocessor 自动缩放/抽帧；预览组件分层 |
| 角色编辑 | *已内化* | 2D/3D 捏脸/动作/绘制/建模；标准面部参数模板（3D 22 参数 / 2D 32 参数）；共享 KeyframeTimeline；.nkm 项目格式；IK 骨骼交互编辑 |
| 路径体系 | *已内化* | 项目文件只存相对路径和 `${VAR}/path`；PathResolver(@neko/shared L0) 统一解析；变量来源: .neko/settings.json(媒体库) + .neko/settings.local.json(本机覆盖)；EngineClient/PreviewFileServer 在调 engine 前自动展开变量；Rust ProjectContext 支持 CLI 独立运行 |

### Rust 引擎开发约束

neko-engine 是 Rust 实现的 Sidecar 进程，通过 N-API 和 HTTP/WebSocket 与 TS 层通信。详细架构见 [ARCHITECTURE.md](./ARCHITECTURE.md#2-extension-host--rust-enginen-api--http)。

**快速参考**:
```
TypeScript 层（Extension Host）
  ↕ N-API 绑定 (@neko-engine/host-napi)
  ↕ HTTP/WebSocket (axum)
Rust 层（neko-engine）
  ├─ engine-kernel:  GPU 渲染(wgpu + GPU Skinning)、FFmpeg 编解码、音视频处理
  ├─ runtime-scene: 3D 场景 ECS（bevy_ecs + glTF + IK + Animation Blend）
  ├─ runtime-puppet: 2D 骨骼 ECS（bevy_ecs + inox2d + Animation Blend）
  ├─ host-api:   ActionRouter、控制器注册
  ├─ host-http:  REST API + WebSocket 流
  └─ types:        共享 Rust 类型
```

**原则**: Rust 引擎是计算和数据模型的唯一权威来源。TS 层不应复制 Rust 的计算逻辑或数据转换。

### GitHub MCP 集成

项目已集成 GitHub MCP 服务器，提供完整的 GitHub 操作能力，用于自动化开发流程：

**核心能力**：

| 类别 | 工具 | 用途 |
|------|------|------|
| **仓库管理** | `search_repositories`, `create_repository`, `fork_repository`, `create_branch` | 仓库发现、创建、分支管理 |
| **代码搜索** | `search_code`, `get_file_contents`, `list_commits`, `get_commit` | 跨仓库代码搜索、文件读取、提交历史 |
| **Issue 管理** | `search_issues`, `issue_read`, `issue_write`, `add_issue_comment` | Issue 创建、查询、更新、评论 |
| **PR 操作** | `search_pull_requests`, `pull_request_read`, `create_pull_request`, `update_pull_request`, `merge_pull_request` | PR 全生命周期管理 |
| **代码审查** | `pull_request_review_write`, `add_comment_to_pending_review`, `request_copilot_review` | 代码审查、评论、AI 审查 |
| **文件操作** | `create_or_update_file`, `delete_file`, `push_files` | 远程文件修改（需提供 SHA） |
| **Copilot 集成** | `create_pull_request_with_copilot`, `assign_copilot_to_issue`, `get_copilot_job_status` | AI 辅助开发、自动化任务 |

**使用原则**：

```
何时使用 GitHub MCP：
├─ 需要跨仓库搜索代码/文档
├─ 自动化 PR/Issue 工作流
├─ 批量文件操作（push_files 单次提交多文件）
├─ 集成 CI/CD 状态检查
└─ 代码审查自动化

何时使用本地 Git：
├─ 日常开发提交（git commit/push）
├─ 分支切换和合并
├─ 本地历史查看
└─ 交互式操作（rebase -i, add -p）
```

**典型场景**：

```typescript
// 场景 1：搜索相关实现参考
mcp__github__search_code({
  query: "EngineClient language:typescript org:neko-suite"
})

// 场景 2：批量更新配置文件
mcp__github__push_files({
  owner: "neko-suite",
  repo: "neko-suite",
  branch: "main",
  files: [
    { path: "package.json", content: "..." },
    { path: "tsconfig.json", content: "..." }
  ],
  message: "chore: update build config"
})

// 场景 3：自动化 PR 创建
mcp__github__create_pull_request({
  owner: "neko-suite",
  repo: "neko-suite",
  title: "feat: add new feature",
  head: "feature-branch",
  base: "main",
  body: "## Changes\n- ..."
})
```

**注意事项**：
- `create_or_update_file` 更新文件时**必须**提供正确的 `sha`（通过 `git rev-parse <branch>:<path>` 获取）
- `push_files` 适合批量操作，单文件修改优先用本地 git
- PR 操作前确保分支已推送到远程
- 代码搜索结果可能不包含最新未推送的本地更改

---

## 1️⃣ 架构

### 快速决策流程

```
收到任务 →
├─ 理解需求？NO → AskUserQuestion 澄清
├─ 需要设计？YES(多模块/新功能) → 五层分析
│              NO(简单修改) → 直接实现
└─ 完成后 → 测试 + 架构图 + 文档
```

### 架构三问（必答）

```
Q1: 是否符合现有架构？   → 保持一致性
Q2: 如何最小化耦合？     → 寻求解耦方案
Q3: 是否易于扩展测试？   → 考虑可维护性
```

### 五层分析法

```
1. 职责分析 → 核心职责是什么？能否拆分？
2. 依赖分析 → 依赖哪些模块？方向是否正确？
3. 接口设计 → 需要哪些抽象？接口是否专一？
4. 扩展分析 → 未来扩展方向？设计是否支持？
5. 测试验证 → 如何单元测试？是否需要 Mock？
```

### 决策输出模板

```
【核心判断】✅ 合理 / ⚠️ 调整 / ❌ 重新设计

【关键洞察】
• 职责划分：[分析]
• 依赖关系：[分析]
• 扩展性：[评估]

【实施步骤】
1. 定义接口和类型
2. 实现抽象层
3. 编写具体实现
4. 编写测试
```

---

## 2️⃣ 设计原则

### SOLID 原则

```
S - Single Responsibility  → 单一职责：一个模块只做一件事
O - Open/Closed           → 开闭原则：对扩展开放，对修改关闭
L - Liskov Substitution   → 里氏替换：子类可替换父类
I - Interface Segregation → 接口隔离：接口小而专一
D - Dependency Inversion  → 依赖倒置：依赖抽象而非具体
```

### 自顶向下设计

```
系统目标 → 子系统划分 → 模块职责 → 接口定义 → 实现细节

示例：添加"视频导出"功能
├─ L1: 确定流程（编码器选择 → 渲染 → 写入）
├─ L2: 划分模块（ExportService / Encoder / Writer）
├─ L3: 定义接口（IEncoder.encode(), IWriter.write()）
└─ L4: 实现具体类（H264Encoder, MP4Writer）
```

### 模块独立性

```
检查标准：
├─ 内聚性：模块内部元素紧密关联
├─ 耦合度：模块间依赖最小化
├─ 可替换：能否独立替换实现
└─ 可测试：能否独立单元测试

量化指标：依赖数 < 5 | 循环依赖 = 0
```

### 接口契约

```
命名约定：
├─ 接口：I + 名词（IMediaService, IEncoder）
├─ 抽象类：Abstract + 名词（AbstractRenderer）
└─ 实现类：名词 + 后缀（H264Encoder, WebGLRenderer）

契约要素：输入类型 | 输出类型 | 异常类型 | 前置/后置条件
```

### 解耦方法

| 方法 | 说明 | 适用场景 |
|------|------|----------|
| **依赖注入** | 构造函数/工厂注入依赖 | 服务类、需要 Mock 测试 |
| **抽象接口** | 面向 interface 编程 | 多实现、可替换组件 |
| **注册表模式** | Map/Registry 动态管理组件 | Provider 管理、插件系统 |
| **策略模式** | 算法封装为可替换策略 | 编码器、路由、重试策略 |
| **事件驱动** | EventEmitter 解耦通信 | 状态变更、跨模块通知 |
| **AOP 切面** | 中间件/拦截器/钩子 | Agent hooks、日志、重试、限流 |

```typescript
// 典型示例：依赖注入 + 接口抽象
interface IEncoder { encode(data: Buffer): Promise<Buffer>; }

class ExportService {
  constructor(private encoder: IEncoder) {}  // 注入抽象，不依赖具体实现
  async export(data: Buffer) { return this.encoder.encode(data); }
}

// 使用时注入具体实现
const service = new ExportService(new H264Encoder());
```

### 设计模式（VSCode + TypeScript）

```
决策指南：
创建对象：统一入口 → Factory | 配置多 → Builder | 全局唯一 → Singleton
组合结构：API 不兼容 → Adapter | 简化子系统 → Facade | 增强功能 → Decorator
处理行为：算法替换 → Strategy | 事件通知 → Observer | 可撤销 → Command
```

| 模式 | TypeScript 实现 | VSCode/本项目应用 |
|------|----------------|------------------|
| **Factory** | 工厂函数 + 泛型 | `createProvider<T>()` 创建 AI Provider |
| **Builder** | 链式调用 + Partial | `TimelineBuilder.addTrack().build()` |
| **Singleton** | 模块级实例导出 | `export const logger = new Logger()` |
| **Adapter** | 实现统一接口 | `LLMAdapter` 适配 Claude/OpenAI API |
| **Facade** | 聚合多个服务 | `MediaEngine` 封装编解码复杂性 |
| **Decorator** | 高阶函数/类装饰器 | `@debounce()` `@memoize()` |
| **Strategy** | interface + 实现类 | `IEncodingStrategy` 编码策略 |
| **Observer** | vscode.EventEmitter | `onDidChangeState` 状态变更 |
| **Command** | 命令对象 + 撤销栈 | `vscode.commands.registerCommand` |
| **Disposable** | vscode.Disposable | 资源清理，防止内存泄漏 |

**VSCode 特有模式**（必用）：
```typescript
// Disposable - 资源管理
class MyService implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  activate() {
    this.disposables.push(vscode.commands.registerCommand('ext.cmd', () => {}));
  }
  dispose() { this.disposables.forEach(d => d.dispose()); }
}

// EventEmitter - 组件通信
private _onDidChange = new vscode.EventEmitter<T>();
readonly onDidChange = this._onDidChange.event;
```

---

## 3️⃣ 开发规范

### 核心原则：契约优先、自顶向下

```
开发顺序（必须遵守）：
1. 先设计再实现     → 画架构图 / 写伪代码
2. 先抽象再具体     → interface → abstract class → impl
3. 先契约再功能     → 定义类型/接口 → 实现方法体
4. 从上到下         → 高层模块 → 低层模块
```

### AI 生成代码要求

| 禁止 | 替代方案 |
|------|----------|
| `console.log` 调试 | 使用项目 Logger |
| `any` 类型 | `unknown` + 类型守卫 |
| 硬编码配置 | 配置文件或常量 |
| 忽略异步错误 | try-catch 或 .catch |
| `as Type` 强制断言 | 类型守卫函数 |

**ESLint 规则**（`eslint.config.mjs`）：
- 生产代码：`@typescript-eslint/no-explicit-any: 'warn'`（会警告但不阻塞）
- 测试文件：`'off'`（允许 `as any` 用于 mock 和测试数据）
- 测试文件模式：`**/*.test.ts`, `**/*.spec.ts`, `**/__tests__/**`

### 常见陷阱

| 陷阱 | 现象 | 解决方案 |
|------|------|----------|
| **Webview 状态丢失** | 切换 tab 后状态重置 | `retainContextWhenHidden` 或持久化到 Extension |
| **异步竞态** | 快速操作导致数据不一致 | AbortController 取消过期请求 |
| **内存泄漏** | 长时间运行后变慢 | 确保所有 Disposable 正确清理 |
| **循环依赖** | 运行时 undefined 错误 | 检查 import 顺序，提取共享类型到 shared |
| **postMessage 丢失** | Webview 未收到消息 | 确保 Webview 已 ready 再发送 |

### 可复用资源

实现新功能前，先检查现有资源：
```
packages/neko-types/src/           → 共享类型、工具函数、Logger、i18n、Theme
packages/neko-types/src/types/     → 类型定义（含 mediaEngine 子目录）
packages/neko-client/src/          → 流媒体客户端（H264/PCM/fMP4）
packages/neko-proto/               → Protobuf IDL（类型契约源）
packages/neko-cut/packages/webview/src/components/  → 视频编辑器 UI 组件
packages/neko-cut/packages/webview/src/hooks/       → React Hooks
packages/neko-agent/packages/platform/src/          → AI 平台服务（LLM 路由）
```

### TODO 标记规范

在契约优先开发中，使用 TODO 标记待实现的功能：

```typescript
// ✅ 正确：先定义完整接口，用 TODO 标记实现
interface IExportService {
  export(timeline: Timeline, options: ExportOptions): Promise<ExportResult>;
  cancel(): void;
}

class ExportServiceImpl implements IExportService {
  async export(timeline: Timeline, options: ExportOptions): Promise<ExportResult> {
    // TODO: implement encoding pipeline
    // TODO: implement progress tracking
    throw new Error('Not implemented');
  }

  cancel(): void {
    // TODO: implement cancellation logic
  }
}

// ❌ 错误：边写边设计，接口不完整
class ExportService {
  export(timeline: any) {  // 类型不明确
    // 边实现边想接口...
  }
}
```

**TODO 优先级标记**：
```typescript
// TODO(P0): 阻塞性功能，必须立即实现
// TODO(P1): 核心功能，当前迭代完成
// TODO(P2): 增强功能，可延后
// TODO: 一般待办
```

### 场景 1：添加新功能

```
【分析】
├─ 核心职责 + 影响范围 + 依赖关系
└─ 画出模块交互图

【设计】（契约优先）
├─ Step 1: 定义类型（types.ts）
├─ Step 2: 定义接口（interface.ts）
├─ Step 3: 抽象层骨架 + TODO 标记
└─ Step 4: 逐个实现 TODO

【实施】（自顶向下）
├─ 高层模块调用逻辑
├─ 中间层业务逻辑
├─ 底层工具函数
└─ 测试 + 文档
```

### 场景 2：重构代码

```
【诊断】
├─ 违反原则 + 具体问题 + 影响程度
└─ 识别需要抽象的部分

【方案】（先抽象再替换）
├─ Step 1: 提取接口，不改实现
├─ Step 2: 新建实现类
├─ Step 3: 逐步迁移调用方
└─ Step 4: 删除旧代码

【验证】测试通过 + 功能正常
```

### 场景 3：Bug 修复

```
【定位】现象 + 根因 + 影响范围
【修复】修改位置 + 具体方案 + 测试验证
【预防】单元测试 + 边界检查 + 文档更新
```

### 代码组织顺序

文件内代码按抽象层次从上到下排列：

```typescript
// 1. 类型定义（最抽象）
interface IService { ... }
type Options = { ... }

// 2. 抽象实现
abstract class BaseService implements IService { ... }

// 3. 具体实现
class ConcreteService extends BaseService { ... }

// 4. 工具函数（最具体）
function helper() { ... }

// 5. 导出
export { ConcreteService, type IService, type Options }
```

---

## 4️⃣ 测试规范

### 测试流程

```bash
pnpm build         # 1. 编译构建
pnpm test          # 2. 单元测试（Vitest）
pnpm check         # 3. 代码质量（Knip + dependency-cruiser）
# Rust: cd packages/neko-engine && cargo test
```

### 测试策略

- **单元测试**：模块独立测试，Mock 外部依赖
- **集成测试**：验证模块交互和接口契约
- **架构测试**：检查依赖方向和循环依赖

### 覆盖率配置

所有包的 Vitest 覆盖率通过 `vitest.shared.ts` 统一管理（reporters + exclude 模式）。各包 `vitest.config.ts` 引用 `sharedCoverage()` 函数，可按需传入 overrides。

### 代码质量工具

```bash
pnpm check:unused    # Knip — 检测未使用文件/导出/依赖（配置: knip.config.ts）
pnpm check:deps      # dependency-cruiser — 架构规则校验（配置: .dependency-cruiser.cjs）
pnpm check           # 两者同时运行
```

**dependency-cruiser 强制规则**（详见 `.dependency-cruiser.cjs`）：
- `no-circular`: 禁止循环依赖
- `layer0-no-internal-deps`: Layer 0 包零内部依赖
- `webview-no-vscode`: Webview 禁止导入 vscode
- `extension-no-react`: Extension 禁止导入 React
- `no-cross-extension-deps-*`: 扩展包间不互相依赖

---

## 7️⃣ 检查清单

### 完成任务前必查

**架构**
- [ ] 符合 SOLID 原则
- [ ] 模块充分解耦，无循环依赖
- [ ] 依赖方向正确（高层不依赖低层实现）

**代码**
- [ ] 契约优先：先定义接口/类型，再实现
- [ ] 自顶向下：高层模块 → 低层模块
- [ ] 命名清晰，错误处理完备
- [ ] 无 `any` 类型、无 `console.log`、无 `as Type` 强制断言

**Code Review 要点**
- [ ] 🟢 优秀：符合 SOLID，模块清晰，易扩展
- [ ] 🟡 一般：基本可用，有改进空间
- [ ] 🔴 问题：违反原则，需要重构
- [ ] 致命缺陷：违反单一职责 | 循环依赖 | 高层依赖低层 | 缺乏抽象

**文档**
- [ ] 按混合策略更新 README（L1 有 Context Summary）
- [ ] 复杂时序/状态机用 Mermaid，其他用纯文本

**测试**
- [ ] 构建通过 `pnpm build`
- [ ] 测试通过 `pnpm test`
- [ ] 代码质量检查通过 `pnpm check`
- [ ] 新增接口有对应单元测试

---

## 💡 最后提醒

```
╔════════════════════════════════════════╗
║  写代码前，先问三个问题：               ║
║  1. 是否符合现有架构？                 ║
║  2. 如何最小化耦合？                   ║
║  3. 是否易于扩展测试？                 ║
║                                        ║
║  不确定？先画架构图。                  ║
╚════════════════════════════════════════╝
```
