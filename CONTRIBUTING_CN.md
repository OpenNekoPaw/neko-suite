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

| 工具    | 版本要求         | 说明                              |
| ------- | ---------------- | --------------------------------- |
| Node.js | ≥ 20             | LTS 版本                          |
| pnpm    | ≥ 10             | `npm i -g pnpm`                   |
| Rust    | stable（≥ 1.75） | `rustup toolchain install stable` |
| VS Code | ≥ 1.85           | 目标宿主环境                      |

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

# 6. 构建 VSIX（用于本地安装或分发）
./build.sh --all
```

### VSIX 安装

仓库只负责构建和打包 VSIX，实际安装动作交给 VS Code 或用户环境：

```bash
# 构建单个扩展 VSIX
./build.sh --package neko-cut

# 构建全部 release-ready VSIX
./build.sh --all

# 使用 VS Code CLI 安装生成的 VSIX
code --install-extension neko-cut-*.vsix
```

也可以在 VS Code 中通过 “Extensions: Install from VSIX...” 选择生成的 `.vsix` 文件安装。

当前包和扩展边界见 [ARCHITECTURE_CN.md](./ARCHITECTURE_CN.md)。

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
├── docs/                # 架构、领域、调研和状态文档
├── ARCHITECTURE.md      # 系统架构总览
├── AGENTS.md            # 仓库工作规则
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
# 4. 做 Webview 视觉/交互验收时，运行真实功能场景
pnpm test:webview:functional --owner neko-cut
```

Vite/浏览器只用于热重载和明确要求的浏览器兼容性辅助；Neko 的 Extension Webview 最终运行在 VS Code 沙箱里。涉及视觉、布局、交互、焦点、CSP、Extension/Webview message、媒体预览或 VS Code 生命周期时，必须用 Extension Development Host + `vscode-extension-debugger` Skill 验证。不要用 Chrome、Browser 插件、Playwright 或普通浏览器打开 `localhost` 作为默认运行态验收。

功能包负责维护 `scripts/webview-functional/scenarios/<owner>/` 下的核心用户场景，以及 `scripts/webview-functional/fixtures/` 下对应的最小合成 workspace。场景必须通过可见 UI 和公开宿主边界完成操作，并同时断言 UI、canonical message/command/service path、持久文件或 Engine 结果、生命周期和运行错误；不得调用私有 store/handler、增加 test-only 业务命令或直接绕过项目文件服务。共享 runner 只负责 VS Code/Electron 宿主、CDP、封闭操作 schema、错误策略和报告。

原始报告写入 gitignored `reports/webview-functional/`，本地只保留复现当前问题所需的最短时间；可信 PR CI artifact 默认保留 14 天。截图、DOM、日志和 side-effect manifest 只能来自隔离 fixture workspace，不得采集普通开发窗口或真实用户工作区。OpenSpec、PR 和文档只提交脱敏摘要：scenario id、命令、宿主/版本、结果、失败分类、证据位置和剩余风险；分享前必须移除 secret、token、绝对用户路径和任何非 fixture 内容。

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

| 规则                        | 级别  | 说明                                                       | 状态      |
| --------------------------- | ----- | ---------------------------------------------------------- | --------- |
| `no-circular`               | error | 禁止循环依赖                                               | ✅ 0 违反 |
| `layer0-no-internal-deps`   | error | Layer 0（@neko/shared, @neko/neko-client）不依赖其他内部包 | ✅ 通过   |
| `webview-no-vscode`         | error | Webview 包禁止导入 `vscode` 模块                           | ✅ 通过   |
| `extension-no-react`        | error | Extension 包禁止导入 React/ReactDOM                        | ✅ 通过   |
| `no-cross-extension-deps-*` | warn  | 扩展包之间不能直接互相依赖                                 | ✅ 通过   |

**常见循环依赖模式及修复指南**：

| 模式                       | 示例                                                                  | 修复方法                                                       |
| -------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------- |
| **Barrel 回导入**          | `index.ts` 定义接口 → 实现文件从 `./index` 导入 → `index.ts` 导入实现 | 将接口移到 `types.ts`，双方从 `types.ts` 导入                  |
| **Hook/Service 互引**      | Service 依赖 Hook 中的工具函数 → Hook 通过 barrel 依赖 Service        | 提取工具函数到 `utils/` 独立模块                               |
| **Inline `import()` 类型** | `types.ts` 用 `import('./impl').Class` 引用实现类                     | 在 `types.ts` 定义接口（依赖倒置），实现类 `implements` 该接口 |

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

残留/债务关键词或冗余代码相关改动需要显式检查：

```bash
pnpm check:legacy-debt   # 扫描 legacy/fallback/deprecated 等残留代码面
pnpm check:unused        # 检查未使用文件、导出和依赖
```

如果已运行 `pnpm ci:local`，则已覆盖 `pnpm check` 和 `pnpm check:quality`；交付说明仍需说明残留/冗余检查由哪个命令覆盖。

### 本地 CI 检查

提交 PR 前按影响范围运行本地 CI 等价检查：

```bash
pnpm ci:local            # TS/Webview/Extension 通用门禁，包含 key-free Agent eval harness 自测
pnpm ci:local:rust       # Rust engine 相关改动
pnpm ci:local:proto      # Proto 契约与生成类型同步
```

Agent 开发需要额外区分 key-free 基线和 eval 场景验收。CI 和默认 `pnpm test`
保持 key-free；但本地改动如果影响 provider/model 选择、AI SDK message
projection、prompt / Skill 行为、tool schema、AgentSession workflow、
validator/recovery 策略，或 TUI/GUI 对实时 Agent 事件的投影，必须运行聚焦的
`scripts/agent-eval` v2 suite，或记录为何无法运行及残余风险。使用
`.codex/skills/neko-agent-evaluation/SKILL.md` 先为每项受影响行为做
`reuse | update | create | excluded` 决策，再规划 user behavior、canonical path、
forbidden fallback、observable evidence、coverage delta 和 suite/case。不要在 Neko
Agent 内恢复 `neko eval`、建立第二套编排，或为 Evaluation 增加 runtime-only 开关。

新增 Agent 功能的默认开发/验收顺序是：先定义共享 contract、runtime path 和
path-level 测试；再用 focused unit/contract tests 和 TUI debug automation eval
验证 Agent 核心行为、Skill/Tool/prompt 效果、长时间任务、失败诊断和稳定性；
确认核心路径可用后，再用 VS Code Extension Development Host +
`vscode-extension-debugger` 验证 Webview UI 投影、交互、`invokeSkill` /
active Skill 指示器和 UI Skill 使用效果。Webview 验收不能替代 Agent/TUI 核心
行为验证，TUI debug automation eval 也不能替代 VS Code Webview runtime 验收。

```bash
pnpm test:agent:eval
node scripts/agent-eval/protocol-smoke.mjs \
  --suite skill.storyboard \
  --case canonical-two-shot-storyboard \
  --dry-run
```

`pnpm test:agent:eval` 是 key-free harness 自测，已经纳入 `pnpm ci:local` 和
GitHub CI；它只证明 strict schema、runner/protocol、报告/失败分类和所有 indexed
suite dry-run，不能替代真实 TUI Agent case。真实 case 使用同一 `--suite` / `--case`
命令并移除 `--dry-run`；结论必须以当前 runner 实际执行的 assertion evaluator、
canonical path/no-fallback facts、effective model/config 和 artifact validator 为准，
不能把 metadata、退出码为 0、Judge 高分或非空最终回答描述为完整场景验收。

默认 PR CI 不读取 provider secrets。真实 focused/nightly Evaluation 只在可信
`main` push、schedule 或 manual dispatch 运行；fork PR 没有 secret execution path。
原始报告写入 gitignored `reports/agent-eval/`；本地按 14 天策略由开发者清理，
trusted-CI artifact 自动保留 14 天。
OpenSpec/PR 只能引用脱敏 summary：suite/case/run、命令、Host Skill identity/fingerprint
或 target hash、provider/model/effective config、fixture digest、hard-gate/artifact
evidence、usage/cost availability、阻塞项和残余风险。不得提交 credential、hidden
prompt、raw provider config、绝对用户路径、cache/temp/runtime handle 或未授权内容。

如果本地缺少 provider 凭据、网络/provider 可用性、模型访问、creative fixture
或 VS Code debugger 运行条件，交付说明必须记录尝试过的 eval 命令、未能运行的
原因和残余风险；不能用 mock-only、browser-only、jsdom-only 或只看最终文本的
证据替代 TUI debug automation eval / 真实 VS Code Webview 功能验收。

当修改 `.github/workflows/ci.yml`、依赖安装、Corepack/pnpm、FFmpeg setup 或 Linux runner shell 逻辑时，可用 `act` 做 GitHub Actions 形状预检：

```bash
pnpm ci:act:list         # 查看本地 act 支持的 job
pnpm ci:act              # 默认运行 Linux 兼容 job：build/test-ts/code-quality/cargo-deny
pnpm ci:act -- --verbose # 透传额外 act 参数
pnpm ci:act -- --reuse   # 示例：复用容器加速调试
```

`act` 只是本地预检，不替代 GitHub Actions。`Rust Tests` 在 CI 使用 `macos-latest`，本地仍优先运行 `pnpm ci:local:rust`，最终结果以 GitHub runner 为准。

构建、本地 CI 和 TS VSIX 发布共享扩展包分组配置：`scripts/package-groups.json`。新增或调整可发布扩展、dev-only 扩展或 TS 扩展发布清单时，优先更新这个文件，再运行对应脚本做验证，避免在 `build.sh`、`ci.sh` 和 GitHub Actions 中重复维护包列表。

需要做集成 smoke 时运行：

```bash
pnpm smoke:engine        # engine CLI + serve /health + dispatch smoke
pnpm smoke:webview       # 构建所有 webview 包；可用 NEKO_WEBVIEW_SMOKE_PACKAGES 限定范围
pnpm smoke:webview:targets
# 仅验证 VS Code page/Webview target 可发现，不能作为功能验收
pnpm smoke:vscode:targets -- --skill vscode-extension-debugger --require-webview
pnpm test:webview:functional:p0
# 在隔离 Extension Development Host 中执行 P0 用户操作、持久化和错误门禁
node scripts/smoke-webview-builds.mjs --list  # 仅列出将被构建的 webview 包
```

### Prelaunch 兼容策略

当前项目仍处于发布前阶段，可以有意破坏尚未发布的内部 API、DTO、Webview message、Agent workflow payload、测试 fixture 或 `nk*` 草稿格式，以减少长期兼容包袱。但这种破坏必须在 proposal、design、tasks 或 PR 说明中写清楚影响范围、原因，以及旧数据是迁移、重建、重新导入、忽略还是明确丢弃。

新路径开发默认先限定本次替换的最小目标边界，然后优先清理该边界内旧 compatibility shim、legacy adapter、fallback branch、dual-read/dual-write、旧字段映射和旧命令入口，并断开旧调用链路；确认旧路径不能继续返回成功后，再定义新设计/新契约、开发新 canonical path 并接入验证。不要在旧路径仍可兜底成功时继续修补旧路径问题，也不要把新功能接在新旧并行路径上。测试新路径时默认禁用兼容 fallback；若执行流命中旧路径，必须立即抛错、返回 fail-closed diagnostic 或触发可断言的 telemetry/log failure，不得继续返回旧路径成功结果；只有明确标记为迁移、拒绝或诊断测试时才可观测旧路径。新路径验收必须是路径级验收，不得只断言最终结果成功；必须断言 canonical path、新 handler、新 renderer、新 adapter 或新 contract 被命中，并通过 spy、counter、log assertion，或将 legacy path poison 成抛错来证明旧路径未参与。代码缺陷不得被兜底或兼容逻辑吞掉：缺失新实现、contract mismatch、非法状态、未知消息、错误配置、未注册 handler/renderer/adapter 时，应 fail-visible，不能回退旧实现、默认空数据、默认成功状态或 no-op。只有保护有价值本地数据、已发布契约或外部信任边界时，才允许临时保留兼容逻辑，并且必须有 owner、replacement、验证命令、移除条件和到期任务。预发布也不能忽略 VS Code、Node、pnpm、Rust、OS、Webview sandbox、CSP、codec、Range、Engine、Proto、marketplace trust 等运行/安全/信任边界，不能静默删除或损坏有价值的本地项目数据、设置、信任状态、权益、安装记录或生成产物。

代码审查流程、风险分级、功能/UX/性能检查和合并规则遵循 [AGENTS.md](./AGENTS.md) 与 [ARCHITECTURE_CN.md](./ARCHITECTURE_CN.md) 中的验证要求。

### CI/CD

PR 和主分支推送会自动触发 GitHub Actions CI（`.github/workflows/ci.yml`），通过路径过滤按需运行：

| Job                   | 触发条件                       | 内容                                            |
| --------------------- | ------------------------------ | ----------------------------------------------- |
| **Build & Lint**      | TS/配置文件变更                | `format:check` + `lint` + `build`               |
| **TypeScript Tests**  | 同上                           | `pnpm test --coverage` + coverage artifact      |
| **Code Quality**      | 同上                           | Knip 僵尸代码检测 + dependency-cruiser 架构规则 |
| **Rust Tests**        | `packages/neko-engine/**` 变更 | `cargo fmt --check` + `clippy` + `cargo test`   |
| **Cargo Deny**        | 同上                           | Rust 依赖审计                                   |
| **Proto Types Sync**  | `packages/neko-proto/**` 变更  | 检查生成类型是否同步                            |
| **Dependency Review** | 仅 PR                          | 安全依赖审查                                    |

---

## 代码规范

仓库级工作规则见 [AGENTS.md](./AGENTS.md)，以下是核心要点：

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
i18n.register('myNamespace', { key: 'value' });

// Webview (React)
import { I18nProvider, useTranslation } from '@neko/shared/i18n/react';
const { t } = useTranslation();
```

**EngineClient**（`@neko/neko-client`）：

```typescript
// 获取引擎端口
const { port } = await vscode.commands.executeCommand<{ port: number }>(
  'neko.engine.ensureFrameServer',
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

| 类型   | 命名              | 示例                           |
| ------ | ----------------- | ------------------------------ |
| 接口   | `I` + 名词        | `IEncoder`, `IMediaService`    |
| 抽象类 | `Abstract` + 名词 | `AbstractRenderer`             |
| 实现类 | 名词 + 后缀       | `H264Encoder`, `WebGLRenderer` |
| 事件   | `onDid` + 动词    | `onDidChangeState`             |

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
- [ ] 新功能涉及样式、主题、i18n、日志、错误、文件 IO、缓存、配置、路径或 DTO 时，已做公共基础能力审计
- [ ] 新功能涉及 provider、registry、bridge、protocol、status/tree/history/selection 等可复用能力时，已做跨子包能力复用审计
- [ ] 新增 Webview/React 组件前已做复用审计，并说明为何不能增强既有组件或抽到 `@neko/ui`
- [ ] 新路径开发已先限定替换边界并断开旧调用链路，旧兼容逻辑已删除、隔离或 fail-closed；验收断言 canonical path 被命中且 legacy path 未参与，若旧路径被命中不会返回旧路径成功结果
- [ ] 涉及架构变更：更新对应 ADR 或 package README
- [ ] 无 `any` 类型、无 `console.log`、无 `as Type` 强制断言

### Code Review 重点

1. 是否符合 SOLID 原则（单一职责、依赖倒置）
2. Webview 是否误用 Node.js/VS Code API
3. 是否引入循环依赖
4. 横切能力是否优先复用或更新公共基础层，而不是功能包私有并行实现
5. 可复用能力是否先查其他子包和共享层，并避免复制实现或直接依赖其他功能包内部模块
6. 新增组件是否先审计并优先增强了既有 `@neko/ui` 或包内组件
7. 是否按本地 VSCode 客户端 + 本地 Rust Engine 的边界控制复杂度，避免云端多租户/分布式服务式的过度设计
8. 防御性代码是否只覆盖真实边界，避免宽泛 try/catch、静默默认值、fallback、兼容分支或重复校验掩盖开发错误
9. Prelaunch 重构是否先在目标边界内清理旧成功路径并断开旧调用链路，再定义和接入新 canonical path
10. Rust 代码是否有 `unwrap()` 隐患

---

## 优先贡献领域

参考 [TODO_CN.md](./TODO_CN.md) 中的 P0/P1 任务，以下是最需要帮助的方向：

| 领域                | 技能要求                 | 关联包                 |
| ------------------- | ------------------------ | ---------------------- |
| GPU 渲染优化        | Rust + wgpu + WGSL       | neko-engine            |
| 时间线 Skills       | TypeScript + LLM API     | neko-agent             |
| LSP 错误诊断        | TypeScript + LSP         | neko-story             |
| 单元测试            | Vitest / cargo test      | 所有包                 |
| Effects/Shader 系统 | Rust + WGSL + TypeScript | neko-engine + neko-cut |
| i18n 翻译补充       | 多语言翻译               | 所有 webview 包        |

**当前架构参考**：

- [ARCHITECTURE_CN.md](./ARCHITECTURE_CN.md)：稳定系统边界。
- [docs/README.md](./docs/README.md)：文档分类与发现路径。
- [TODO_CN.md](./TODO_CN.md)：活跃工作。
- [ROADMAP_CN.md](./ROADMAP_CN.md)：方向性产品路线。

---

## 调试技巧

**Extension Host 日志**：`console.log('[MyExt]', data)` → VS Code 输出面板

**Webview 调试**：`Cmd+Shift+P → Developer: Open Webview Developer Tools`

**Rust 日志**：`tracing::info!("msg")` → 通过 neko-engine 遥测系统输出

仓库级调试和工作约定见 [AGENTS.md](./AGENTS.md)。

---

_有问题？欢迎在 Issues 中讨论，或直接在 PR 中 @ 维护者。_
