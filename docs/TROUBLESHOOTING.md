# NekoCut 统一排错文档

最后更新：2026-04-08
维护范围：`packages/neko-cut`（`extension + webview`）

## 使用说明

- 本文档用于集中记录已确认问题、影响范围、定位线索和修复进度。
- 问题编号格式：`NKC-XXX`。
- 状态定义：
  - `open`：已确认，未修复
  - `in_progress`：修复中
  - `fixed`：已修复，待回归
  - `verified`：已回归验证通过

## 问题总览（当前批次）

| 编号 | 严重级别 | 状态 | 问题摘要 |
|---|---|---|---|
| NKC-001 | P0 | fixed | `NekoCutAPI.timeline` 命令名与实际注册不一致，跨扩展 API 调用失败 |
| NKC-002 | P0 | fixed | `TimelineBridge` 请求有发送无接收，调用 30s 超时 |
| NKC-003 | P0 | fixed | `asset:*` 资产消息未接入主消息路由，资产库请求无法闭环 |
| NKC-004 | P0 | fixed | AI 状态消息协议不一致，Webview 无法正确更新 AI 状态 |
| NKC-005 | P1 | fixed | 导出完成事件丢失 `outputPath`，后续”打开文件/目录”链路受影响 |
| NKC-006 | P1 | fixed | AI 输入源路径解析仍为占位实现，真实媒体处理易失败 |
| NKC-007 | P1 | open | 资源访问边界偏宽 + 同步 I/O，存在安全与性能风险 |
| NKC-008 | P1 | fixed | 多编辑器场景下状态栏/大纲更新存在可见性竞态 |
| NKC-009 | P2 | open | 扩展侧存在未接线/残留执行路径，增加维护成本与歧义 |
| NKC-010 | P1 | open | 当前测试主要覆盖 webview slice，extension 协议链路覆盖不足 |

## 问题详情

### NKC-001：`NekoCutAPI.timeline` 命令名不一致（P0）

- 影响：对外暴露 API 基本不可用或行为异常。
- 定位：
  - 调用：`packages/extension/src/extension.ts`（`neko.cut.timeline.*`）
  - 实际注册：`packages/extension/src/commands/timeline-commands.ts`（`neko.timeline.*`、`neko.element.*`）
- 建议：统一命名空间，优先保证 API 与注册命令 1:1 对齐。

### NKC-002：`TimelineBridge` 协议断链（P0）

- 影响：Bridge 请求超时（30s），对应命令不可用。
- 定位：
  - 发送与超时：`packages/extension/src/bootstrap/toolsBootstrap.ts`
  - Webview 未处理 `timelineBridgeRequest`（当前仅见 `tool.execute` 协议）
- 建议：二选一
  - 方案 A：补齐 `timelineBridgeRequest/Response` 处理；
  - 方案 B：移除 Bridge，统一到 `tool.execute/tool.result`。

### NKC-003：资产库消息未接线（P0）

- 影响：资产库增删改查、导入、对比等请求无法到达 Extension 处理器。
- 定位：
  - Webview 发送：`packages/webview/src/components/AssetLibrary/useAssetLibrary.ts`
  - 处理器存在但未接线：`packages/extension/src/handlers/assetHandlers.ts`
  - 主入口未路由到 `assetHandlers`：`packages/extension/src/editor/video/videoEditorProvider.ts` / `messageHandler.ts`
- 建议：在 Provider 消息总线优先分发 `asset:*` 到 `handleAssetMessage`。

### NKC-004：AI 状态消息协议不一致（P0）

- 影响：前端 `activeAIAction` 状态无法按预期更新，用户感知为“AI 无反馈/状态卡死”。
- 定位：
  - Extension 发送：`aiActionStarted/aiActionProgress/aiActionResult`
  - Webview 监听：`aiActionStatus`
  - 相关文件：`packages/extension/src/services/AIActionHandler.ts`、`packages/webview/src/hooks/useVSCodeMessaging.ts`
- 建议：统一为单一协议（推荐 `aiActionStatus`），并做向后兼容映射。

### NKC-005：导出完成丢失 `outputPath`（P1）

- 影响：成功导出后无法稳定执行“打开文件/目录”等后置动作。
- 定位：`packages/extension/src/services/ExportService.ts` 完成事件中 `outputPath` 为 `undefined`。
- 建议：在 job 上下文保留并回传真实输出路径。

### NKC-006：AI 源路径解析为占位实现（P1）

- 影响：`upscale/denoise/transcribe` 等动作可能输入错误路径而失败。
- 定位：`packages/extension/src/services/AIActionHandler.ts` 中存在 `TODO(P0)`，`resolveElementSourcePath` 逻辑不完整。
- 建议：通过 `VideoEditorModel` 按 `elementId` 解析真实 `src`，并做路径规范化。

### NKC-007：访问边界偏宽 + 同步 I/O（P1）

- 影响：安全边界收敛不足、主线程阻塞风险提升。
- 定位：
  - `localResourceRoots` 放宽到 workspace/父目录/项目根：`videoEditorProvider.ts`
  - `readFileRange` 使用 `statSync/openSync/readSync`：`messageHandler.ts`
  - 绝对路径直接放行：`services/tools/helpers.ts`
- 建议：收紧可访问根目录、改为异步 I/O、增加路径白名单校验。

### NKC-008：多编辑器可见性竞态（P1）

- 影响：多个编辑器并存时，状态栏与大纲可能被非当前面板误清空。
- 定位：`videoEditorProvider.ts` 中 `onDidChangeViewState` 与 `onDidDispose` 的全局更新策略。
- 建议：按“当前 active 文档”更新状态，不可见/关闭事件需二次确认活动面板。

### NKC-009：未接线/残留执行路径（P2）

- 影响：代码可读性下降，后续维护成本上升，易引入重复逻辑。
- 定位：
  - 扩展侧 `TimelineToolExecutor` 仅测试使用，未接入主链路
  - Webview 存在 `tool.execute` 执行器但未见初始化入口
- 建议：删除无用路径或完成接线并补测试。

### NKC-010：测试覆盖盲区（P1）

- 影响：协议不一致、消息路由等 extension 关键问题难以及时暴露。
- 定位：
  - `packages/neko-cut/vitest.config.ts` 排除了 extension 目录
  - 当前通过用例主要为 webview slice 与 utils
- 建议：补 extension 集成测试（命令注册、消息路由、导出/AI/资产链路）。

## 本批次验证信息

- 命令：`pnpm -C packages/neko-cut test -- --run`
- 结果：通过（11 文件 / 399 用例）
- 说明：本次结果不能覆盖 extension 消息协议链路问题（见 NKC-010）

---

## 追加记录：2026-04-07（neko-agent）

维护范围：`packages/neko-agent`（`agent + extension + platform + webview + cli-tui`）

### 问题总览（追加）

| 编号 | 严重级别 | 状态 | 问题摘要 |
|---|---|---|---|
| NKA-001 | P0 | fixed | 会话反复 `configure` 触发 session 重建，存在上下文断档风险 |
| NKA-002 | P0 | fixed | `workspaceRoot` 未在主链路透传，导致 AGENTS/记忆/工具工作目录能力退化 |
| NKA-003 | P1 | verified | Plan 模式只读工具缺少工作区边界，存在越界读取风险 |
| NKA-004 | P1 | fixed | Skill 默认允许执行内嵌 shell，存在供应链执行风险 |
| NKA-005 | P1 | fixed | `maxIterations: Infinity` 可能导致异常链路下成本与时延失控 |
| NKA-006 | P2 | open | `lint` 脚本与当前 ESLint Flat Config 不兼容，质量门禁失效 |
| NKA-007 | P2 | open | 默认测试集包含真实 API 集成用例，离线/无网环境不稳定 |
| NKA-008 | P3 | open | 构建脚本与代码结构存在维护性问题（脚本混用、巨型文件、硬编码 TODO） |

### 问题详情（追加）

#### NKA-001：会话重建导致上下文断档（P0）
- 影响：多轮对话可能出现“表面连续、实际上下文丢失”，影响推理稳定性与可复现性。
- 定位：
  - `packages/neko-agent/packages/extension/src/chat/messageHandler.ts` 每次消息都调用 `agentRunner.configure(...)`
  - `packages/neko-agent/packages/extension/src/ai/agentRunner.ts` 中 `configure` 会 `dispose` 旧 session 并新建 session
- 建议：
  - 将 `configure` 拆分为“首次初始化 + 增量更新配置”
  - 增加多轮对话上下文保留回归测试

#### NKA-002：`workspaceRoot` 主链路未透传（P0）
- 影响：AGENTS.md、项目记忆、core tools 默认工作目录能力退化。
- 定位：
  - `packages/neko-agent/packages/extension/src/chat/messageHandler.ts` 调用 `configure` 未传 `workspaceRoot`
  - `packages/neko-agent/packages/extension/src/ai/agentRunner.ts` 对 `workspaceRoot` 有明确依赖
- 建议：在消息主链路与 plan 执行链路统一透传 `workspaceRoot`。

#### NKA-003：Plan 模式缺少工作区读边界（P1）
- 影响：提示词注入场景下可能读取工作区外敏感文件。
- 定位：
  - `packages/neko-agent/packages/agent/src/permission/rule-matcher.ts` 在 plan 模式放行 read-only 工具
  - `packages/neko-agent/packages/agent/src/tools/core/read-tool.ts`、`list-directory-tool.ts` 未限制读取边界
- 建议：为 `Read/ListDirectory/Grep` 加统一工作区白名单校验。

#### NKA-004：Skill 默认执行 shell（P1）
- 影响：第三方 skill 激活时可能执行本地命令，扩大安全攻击面。
- 定位：
  - `packages/neko-agent/packages/agent/src/skill/skill-injector.ts` 默认启用 shell
  - `packages/neko-agent/packages/agent/src/skill/shell-replacer.ts` 使用 `bash -c`
- 建议：默认关闭 shell 执行，改为显式启用 + 审批。

#### NKA-005：无上限迭代配置（P1）
- 影响：异常循环场景下 token 成本、执行时延不可控。
- 定位：
  - `packages/neko-agent/packages/extension/src/chat/messageHandler.ts` 与 `planModeHandler.ts` 使用 `maxIterations: Infinity`
  - `packages/neko-agent/packages/agent/src/executor/agent-executor.ts` 循环由该上限控制
- 建议：改为有限上限（如 30/50）+ 可配置。

#### NKA-006：`lint` 脚本失效（P2）
- 影响：静态检查门禁不可用，回归风险上升。
- 定位：
  - `packages/neko-agent/package.json` 的 `lint` 使用 `--ext`
  - 当前仓库使用 ESLint Flat Config
- 建议：改为兼容命令（如 `eslint packages`），并统一 ESLint 主版本。

#### NKA-007：默认测试包含真实 API 集成（P2）
- 影响：离线/受限网络环境下测试不稳定。
- 定位：
  - `packages/neko-agent/vitest.config.ts` 包含 `packages/platform/src/**/*.test.ts`
  - `packages/neko-agent/packages/platform/src/__tests__/integration.test.ts` 依赖真实配置和外网
- 建议：拆分 `test` 与 `test:integration`，默认排除真实 API 用例。

#### NKA-008：构建与可维护性问题（P3）
- 影响：跨平台构建一致性与长期维护效率下降。
- 定位：
  - `packages/neko-agent/package.json` 构建脚本混用 `npm` 与 shell 命令
  - `packages/neko-agent/packages/extension/src/tools/extensionTools.ts` 文件体量过大
  - 存在关键 TODO（版本硬编码、mediaType 占位）
- 建议：统一脚本、拆分巨型文件、把关键 TODO 转 issue 编号跟踪。

### 本批次验证信息（追加）

- 命令：`pnpm --filter neko-agent lint`
- 结果：失败（`--ext` 与 Flat Config 不兼容）
- 命令：`pnpm --filter neko-agent test -- --runInBand`
- 结果：失败（1725 用例中 2 例依赖真实 API 网络访问）
- 命令：`pnpm --filter neko-agent compile`
- 结果：通过（存在构建告警）

---

## 追加记录：2026-04-07（neko-preview）

维护范围：`packages/neko-preview`（`extension + webview`）

### 问题总览（追加）

| 编号 | 严重级别 | 状态 | 问题摘要 |
|---|---|---|---|
| NKP-001 | P0 | fixed | 错误页直接拼接动态字符串且无 CSP，存在 XSS 注入面 |
| NKP-002 | P1 | verified | CBZ 预览的 Blob URL 回收不完整，长会话存在内存泄漏风险 |
| NKP-003 | P1 | open | 文档预览文件服务端口缓存未失效重试，engine 重启后可能持续失败 |
| NKP-004 | P1 | open | 对外声明配置项未落地（`videoQuality`/`autoPlay`） |
| NKP-005 | P2 | fixed | 文档消息协议与实现漂移，类型约束与实际 payload 不一致 |
| NKP-006 | P1 | open | 测试覆盖盲区集中在文档链路与 EPUB 解析，回归风险偏高 |
| NKP-007 | P2 | open | `copy:webview` 构建脚本吞错，可能打包不完整产物 |
| NKP-008 | P3 | open | `AudioPlayer` 存在重复卸载清理逻辑，增加维护复杂度 |

### 问题详情（追加）

#### NKP-001：错误页存在注入面（P0）
- 影响：异常消息包含可控输入时，可能在 webview 中形成脚本注入风险。
- 定位：
  - `packages/neko-preview/packages/extension/src/providers/document/documentProviderHelper.ts`
  - `packages/neko-preview/packages/extension/src/providers/VideoPreviewProvider.ts`
  - `packages/neko-preview/packages/extension/src/providers/AudioPreviewProvider.ts`
- 建议：统一引入 HTML 转义函数，错误页添加最小 CSP，禁止内联脚本执行。

#### NKP-002：CBZ Blob URL 回收不完整（P1）
- 影响：高频翻页或长时间阅读后内存占用持续增长。
- 定位：`packages/neko-preview/packages/webview/src/cbz/CbzViewer.tsx` 中卸载回收使用了初始闭包 `pageCache`。
- 建议：改为使用 `ref` 持有最新缓存并在卸载时全量回收，或在 `pageCache` 变化时增量回收。

#### NKP-003：PreviewFileServer 端口缓存无失效重试（P1）
- 影响：`neko-engine` 端口变化后，文档预览可能长期不可用，需重启扩展恢复。
- 定位：`packages/neko-preview/packages/extension/src/providers/document/PreviewFileServer.ts`
- 建议：`fetch` 失败时清空 `_port` 并重走 `ensureFrameServer`；对 `5xx/ECONNREFUSED` 增加一次重试。

#### NKP-004：配置项声明未接线（P1）
- 影响：用户在设置中修改参数无实际效果，形成“可配置但不生效”的体验问题。
- 定位：`packages/neko-preview/package.json` 已声明 `neko.preview.videoQuality`、`neko.preview.autoPlay`，代码侧未读取。
- 建议：在 provider/webview 初始化阶段读取并注入配置，补充配置变更监听。

#### NKP-005：消息协议与实现漂移（P2）
- 影响：类型可信度下降，后续重构易出现静默兼容问题。
- 定位：
  - `packages/neko-preview/packages/extension/src/types/document-messages.ts`
  - `packages/neko-preview/packages/webview/src/shared/document-types.ts`
  - `packages/neko-preview/packages/extension/src/providers/document/PdfPreviewProvider.ts`（仅发送 `{ url }`）
- 建议：清理未落地协议（`document:metadata/readRange/readEntry`）或补齐实现，并统一 `document:data` 的必填字段约束。

#### NKP-006：测试覆盖盲区（P1）
- 影响：文档预览与 EPUB 解析回归问题难以及时暴露。
- 定位：
  - `packages/neko-preview/vitest.config.ts` 仅包含 `packages/extension/src/**/*.test.ts`
  - `coverage/coverage-summary.json` 总覆盖率偏低（lines 49.45%，branches 37.07%），`documentProviderHelper/PreviewFileServer/EpubParser` 覆盖显著不足
- 建议：优先补 extension 侧文档链路测试（register/unregister、状态恢复、sendToAi），并增加 EPUB 解析边界用例。

#### NKP-007：构建产物复制吞错（P2）
- 影响：webview 构建异常时仍可能产出“看似成功”的包。
- 定位：`packages/neko-preview/package.json` 的 `copy:webview` 使用 `2>/dev/null || true`。
- 建议：改为显式校验 `dist/assets` 和 HTML 入口文件存在性，缺失时直接失败。

#### NKP-008：重复卸载清理逻辑（P3）
- 影响：代码可读性下降，后续修改时容易引入重复副作用。
- 定位：`packages/neko-preview/packages/webview/src/audio/AudioPlayer.tsx` 存在两段功能相同的 unmount dispose effect。
- 建议：合并为单一 cleanup 入口，统一音频客户端生命周期管理。

### 本批次验证信息（追加）

- 命令：`npm test`（工作目录：`packages/neko-preview`）
- 结果：通过（5 个测试文件 / 115 用例）
- 命令：`npm run lint`（工作目录：`packages/neko-preview`）
- 结果：通过（0 error，7 warning）

---

## 追加记录：2026-04-07（neko-canvas）

维护范围：`packages/neko-canvas`（`extension + webview`）

### 问题总览（追加）

| 编号 | 严重级别 | 状态 | 问题摘要 |
|---|---|---|---|
| NKV-001 | P0 | fixed | `nodes.*` 请求/响应协议字段不一致，节点 API 调用存在失效风险 |
| NKV-002 | P0 | fixed | `scriptIndexResult` 字段错位，`ScriptNode` 存在运行时崩溃风险 |
| NKV-003 | P0 | fixed | `modelInstalledResult` 字段错位，模型安装状态长期”检查中” |
| NKV-004 | P0 | fixed | `/batch` 命令对 `Promise` 直接 `.map`，批量生图命令会抛异常 |
| NKV-005 | P0 | fixed | AutoPrompt 回路未闭环，面板”自动填写”稳定返回空字符串 |
| NKV-006 | P0 | verified | `operationApplied` 脏标记链路断裂，扩展侧 dirty 事件可能丢失 |
| NKV-007 | P1 | fixed | 命令声明与注册实现不一致，部分命令”可见但不可用” |
| NKV-008 | P1 | open | 质量门禁失效（lint/test/tsc），导致回归问题难以及时暴露 |
| NKV-009 | P1 | fixed | 空文件加载默认值链路不完整，初始数据一致性存在风险 |
| NKV-010 | P1 | open | 测试覆盖集中在 webview util/store，extension 协议链路覆盖不足 |

### 问题详情（追加）

#### NKV-001：`nodes.*` 协议字段不一致（P0）
- 影响：`list/update/create` 可能返回错误数据或直接失效，跨扩展节点 API 不可靠。
- 定位：
  - `packages/neko-canvas/packages/extension/src/editor/canvasEditorProvider.ts`
  - `packages/neko-canvas/packages/webview/src/hooks/useVSCodeMessages.ts`
- 建议：统一请求体字段（`typeFilter/updates/node` 或等价命名）并补通信契约测试。

#### NKV-002：`scriptIndexResult` 字段错位（P0）
- 影响：脚本目录回填失败时，`ScriptNode` 对 `scenes.length` 的读取可能触发运行时异常。
- 定位：
  - `packages/neko-canvas/packages/extension/src/editor/canvasEditorProvider.ts`
  - `packages/neko-canvas/packages/webview/src/hooks/useVSCodeMessages.ts`
  - `packages/neko-canvas/packages/webview/src/components/nodes/ScriptNode.tsx`
- 建议：统一回包字段名（`scenes`），并在组件层对空值兜底。

#### NKV-003：模型安装状态字段错位（P0）
- 影响：`ModelNode` 无法从“检查中”切换到“已安装/未安装”。
- 定位：
  - `packages/neko-canvas/packages/extension/src/editor/canvasEditorProvider.ts`
  - `packages/neko-canvas/packages/webview/src/hooks/useVSCodeMessages.ts`
  - `packages/neko-canvas/packages/webview/src/components/nodes/ModelNode.tsx`
- 建议：统一回包字段（`installed` 或 `installedVersion` 二选一），保持前后端一致。

#### NKV-004：`/batch` 命令运行时错误（P0）
- 影响：Agent Slash Command 的批量生图入口在运行时可能直接失败。
- 定位：`packages/neko-canvas/packages/extension/src/extension.ts`
- 建议：先 `await canvasEditorProvider.listNodes('shot')` 再 `map`。

#### NKV-005：AutoPrompt 未真正等待结果（P0）
- 影响：用户点击“自动填写”时常得到空提示词，功能体验不可用。
- 定位：`packages/neko-canvas/packages/webview/src/CanvasApp.tsx`
- 建议：用 `Promise` + resolver 完整闭环 `buildPrompt` round-trip，并处理超时/失败分支。

#### NKV-006：`operationApplied` 链路断裂（P0）
- 影响：操作审计与 dirty 事件同步不稳定，保存状态感知可能异常。
- 定位：
  - `packages/neko-canvas/packages/webview/src/stores/canvasOperationStore.ts`
  - `packages/neko-canvas/packages/webview/src/CanvasApp.tsx`
  - `packages/neko-canvas/packages/extension/src/editor/canvasEditorProvider.ts`
- 建议：统一 VSCode API 注入键名（建议全量使用 `window.vscode`）。

#### NKV-007：命令清单与实现不一致（P1）
- 影响：命令出现在 `package.json` 但未注册处理，用户操作会落空。
- 定位：
  - `packages/neko-canvas/package.json`
  - `packages/neko-canvas/packages/extension/src/extension.ts`
  - `packages/neko-canvas/packages/extension/src/editor/canvasEditorProvider.ts`
- 建议：清理无实现命令或补齐注册/处理器，并增加“命令声明-注册一致性”测试。

#### NKV-008：质量门禁失效（P1）
- 影响：静态检查与默认测试无法覆盖关键风险，回归容易漏检。
- 定位：
  - `packages/neko-canvas/package.json`（`lint` 与 Flat Config 不兼容）
  - `packages/neko-canvas/package.json`（默认 `test` 对 extension 为 `passWithNoTests`）
  - `packages/neko-canvas/packages/extension/tsconfig.json`（严格模式下类型问题未进构建门禁）
- 建议：修复 lint 命令、将 extension 类型检查纳入 CI、调整默认 test 覆盖目标。

#### NKV-009：空文件初始化链路不完整（P1）
- 影响：空/损坏 `.nkc` 文件场景下，webview 初始状态一致性不可预测。
- 定位：
  - `packages/neko-canvas/packages/extension/src/editor/canvasEditorProvider.ts`
  - `packages/neko-canvas/packages/webview/src/hooks/useVSCodeMessages.ts`
- 建议：当 `update.data` 为空时显式回落到 `DEFAULT_CANVAS_DATA`。

#### NKV-010：测试覆盖盲区（P1）
- 影响：消息协议、命令路由、跨扩展通信等 extension 关键链路缺乏自动回归保护。
- 定位：
  - `packages/neko-canvas/packages/webview/vitest.config.ts`
  - `packages/neko-canvas/packages/extension`（当前无独立测试集）
- 建议：新增 extension 集成测试（`nodes.*`、`script/model` 回包、slash command、dirty 事件）。

### 本批次验证信息（追加）

- 命令：`pnpm --filter neko-canvas test`
- 结果：通过（No test files found，默认测试未覆盖 extension/webview 关键链路）
- 命令：`pnpm --filter neko-canvas test:packages`
- 结果：通过（`@neko-canvas/webview` 4 文件 / 71 用例）
- 命令：`pnpm --filter neko-canvas lint`
- 结果：失败（`--ext` 与当前 ESLint Flat Config 不兼容）
- 命令：`pnpm --filter @neko-canvas/extension exec tsc --noEmit`
- 结果：失败（存在类型错误与运行时风险信号）
- 命令：`pnpm --filter @neko-canvas/extension run build`
- 结果：通过（`esbuild` 可产物，但未覆盖类型安全）

---

## 追加记录：2026-04-07（neko-story）

维护范围：`packages/neko-story`（`extension + parser + webview + types`）

### 问题总览（追加）

| 编号 | 严重级别 | 状态 | 问题摘要 |
|---|---|---|---|
| NKS-001 | P0 | fixed | 文档宣称支持 `.nks/.story`，实际语言注册与索引仅覆盖 `.fountain` |
| NKS-002 | P0 | open | Webview CSP 未声明 `img-src`，资产图片预览存在被拦截风险 |
| NKS-003 | P0 | fixed | `AUDIO` 资产被错误映射为 `mediaType: image`，音频转换语义失真 |
| NKS-004 | P1 | open | 滚动同步链路未闭环（`scroll` 分支空实现 + 缺失 `data-line`） |
| NKS-005 | P1 | fixed | 与 `neko-agent` 的命令依赖未在扩展依赖中声明 |
| NKS-006 | P1 | open | `generateStoryboard` 仍为占位命令，核心能力未落地 |
| NKS-007 | P2 | open | 工作区索引采用全量重建，规模增大时性能退化风险高 |
| NKS-008 | P2 | open | i18n 基础设施已搭建但大量 UI 文案硬编码，国际化一致性不足 |
| NKS-009 | P1 | open | 测试覆盖偏向纯函数/渲染，关键协议链路（CSP/滚动/音频映射）缺乏回归保护 |
| NKS-010 | P2 | open | lint 存在非空断言告警，工程约束执行不彻底 |

### 问题详情（追加）

#### NKS-001：格式支持宣称与实现不一致（P0）
- 影响：用户按文档创建 `.nks/.story` 文件时可能无法获得完整语言能力（索引、链接、跨文件能力）。
- 定位：
  - `packages/neko-story/README.md`
  - `packages/neko-story/package.json`
  - `packages/neko-story/packages/extension/src/services/WorkspaceIndexService.ts`
  - `packages/neko-story/packages/extension/src/providers/documentLink.ts`
- 建议：统一“文档声明、语言注册、索引 glob、文档链接匹配”四处格式支持集合。

#### NKS-002：CSP 未显式允许图片资源（P0）
- 影响：`[[IMAGE: ...]]` 在部分环境下可能渲染失败，用户感知为“资产预览失效”。
- 定位：
  - `packages/neko-story/packages/extension/src/panels/PreviewPanel.ts`
  - `packages/neko-story/packages/webview/src/components/ScriptRenderer.tsx`
- 建议：为 CSP 增加最小必要的 `img-src`（如 `${webview.cspSource}` / `data:`），并补安全回归测试。

#### NKS-003：音频资产映射错误（P0）
- 影响：`[[AUDIO: ...]]` 转换到时间线后被当作图像媒体处理，导致播放与轨道语义不正确。
- 定位：
  - `packages/neko-story/packages/parser/src/parser.ts`
  - `packages/neko-story/packages/extension/src/converters/TimelineConverter.ts`
  - `packages/neko-types/src/types/element.ts`
- 建议：为音频引用生成 `audio` 元素或保持与 `neko-cut` 约定一致的音频轨道映射策略。

#### NKS-004：滚动同步协议未闭环（P1）
- 影响：编辑器与预览滚动同步行为不稳定或无效，降低长剧本编辑体验。
- 定位：
  - `packages/neko-story/packages/extension/src/panels/PreviewPanel.ts`
  - `packages/neko-story/packages/webview/src/App.tsx`
  - `packages/neko-story/packages/webview/src/components/*.tsx`
- 建议：补齐 `scroll` 消息处理并在可导航节点统一注入 `data-line`。

#### NKS-005：AI 命令依赖声明缺失（P1）
- 影响：当 `neko-agent` 未加载时，内联补全与“发送给 Agent”功能表现退化且缺少显式依赖提示。
- 定位：
  - `packages/neko-story/package.json`
  - `packages/neko-story/packages/extension/src/extension.ts`
  - `packages/neko-story/packages/extension/src/providers/inlineCompletion.ts`
- 建议：在 `extensionDependencies` 中补充 `neko.neko-agent`，并保留无依赖时的优雅降级提示。

#### NKS-006：分镜生成功能仍为占位（P1）
- 影响：命令已对外暴露但不具备实际生产能力，形成“可见不可用”。
- 定位：`packages/neko-story/packages/extension/src/extension.ts`
- 建议：在功能未完成前弱化入口或标注实验性状态，完成后补端到端回归。

#### NKS-007：索引重建策略可扩展性不足（P2）
- 影响：中大型剧本库下，频繁编辑会触发全量重建，可能造成 UI 卡顿。
- 定位：`packages/neko-story/packages/extension/src/services/WorkspaceIndexService.ts`
- 建议：引入增量更新（按受影响文件重建索引分片）并增加防抖/批处理策略。

#### NKS-008：国际化落地不完整（P2）
- 影响：多语言体验不一致，后续维护成本增加（新增文案易遗漏）。
- 定位：
  - `packages/neko-story/packages/webview/src/i18n/*`
  - `packages/neko-story/packages/webview/src/App.tsx`
  - `packages/neko-story/packages/webview/src/components/ErrorBoundary.tsx`
  - `packages/neko-story/packages/webview/src/components/ScriptRenderer.tsx`
- 建议：统一接入 `t(...)`，将 Tab、空态、错误态文案全部迁移到 i18n bundle。

#### NKS-009：关键链路测试盲区（P1）
- 影响：当前测试虽通过，但无法及时发现 CSP、滚动同步、音频映射等真实集成问题。
- 定位：
  - `packages/neko-story/packages/extension/src/__tests__`
  - `packages/neko-story/packages/webview/src/__tests__`
- 建议：新增 PreviewPanel 协议测试、TimelineConverter 音频用例、CSP 资源加载回归用例。

#### NKS-010：静态检查告警未清理（P2）
- 影响：工程约束弱化，后续可能引入空值相关回归。
- 定位：`packages/neko-story/packages/extension/src/providers/definition.ts`
- 建议：移除非空断言，改为显式空值分支。

### 本批次验证信息（追加）

- 命令：`pnpm --filter neko-story run test:packages`
- 结果：通过（`@neko-story/parser` 31、`@neko-story/extension` 58、`@neko-story/webview` 21）
- 命令：`pnpm --filter neko-story run build`
- 结果：通过（types/parser/webview/extension 全部构建成功）
- 命令：`pnpm --filter neko-story run lint`
- 结果：通过（0 error，2 warning：`no-non-null-assertion`）

---

## 追加记录：2026-04-07（neko-engine）

维护范围：`packages/neko-engine`（`extension + host-napi + host-api + host-http + engine-kernel + host-cli + runtime-scene + runtime-puppet + types`）

### 问题总览（追加）

| 编号 | 严重级别 | 状态 | 问题摘要 |
|---|---|---|---|
| NKE-001 | P0 | fixed | 引擎生命周期语义不闭合，`stop/start` 与 Rust 单例模型冲突 |
| NKE-002 | P0 | fixed | `frameServerPort` 停止引擎后未失效，存在陈旧端口返回风险 |
| NKE-003 | P0 | fixed | TS 声明与 N-API 实际签名漂移，且主流程缺少类型校验门禁 |
| NKE-004 | P1 | fixed | 架构文档宣称“独立 sidecar”，实现主路径实际是进程内 N-API |
| NKE-005 | P1 | fixed | `host-napi` 同时维护两套全局引擎入口，存在双实例/双状态风险 |
| NKE-006 | P1 | fixed | 分层迁移未收口，`engine-kernel` 仍保留历史 HTTP/FrameServer 残留 |
| NKE-007 | P1 | fixed | 已暴露 `documents:probe` 能力，但实现仍为占位返回 |
| NKE-008 | P1 | fixed | 测试体系未进入标准流水线，关键导出/协议链路缺少自动回归 |
| NKE-009 | P1 | fixed | 发布链路依赖手工平台产物和外部动态库，跨平台打包稳定性偏弱 |
| NKE-010 | P2 | fixed | 代码体量、残留文件与生产路径 `unwrap/expect` 偏多，维护风险累积 |

### 问题详情（追加）

#### NKE-001：生命周期语义不闭合（P0）
- 影响：用户执行“停止引擎”后，底层 Rust 引擎并未真正释放；后续“重启”更接近重新绑定 JS 包装层，而不是重建底层状态。
- 定位：
  - `packages/neko-engine/packages/host-napi/src/engine.rs`
  - `packages/neko-engine/packages/extension/src/mediaEngine/NativeMediaEngine.ts`
  - `packages/neko-engine/packages/extension/src/extension.ts`
- 建议：
  - 明确二选一：
    - 方案 A：公开声明“进程级单例，不支持真正 stop/restart”，UI 上改为“连接/断开”语义；
    - 方案 B：补真实 `shutdown/reset` 能力，使 `stop/start` 与用户认知一致。
- 2026-04-08 处理结果：
  - 已采用方案 A。
  - 已将用户可见命令与提示文案收敛为“连接/断开引擎”语义。
  - 已在 `README.md`、`ARCHITECTURE.md`、Extension 注释中明确当前主路径为进程内 N-API 单例。

#### NKE-002：Frame Server 端口缓存失效不完整（P0）
- 影响：停止引擎后再次请求 Frame Server，可能返回已失效端口，导致预览或流媒体链路持续失败。
- 定位：
  - `packages/neko-engine/packages/extension/src/extension.ts`
  - `packages/neko-engine/packages/extension/src/mediaEngine/NativeMediaEngine.ts`
- 建议：在 `cmdStopEngine()` 与异常分支统一清理 `frameServerPort`，并在 `ensureFrameServer` 中对失效端口做健康探测与重试。
- 2026-04-08 处理结果：
  - 已在 `cmdStopEngine()` 成功与异常路径清理 `frameServerPort`。
  - 已在 `ensureFrameServer` 中增加 `/health` 探测、陈旧端口自愈与重启逻辑。
  - 当前剩余风险主要是极端网络抖动下的误判概率，主故障路径已收敛。

#### NKE-003：NativeEngine 类型契约漂移（P0）
- 影响：TS 本地声明与 Rust/N-API 实际接口不一致，后续改动容易在运行时才暴露，回归成本高。
- 定位：
  - `packages/neko-engine/packages/extension/src/mediaEngine/NativeMediaEngine.ts`
  - `packages/neko-engine/packages/host-napi/index.d.ts`
  - `packages/neko-engine/packages/host-napi/src/engine.rs`
  - `packages/neko-engine/package.json`
  - `packages/neko-engine/tsconfig.json`
- 建议：
  - 扩展层直接复用生成的 `index.d.ts`，不要手写镜像接口；
  - 在 CI 增加 `tsc --noEmit`；
  - 修正 `tsconfig` 覆盖范围，确保 `packages/extension/src` 真正参与类型检查。
- 2026-04-08 当前进展：
  - 已移除扩展层手写 `NativeEngine` 镜像声明，改为直接复用 `@neko-engine/host-napi` 生成类型。
  - 已新增 `packages/neko-engine/packages/extension/tsconfig.json`，将 `packages/extension/src` 纳入独立类型检查范围。
  - 已新增 `pnpm --filter neko-engine typecheck`，并完成通过验证。

#### NKE-004：架构文档与真实实现不一致（P1）
- 影响：协作者会误判系统边界，导致生命周期设计、调用方式和排障手段都出现偏差。
- 定位：
  - `packages/neko-engine/README.md`
  - `packages/neko-engine/ARCHITECTURE.md`
  - `packages/neko-engine/packages/extension/src/mediaEngine/MediaEngineManager.ts`
- 建议：统一文档口径，明确当前主路径到底是：
  - “进程内 N-API 引擎 + 可选嵌入式 HTTP 服务”；还是
  - “真正独立 sidecar 进程 + HTTP/WebSocket 主通道”。
- 2026-04-08 处理结果：
  - 已明确当前口径为“Rust 全局单例 + N-API 控制命令 + WebSocket/HTTP 数据传输”。
  - 已在 `README.md` 与 `ARCHITECTURE.md` 中补充控制面 / 数据面边界说明。

#### NKE-005：N-API 双入口状态模型不清晰（P1）
- 影响：`NativeEngine` 与 bridge 函数看似共享同一引擎，实际各自维护独立 `OnceCell`，后续若 bridge 被消费，可能产生两套 `EngineApi` 状态。
- 定位：
  - `packages/neko-engine/packages/host-napi/src/engine.rs`
  - `packages/neko-engine/packages/host-napi/src/bridge.rs`
- 建议：统一为单一引擎实例入口；若保留 bridge，需明确其与 `NativeEngine` 的共享/隔离策略并补回归测试。
- 2026-04-08 当前进展：
  - 已移除 bridge 侧独立全局入口，改为直接复用 `engine.rs` 的共享单例初始化函数。
  - 已新增“不初始化 GPU 也能成立”的最小回归测试，验证 bridge 与 `NativeEngine` 复用同一 `OnceCell` 入口。
  - Rust 侧 `cargo test -p neko-host-napi bridge_and_native_engine_share_the_same_singleton_cell` 与 `cargo check -p neko-host-napi` 已通过。

#### NKE-006：分层迁移未收口（P1）
- 影响：`engine-kernel` 同时承载核心媒体能力和历史 HTTP/FrameServer 残留，边界模糊，增加编译依赖与理解成本。
- 定位：
  - `packages/neko-engine/packages/engine-kernel/src/lib.rs`
  - `packages/neko-engine/packages/engine-kernel/src/frame_server/mod.rs`
  - `packages/neko-engine/packages/engine-kernel/Cargo.toml`
- 建议：将 HTTP 责任明确收敛到 `host-http`，清理 `engine-kernel` 中的壳模块与残留依赖，避免继续形成“核心层夹带传输层”的架构漂移。
- 2026-04-08 处理结果：
  - 已从 `engine-kernel` 导出面移除仅剩说明文字的 `frame_server` 壳模块。
  - 已从 `engine-kernel/Cargo.toml` 删除未再被源码引用的 HTTP/WebSocket 依赖，传输层依赖收敛回 `host-http`。
  - 已为 `engine-kernel` 显式声明 `tokio` 的 `macros/time` 能力，避免继续依赖 HTTP 栈间接带来的运行时 feature。
  - 已同步清理相关架构文档描述与遗留注释，避免继续把 `frame_server` 视为 `engine-kernel` 模块。
  - `cargo check -p neko-engine-kernel --quiet` 与 `cargo check -p neko-host-http --quiet` 已通过。

#### NKE-007：对外能力存在占位接口（P1）
- 影响：接口已经暴露给上层，但实际只返回 `not_implemented`，容易形成“可见不可用”的集成错觉。
- 定位：
  - `packages/neko-engine/packages/host-api/src/controllers/documents.rs`
- 建议：在功能未完成前：
  - 方案 A：从动作注册和文档中移除；
  - 方案 B：保留但标记为实验性，并返回明确错误码而非静态占位成功响应。
- 2026-04-08 处理结果：
  - 已改为返回明确 `ServiceError`，不再伪造成功响应。
  - 已补最小单元测试，确保 `documents:probe` 在未实现阶段表现为显式失败。

#### NKE-008：测试体系未覆盖关键主链路（P1）
- 影响：导出、NativeEngine 协议、Extension 命令桥接等高风险路径难以及时发现回归。
- 定位：
  - `packages/neko-engine/package.json`
  - `packages/neko-engine/vitest.config.ts`
  - `packages/neko-engine/packages/extension/src/extension.test.ts`
  - `packages/neko-engine/packages/extension/src/mediaEngine/MediaEngineManager.test.ts`
  - `packages/neko-engine/packages/extension/src/mediaEngine/export/JviProjectLoader.test.ts`
  - `packages/neko-engine/packages/extension/src/mediaEngine/NativeMediaEngine.test.ts`
  - `packages/neko-engine/packages/extension/src/mediaEngine/export/ExportService.test.ts`
  - `packages/neko-engine/packages/extension/src/mediaEngine/export/ExportIntegrationTest.ts`
  - `packages/neko-engine/packages/extension/src/mediaEngine/export/simpleExportTest.js`
- 建议：
  - 将现有手工测试脚本迁移到标准测试入口；
  - 区分 `unit` / `integration` / `manual`；
  - 禁止 `--passWithNoTests` 掩盖空测试状态。
- 2026-04-08 处理结果：
  - 已新增 `vitest.config.ts`，将 extension 侧测试接入标准 `pnpm --filter neko-engine test` 流水线。
  - 已移除 `--passWithNoTests`，默认测试不再空跑。
  - 已补 `extension`、`MediaEngineManager`、`JviProjectLoader`、`NativeMediaEngine`、`ExportService` 五组自动测试，覆盖命令注册、会话级包装层行为、`NativeEngine` 协议桥接、导出请求构造与任务轮询闭环。
  - 已顺带修复 `ExportService.cancel()` / `dispose()` 停止轮询后未结算挂起导出 Promise 的问题，避免取消导出时调用方长期 pending。
  - 关键主链路已进入标准测试入口，本项调整为 `fixed`；遗留的手工脚本可后续按需要继续收敛，但不再阻塞当前质量门禁。

#### NKE-009：发布链路可重复性不足（P1）
- 影响：平台包依赖手工准备 `.node`、ORT 和 FFmpeg 动态库，跨平台发布容易出现“本地可打、CI/用户环境不可复现”。
- 定位：
  - `packages/neko-engine/scripts/package-platform.js`
  - `packages/neko-engine/scripts/bundle-ffmpeg.js`
  - `packages/neko-engine/scripts/download-ort.js`
  - `packages/neko-engine/packages/extension/src/mediaEngine/OrtInitializer.ts`
- 建议：将“原生产物构建、动态库打包、平台裁剪、VSIX 产出”串成单一可重复流水线，并尽量减少人工前置条件。
- 2026-04-08 处理结果：
  - 已新增 `scripts/package-config.json` / `scripts/package-config.js`，统一平台 key、`.node` 文件名、ORT 产物命名与 FFmpeg 来源，消除 `download-ort.js`、`bundle-ffmpeg.js`、`OrtInitializer.ts` 之间的重复平台事实。
  - 已新增 `scripts/package-platform.js` 作为单一 Node 打包入口，统一执行 native binary 校验、当前主机平台缺失时的自动 `build:napi`、平台裁剪、ORT 下载、FFmpeg 打包、compile 与 VSIX 产物校验。
  - 已将 `package-platform.sh` 收敛为兼容转发层，`package.json` 的 `package:platform` 默认改走新的 Node 流水线。
  - 已新增脚本级自动测试并接入 `pnpm --filter neko-engine test`，覆盖共享配置解析、native binary 自动构建决策与打包步骤编排顺序。
  - 已完成一次真实主机平台打包验证，产出 `neko-engine-darwin-arm64-0.0.1.vsix`；VSIX 已包含 `bin/libonnxruntime-darwin-arm64.1.20.1.dylib`、`packages/host-napi/*.dylib`、`neko-engine.darwin-arm64.node` 与 `scripts/package-config.json`。
  - 当前打包链路已具备单入口、可验证、可重复的收口路径；跨平台仅保留 native binary 预构建这一必要前置条件，本项调整为 `fixed`。

#### NKE-010：维护性与健壮性信号偏弱（P2）
- 影响：巨型文件、备份文件、临时调试文件和生产路径上的 `unwrap/expect` 会持续抬高维护成本与运行期崩溃风险。
- 定位：
  - `packages/neko-engine/packages/engine-kernel/src/domain/timeline.rs`
  - `packages/neko-engine/packages/engine-kernel/src/export/gpu_export_pipeline.rs`
  - `packages/neko-engine/packages/engine-kernel/src/services/impls/timeline.rs`
  - `packages/neko-engine/packages/engine-kernel/src/domain/timeline.rs.bak`
  - `packages/neko-engine/test_stream.html`
  - `packages/neko-engine/test_devices.html`
  - `packages/neko-engine/test_diff.html`
  - `packages/neko-engine/packages/host-http/src/routes/preview_file.rs`
  - `packages/neko-engine/packages/host-http/src/routes/monitor.rs`
- 建议：
  - 拆分巨型模块；
  - 清理 `.bak` 与临时测试文件；
  - 优先处理生产路径 `unwrap/expect`，避免单点 panic 影响整条引擎链路。
- 2026-04-08 处理结果：
  - 已删除 `timeline.rs.bak` 与 `test_stream.html` / `test_devices.html` / `test_diff.html` 等未被引用的历史调试文件。
  - 已将 `timeline` 的增量操作应用逻辑拆到 `src/domain/timeline/apply.rs`，并把 `timeline`、`gpu_export_pipeline`、`services/impls/timeline` 的测试拆到各自子模块，三处核心文件总行数从 `5288` 降到 `4458`。
  - 已移除 `preview_file.rs` 与 `monitor.rs` 生产请求路径上的显式 `unwrap`，注册表锁中毒或序列化失败时改为返回 `500`，不再直接 panic。
  - 已补 `host-http` 最小单测，覆盖 `PreviewFileRegistry`、`parse_byte_range` 与 monitor 缺省路径。
  - 本批次定位的维护性与健壮性信号已完成收口，本项调整为 `fixed`。

### 本批次验证信息（追加）

- 命令：`cargo check --workspace --quiet`
- 结果：通过（Rust workspace 可完成基础编译检查）
- 命令：`cargo check -p neko-engine-kernel --quiet`
- 结果：通过（`engine-kernel` 已不再依赖 HTTP 栈转移的 `tokio` feature）
- 命令：`cargo check -p neko-host-http --quiet`
- 结果：通过（传输层边界收敛后仍可独立完成编译检查）
- 命令：`cargo test -p neko-host-http --quiet`
- 结果：通过（13 个测试通过，覆盖路由与注册表基础行为）
- 命令：`cargo test -p neko-engine-kernel --quiet`
- 结果：通过（355 个测试通过；GPU 环境测试已改为无适配器时跳过）
- 命令：`cd packages/neko-engine && cargo test --quiet`
- 结果：通过（workspace 各 crate 测试通过，含 9 个忽略测试）
- 命令：`pnpm --filter neko-engine typecheck`
- 结果：通过（extension TypeScript 类型检查已纳入独立门禁）
- 命令：`pnpm --filter neko-engine test`
- 结果：通过（extension `vitest` 5 个测试文件 / 12 个用例 + 脚本 `node:test` 5 个用例）
- 命令：`pnpm --filter neko-engine package:platform -- --target darwin-arm64 --skip-native-build`
- 结果：通过（真实打包产出 `neko-engine-darwin-arm64-0.0.1.vsix`，大小 21.03 MB）
- 命令：`find packages -type f \\( -name '*.rs' -o -name '*.ts' -o -name '*.js' \\) | xargs wc -l | sort -nr | head -n 25`
- 结果：发现多个超大文件（`timeline.rs`、`gpu_export_pipeline.rs`、`timeline.rs` 实现层等）
- 命令：`find packages/extension/src -type f \\( -iname '*test*' -o -iname '*spec*' \\)`
- 结果：共 7 个测试/脚本文件，其中 5 个 `.test.ts` 已纳入标准 `vitest` 流程，2 个手工脚本保留为补充验证入口
- 命令：`rg -o "unwrap\\(|expect\\(" packages/neko-engine/packages/engine-kernel packages/neko-engine/packages/host-http --glob '!**/*.bak' | wc -l`
- 结果：共 253 处（含大量测试代码；本批次定位的 `host-http` 生产路由已完成收口）

---

## 追加记录：2026-04-07（neko-assets）

维护范围：`packages/neko-assets`（`extension + packages/asset`）

### 问题总览（追加）

| 编号 | 严重级别 | 状态 | 问题摘要 |
|---|---|---|---|
| NKAS-001 | P1 | open | 对外宣称 `cloud sync / CI/CD auto-rendering`，实际仍是占位命令 |
| NKAS-002 | P1 | open | 已贡献 `neko.cloudSync` 视图，但 Extension 未注册对应 Provider |
| NKAS-003 | P1 | open | 文档规划中的 `AssetRegistry` 多源合并未真正接入主链路 |
| NKAS-004 | P1 | open | `AssetRegistry` 的非媒体资产当前仅驻留内存，缺少持久化与实际消费方 |
| NKAS-005 | P2 | open | `extension.ts` 体量过大，初始化/命令/UI/集成强耦合 |
| NKAS-006 | P2 | open | 多根工作区仅使用首个 workspace，路径与媒体库行为存在偏差风险 |
| NKAS-007 | P1 | open | 测试覆盖集中在 core service，extension/provider/命令编排回归保护不足 |

### 问题详情（追加）

#### NKAS-001：云同步与 CI/CD 渲染能力仍为占位（P1）
- 影响：用户会看到“可用功能”入口，但真实云同步、推送、拉取、远程渲染链路并未落地。
- 定位：
  - `packages/neko-assets/package.json`
  - `packages/neko-assets/src/extension.ts`
- 现状：
  - `neko.assets.sync` / `push` / `pull` / `triggerRender` 仍以提示信息或临时终端调用为主；
  - 与描述中的 `cloud sync`、`CI/CD auto-rendering` 不一致。
- 建议：要么补齐真实服务编排与错误处理，要么先下调功能宣称，避免“可见不可用”。

#### NKAS-002：`neko.cloudSync` 视图声明未接线（P1）
- 影响：Activity Bar 中暴露了云同步视图位，但运行时没有对应数据源与交互能力。
- 定位：
  - `packages/neko-assets/package.json`
  - `packages/neko-assets/src/extension.ts`
- 建议：补齐 TreeDataProvider / WebviewProvider；若短期不做，先移除贡献项。

#### NKAS-003：`AssetRegistry` 多源架构尚未真正落地（P1）
- 影响：文档中“项目库 + 共享库 + marketplace”统一资产视图的目标尚未实现，当前仍主要停留在项目级 `AssetLibrary`。
- 定位：
  - 文档规划：`docs/architecture/local-storage-strategy.md`
  - 核心实现：`packages/neko-assets/packages/asset/src/service/AssetRegistry.ts`
  - 扩展入口：`packages/neko-assets/src/extension.ts`
- 现状：扩展启动时直接实例化的是 `AssetLibrary`，未见 `AssetRegistry` 进入主查询、视图或命令链路。
- 建议：先完成 `AssetRegistry` 接管主入口，再逐步接入 shared / marketplace source。

#### NKAS-004：`AssetRegistry` 非媒体资产仅为内存态（P1）
- 影响：即使未来接入 marketplace / handler 资产，当前实现也会在重启后丢失非媒体注册结果。
- 定位：
  - `packages/neko-assets/packages/asset/src/service/AssetRegistry.ts`
- 现状：
  - 非媒体 manifest 存储在内存 `Map`；
  - 未见持久化、恢复或 Extension 主链路消费实现。
- 建议：为 registry 引入持久化源，明确其与 `library.json`、共享库描述文件、market 安装记录的关系。

#### NKAS-005：扩展入口文件过胖，职责耦合偏高（P2）
- 影响：初始化、命令注册、媒体库、健康检查、Git/LFS、缩略图、搜索等职责堆叠在单文件中，后续迭代与测试成本持续上升。
- 定位：
  - `packages/neko-assets/src/extension.ts`
- 建议：按“启动编排 / TreeView 注册 / 命令模块 / 外部集成”拆分子模块，保留薄入口。

#### NKAS-006：多工作区支持偏弱（P2）
- 影响：multi-root workspace 下，路径解析、缓存目录、媒体库设置和资产存储均可能只绑定到第一个工作区。
- 定位：
  - `packages/neko-assets/src/extension.ts`
- 建议：将 workspace 选择显式化，或至少在多根场景下给出限制提示与一致策略。

#### NKAS-007：测试覆盖偏向 core，扩展链路保护不足（P1）
- 影响：TreeView、命令注册、媒体库设置、健康检查、云同步占位等 Extension 层回归难以及时暴露。
- 定位：
  - 已有测试：`packages/neko-assets/packages/asset/src/__tests__/service/*`
  - 扩展入口：`packages/neko-assets/src/extension.ts`
- 建议：补充 extension 侧最小集成测试，优先覆盖命令注册、Provider 初始化、路径变量同步和健康检查主链路。

### 本批次验证信息（追加）

- 命令：`wc -l packages/neko-assets/src/extension.ts`
- 结果：入口文件 1243 行，已出现明显“巨型入口”信号
- 命令：`rg -n "cloudSync|AssetRegistry|neko\\.assets\\.(sync|push|pull|triggerRender)" packages/neko-assets`
- 结果：确认存在功能宣称、视图贡献与实际接线之间的不一致
- 命令：`find packages/neko-assets -path '*/__tests__/*' -o -name '*.test.ts'`
- 结果：测试主要集中于 `packages/asset` core 层，extension 覆盖较弱

---

## 追加记录：2026-04-07（neko-market）

维护范围：`packages/neko-market`（`core + extension + webview`）

### 问题总览（追加）

| 编号 | 严重级别 | 状态 | 问题摘要 |
|---|---|---|---|
| NKM-001 | P0 | fixed | 安装链路未解包归档，InstallTarget 后置逻辑与实际产物形态不匹配 |
| NKM-002 | P0 | open | Extension 与 Webview 的市场 DTO 未统一，大量强制断言掩盖运行时错配 |
| NKM-003 | P1 | fixed | 类型筛选使用 `model/preset` 聚合值，偏离共享 `AssetType` 契约 |
| NKM-004 | P1 | fixed | `InstalledRegistry.load()` 异步竞态可能导致首次打开状态不准 |
| NKM-005 | P1 | fixed | `openSkills` 依赖即时 `postMessage`，view 未 resolve 时筛选消息可能丢失 |
| NKM-006 | P1 | open | 付费/私有资产许可校验仍是 stub，认证与商业能力未闭环 |
| NKM-007 | P2 | fixed | `registryUrl` 配置与架构文档不一致，`nekoSuiteVersion` 仍为硬编码 |
| NKM-008 | P1 | open | 测试覆盖偏 core unit，缺少安装编排与 webview 协议级回归 |

### 问题详情（追加）

#### NKM-001：安装成功但产物形态错误（P0）
- 影响：技能、模型、预设等包即使“安装成功”，后置注册逻辑也可能因目录结构不符合预期而失效。
- 定位：
  - `packages/neko-market/packages/core/src/cache/cache-manager.ts`
  - `packages/neko-market/packages/core/src/install/install-manager.ts`
  - `packages/neko-market/packages/extension/src/SkillInstallTarget.ts`
  - `packages/neko-market/packages/extension/src/ModelInstallTarget.ts`
- 现状：
  - 缓存命名明确使用 `.tar.gz`；
  - `InstallManager` 安装阶段仅做 `cp(archivePath, installPath)`；
  - `SkillInstallTarget` / `ModelInstallTarget` 却假设安装目录中直接存在 `SKILL.md`、`.gguf` 等展开后的文件。
- 建议：在 core 层明确“下载归档 → 校验 → 解包 → 再交给 target hook”的安装契约。

#### NKM-002：Host 与 Webview DTO 契约漂移（P0）
- 影响：市场列表、安装状态、精选内容等 UI 容易出现字段错读、空白或静默异常。
- 定位：
  - 共享类型：`packages/neko-types/src/types/asset/market.ts`
  - Webview store：`packages/neko-market/packages/webview/src/stores/marketplaceStore.ts`
  - 消息处理：`packages/neko-market/packages/webview/src/components/MarketplaceApp.tsx`
- 现状：
  - 共享 `MarketPackage` 以 `manifest` 为核心；
  - Webview `MarketItem` 为扁平结构；
  - 当前通过 `as` 强转直接消费，缺少显式映射层。
- 建议：在 Extension 或 Webview 边界新增 DTO adapter，禁止直接跨层强转。

#### NKM-003：筛选类型与 `AssetType` 契约不一致（P1）
- 影响：真实查询类型、图标展示和安装逻辑会逐渐漂移，后续新增类型时更容易失配。
- 定位：
  - 共享类型：`packages/neko-types/src/types/asset/manifest.ts`
  - Webview filter：`packages/neko-market/packages/webview/src/stores/marketplaceStore.ts`
  - 搜索栏：`packages/neko-market/packages/webview/src/components/SearchBar.tsx`
  - 消息定义：`packages/neko-market/packages/webview/src/messages/index.ts`
- 现状：UI 使用 `model` / `preset` 聚合值，但共享层实际是 `ai-model` / `template` / `lut` / `shader-preset` 等细粒度类型。
- 建议：将“UI 聚合分类”和“后端查询类型”拆开建模，避免直接混用。

#### NKM-004：安装注册表初始化存在竞态（P1）
- 影响：扩展刚激活时，首次打开已安装列表或执行 `isInstalled()` 可能读到空状态。
- 定位：
  - `packages/neko-market/packages/extension/src/MarketplaceService.ts`
  - `packages/neko-market/packages/core/src/registry/installed-registry.ts`
- 建议：在对外提供查询能力前等待 registry load 完成，或引入显式 ready 阶段。

#### NKM-005：`openSkills` 筛选消息可能丢失（P1）
- 影响：命令 `neko.market.openSkills` 的用户体验不稳定，偶现打开市场但未自动过滤到技能页。
- 定位：
  - `packages/neko-market/packages/extension/src/index.ts`
  - `packages/neko-market/packages/extension/src/MarketplaceProvider.ts`
- 建议：为 Provider 增加待发送消息队列，待 webview resolve 后再 flush。

#### NKM-006：许可与认证能力仍未闭环（P1）
- 影响：`paid/private` 资产当前不可用，市场商业化和团队私有包能力尚未真正具备。
- 定位：
  - `packages/neko-market/packages/core/src/license/license-manager.ts`
  - `packages/neko-market/packages/extension/src/MarketplaceService.ts`
- 建议：补齐与 `neko-auth` 的 entitlement / token 校验流程，至少明确阶段性能力边界。

#### NKM-007：实现与架构文档口径不一致（P2）
- 影响：协作者会对 registry 来源、版本兼容策略产生误判。
- 定位：
  - 扩展配置：`packages/neko-market/package.json`
  - 服务实现：`packages/neko-market/packages/extension/src/MarketplaceService.ts`
  - 架构文档：`docs/architecture/registry-server.md`
- 现状：
  - 文档倾向固定官方 registry；
  - 代码仍允许 `registryUrl` 自定义；
  - `nekoSuiteVersion` 仍写死为 `0.0.1`。
- 建议：统一“是否允许自定义 registry”的产品决策，并把 suite version 改为实际版本源注入。

#### NKM-008：关键链路测试不足（P1）
- 影响：安装编排、webview 协议、消息时序和 DTO 映射问题难以及时发现。
- 定位：
  - core tests：`packages/neko-market/packages/core/src/*.test.ts`
  - extension tests：`packages/neko-market/packages/extension/src/__tests__/*`
- 建议：增加最小集成测试，优先覆盖“下载/解包/后置注册”“Provider 与 Handler 消息流”“筛选命令时序”。

### 本批次验证信息（追加）

- 命令：`wc -l packages/neko-market/packages/extension/src/*.ts packages/neko-market/packages/webview/src/components/*.tsx | sort -nr`
- 结果：`MarketplaceService.ts`、`MarketplaceHandler.ts`、`MarketplaceApp.tsx` 已形成关键编排热点
- 命令：`nl -ba packages/neko-market/packages/core/src/install/install-manager.ts` + 相关 InstallTarget 实现静态审查
- 结果：确认安装阶段仅复制归档文件，未见解包流程
- 命令：`find packages/neko-market -path '*/__tests__/*' -o -name '*.test.ts' -o -name '*.test.tsx'`
- 结果：当前测试偏 unit，webview 协议与安装编排集成覆盖不足

---

## 追加记录：2026-04-07（neko-auth）

维护范围：`packages/neko-auth`（`core + extension`）

### 问题总览（追加）

| 编号 | 严重级别 | 状态 | 问题摘要 |
|---|---|---|---|
| NKAT-001 | P0 | fixed | 自动刷新 token 后不广播 session 变更，消费者可能长期持有过期凭证 |
| NKAT-002 | P1 | verified | VSCode 设置半配置会屏蔽 `config.json` 完整配置，导致登录配置判定异常 |
| NKAT-003 | P1 | fixed | 刷新失败对所有异常一律清空会话，网络抖动也会误触发”被登出” |
| NKAT-004 | P2 | open | 对外宣称文件存储/云厂商 token 能力，但扩展侧仍未落地 |
| NKAT-005 | P2 | open | `AuthBridge` 与 extension 层测试覆盖不足，接线遗漏难以及时暴露 |

### 问题详情（追加）

#### NKAT-001：静默刷新不触发 session 变更事件（P0）
- 影响：依赖 `onDidChangeSession` 的扩展（如市场、远程服务调用方）可能继续使用旧 access token。
- 定位：
  - `packages/neko-auth/packages/core/src/neko-auth-service.ts`
  - `packages/neko-auth/packages/extension/src/auth-api.ts`
- 现状：
  - `getSession()` 内部可能触发 `refresh()`；
  - 但 `NekoAuthAPIImpl` 只在 `login()` / `logout()` 时 `fire` 事件。
- 建议：在刷新成功后补发 session change，或在 API 层包裹 `getSession()` 的状态变化检测。

#### NKAT-002：配置优先级判定过宽（P1）
- 影响：只要 VSCode 设置中填了部分字段，就可能覆盖掉 `config.json` 中完整可用的认证配置。
- 定位：
  - `packages/neko-auth/packages/extension/src/extension.ts`
  - `packages/neko-types/src/config/auth-config-loader.ts`
- 现状：
  - 当前判断条件是“存在 `authUrl` 或 `clientId` 即优先用 VSCode 设置”；
  - 但共享校验真正要求的是 `authUrl + tokenUrl` 同时存在。
- 建议：改为基于 `isAuthConfigured()` 判定是否采用 VSCode 配置，避免半配置抢占。

#### NKAT-003：刷新失败策略过于激进（P1）
- 影响：临时网络错误、超时或服务端瞬时异常都会直接清空本地 session，用户体验接近“随机掉线”。
- 定位：
  - `packages/neko-auth/packages/core/src/neko-auth-service.ts`
- 建议：区分“令牌无效/撤销”和“网络不可达/瞬时失败”，只对前者清理本地凭证。

#### NKAT-004：能力宣称超前于实现（P2）
- 影响：外部模块会误以为已有文件存储回退或云厂商 token 能力，实际集成时仍拿到空实现。
- 定位：
  - 文档：`README_CN.md`
  - 共享契约：`packages/neko-types/src/types/auth.ts`
  - 扩展实现：`packages/neko-auth/packages/extension/src/vscode-token-storage.ts`
  - API stub：`packages/neko-auth/packages/extension/src/auth-api.ts`
- 现状：
  - 扩展内只有 `VscodeTokenStorage`；
  - `getCloudToken()` 仍固定返回 `null`；
  - 文件存储能力只停留在共享契约说明中。
- 建议：明确区分“CLI 规划能力”和“VSCode 扩展已实现能力”，避免 README 过度承诺。

#### NKAT-005：桥接层与 extension 测试覆盖不足（P2）
- 影响：`AuthBridge` 这类桥接层即使未接入主链路，也不容易被现有测试发现。
- 定位：
  - `packages/neko-auth/packages/extension/src/auth-bridge.ts`
  - 现有测试：`packages/neko-auth/packages/core/src/__tests__/*`
- 建议：补 extension 层最小测试，覆盖配置加载、API 事件、bridge 消息与 SecretStorage 适配器。

### 本批次验证信息（追加）

- 命令：`find packages/neko-auth -path '*/__tests__/*' -type f`
- 结果：现有测试全部集中在 core 层，未见 extension/bridge 级测试
- 命令：`rg -n "AuthBridge|getCloudToken|SecretStorage|@ts-ignore" packages/neko-auth`
- 结果：确认存在桥接层未接入、能力 stub 与构建层临时规避信号
- 命令：`nl -ba packages/neko-auth/packages/core/src/neko-auth-service.ts` + `auth-api.ts` 静态审查
- 结果：确认自动刷新后的 session 变更未向外广播

---

## 追加记录：2026-04-07（统一能力接入审查）

维护范围：monorepo 横切能力接入状态（`@neko/shared` / `neko-agent` / 各业务子包）

### 结论总览（追加）

结论不是“没有统一”，而是“共享抽象已统一，但各子包接入还不统一”。

- 统一出口已经集中在 `packages/neko-types/src/index.ts`
- VSCode Extension 侧统一入口已经集中在 `packages/neko-types/src/vscode/extension/index.ts`
- 公共组件与 AI 右键菜单 builder 已集中在 `packages/neko-types/src/components/index.ts`
- 但各子包在主题、日志、报错、国际化、AI 菜单、Shell、公共组件等方面的接入深度不一致

| 编号 | 严重级别 | 状态 | 问题摘要 |
|---|---|---|---|
| NKUN-001 | P1 | open | 共享抽象层已统一，但子包接入完整度差异明显，尚未形成统一落地基线 |
| NKUN-002 | P1 | open | Webview 标准入口未统一，部分包缺少 `I18nProvider` 或 `ErrorBoundary` |
| NKUN-003 | P1 | open | Extension 标准入口未统一，`neko-model` / `neko-auth` 未接统一 logger + error handler |
| NKUN-004 | P2 | open | 主题体系未完全统一，`neko-tools`、`neko-live`、`neko-story` 仍以手写 token 映射为主 |
| NKUN-005 | P1 | open | 国际化接入分层不一致，部分包只有 `t()`/bundle，未统一到 React Provider 模式 |
| NKUN-006 | P2 | open | AI 菜单与 AI 接口接入碎片化，统一 builder 仅在少数包真正落地 |
| NKUN-007 | P2 | open | `tools` / Shell 能力名义上在共享层存在，但实际仍主要是 `neko-agent` 专属能力 |
| NKUN-008 | P2 | open | 文档与实现存在偏差，`neko-tools` README 声称接入错误边界，但实际入口未包裹 |

### 接入完整度分层（追加）

#### 第一梯队：接入最完整
- `neko-agent`
- `neko-cut`
- `neko-canvas`
- `neko-preview`

这些包普遍已经接入：
- `@neko/shared` 类型与公共抽象
- `createVSCodeLogger` / `VSCodeErrorHandler`
- Webview `I18nProvider`
- 部分共享组件
- 与 `neko-agent` 的 AI 上下文或 AI 菜单桥接

#### 第二梯队：部分接入
- `neko-audio`
- `neko-sketch`
- `neko-puppet`
- `neko-assets`
- `neko-market`

这些包通常已经接了部分共享能力，但仍保留局部自定义实现或存在接线缺口。

#### 第三梯队：明显不一致或偏底层
- `neko-tools`
- `neko-model`
- `neko-story`
- `neko-live`
- `neko-auth`
- `neko-engine`
- `neko-client`
- `neko-proto`

其中一部分是“底层包本就不需要完整 UI 横切能力”，另一部分则是“业务层确实还没接齐”。

### 问题详情（追加）

#### NKUN-001：共享抽象已统一，但接入基线未统一（P1）
- 影响：项目已经有统一主题、日志、错误、i18n、组件、tools 抽象，但各包落地方式不一，维护成本和迁移成本持续上升。
- 定位：
  - `packages/neko-types/src/index.ts`
  - `packages/neko-types/src/vscode/extension/index.ts`
  - `packages/neko-types/src/components/index.ts`
- 现状：
  - `@neko/shared` 已统一导出 `types / errors / tools / logger / i18n / theme / path`
  - 但业务包仍混合使用“共享实现 + 包内局部实现 + 历史遗留自定义”
- 建议：建立“Extension 入口模板”和“Webview 入口模板”，把共享抽象升级为共享接入规范。

#### NKUN-002：Webview 标准入口未统一（P1）
- 影响：部分 webview 有 `I18nProvider + ErrorBoundary + theme preset`，部分只有其中一部分，导致 UX、稳定性和排错路径不一致。
- 定位：
  - 完整接入示例：
    - `packages/neko-agent/packages/webview/src/main.tsx`
    - `packages/neko-cut/packages/webview/src/main.tsx`
    - `packages/neko-canvas/packages/webview/src/main.tsx`
  - 缺口示例：
    - `packages/neko-audio/packages/webview/src/editor/main.tsx`
    - `packages/neko-live/packages/webview/src/main.tsx`
    - `packages/neko-story/packages/webview/src/main.tsx`
    - `packages/neko-tools/packages/webview/src/mediaDiff.tsx`
- 现状：
  - `neko-audio` 只做了 i18n 初始化 side-effect，入口未包 `I18nProvider`
  - `neko-live` 入口未包 `I18nProvider`、未包 `ErrorBoundary`
  - `neko-story` 入口有 `ErrorBoundary`，但未包 `I18nProvider`
  - `neko-tools` 入口有 `I18nProvider`，但未包 `ErrorBoundary`
- 建议：统一规定 webview 根入口最少包含：
  - `React.StrictMode`
  - `I18nProvider`
  - `ErrorBoundary`
  - 共享 logger / shared theme preset

#### NKUN-003：Extension 标准入口未统一（P1）
- 影响：大多数扩展包已经统一走 `createVSCodeLogger + VSCodeErrorHandler`，但仍有少数包未接入，排查问题时日志与错误上报体验不一致。
- 定位：
  - 已接入示例：
    - `packages/neko-cut/packages/extension/src/extension.ts`
    - `packages/neko-preview/packages/extension/src/extension.ts`
    - `packages/neko-live/packages/extension/src/extension.ts`
  - 未接入示例：
    - `packages/neko-model/packages/extension/src/extension.ts`
    - `packages/neko-auth/packages/extension/src/extension.ts`
- 现状：
  - `neko-model` 主要只用了 `createNewFile`
  - `neko-auth` 直接初始化 service/API，未接统一 logger/error handler
- 建议：补一个共享的 `activate()` 初始化模板，至少统一：
  - root logger 初始化
  - root error handler 初始化
  - 统一 OutputChannel 命名
  - 统一 activation/deactivation 日志

#### NKUN-004：主题接入不完全统一（P2）
- 影响：视觉 token 虽然都围绕 VSCode CSS 变量，但不同包的主题维护方式不同，后续改设计 token 时会出现重复修改。
- 定位：
  - 统一 preset 接入示例：
    - `packages/neko-agent/packages/webview/tailwind.config.js`
    - `packages/neko-cut/packages/webview/tailwind.config.js`
    - `packages/neko-market/packages/webview/tailwind.config.ts`
  - 非统一 preset 示例：
    - `packages/neko-tools/packages/webview/tailwind.config.js`
    - `packages/neko-live/packages/webview/src/index.css`
    - `packages/neko-story/packages/webview/src/styles/screenplay.css`
- 现状：
  - `neko-tools` 仍手工维护一套 VSCode Tailwind 映射
  - `neko-live` / `neko-story` 主要通过手写 CSS 变量消费 token
- 建议：逐步统一到 `nekoTailwindPreset`，至少先消除重复维护的 Tailwind token 映射。

#### NKUN-005：国际化接入模式不统一（P1）
- 影响：部分包已经是共享 React i18n 模式，部分包仍停留在 `t()` 函数模式，后续想统一运行时切换 locale、上下文注入和测试方式会比较痛苦。
- 定位：
  - 完整 Provider 模式：
    - `packages/neko-agent/packages/webview/src/main.tsx`
    - `packages/neko-market/packages/webview/src/main.tsx`
    - `packages/neko-model/packages/webview/src/main.tsx`
    - `packages/neko-tools/packages/webview/src/mediaDiff.tsx`
    - `packages/neko-puppet/packages/webview/src/PuppetApp.tsx`
  - 仅 service / `t()` 模式：
    - `packages/neko-audio/packages/webview/src/editor/main.tsx`
    - `packages/neko-live/packages/webview/src/main.tsx`
    - `packages/neko-story/packages/webview/src/main.tsx`
- 现状：
  - `neko-audio` / `neko-live` / `neko-story` 已建立 bundle 与 `i18nService`
  - 但没有统一在 React 根树上注入共享 `I18nProvider`
- 建议：统一采用 `@neko/shared/i18n/react` 模式，减少包内重复的 `t()` 管线。

#### NKUN-006：AI 菜单与 AI 接口接入碎片化（P2）
- 影响：AI 入口已经存在统一抽象，但实际落地仍分为“VSCode 命令接入”“internalChat 借道”“webview 右键菜单 builder”“AgentContextPayload 传上下文”几套并行方式。
- 定位：
  - 统一 AI 菜单 builder：
    - `packages/neko-types/src/components/contextMenuAI.ts`
  - builder 已落地：
    - `packages/neko-cut/packages/webview/src/hooks/useTimelineContextMenu.ts`
    - `packages/neko-canvas/packages/webview/src/components/common/ContextMenu.tsx`
  - `internalChat` 借道：
    - `packages/neko-assets/src/services/LLMClassifier.ts`
    - `packages/neko-story/packages/extension/src/providers/inlineCompletion.ts`
  - 上下文桥接：
    - `packages/neko-preview/packages/extension/src/providers/document/documentProviderHelper.ts`
- 现状：
  - 真正统一的 AI 中枢在 `neko-agent`
  - 其他包大多只是部分借用 agent 能力
  - 统一 AI 菜单 builder 目前只在 cut/canvas 真正落地
- 建议：后续限制为两种标准接入路径：
  - `AgentContextPayload`
  - `buildAIMenuSection` / `neko.agent.internalChat`

#### NKUN-007：共享 tools / Shell 能力仍主要是 agent 专属（P2）
- 影响：从抽象层看 `@neko/shared/tools` 已经存在，但在业务层的真实消费面仍几乎只在 agent 生态中，尚不能算“全套件统一能力”。
- 定位：
  - 共享出口：`packages/neko-types/src/tools/index.ts`
  - 实际消费：
    - `packages/neko-agent/packages/agent/src/tools/index.ts`
    - `packages/neko-agent/packages/agent/src/tools/core/bash-tool.ts`
- 现状：
  - `BuiltinTool/createTool`、`BashTool`、skill shell replacement 等能力都集中在 `neko-agent`
  - 其他业务包基本不消费共享 tools 抽象
- 建议：如果目标是“全套件统一 tools”，需要明确哪些包也需要接入；否则应在文档中标注它属于 agent 域能力，而不是全局通用能力。

#### NKUN-008：文档与实现存在偏差（P2）
- 影响：开发者会误以为统一能力已经全部落地，实际排查问题时会因为“文档说有、代码里没有”而浪费时间。
- 定位：
  - 文档：`packages/neko-tools/README.md`
  - 实现：`packages/neko-tools/packages/webview/src/mediaDiff.tsx`
- 现状：
  - README 写明“Webview 入口已包裹 `ErrorBoundary`”
  - 但实际入口只包了 `I18nProvider`，未见 `ErrorBoundary`
- 建议：文档与实际实现要二选一：
  - 要么补 `ErrorBoundary`
  - 要么回写 README，避免误导

### 代表性证据点（追加）

- 共享出口：
  - `packages/neko-types/src/index.ts`
  - `packages/neko-types/src/vscode/extension/index.ts`
  - `packages/neko-types/src/components/index.ts`
- 统一 AI 菜单 builder：
  - `packages/neko-types/src/components/contextMenuAI.ts`
- 统一 logger registry：
  - `packages/neko-types/src/logger/index.ts`
  - `packages/neko-agent/packages/webview/src/utils/logger.ts`
  - `packages/neko-agent/packages/extension/src/base/logger.ts`
- 统一 Shell/tool 基类主要由 agent 消费：
  - `packages/neko-agent/packages/agent/src/tools/index.ts`
  - `packages/neko-agent/packages/agent/src/tools/core/bash-tool.ts`

### 本批次验证信息（追加）

- 命令：`find packages -path '*/tailwind.config.*' | sort`
- 结果：大部分 React webview 已接 `nekoTailwindPreset`，但 `neko-tools` 仍是手写 token 映射
- 命令：`find packages -path '*/src/i18n/index.ts' | sort`
- 结果：多数 webview 都已建立 i18n 目录与 bundle，但根入口是否接 `I18nProvider` 仍不一致
- 命令：`rg -n "createVSCodeLogger|VSCodeErrorHandler" packages -g '!**/dist/**' -g '!**/out/**'`
- 结果：大多数扩展包已接统一日志/报错入口，但 `neko-model` / `neko-auth` 仍未统一
- 命令：`rg -n "buildAIMenuSection|neko\\.agent\\.internalChat|AgentContextPayload" packages -g '!**/dist/**' -g '!**/out/**'`
- 结果：AI 统一抽象已存在，但实际落地集中在 `neko-agent`、`neko-cut`、`neko-canvas`、`neko-preview`、`neko-story`、`neko-assets`
- 命令：`rg -n "BuiltinTool|BashTool|createTool\\(" packages -g '!**/dist/**' -g '!**/out/**'`
- 结果：共享 tool 抽象的实际消费基本仍集中在 `neko-agent`

---

## 开发优先级与实施顺序建议：2026-04-07

本节基于当前文档中的问题分布、[ARCHITECTURE_CN.md](../ARCHITECTURE_CN.md) 的分层约束，以及 `core + 场景包` 的依赖关系，对当前批次问题给出推荐开发顺序。

### 排序原则

- 优先修复会阻断主用户路径的问题，而不是单纯按问题数量排序。
- 优先修复 `core` 基础设施包，再修复依赖其契约的场景包。
- 优先收敛命令、消息、DTO、N-API 等跨层契约，再修复局部业务逻辑。
- 优先处理安全边界、数据正确性和状态一致性，再处理体验增强与结构优化。
- 每一阶段都必须同步补最小必要测试，避免协议类问题反复回归。

### 五层分析（用于排期和拆单）

#### 1. 职责层

- `neko-engine`、`neko-preview`、`neko-auth`、`neko-agent`、`neko-market` 属于跨场景基础设施，优先级高于 `neko-cut`、`neko-canvas`、`neko-story` 等场景能力。
- `neko-cut` 是视频创作链路的消费端与落点，`neko-canvas`、`neko-story` 应围绕稳定的下游接口收敛。

#### 2. 依赖层

- `neko-preview`、`neko-market`、`neko-auth`、`neko-agent` 依赖 `neko-engine` 或共享契约，不能在引擎语义和基础协议不清晰时大规模并行推进上层修复。
- `neko-canvas` 与 `neko-story` 的多项问题会落到 `neko-cut`、`neko-agent`、`neko-engine` 的稳定接口上，应避免先修上游再返工下游。

#### 3. 接口层

- 当前最高风险问题集中在命令名、消息协议、DTO、事件字段、N-API 声明等契约边界。
- 这类问题应先统一单一事实来源，再展开功能修复与测试补齐。

#### 4. 扩展层

- `core` 层先稳定后，才能安全推进 `video` 场景包和统一接入规范。
- 统一能力接入问题（logger/i18n/ErrorBoundary/AI 菜单）应放在核心协议稳定后收口，避免“统一到错误接口”。

#### 5. 测试层

- 所有 extension 侧协议链路必须补进默认回归集，不能继续依赖仅覆盖 webview slice 或 `passWithNoTests` 的门禁。
- 每一阶段的出口必须包含对应模块的命令注册、消息路由、关键状态流和失败分支验证。

### 推荐阶段顺序

#### 阶段 0：冻结核心架构决策

目标：先决定不能边修边变的基础语义，避免大面积返工。

- `NKE-001`：明确引擎到底是“进程级单例 + 连接/断开语义”还是“真正支持 stop/start/shutdown”。
- `NKC-002`：明确 `TimelineBridge` 是补齐协议还是统一移除并收敛到 `tool.execute/tool.result`。
- `NKM-001`：明确市场安装契约必须是“下载归档 → 校验 → 解包 → 注册”，禁止 target 依赖模糊产物形态。

完成标志：

- 核心接口语义有单一口径。
- 相关 README / 架构文档 / 代码注释口径一致。

#### 阶段 1：修复 core stop-ship 问题

目标：先恢复所有场景共享基础设施的可用性与安全性。

推荐模块顺序：

1. `neko-engine`
2. `neko-preview`
3. `neko-agent`
4. `neko-auth`
5. `neko-market`

优先问题：

- `neko-engine`：`NKE-002`、`NKE-003`
- `neko-preview`：`NKP-001`、`NKP-003`
- `neko-agent`：`NKA-001`、`NKA-002`
- `neko-auth`：`NKAT-001`
- `neko-market`：`NKM-001`、`NKM-002`

原因：

- 这些问题直接影响共享运行时、认证、AI 上下文、市场安装和预览安全，是所有场景包的共同阻断项。

#### 阶段 2：补 core 安全边界与质量门禁

目标：在可用性恢复后，先把越界、失控和回归漏检风险压住。

优先问题：

- `neko-agent`：`NKA-003`、`NKA-004`、`NKA-005`
- `neko-auth`：`NKAT-002`、`NKAT-003`
- `neko-engine`：`NKE-008`
- `neko-preview`：`NKP-006`
- `neko-market`：`NKM-004`、`NKM-005`、`NKM-008`

完成标志：

- 关键 read/shell/tool 权限边界收紧。
- 默认测试集覆盖 core extension 协议主链路。
- 不再依赖失效 lint/test 配置掩盖真实风险。

#### 阶段 3：恢复视频主链路

目标：恢复“剧本 → 分镜 → 剪辑”的可用闭环。

推荐模块顺序：

1. `neko-cut`
2. `neko-canvas`
3. `neko-story`

优先问题：

- `neko-cut`：`NKC-002` → `NKC-001` → `NKC-003` → `NKC-004`
- `neko-canvas`：先一起收敛 `NKV-001`、`NKV-002`、`NKV-003`，再处理 `NKV-006`、`NKV-004`、`NKV-005`
- `neko-story`：`NKS-002` → `NKS-001` → `NKS-003`

原因：

- `neko-cut` 是时间线消费端和外部导入终点，应先成为稳定基准。
- `neko-canvas` 的多项 P0 是典型协议问题，必须成组修复。
- `neko-story` 需要围绕已稳定的 cut/agent/preview 契约完成闭环。

#### 阶段 4：收口 core 完整度与产品承诺

目标：处理“文档已承诺但实现未闭环”的核心能力缺口。

优先问题：

- `neko-assets`：`NKAS-001`、`NKAS-002`、`NKAS-003`、`NKAS-004`、`NKAS-007`
- `neko-market`：`NKM-006`、`NKM-007`
- `neko-preview`：`NKP-004`、`NKP-005`

原因：

- 这一阶段主要解决“入口可见但能力未闭环”“文档与实现不一致”“发布与运维链路不稳定”等问题。

#### 阶段 5：统一横切能力接入规范

目标：在核心接口稳定后，统一 webview 和 extension 的接入基线。

优先问题：

- `NKUN-001`、`NKUN-002`、`NKUN-003`、`NKUN-005`

后续问题：

- `NKUN-004`、`NKUN-006`、`NKUN-007`、`NKUN-008`

完成标志：

- 形成统一的 Extension 入口模板。
- 形成统一的 Webview 根入口模板。
- logger、error handler、i18n、theme、AI 菜单接入路径有明确基线。

### 模块内推荐修复顺序

#### `neko-engine`

本轮 `NKE-001` ~ `NKE-010` 已完成收口，后续以新增问题单为准。

#### `neko-market`

1. `NKM-001`
2. `NKM-002`
3. `NKM-004`
4. `NKM-005`
5. `NKM-008`
6. `NKM-003`
7. `NKM-006`
8. `NKM-007`

#### `neko-cut`

1. `NKC-002`
2. `NKC-001`
3. `NKC-003`
4. `NKC-004`
5. `NKC-005`
6. `NKC-006`
7. `NKC-007`
8. `NKC-008`
9. `NKC-010`
10. `NKC-009`

#### `neko-canvas`

1. 成组修复 `NKV-001`、`NKV-002`、`NKV-003`
2. `NKV-006`
3. `NKV-004`
4. `NKV-005`
5. `NKV-007`
6. `NKV-008`
7. `NKV-009`
8. `NKV-010`

#### `neko-story`

1. `NKS-002`
2. `NKS-001`
3. `NKS-003`
4. `NKS-004`
5. `NKS-005`
6. `NKS-006`
7. `NKS-009`
8. `NKS-007`
9. `NKS-008`
10. `NKS-010`

### 并行开发建议

- 若资源有限，按上述阶段串行推进，避免跨阶段并行导致返工。
- 若允许 3 条并行线，建议拆为：
  - A 线：`neko-engine + neko-preview`
  - B 线：`neko-agent + neko-auth + neko-market`
  - C 线：`neko-cut → neko-canvas → neko-story`
- 其中 C 线应在阶段 0 的关键契约冻结后再全面展开。

### 验证门禁建议

- 每个阶段结束后执行最小必要验证：
  - `pnpm build`
  - `pnpm test`
  - `pnpm check`
  - Rust 相关模块增加 `cd packages/neko-engine && cargo test`
- 新增或修复以下测试优先级最高：
  - Extension 命令注册一致性测试
  - Webview ↔ Extension 消息路由测试
  - DTO / 协议映射测试
  - 认证刷新与事件广播测试
  - 市场安装编排与解包测试

### 排期备注

- `neko-canvas` 的 P0 数量最多，但不应最先做；其问题高度依赖底层契约稳定。
- `neko-preview` 虽然仅有 1 个 P0，但属于安全问题，必须前置。
- `neko-assets` 虽是 core，但当前主要是能力闭环与承诺收口问题，可放在主链路恢复之后。
- `NKUN-*` 横切统一问题很重要，但本质上属于平台收口，不应早于核心协议修复。

### 执行 Checklist

#### 阶段 0：冻结核心架构决策

- [x] 为 `NKE-001` 输出明确结论：引擎语义采用“单例连接/断开”还是“真实 stop/start/shutdown”
- [ ] 为 `NKC-002` 输出明确结论：保留并补齐 `TimelineBridge`，或统一迁移到 `tool.execute/tool.result`
- [ ] 为 `NKM-001` 输出明确结论：市场安装链路统一为“下载 → 校验 → 解包 → 注册”
- [x] 同步更新受影响的 README / ADR / 代码注释，消除同一问题的双重口径
- [ ] 为上述 3 项决策补一页简短设计记录或 issue 链接

阶段出口：

- [ ] 核心语义在文档和代码中只有一套说法
- [ ] 后续阶段不再依赖“边实现边决定协议”

#### 阶段 1：修复 core stop-ship

`neko-engine`

- [x] 修复 `NKE-002`：停止引擎与异常分支统一清理 `frameServerPort`
- [x] 修复 `NKE-003`：扩展层复用真实 N-API 类型声明，移除手写镜像漂移
- [x] 为 `ensureFrameServer` 增加失效端口探测与重试
- [ ] 增加 NativeEngine / 命令桥接的最小回归测试

`neko-preview`

- [ ] 修复 `NKP-001`：错误页统一 HTML 转义并加最小 CSP
- [ ] 修复 `NKP-003`：Frame Server 端口缓存失败后失效重试
- [ ] 增加文档预览错误页与文件服务重试测试

`neko-agent`

- [ ] 修复 `NKA-001`：拆分 session 首次初始化与增量配置
- [ ] 修复 `NKA-002`：在主链路与 plan 链路透传 `workspaceRoot`
- [ ] 增加多轮会话上下文保持测试
- [ ] 增加 `workspaceRoot` 透传回归测试

`neko-auth`

- [ ] 修复 `NKAT-001`：静默刷新成功后广播 session 变更事件
- [ ] 增加刷新前后 token 变更与事件触发测试

`neko-market`

- [ ] 修复 `NKM-001`：安装阶段真正执行解包而非仅复制归档
- [ ] 修复 `NKM-002`：补齐 Host/Webview DTO adapter，移除跨层直接强转
- [ ] 增加安装编排与 DTO 映射回归测试

阶段出口：

- [ ] core 包的共享阻断问题已解除
- [ ] 相关 P0 路径具备最小自动化回归保护

#### 阶段 2：补 core 安全边界与质量门禁

`neko-agent`

- [ ] 修复 `NKA-003`：Plan 模式只读工具增加工作区白名单校验
- [ ] 修复 `NKA-004`：Skill 默认关闭内嵌 shell，改为显式启用
- [ ] 修复 `NKA-005`：为迭代次数设置有限上限并支持配置

`neko-auth`

- [ ] 修复 `NKAT-002`：仅在配置完整时才让 VSCode 设置覆盖 `config.json`
- [ ] 修复 `NKAT-003`：区分“无效令牌”和“暂时网络失败”的刷新策略

`neko-engine` / `neko-preview` / `neko-market`

- [x] 修复 `NKE-008`：把关键主链路测试纳入标准测试入口
- [ ] 修复 `NKP-006`：补文档预览与 EPUB 关键链路测试
- [ ] 修复 `NKM-004`：InstalledRegistry 对外查询前等待 ready
- [ ] 修复 `NKM-005`：Provider 增加待发送消息队列
- [ ] 修复 `NKM-008`：补安装编排与协议级集成测试

阶段出口：

- [ ] read/shell/tool 边界具备统一约束
- [ ] 默认 lint/test/tsc 能暴露 core 高风险回归

#### 阶段 3：恢复视频主链路

`neko-cut`

- [ ] 修复 `NKC-002`：统一 timeline bridge / tool execute 协议
- [ ] 修复 `NKC-001`：对外 API 命令名与实际注册 1:1 对齐
- [ ] 修复 `NKC-003`：把 `asset:*` 接入主消息路由
- [ ] 修复 `NKC-004`：统一 AI 状态消息协议
- [ ] 修复 `NKC-005`：导出完成回传真实 `outputPath`
- [ ] 修复 `NKC-006`：按 `elementId` 解析真实 AI 输入源路径
- [ ] 修复 `NKC-007`：收紧资源访问边界并替换同步 I/O
- [ ] 修复 `NKC-008`：按活动面板更新状态栏与大纲
- [ ] 修复 `NKC-010`：补 extension 协议链路测试

`neko-canvas`

- [ ] 成组修复 `NKV-001`、`NKV-002`、`NKV-003`，统一请求/响应字段
- [ ] 修复 `NKV-006`：打通 `operationApplied` 脏标记链路
- [ ] 修复 `NKV-004`：`/batch` 先 await 再 map
- [ ] 修复 `NKV-005`：为 AutoPrompt round-trip 补 Promise/resolver 闭环
- [ ] 修复 `NKV-007`：清理命令声明与注册不一致
- [ ] 修复 `NKV-008`：恢复 lint/test/tsc 门禁
- [ ] 修复 `NKV-009`：空文件回落到 `DEFAULT_CANVAS_DATA`
- [ ] 修复 `NKV-010`：补 extension 集成测试

`neko-story`

- [ ] 修复 `NKS-002`：CSP 显式允许最小必要图片来源
- [ ] 修复 `NKS-001`：统一文档声明、语言注册、索引 glob、链接匹配支持集合
- [ ] 修复 `NKS-003`：音频资产映射为正确媒体类型/轨道语义
- [ ] 修复 `NKS-004`：补 scroll 协议与 `data-line`
- [ ] 修复 `NKS-005`：补 `neko-agent` 扩展依赖声明
- [ ] 修复 `NKS-006`：弱化占位命令或完成真实实现
- [ ] 修复 `NKS-009`：补 CSP / 滚动同步 / 音频映射回归测试

阶段出口：

- [ ] 剧本 → 分镜 → 剪辑主链路恢复可用
- [ ] 关键协议、命令、事件流具备自动回归保护

#### 阶段 4：收口 core 完整度与产品承诺

`neko-assets`

- [ ] 修复 `NKAS-001`：决定补真实云同步/渲染编排或下调功能宣称
- [ ] 修复 `NKAS-002`：补 `neko.cloudSync` Provider 或移除视图贡献
- [ ] 修复 `NKAS-003`：让 `AssetRegistry` 真正进入主查询/视图/命令链路
- [ ] 修复 `NKAS-004`：为非媒体资产补持久化与恢复策略
- [ ] 修复 `NKAS-007`：增加 extension 层最小集成测试

其他 core 收口

- [x] 修复 `NKE-004`：统一 `neko-engine` 文档与实现口径
- [x] 修复 `NKE-005`：统一 N-API 单一引擎实例入口
- [x] 修复 `NKE-006`：收敛 `engine-kernel` 中历史 HTTP/FrameServer 残留
- [x] 修复 `NKE-007`：移除或明确标注占位接口
- [x] 修复 `NKE-009`：串联可重复的原生产物与发布流水线
- [x] 修复 `NKE-010`：清理死文件并收敛维护性/健壮性风险
- [ ] 修复 `NKM-006`：补齐许可与认证闭环
- [ ] 修复 `NKM-007`：统一 registry 与 suite version 口径
- [ ] 修复 `NKP-004`：把配置项真正接线到 provider/webview
- [ ] 修复 `NKP-005`：清理消息协议漂移

阶段出口：

- [ ] 文档已承诺的 core 能力与实际实现基本一致
- [ ] 主要“可见不可用”入口被移除、降级或完成闭环

#### 阶段 5：统一横切能力接入规范

- [ ] 修复 `NKUN-001`：定义共享接入基线与模板
- [ ] 修复 `NKUN-002`：统一 webview 根入口最小包装
- [ ] 修复 `NKUN-003`：统一 extension 激活入口模板
- [ ] 修复 `NKUN-005`：统一 i18n React Provider 模式
- [ ] 修复 `NKUN-004`：逐步收敛到统一 theme preset
- [ ] 修复 `NKUN-006`：限制 AI 接入路径到标准方案
- [ ] 修复 `NKUN-007`：明确 tools / Shell 能力是否为全局能力
- [ ] 修复 `NKUN-008`：回写文档或补齐实现，消除偏差

阶段出口：

- [ ] webview/extension 的共享入口规范可复用
- [ ] logger / error / i18n / theme / AI 接入路径统一

#### 总体验收 Checklist

- [ ] `pnpm build` 通过
- [ ] `pnpm test` 通过
- [ ] `pnpm check` 通过
- [x] `cd packages/neko-engine && cargo test` 通过
- [ ] 所有 P0 问题状态更新为 `fixed` 或 `verified`
- [ ] 阶段性修复对应测试已落库，而不是停留在手工验证
- [ ] 文档中的能力宣称、架构描述、配置说明与当前实现一致
