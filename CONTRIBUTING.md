# 贡献指南

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
cd packages/neko-engine/packages/native-napi
pnpm build
cd ../../../..

# 5. 全量 TypeScript 构建
pnpm build

# 6. 安装到 VS Code（开发模式）
./install.sh
```

---

## 项目结构速览

```
neko-suite/
├── packages/
│   ├── neko-engine/     # Rust GPU 媒体引擎 + VSCode 扩展集成
│   ├── neko-cut/        # 视频剪辑器（Extension + Webview）
│   ├── neko-agent/      # AI Agent（Extension + Platform + Webview）
│   ├── neko-types/      # @neko/shared 共享基础设施（零依赖）
│   ├── neko-client/     # @neko/neko-client 流媒体客户端（零依赖）
│   ├── neko-proto/      # @neko/proto Protobuf IDL 定义
│   └── ...              # 其他功能包（见 README.md）
├── docs/                # 架构决策文档（ADR）
├── ARCHITECTURE.md      # 系统架构总览
├── CLAUDE.md            # AI 开发规范（必读）
├── ROADMAP.md           # 长期路线图
└── TODO.md              # 当前迭代活跃任务
```

各包详情见对应的 `packages/*/README.md`。

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

## 代码规范

详细规范见 [CLAUDE.md](./CLAUDE.md)，以下是核心要点：

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

参考 [TODO.md](./TODO.md) 中的 P0/P1 任务，以下是最需要帮助的方向：

| 领域 | 技能要求 | 关联包 |
|------|---------|--------|
| GPU 渲染优化 | Rust + wgpu + WGSL | neko-engine |
| 时间线 Skills | TypeScript + LLM API | neko-agent |
| LSP 错误诊断 | TypeScript + LSP | neko-story |
| 单元测试 | Vitest / cargo test | 所有包 |
| 流式 Diff | Rust async + tokio | neko-engine + neko-tools |

---

## 调试技巧

**Extension Host 日志**：`console.log('[MyExt]', data)` → VS Code 输出面板

**Webview 调试**：`Cmd+Shift+P → Developer: Open Webview Developer Tools`

**Rust 日志**：`tracing::info!("msg")` → 通过 neko-engine 遥测系统输出

详细调试方法见 [CLAUDE.md](./CLAUDE.md)。

---

*有问题？欢迎在 Issues 中讨论，或直接在 PR 中 @ 维护者。*
