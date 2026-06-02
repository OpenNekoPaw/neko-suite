# ADR: 代码审查与质量门禁流程

- **Status**: Proposed / Ready for adoption
- **Date**: 2026-06-02
- **Scope**: 全仓库；所有 TypeScript、React Webview、VSCode Extension、Rust engine、Proto、文档和打包流程
- **Related**: [vscode-constraints.md](./vscode-constraints.md), [format-strategy.md](./format-strategy.md), [engine-runtime-layering.md](./engine-runtime-layering.md), [adr-webview-ui-design-system.md](./adr-webview-ui-design-system.md), [adr-unified-viewport-protocol.md](./adr-unified-viewport-protocol.md)

## 1. 背景

Neko Suite 是一个 VSCode 内创意工作套件 monorepo，包含 React Webview、VSCode Extension Host、Rust 媒体引擎、Protobuf 契约、AI Agent、资产/市场/预览等多个子系统。单一的“代码风格 review”不足以控制真实风险：

- Webview、Extension Host、Rust engine、Proto 的错误类型不同，审查重点也不同。
- 跨层通信依赖稳定契约，不能只检查局部实现。
- 媒体、渲染、AI 工作流存在功能、UX、性能和专业软件对标风险。
- 仓库已有 GitHub Actions CI、Vitest、cargo test、dependency-cruiser、Knip、Proto sync 检查，但本地质量入口和人工审查标准需要统一。

本 ADR 定义一套仓库级代码审查与质量门禁流程：统一基线，按风险和子包职责追加专项检查。

## 2. 决策

采用 **统一 Review 基线 + 风险分级 + 子包专项清单 + 自动化证据** 的审查模型。

核心原则：

1. **架构优先**：先审查职责、依赖方向、契约边界，再审查实现细节。
2. **契约优先**：跨模块、引擎通信、Webview/Extension 通信、Proto/DTO/schema 变更必须先确认接口稳定性。
3. **风险分级**：小改动不套重流程；跨模块、核心数据、媒体引擎、公共 API 改动必须扩大审查面。
4. **证据驱动**：功能、UX、性能、CI 结果需要可复现证据，不能只凭“看起来正常”。
5. **自动化先行，人工兜底**：格式、类型、边界、测试、依赖由工具优先检查；架构取舍、UX、专业工作流由 reviewer 判断。

## 3. 审查入口分类

每个 PR 或重要本地变更先归类，决定审查强度。

| 等级    | 适用改动                                                         | 必要审查                                                      |
| ------- | ---------------------------------------------------------------- | ------------------------------------------------------------- |
| L0 轻量 | 文案、样式、小型 bug、单文件低风险修复                           | 作者自检 + 相关测试或截图                                     |
| L1 普通 | 新组件、hook、service、小型 API、局部状态逻辑                    | 通用 checklist + 单元测试 + 最小构建                          |
| L2 跨层 | Webview/Extension 通信、EngineClient、共享包、公共类型、导入导出 | 五层分析 + 契约测试 + CI 相关 job                             |
| L3 核心 | Rust engine、Proto、媒体流、渲染、项目格式、AI 工作流、打包发布  | 架构 reviewer + 自动化门禁 + smoke/integration + 性能/UX 证据 |
| L4 发布 | release、平台打包、重大 UX、核心创作工作流                       | 完整 CI + 安装/运行 smoke + 专业软件对标验收                  |

## 4. 作者自检

提交 review 前，作者必须先回答三个问题：

1. 是否符合现有架构？
2. 如何进一步降低耦合？
3. 是否易于扩展与测试？

遇到多模块改动、新功能或公共契约变更，必须补充五层分析：

| 层面 | 必答问题                                                     |
| ---- | ------------------------------------------------------------ |
| 职责 | 谁拥有数据、行为和生命周期？是否把 UI、编排、计算混在一起？  |
| 依赖 | 依赖方向是否符合 L0/L1/L2、Webview/Extension、TS/Rust 边界？ |
| 接口 | 类型、Proto、message、schema 是否最小、稳定、可验证？        |
| 扩展 | 下一类同功能是否需要复制粘贴或修改大量调用方？               |
| 测试 | 哪些行为由单测、集成、CLI smoke、真实 VSCode 验证覆盖？      |

作者还应在 PR 描述中提供：

- 改动目的和用户路径。
- 影响包和风险等级。
- 本地运行过的命令。
- 截图、录屏、性能数据或 CLI 输出摘要。
- 未覆盖风险和后续 TODO。

## 5. 通用代码审查清单

所有代码 review 都必须覆盖以下基线：

| 类别 | 检查点                                                                                                                             |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 架构 | 职责单一；无循环依赖；不绕过共享层；不重复 Rust/Proto 已定义的权威逻辑                                                             |
| 类型 | 不新增生产 `any`；避免不安全 `as Type`；使用 `unknown` + 类型守卫；保留 `strict`、`noUncheckedIndexedAccess`、`noImplicitOverride` |
| 异步 | 错误处理、取消、超时、资源释放、竞态边界明确                                                                                       |
| 日志 | 生产代码使用项目 Logger，不用 `console.log` 作为正式日志                                                                           |
| 配置 | 不硬编码路径、端口、阈值；路径遵守相对路径或 `${VAR}/path` 策略                                                                    |
| 测试 | 新接口、关键分支、状态机、失败路径有测试或明确验证理由                                                                             |
| 文档 | 影响架构、使用方式、公共接口、配置或格式时同步 README/ADR/spec                                                                     |

## 6. 子包专项清单

不同子系统使用同一流程，但追加不同专项检查。

| 子系统           | 适用包                                             | 专项检查                                                                                                  |
| ---------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 核心契约层       | `packages/neko-proto`, `packages/neko-types`       | 向后兼容；生成类型同步；无 VSCode/React 依赖泄漏；公共 API 是否稳定                                       |
| 客户端通信层     | `packages/neko-client`                             | HTTP/WS URL 构造；错误传播；重试/取消；与 Rust response schema 一致                                       |
| VSCode Extension | 各 `packages/*/packages/extension`, extension 根包 | 不引入 React；正确释放 `vscode.Disposable`；Webview 资源经 `asWebviewUri()`；CSP 正确；postMessage 可恢复 |
| Webview / React  | 各 `packages/*/packages/webview`                   | 不导入 `vscode`；状态边界清晰；组件职责小；暗色主题、i18n、焦点、快捷键、resize 行为正确                  |
| Rust engine      | `packages/neko-engine/**`                          | Rust 为计算权威；FFmpeg/GPU/ONNX 边界清楚；并发安全；错误类型可诊断；`cargo test` 和 clippy 通过          |
| Agent / AI       | `packages/neko-agent/**`                           | 工具契约、权限、上下文压缩、失败恢复、Journal/trace 证据、可观察性                                        |
| Asset / Market   | `packages/neko-assets`, `packages/neko-market`     | registry/manifest/schema；路径安全；缓存失效；版本兼容；第三方资产信任边界                                |
| Preview / Tools  | `packages/neko-preview`, `packages/neko-tools`     | 预览资源访问边界；二进制文件通过 engine/file access；diff/inspection 结果可解释                           |
| 应用集成         | `packages/neko-suite`, extension pack              | 依赖声明、激活顺序、打包内容、用户入口稳定性                                                              |

## 7. 功能检查

功能检查是所有 PR 的最低验收。

| 检查项   | 要求                                                              |
| -------- | ----------------------------------------------------------------- |
| 主路径   | 覆盖用户从入口到结果的完整路径，而不是只测单个函数                |
| 边界状态 | 空状态、加载中、失败、权限拒绝、取消、重试、重复触发              |
| 契约一致 | Webview message、EngineClient、Rust action、Proto/DTO/schema 同步 |
| 回归测试 | 修 bug 必须优先补可失败的回归测试；若不可测，说明原因             |
| 兼容性   | 公共 API、文件格式、配置字段变更需要兼容策略或迁移说明            |

推荐验证方式：

- Webview/Extension：Vitest + mock postMessage/EngineClient。
- Engine：`cargo test` + CLI action smoke。
- 跨层：`serve` + HTTP/WS integration test。
- 真实 VSCode：仅用于 smoke 或问题复现，不替代单元测试。

## 8. UX 检查

UI、工作流、编辑器交互改动必须进行 UX 检查。

| 检查项   | 要求                                                          |
| -------- | ------------------------------------------------------------- |
| 工作流   | 首屏直接进入可用工作区；常见任务步骤少且状态可见              |
| 交互     | 工具栏、面板、快捷键、右键菜单、拖拽、resize 符合专业创作习惯 |
| 反馈     | 保存、导出、生成、连接 engine、长任务进度和失败原因清楚       |
| 布局     | 小窗口、宽屏、VSCode sidebar 变化、暗色主题下不重叠、不溢出   |
| 可访问性 | 焦点顺序、按钮语义、ARIA、键盘可达性符合已有组件标准          |
| i18n     | 新增文案同步中文/英文或遵循模块现有语言策略                   |

验证工具：

- 本地 Vite/Vitest layout tests 覆盖可自动断言的布局逻辑。
- `vscode-extension-debugger` 用于真实 VSCode Webview 运行态诊断：DOM、console、CSP、postMessage、截图。
- 必要时提交截图或短录屏作为 review 证据。

## 9. 性能检查

媒体、渲染、timeline、preview、AI、启动路径改动必须给出性能判断。

| 区域               | 关注指标                                                  |
| ------------------ | --------------------------------------------------------- |
| Webview            | 首屏时间、交互响应、React 重渲染、拖拽/缩放流畅度         |
| Timeline / Preview | seek 延迟、播放帧率、缩略图生成速度、大项目滚动           |
| Rust engine        | probe/capture/export/stream 延迟、内存、GPU/FFmpeg 稳定性 |
| Extension          | 激活时间、Webview 恢复时间、Disposable 泄漏               |
| Agent              | 工具调用延迟、上下文压缩成本、失败恢复时间                |

性能门禁分级：

- L0/L1：不得引入明显卡顿或无界内存增长。
- L2/L3：提供前后对比数据或固定 fixture smoke 结果。
- L4：跑完整 benchmark 或发布前性能验收。

建议固定轻量 fixture 放在 `test-fixtures/` 下；大媒体、大模型、大 PSD/MOC3/GLB 用环境变量指向外部测试库，例如 `NEKO_TEST_FIXTURES=/path/to/neko-test/cases`，禁止把绝对路径写入代码或项目文件。

## 10. 专业软件对标

专业软件对比不要求每个 PR 执行，但以下场景必须执行：

- 新核心编辑能力设计前。
- 大版本验收。
- 重大 UX 或工作流重构。
- 性能目标和交互默认值存在争议。
- 视频、音频、3D、绘画、骨骼动画等核心体验进入 release gate。

| 领域        | 参考对象                             | 对标问题                                                   |
| ----------- | ------------------------------------ | ---------------------------------------------------------- |
| 视频剪辑    | DaVinci Resolve, Premiere, Final Cut | 剪辑、seek、预览、导出、字幕、调色路径是否符合创作者直觉   |
| 3D          | Blender, Unity Editor                | 视口、选择、变换、材质、灯光、预览模式是否清晰             |
| 2D 绘画     | Krita, Photoshop, Clip Studio Paint  | 图层、笔刷、选择、历史、导入导出是否可靠                   |
| 骨骼动画    | Live2D Cubism, Spine, Inochi2D       | 骨骼、参数、表情、权重、预览、导出契约是否完整             |
| 音频        | Reaper, Audition, Logic              | 波形、混音、响度、导出、实时反馈是否专业                   |
| VSCode 集成 | VSCode 原生面板、Jupyter、GitLens    | Webview 生命周期、焦点、命令、状态恢复是否符合 VSCode 习惯 |

对标不是复制功能，而是提取验收基准：任务步数、默认行为、状态可见性、错误恢复、大文件流畅度、输出质量、快捷键和工具组织。

## 11. 本地检查流程

当前本地 pre-commit 仅运行 `pnpm lint-staged`。正式提交 PR 前，作者应按影响范围运行：

### TypeScript / Webview / Extension

```bash
pnpm format:check
pnpm lint
pnpm build
pnpm test -- --run
pnpm check
```

### Rust engine

```bash
cd packages/neko-engine
cargo fmt --all -- --check
cargo clippy --workspace -- -D warnings
cargo test --workspace
```

### Proto

```bash
pnpm generate:types
git diff --exit-code packages/neko-types/src/generated/
```

仓库提供本地 CI 等价入口：

```json
{
  "scripts": {
    "ci:local": "pnpm format:check && pnpm lint && pnpm build && pnpm test -- --run && pnpm check",
    "ci:local:rust": "cd packages/neko-engine && cargo fmt --all -- --check && cargo clippy --workspace -- -D warnings && cargo test --workspace",
    "ci:local:proto": "pnpm generate:types && git diff --exit-code packages/neko-types/src/generated/"
  }
}
```

不建议把完整 `build + test + cargo test` 强制放入 pre-commit；pre-commit 应保持轻量，完整门禁放在 PR 前手动执行、pre-push 可选执行或 CI 强制执行。

## 12. CI 门禁

GitHub Actions CI 是合并前的强制质量门禁。现有 `.github/workflows/ci.yml` 已覆盖：

| Job               | 目的                                                     |
| ----------------- | -------------------------------------------------------- |
| Build & Lint      | TS 格式、lint、build                                     |
| TypeScript Tests  | Vitest + coverage artifact                               |
| Rust Tests        | `cargo fmt`、clippy、workspace tests、ONNX feature tests |
| Cargo Deny        | Rust 依赖审计                                            |
| Proto Types Sync  | Proto 生成类型同步                                       |
| Code Quality      | Knip + dependency-cruiser 架构规则                       |
| Dependency Review | PR 依赖安全审查                                          |
| VSIX Packaging    | main push 平台打包验证                                   |

仓库提供显式 smoke 命令，按需要在本地、release gate 或后续 CI job 中调用：

```bash
pnpm smoke:engine        # engine CLI + serve /health + dispatch smoke
pnpm smoke:webview       # 构建所有 webview 包，可用 NEKO_WEBVIEW_SMOKE_PACKAGES 限定范围
node scripts/smoke-webview-builds.mjs --list  # 仅列出将被构建的 webview 包
pnpm smoke               # engine + webview smoke
```

推荐后续补充：

1. **Media fixture smoke**：固定小 fixture 跑 `videos probe`、`videos capture`、基础 export。
2. **Engine WebSocket integration**：扩展 `neko-engine serve` smoke，覆盖 stream/control socket。
3. **Webview runtime smoke**：使用可重复的 headless 或 VSCode extension test runner，覆盖关键 Webview 入口、截图和 console。
4. **性能 nightly**：固定 fixture 记录 probe/capture/export/preview 指标，PR 只跑轻量 smoke。
5. **覆盖率阈值演进**：按包逐步提高阈值，不一次性全仓库硬卡。

## 13. Reviewer 评论规范

Review comment 应说明问题、影响、建议和级别。

推荐格式：

```text
级别：Blocking
问题：这里在 Webview 层重复实现了 Rust engine 已拥有的时间轴计算逻辑。
影响：后续 engine 规则变化时，TS 和 Rust 可能产生不一致结果。
建议：通过 EngineClient 暴露查询接口，Webview 只消费结果并负责展示。
```

级别定义：

| 级别       | 含义                                                          |
| ---------- | ------------------------------------------------------------- |
| Blocking   | 必须修改；否则引入 bug、架构破坏、安全/数据风险或不可接受回归 |
| Suggestion | 建议修改；能提升可维护性、一致性、性能或测试质量              |
| Question   | 需要澄清设计意图、契约边界或风险                              |
| Nit        | 小问题；不应阻塞合并                                          |

Reviewer 不应只写“感觉不好”。应指出可验证风险和可执行替代方案。

## 14. 合并规则

合并前必须满足：

1. 对应风险等级的自动化检查通过，或在 PR 中说明未运行原因。
2. Blocking 评论全部解决。
3. 公共契约、架构、格式、打包、用户入口变更有文档同步。
4. L2/L3/L4 改动至少有一名熟悉相关子系统的 reviewer。
5. UI/UX 改动有截图、录屏或真实 VSCode smoke 证据。
6. 性能敏感改动有前后对比或明确不影响性能的理由。

允许例外，但必须显式记录：

- 为什么跳过某项检查。
- 风险是什么。
- 后续补救任务和负责人。
- 是否需要 feature flag 或回滚方案。

## 15. 结果

### 正向影响

- Review 从风格检查提升为架构、契约、功能、UX、性能的统一质量控制。
- 子包保持统一流程，同时覆盖各自真实风险。
- CI、本地检查和人工审查职责边界清晰。
- 质量证据可复现，便于回归和 release 验收。

### 成本

- L2/L3/L4 改动需要更多 review 和验证材料。
- 需要维护 fixture、smoke test、性能基线和专业软件对标记录。
- Reviewer 需要按领域分工，不能只依赖单人全仓库审查。

### 非目标

- 不把所有检查强塞进 pre-commit。
- 不要求每个 PR 都做专业软件对标。
- 不用手工 VSCode Debugger 替代自动化测试。
- 不改变现有包边界或引入新的运行时依赖。

## 16. 后续任务

1. 为 engine 增加媒体 fixture smoke：`videos probe`、`videos capture`、基础 export。
2. 为 engine `serve` smoke 增加 WebSocket stream/control 覆盖。
3. 为 Webview 增加运行时 smoke 和截图验证流程。
4. 建立 `test-fixtures/media/smoke` 轻量媒体样本和外部大 fixture 约定。
5. 按领域建立专业软件对标 checklist，并在 release gate 使用。

## 17. 实施记录

- 2026-06-02：新增项目 skill `.codex/skills/neko-quality-review/SKILL.md`，用于 Agent 在新增功能、修改代码或执行 review 时按本 ADR 自审。
- 2026-06-02：新增 `pnpm ci:local`、`pnpm ci:local:rust`、`pnpm ci:local:proto` 本地质量入口。
- 2026-06-02：新增 `.github/pull_request_template.md`，要求 PR 填写风险等级、影响范围、架构自检、功能/UX/性能证据、验证命令和剩余风险。
- 2026-06-02：新增 `pnpm smoke:engine`、`pnpm smoke:webview` 和 `pnpm smoke`，提供 engine CLI、engine serve HTTP/dispatch、webview build 的显式 smoke 入口。
