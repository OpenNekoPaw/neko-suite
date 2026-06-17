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
- 新增功能或非平凡代码修改后，按本文“测试与质量门禁”章节和 `CONTRIBUTING_CN.md` 做自审；可使用项目 skill `.codex/skills/neko-quality-review/SKILL.md`，并在交付说明中列出验证命令与剩余风险。

## 语言与沟通

- 面向用户的说明优先使用中文。
- 新增代码注释应优先遵循所在模块既有风格；若无明确先例，使用简洁英文注释说明非显然约束。
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

- 功能背景先看 `README_CN.md`，必要时对照 `README.md`。
- 总体架构先看 `ARCHITECTURE_CN.md`，必要时对照 `ARCHITECTURE.md`。
- 文档导航先看 `docs/README.md`，不要猜测具体文档路径。
- 系统级架构、ADR 和跨领域约束从 `docs/architecture/README.md` 进入。
- 子包边界、UI 层、公共代码、Extension/Webview/Engine 约束先看 `docs/architecture/package-boundaries.md`。
- 领域能力、领域架构和跨包领域边界从 `docs/domains/README.md` 进入，再进入 `docs/domains/<domain>/README.md`。
- 调研、竞品、技术 spike 和 UX 分析从 `docs/research/README.md` 进入。
- Gap、迁移、健康度和审计快照从 `docs/status/README.md` 进入。
- 活跃设计变更优先查 `openspec/changes/`。
- 若根架构与包级文档冲突，以当前代码和根架构约束为准。

## 文档治理

- 根目录 `README_CN.md` / `README.md` 是项目入口；`ARCHITECTURE_CN.md` / `ARCHITECTURE.md` 是系统架构总览入口。
- `docs/architecture/` 只放系统级约束、ADR 和跨领域不变量。
- `docs/domains/<domain>/` 放领域能力模型、领域数据流和领域内部架构；领域架构文件命名为 `architecture.md`。
- `docs/research/` 放调研、竞品、市场、技术 spike 和 UX 分析；此类文档必须带日期、来源或不确定性说明。
- `docs/status/` 放带日期的 gap、迁移进度、健康度和审计快照；此类文档不作为长期架构事实来源，也不承担任务管理。
- `openspec/changes/` 放仍在设计或实施中的变更；稳定结论再提升到 `docs/architecture/` 或 `docs/domains/`。
- `packages/<pkg>/docs/` 放只服务某个包的实现、配置和维护说明。
- 新增或移动文档前，先判断它是系统约束、领域模型、调研分析、当前状态、开发变更还是包私有实现。
- 不要把领域内部架构放入 `docs/architecture/<domain>/`；应放入 `docs/domains/<domain>/architecture.md`。
- 不要把实现日志、命令输出、阶段完成记录或临时状态写成架构事实。
- 状态文档中的行动项需要设计、实现或验收时，转入 `openspec/changes/`；只是排队事项时，转入 `TODO_CN.md` / `TODO.md`；长期方向转入 `ROADMAP_CN.md` / `ROADMAP.md`。

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
  - `packages/neko-ui/src/`
  - `packages/neko-cut/packages/webview/src/components/`
  - `packages/neko-cut/packages/webview/src/hooks/`
  - `packages/neko-agent/packages/platform/src/`
- 新增 Webview/React 组件前必须先做组件复用审计：搜索 `@neko/ui`、同包 `components/`、`hooks/`、`shared/`、相邻领域包和已有测试，优先增强旧组件、提取 prop/slot/variant、或抽出 package-local adapter。
- 只有在职责、状态生命周期、交互契约或可访问性语义明显不同，且增强旧组件会增加耦合或破坏既有使用方时，才新增组件；新增时需在 OpenSpec、PR 或交付说明中写明复用审计结论。
- 不要为单个页面复制按钮、选择器、面板、空状态、工具栏、列表、卡片、输入区、Header/Input 等已有模式；跨两个以上 Webview 复用的无业务 UI 优先进入 `@neko/ui`，领域专属适配留在 owning package。

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
- Vite/浏览器/Chrome/Playwright 只可作为 Webview 热重载和纯浏览器兼容性辅助；涉及 VS Code Extension Webview 的视觉、交互、CSP、消息、焦点或媒体验证时，必须使用 Extension Development Host + `vscode-extension-debugger` Skill。除非用户明确要求浏览器兼容性测试，不要调用 Chrome/Browser/Playwright 作为默认验证路径，也不要把普通浏览器打开 `localhost` 当作运行态验收。
- 注意 Webview 状态丢失、异步竞态、内存泄漏和 `postMessage` 丢失等常见问题。
- 所有 `vscode.Disposable` 资源都要显式释放。
- 扩展之间不要建立直接依赖，优先走共享层或契约层。

## TODO 与增量实现

- 契约先行但实现暂未完成时，可保留带优先级的 TODO：
  - `TODO(P0)`：必须立即完成
  - `TODO(P1)`：当前迭代核心功能
  - `TODO(P2)`：可延期增强项
- TODO 应与完整接口或骨架实现一起出现，不要边写边发明接口。

## Prelaunch 兼容策略

- 项目尚未发布时，可以对未发布的内部 API、DTO、Webview message、Agent workflow payload、测试 fixture 和 nk\* 草稿格式做显式破坏性调整，用于清理 legacy debt 或收敛到更清晰的架构。
- “未发布”不等于忽略版本兼容性。破坏性变更必须说明影响范围，以及旧数据是迁移、重建、重新导入、忽略还是有意丢弃。
- 不要为了未发布草稿保留长期 compatibility shim；确需保留时必须有 owner、replacement、验证命令和移除条件。
- 不能借 prelaunch cleanup 忽略 VS Code、Node、pnpm、Rust、OS、Webview sandbox、CSP、codec、Range、Engine、Proto、marketplace trust 或安全边界。
- 不能静默删除或损坏有价值的本地项目数据、用户设置、trust state、entitlement、插件安装记录或生成产物；必须提供迁移、重建、确认或 fail-closed diagnostic。

## 测试与质量门禁

- 修改完成后按影响范围执行最小必要验证，并逐步扩大：
  - `pnpm build`
  - `pnpm test`
  - `pnpm check`
  - Rust 相关改动：`cd packages/neko-engine && cargo test`
  - Webview 视觉/交互改动：运行 `pnpm smoke:webview:runtime` 或等价的 `vscode-extension-debugger` Skill 验证；仅浏览器/Vite/Chrome/Playwright 验证不足以证明 VS Code Webview 运行态正确。
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
