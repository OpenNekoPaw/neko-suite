
# AGENTS.md

## 适用范围

- 本文件作用于仓库根目录及其所有子目录。
- 若系统、开发者或用户指令与本文件冲突，以更高优先级指令为准。

## 工作方式

- 以架构师视角工作：遵循 SOLID、自顶向下设计、契约优先实现。
- 修改前先回答三个问题：
  1. 是否符合现有架构？
  2. 如何进一步降低耦合？
  3. 是否易于扩展与测试？
- 遇到多模块改动或新功能，先做五层分析：职责、依赖、接口、扩展、测试。
- 简单改动可直接实现，但仍需保持与现有架构一致。
- 新增功能或非平凡代码修改后，按 `docs/architecture/adr-code-review-quality-gates.md` 做自审；可使用项目 skill `.codex/skills/neko-quality-review/SKILL.md`，并在交付说明中列出验证命令与剩余风险。

## 语言与沟通

- 面向用户的说明优先使用中文。
- 新增代码注释应优先遵循所在模块既有风格；若无明确先例，可参考 `CLAUDE.md` 使用英文注释。
- 文档更新优先同步中文版本；若变更影响英文文档语义，补充对应英文文档。

## 项目概览

- 本仓库是 `Neko Suite`，一个集成在 VSCode 内的创意工作套件 monorepo。
- 主要技术栈：
  - 前端：React 18、Zustand、Tailwind CSS、Vite
  - 插件：VSCode Extension API、TypeScript、esbuild
  - 媒体引擎：Rust（wgpu、FFmpeg、axum、tokio）+ N-API（napi-rs）
  - 流媒体：H.264 + PCM + fMP4 over WebSocket
  - AI：Vercel AI SDK + MCP Protocol
  - 类型契约：Protobuf
  - 构建：pnpm 10 + Turborepo 2
  - 测试：Vitest、cargo test
- 共享基础核心包：
  - `packages/neko-engine`：Rust 媒体引擎（GPU/FFmpeg/HTTP + ONNX 原生推理）
  - `packages/neko-types`：共享基础设施（Logger、i18n、Theme、Errors）
  - `packages/neko-client`：流媒体客户端与 `EngineClient`
  - `packages/neko-proto`：Protobuf IDL，类型契约单一事实来源
- 功能扩展包：`neko-cut`（视频）、`neko-agent`（AI）、`neko-canvas`（画布）、`neko-model`（3D）、`neko-sketch`（2D 绘画）、`neko-puppet`（2D 骨骼）、`neko-story`（剧本）、`neko-preview`（预览）、`neko-tools`、`neko-assets`、`neko-market`、`neko-audio`、`neko-auth`、`neko-live`、`neko-suite` 等。完整清单与职责见 `ARCHITECTURE_CN.md` 与 `README_CN.md`。

## 开发前先读

- 总体架构先看 `ARCHITECTURE_CN.md`，必要时对照 `ARCHITECTURE.md`。
- 功能背景先看 `README_CN.md`。
- 进入某个领域前，先查阅对应 ADR 或架构文档，例如：
  - VSCode 平台约束（面板放置 / 设备访问）：`docs/architecture/vscode-constraints.md`
  - 媒体 Diff 与 LSP：`docs/architecture/media-lsp.md`
  - 文件格式策略（nk* / JSON Schema / Proto）：`docs/architecture/format-strategy.md`
  - 市场与 Registry（含 registry-server）：`docs/architecture/marketplace.md`
  - 本地模型部署：`docs/architecture/model-runtime.md`
  - 文档预览：`docs/architecture/document-preview.md`
  - 创意上下文压缩：`docs/architecture/creative-context-compression.md`
  - 消融实验框架：`docs/architecture/ablation-experiment-framework.md`
  - Agent 媒体资产：`docs/architecture/agent-media-architecture.md`
  - Agent 统一工作流（IDC 三阶段 + 六平面约束）：`docs/architecture/agent-unified-workflow.md`
  - Agent 能力提供者协议：`docs/architecture/neko-agent-media-requirements-fit.md`
  - 3D 编辑器渲染架构（活跃议题，Proposed 2026-04-27）：`docs/architecture/adr-3d-editor-rendering-architecture.md`
  - 代码审查与质量门禁：`docs/architecture/adr-code-review-quality-gates.md`
- ADR 全集见 `docs/architecture/`，更多条目请直接浏览该目录。

## 架构硬约束

- TypeScript 不要放松以下编译约束：`strict`、`noUncheckedIndexedAccess`、`noImplicitOverride`。
- Webview 沙箱限制必须遵守：
  - Webview 不能直接访问 Node.js API。
  - Webview 不能直接调用 VSCode API。
  - Webview 资源路径必须通过 `webview.asWebviewUri()` 暴露。
  - Webview 与 Extension Host 之间通过 `postMessage` 通信。
- Rust 引擎是计算逻辑和数据模型的权威来源；TypeScript 层负责 UI 与编排，不要重复实现 Rust 已定义的核心计算或数据变换。
- Protobuf 是跨层类型契约的单一事实来源；涉及引擎通信时优先复用 `packages/neko-proto`。
- 路径系统只保存相对路径或 `${VAR}/path` 形式，避免写入绝对路径；优先复用 `PathResolver` 与现有设置机制。
- 遵守共享层级隔离：
  - L0：零依赖基础能力
  - L1：VSCode 相关能力
  - L2：DOM / React 能力
  - 不要破坏依赖方向

## 设计与实现规范

- 遵循“契约优先、自顶向下”顺序：
  1. 先定义类型和接口
  2. 再搭建抽象层或骨架
  3. 最后补齐具体实现
- 文件内代码顺序应从抽象到具体：类型/接口 → 抽象实现 → 具体实现 → 工具函数 → 导出。
- 优先使用以下解耦方式：
  - 依赖注入
  - 抽象接口
  - 注册表模式
  - 策略模式
  - 事件驱动
- 接口应小而专注，命名清晰，避免把多个职责揉进同一模块。
- 实现新功能前，优先复用现有资源：
  - `packages/neko-types/src/`
  - `packages/neko-client/src/`
  - `packages/neko-proto/`
  - `packages/neko-cut/packages/webview/src/components/`
  - `packages/neko-cut/packages/webview/src/hooks/`
  - `packages/neko-agent/packages/platform/src/`

## 禁止与推荐

- 禁止：
  - 在生产代码中滥用 `any`
  - 使用 `console.log` 作为正式调试/日志方案
  - 硬编码配置
  - 忽略异步错误
  - 用 `as Type` 做不安全的强制断言
- 推荐：
  - 用 `unknown` + 类型守卫替代 `any`
  - 使用项目 Logger 替代 `console.log`
  - 用配置、常量或 schema 管理可变参数
  - 为异步流程补齐错误处理、取消和边界检查

## VSCode 插件专项约束

- Webview 侧不要导入 `vscode`。
- Extension 侧不要引入 React。
- 注意 Webview 状态丢失、异步竞态、内存泄漏和 `postMessage` 丢失等常见问题。
- 所有 `vscode.Disposable` 资源都要显式释放。
- 扩展之间不要建立直接依赖，优先走共享层或契约层。

## TODO 与增量实现

- 契约先行但实现暂未完成时，可保留带优先级的 TODO：
  - `TODO(P0)`：必须立即完成
  - `TODO(P1)`：当前迭代核心功能
  - `TODO(P2)`：可延期增强项
- TODO 应与完整接口或骨架实现一起出现，不要边写边发明接口。

## 测试与质量门禁

- 修改完成后按影响范围执行最小必要验证，并逐步扩大：
  - `pnpm build`
  - `pnpm test`
  - `pnpm check`
  - Rust 相关改动：`cd packages/neko-engine && cargo test`
- 重点关注以下架构规则：
  - 禁止循环依赖
  - Layer 0 不得依赖内部包
  - Webview 不得依赖 `vscode`
  - Extension 不得依赖 React
  - 扩展包之间不得交叉依赖
- 新增接口、抽象层或关键分支时，应补充对应单元测试。

## 交付前检查

- 架构上符合 SOLID，职责清晰，无循环依赖。
- 依赖方向正确，高层不依赖低层具体实现。
- 代码遵循契约优先与自顶向下实现。
- 没有遗留明显的 `any`、`console.log`、不安全断言和硬编码。
- 复杂流程或状态机优先补充 Mermaid 或清晰文本说明。
- 影响使用方式、架构约束或模块入口时，同步更新 README / 架构文档。

## 常用命令

```bash
pnpm build
pnpm build:neko-cut
pnpm test
pnpm check
cd packages/neko-engine && cargo test
```
