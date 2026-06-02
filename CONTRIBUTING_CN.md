# 贡献指南

> **Lang:** [English](./CONTRIBUTING.md) | 中文

欢迎参与 Neko Suite 的开发！本文档涵盖开发环境搭建、代码规范和 PR 流程。

---

## 目录

- [前置条件](#前置条件)
- [开发环境搭建](#开发环境搭建)
- [项目结构速览](#项目结构速览)
- [开发工作流](#开发工作流)
- [代码规范](#代码规范)
- [测试](#测试)
- [提交 PR](#提交-pr)
- [优先贡献领域](#优先贡献领域)

---

## 前置条件

| 工具 | 版本要求 | 说明 |
|------|---------|------|
| Node.js | ≥ 20 | LTS 版本 |
| pnpm | ≥ 10 | `npm i -g pnpm` |
| Rust | stable（≥ 1.75） | `rustup toolchain install stable` |
| VS Code | ≥ 1.85 | 目标宿主环境 |

**macOS 额外依赖**：Xcode Command Line Tools（`xcode-select --install`）

**Linux 额外依赖**：`libavcodec-dev libavformat-dev libavutil-dev pkg-config`（FFmpeg dev headers）

---

## 开发环境搭建

```bash
# 1. 克隆仓库
git clone https://github.com/your-org/neko-suite.git
cd neko-suite

# 2. 安装 Node.js 依赖
pnpm install

# 3. 编译 Rust 引擎（首次耗时 2-5 分钟）
cd packages/neko-engine
cargo build                    # debug 模式
# 或: cargo build --release   # release 模式（更慢，性能更好）
cd ../..

# 4. 编译 N-API 绑定
cd packages/neko-engine/packages/host-napi
pnpm build
cd ../../../..

# 5. 全量 TypeScript 构建
pnpm build

# 6. 安装到 VS Code（开发模式）
./install.sh
```

### 按需安装（推荐）

Neko Suite 支持按场景安装子包，无需全量安装所有扩展：

```bash
# 场景子包（自动包含 core 基础设施）
./install.sh --pack video     # AIGC 视频：core + cut + canvas + story（10 个扩展）
./install.sh --pack 2d        # 2D 创作：core + sketch（8 个扩展）
./install.sh --pack audio     # 音频编辑：core + audio（8 个扩展）

# 叠加安装
./install.sh --pack video --pack 2d   # 视频 + 2D（共享扩展不重复）

# 全量安装（release-ready）
./install.sh --all            # 全部 release-ready 扩展

# 开发模式（含未完成模块）
./install.sh --dev            # 包含 neko-live, neko-model
```

| 子包 | 包含扩展 | 适用场景 |
|------|---------|---------|
| **neko-suite-core** | engine + tools + preview + assets + auth + agent + market | 基础设施 + AI（自动依赖） |
| **neko-suite-video** | core + cut + canvas + story | 素材→剧本→分镜→视频 |
| **neko-suite-2d** | core + sketch | 绘画 + Puppet + AI 辅助 |
| **neko-suite-audio** | core + audio | 波形编辑 + 效果链 |
| **neko-suite** | 全部 | 全栈创作 |

详见 [Extension Pack 分层策略 ADR](./docs/architecture/extension-pack-strategy.md)。

---

## 项目结构速览

```
neko-suite/
├── packages/
│   ├── neko-engine/     # Rust GPU 媒体引擎 + VSCode 扩展集成（统一 Sidecar 进程）
│   ├── neko-cut/        # 视频剪辑器（Extension + Webview）
│   ├── neko-agent/      # AI Agent（Extension + Platform + Webview）
│   ├── neko-types/      # @neko/shared 共享基础设施（Logger/i18n/Theme/Errors，零依赖）
│   ├── neko-client/     # @neko/neko-client 流媒体客户端 + EngineClient（零依赖）
│   ├── neko-proto/      # @neko/proto Protobuf IDL 定义
│   └── ...              # 其他功能包（见 README.md）
├── docs/                # 架构决策文档（ADR）
├── ARCHITECTURE.md      # 系统架构总览
├── CLAUDE.md            # AI 开发规范（必读）
├── ROADMAP.md           # 长期路线图
└── TODO.md              # 当前迭代活跃任务
```

各包详情见对应的 `packages/*/README.md`。

**依赖关系**（统一引擎架构）:
```
@neko/proto                          ← Protobuf 源（类型契约权威来源）
@neko/shared (neko-types)            ← 共享基础设施（Logger/i18n/Theme/Errors，零内部依赖）
@neko/neko-client                    ← EngineClient HTTP dispatch + 流媒体客户端（零内部依赖）

@neko-engine/host-napi             ← Rust N-API 绑定（独立编译）
  ↑
neko-engine ext                      ← 唯一 Sidecar 进程 + 统一 HTTP/WS 服务器
  ↑ (通过 EngineClient HTTP/WS 通信)
neko-cut ext → @neko/shared, @neko/neko-client, @neko/platform
neko-agent ext → @neko/agent, @neko/platform, @neko/shared
neko-tools ext → @neko/shared, @neko/neko-client
neko-preview ext → @neko/shared, @neko/neko-client
neko-canvas ext → @neko/shared
neko-story ext → @neko-story/parser, @neko-story/types, @neko/shared
neko-assets ext → @neko/shared

各 webview → @neko/shared, @neko/neko-client (按需), React 18
```

**架构要点**：
- **统一引擎**：所有扩展通过 `EngineClient`（位于 `@neko/neko-client`）与唯一的 neko-engine Sidecar 进程通信
- **端口统一**：从 3 个独立端口降为 1 个统一端口（HTTP/WS）
- **横切关注点**：Logger/i18n/Theme/Errors 统一在 `@neko/shared`，三层隔离（Core/VSCode/Webview）

---

## 开发工作流

### 开发单个扩展

```bash
# 以 neko-cut 为例

# 1. 启动 webview 热重载开发服务器（Vite）
cd packages/neko-cut/packages/webview
pnpm dev            # 监听 http://localhost:5173

# 2. 在另一个终端，监听 Extension 变更（esbuild watch）
cd packages/neko-cut/packages/extension
pnpm watch

# 3. 在 VS Code 中按 F5 启动扩展调试（Extension Development Host）
```

### 开发 Rust 引擎

```bash
cd packages/neko-engine

# 运行 Rust 单元测试
cargo test

# 检查类型错误（不编译）
cargo check

# 格式化 Rust 代码
cargo fmt

# Lint
cargo clippy -- -D warnings
```

### 全量构建

```bash
pnpm build                  # 全量构建（turbo 并行）
pnpm build:neko-cut         # 仅构建指定包
pnpm build:ui               # 仅构建所有 webview
pnpm build:core             # 仅编译 Rust engine
pnpm generate:types         # 重新生成 Protobuf TS 类型
```

---

## 代码质量工具

### 格式化（Prettier）

项目使用 Prettier 统一代码风格，配置见 `.prettierrc.json`。

```bash
pnpm format          # 格式化所有源文件
pnpm format:check    # 检查格式（CI 使用）
```

Pre-commit hook 会自动对暂存文件执行格式化（Husky + lint-staged）。

### Lint（ESLint）

项目使用 ESLint flat config v9（`eslint.config.mjs`），集成 typescript-eslint + react-hooks。

```bash
pnpm lint            # 检查所有源文件
pnpm lint:fix        # 自动修复可修复问题
```

Pre-commit hook 会自动执行 `eslint --fix` + `prettier --write`。

**规则说明**：
- 生产代码：`@typescript-eslint/no-explicit-any: 'warn'`（警告但不阻塞）
- 测试文件：`'off'`（允许 `as any` 用于 mock 和测试数据）
- 测试文件模式：`**/*.test.ts`, `**/*.spec.ts`, `**/__tests__/**`

### 僵尸代码检测（Knip）

[Knip](https://knip.dev) 检测未使用的文件、导出和依赖项，配置见 `knip.config.ts`。

```bash
pnpm check:unused        # 检测未使用代码
pnpm check:unused:fix    # 自动移除未使用的导出和依赖
```

**当前基线**（2026-03-14）：
- 未使用文件: 5 个
- 未使用导出: 435 个（函数/常量）
- 未使用类型: 527 个
- 未使用 devDependencies: 16 个

**清理策略**：
- 约 35% 可安全清理（barrel exports、工具函数）
- 约 65% 应保留（Phase 2 功能类型、公共 API）

### 架构规则校验（dependency-cruiser）

[dependency-cruiser](https://github.com/sverweij/dependency-cruiser) 自动校验架构约束，配置见 `.dependency-cruiser.cjs`。

```bash
pnpm check:deps          # 检查架构规则违反
```

当前强制执行的规则：

| 规则 | 级别 | 说明 | 状态 |
|------|------|------|------|
| `no-circular` | error | 禁止循环依赖 | ✅ 0 违反 |
| `layer0-no-internal-deps` | error | Layer 0（@neko/shared, @neko/neko-client）不依赖其他内部包 | ✅ 通过 |
| `webview-no-vscode` | error | Webview 包禁止导入 `vscode` 模块 | ✅ 通过 |
| `extension-no-react` | error | Extension 包禁止导入 React/ReactDOM | ✅ 通过 |
| `no-cross-extension-deps-*` | warn | 扩展包之间不能直接互相依赖 | ✅ 通过 |

**常见循环依赖模式及修复指南**：

| 模式 | 示例 | 修复方法 |
|------|------|----------|
| **Barrel 回导入** | `index.ts` 定义接口 → 实现文件从 `./index` 导入 → `index.ts` 导入实现 | 将接口移到 `types.ts`，双方从 `types.ts` 导入 |
| **Hook/Service 互引** | Service 依赖 Hook 中的工具函数 → Hook 通过 barrel 依赖 Service | 提取工具函数到 `utils/` 独立模块 |
| **Inline `import()` 类型** | `types.ts` 用 `import('./impl').Class` 引用实现类 | 在 `types.ts` 定义接口（依赖倒置），实现类 `implements` 该接口 |

### 覆盖率配置

所有包的 vitest 覆盖率配置通过 `vitest.shared.ts` 统一管理（reporters、exclude 模式）。

**Vitest 版本**：全部统一到 `^4.0.18`（根 + 所有子包）

**覆盖率阈值**（已启用）：
- Lines: 30%
- Branches: 20%
- Functions: 25%
- Statements: 30%

**v4 注意事项**：
- 构造函数 mock 必须使用 `function` 语法，不能用箭头函数
- 无测试文件的包需在 `package.json` 的 test 脚本加 `--passWithNoTests`
- 对 package.json exports 解析更严格，alias 错误路径会导致 import 失败

### 一键质量检查

```bash
pnpm check               # 同时运行 Knip + dependency-cruiser
```

### 本地 CI 检查

提交 PR 前按影响范围运行本地 CI 等价检查：

```bash
pnpm ci:local            # TS/Webview/Extension 通用质量门禁
pnpm ci:local:rust       # Rust engine 相关改动
pnpm ci:local:proto      # Proto 契约与生成类型同步
```

需要做集成 smoke 时运行：

```bash
pnpm smoke:engine        # engine CLI + serve /health + dispatch smoke
pnpm smoke:webview       # 构建所有 webview 包；可用 NEKO_WEBVIEW_SMOKE_PACKAGES 限定范围
node scripts/smoke-webview-builds.mjs --list  # 仅列出将被构建的 webview 包
```

代码审查流程、风险分级、功能/UX/性能检查、专业软件对标和合并规则见 [代码审查与质量门禁 ADR](./docs/architecture/adr-code-review-quality-gates.md)。

### CI/CD

PR 和主分支推送会自动触发 GitHub Actions CI（`.github/workflows/ci.yml`），通过路径过滤按需运行：

| Job | 触发条件 | 内容 |
|-----|---------|------|
| **Build & Lint** | TS/配置文件变更 | `format:check` + `lint` + `build` |
| **TypeScript Tests** | 同上 | `pnpm test --coverage` + coverage artifact |
| **Code Quality** | 同上 | Knip 僵尸代码检测 + dependency-cruiser 架构规则 |
| **Rust Tests** | `packages/neko-engine/**` 变更 | `cargo fmt --check` + `clippy` + `cargo test` |
| **Cargo Deny** | 同上 | Rust 依赖审计 |
| **Proto Types Sync** | `packages/neko-proto/**` 变更 | 检查生成类型是否同步 |
| **Dependency Review** | 仅 PR | 安全依赖审查 |

---

## 代码规范

详细规范见 [CLAUDE_CN.md](./CLAUDE_CN.md)，以下是核心要点：

### TypeScript

- **严格模式**：`strict: true` + `noUncheckedIndexedAccess: true`（已在 tsconfig.json 配置）
- **类型优先**：先定义 interface/type，再实现逻辑
- **禁止 `any`**：用 `unknown` + 类型守卫替代
- **禁止 `console.log`**：使用项目 Logger（`@neko/shared` 中的 `ILogger`）
- **禁止强制断言**：`as Type` 替换为类型守卫函数

```typescript
// ❌ 禁止
const data = response as MyType;
console.log(data);

// ✅ 正确
function isMyType(v: unknown): v is MyType { ... }
if (isMyType(data)) { logger.info('data', data); }
```

### 统一基础设施使用

**Logger**（`@neko/shared`）：
```typescript
// Extension Host
import { createVSCodeLogger } from '@neko/shared/vscode/extension';
const logger = createVSCodeLogger('MyExtension');
logger.info('message', { data });

// Webview
import { ConsoleLogger } from '@neko/shared';
const logger = new ConsoleLogger('MyWebview');
```

**i18n**（`@neko/shared`）：
```typescript
// Extension Host
import { I18nService, getVSCodeLocale } from '@neko/shared/vscode/extension';
const i18n = new I18nService(getVSCodeLocale());
i18n.register('myNamespace', { 'key': 'value' });

// Webview (React)
import { I18nProvider, useTranslation } from '@neko/shared/i18n/react';
const { t } = useTranslation();
```

**EngineClient**（`@neko/neko-client`）：
```typescript
// 获取引擎端口
const { port } = await vscode.commands.executeCommand<{ port: number }>(
  'neko.engine.ensureFrameServer'
);

// 创建客户端
import { EngineClient } from '@neko/neko-client';
const client = new EngineClient(port);

// 调用引擎功能
const probeResult = await client.probe(filePath);
const waveform = await client.waveform(filePath, { width: 1000 });
```

### Webview 开发约束

Webview 运行在沙箱环境中，**无法直接访问 Node.js API 或 VS Code API**：

```typescript
// ❌ Webview 中禁止
import fs from 'fs';
import * as vscode from 'vscode';

// ✅ 通过 postMessage 请求 Extension Host
vscode.postMessage({ type: 'readFile', path: '/path/to/file' });
```

### 命名约定

| 类型 | 命名 | 示例 |
|------|------|------|
| 接口 | `I` + 名词 | `IEncoder`, `IMediaService` |
| 抽象类 | `Abstract` + 名词 | `AbstractRenderer` |
| 实现类 | 名词 + 后缀 | `H264Encoder`, `WebGLRenderer` |
| 事件 | `onDid` + 动词 | `onDidChangeState` |

### 文件组织

文件内代码按抽象层次排列：类型定义 → 接口 → 抽象类 → 具体实现 → 工具函数 → 导出。

### Rust

- 遵循 `cargo fmt` 格式
- 新增公共 API 需有文档注释（`///`）
- 避免 `unwrap()`：使用 `?` 传播错误或 `expect("明确原因")`

---

## 测试

```bash
# TypeScript 单元测试（Vitest）
pnpm test

# 单个包测试
cd packages/neko-agent && pnpm test

# Rust 测试
cd packages/neko-engine && cargo test

# 类型检查（不运行测试）
pnpm typecheck
```

**测试要求**：
- 新增公共接口/服务需有对应单元测试
- Rust 核心算法需有单元测试（`#[cfg(test)]`）
- 复杂 Store Slice 变更需有 Vitest 测试

---

## 提交 PR

### 分支命名

```
feature/neko-cut-export-presets
fix/neko-engine-audio-normalize
refactor/neko-types-error-handler
docs/update-architecture
```

### Commit Message

采用 [Conventional Commits](https://www.conventionalcommits.org/) 格式：

```
feat(neko-cut): add export preset management
fix(neko-engine): resolve audio normalize API missing route
refactor(neko-types): extract IErrorHandler to separate interface
docs: update ARCHITECTURE.md with streaming flow
```

**类型**：`feat` / `fix` / `refactor` / `perf` / `test` / `docs` / `chore`

### PR Checklist

- [ ] `pnpm build` 构建通过
- [ ] `pnpm test` 测试通过
- [ ] Rust 变更：`cargo test` + `cargo clippy` 通过
- [ ] 新接口有单元测试
- [ ] 涉及架构变更：更新对应 ADR 或 package README
- [ ] 无 `any` 类型、无 `console.log`、无 `as Type` 强制断言

### Code Review 重点

1. 是否符合 SOLID 原则（单一职责、依赖倒置）
2. Webview 是否误用 Node.js/VS Code API
3. 是否引入循环依赖
4. Rust 代码是否有 `unwrap()` 隐患

---

## 优先贡献领域

参考 [TODO_CN.md](./TODO_CN.md) 中的 P0/P1 任务，以下是最需要帮助的方向：

| 领域 | 技能要求 | 关联包 |
|------|---------|--------|
| GPU 渲染优化 | Rust + wgpu + WGSL | neko-engine |
| 时间线 Skills | TypeScript + LLM API | neko-agent |
| LSP 错误诊断 | TypeScript + LSP | neko-story |
| 单元测试 | Vitest / cargo test | 所有包 |
| Effects/Shader 系统 | Rust + WGSL + TypeScript | neko-engine + neko-cut |
| i18n 翻译补充 | 多语言翻译 | 所有 webview 包 |

**最新完成的架构改进**（可参考学习）：
- AI Agent 架构重构（`docs/plans/2026-03-10-neko-agent-skill-tool-refactor-design.md`）：ToolSet/Skill/Hook 三子系统重命名清理、Shell hooks 桥接、两层工具注入（`always`/`dynamic`）
- 统一引擎架构（`docs/adr-unified-engine.md`）
- 横切关注点统一（`docs/architecture/adr-cross-cutting-concerns.md`）
- Shader/Effects 全量打通（`packages/neko-engine/packages/engine-kernel/src/export/gpu_export_pipeline.rs`）

---

## 调试技巧

**Extension Host 日志**：`console.log('[MyExt]', data)` → VS Code 输出面板

**Webview 调试**：`Cmd+Shift+P → Developer: Open Webview Developer Tools`

**Rust 日志**：`tracing::info!("msg")` → 通过 neko-engine 遥测系统输出

详细调试方法见 [CLAUDE_CN.md](./CLAUDE_CN.md)。

---

*有问题？欢迎在 Issues 中讨论，或直接在 PR 中 @ 维护者。*
