## Why

Neko Suite 已有大量单元、契约和 Webview 构建测试，但 PR 变更检测、覆盖率配置和测试所有权仍可能漏掉真实风险，现有 `smoke:webview:targets` 也只证明 VS Code CDP target 存在，不能证明用户能在真实 Extension Webview 或 Desktop AppHost 中完成操作且不产生运行错误。现在需要把“可构建、可发现”提升为可重复、可失败、带证据的真实客户端功能验收。

## What Changes

- 建立统一仓库测试编排契约，使本地 CI 与 GitHub CI 使用相同命令、覆盖率配置和测试所有权规则，并消除仅修改测试/构建配置时 PR 门禁漏跑的问题。
- 建立仓库拥有的 VS Code Extension Development Host 功能测试 runner，加载真实扩展和 fixture workspace，通过 VS Code CDP 操作真实 Webview，而不是在普通浏览器中模拟。
- 定义结构化 UI 场景、操作、断言、依赖和错误策略，覆盖激活、可见 UI、点击/输入/键盘、Webview/Extension 通信、文件或 Engine 结果、保存/reload/关闭重开和失败诊断。
- 将 Webview console、CSP violation、未处理异常、Extension Host 日志、DOM snapshot 和 VS Code 截图纳入场景证据与失败判定。
- 建立 Desktop AppHost 的真实 Electron 功能验收，启动实际应用并验证 Workbench、package Webview、项目文件、Engine 状态和重启恢复，而不再把 bundle 文件存在视为功能成功。
- 将现有 target-discovery smoke 明确降级为环境预检；只有执行业务断言、canonical path、durable side effect 和 runtime error policy 的场景才能作为 UI 功能完成证据。
- **BREAKING**：`smoke:webview:targets` 不再被描述或接受为完整 Webview 功能验收；历史只记录 target count 的验证结果不能继续关闭功能验收任务。

## Capabilities

### New Capabilities
- `repository-test-orchestration`: 定义 PR/本地测试命令一致性、覆盖率源文件纳入、workspace 测试所有权、变更触发和结构化测试证据要求。
- `vscode-webview-functional-acceptance`: 定义真实 Extension Development Host、Webview CDP 操作、业务断言、生命周期、错误采集和证据报告的功能验收契约。
- `desktop-functional-acceptance`: 定义真实 Electron Desktop AppHost 启动、交互、持久化、Engine 集成、重启恢复和错误门禁。

### Modified Capabilities
- `quality-validation-release-loop`: 将 Extension Webview 和 Desktop 的运行态验证从 target/build smoke 提升为按风险执行真实功能场景，并明确 smoke、JSDOM 和普通浏览器不能替代功能验收。

## Impact

- 主要影响 `.github/workflows/ci.yml`、根 `package.json`、`turbo.json`、`vitest.shared.ts`、各 workspace Vitest/test scripts、`quality/` 机器可读门禁以及新的 `scripts/webview-functional/`。
- 影响现有 `scripts/smoke-vscode-targets.mjs`、`scripts/smoke-webview-builds.mjs` 和 `packages/neko-desktop/scripts/smoke.mjs` 的命名、职责和验收声明，但保留轻量环境/产物预检价值。
- 使用当前开发窗口的 VS Code 内置 `extensionHost` 调试配置启动 Extension Development Host，固定打开仓库相邻的 `../neko-test` 测试工作区；仓库 runner 只附加该会话的 controller/CDP 端点，`vscode-extension-debugger` 对同一会话取证。runner 不调用系统 `code` 命令，也不会下载或启动 `.vscode-test`、普通浏览器或独立 Electron 验收宿主。
- 各功能包需要贡献 package-owned fixture 和核心用户路径场景，但业务断言仍通过真实 public command、Webview message、项目文件服务和 Engine/client 边界完成，不增加测试专用业务成功入口。
- 真实 UI 场景会增加 CI 时间，因此 PR 运行受影响包的 P0 场景，nightly/release 运行完整矩阵；基础 TS/quality job 本身不再因脆弱路径过滤而完全跳过。
