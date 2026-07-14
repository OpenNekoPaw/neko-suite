## Context

当前仓库的 TypeScript、Rust、Proto、架构和 key-free Agent harness 门禁已经形成基础，但 CI 的手写路径判断遗漏部分根配置和 package-level test config，本地 CI 与 GitHub coverage 行为也不一致。测试执行同时存在父包扫描子包与子包自行运行的重叠，覆盖率没有统一证明所有生产源文件被纳入。

UI 侧已有 JSDOM、Extension mock、Webview build smoke 和 VS Code target discovery。`scripts/smoke-vscode-targets.mjs` 只读取 `/json` target 列表，不能操作 UI、观察完整 console 时段、验证 Webview/Extension 消息、文件或 Engine 结果。历史 OpenSpec 中存在人工 CDP 检查记录，但没有仓库拥有、可重复执行的场景 runner。Desktop smoke 同样只构建并检查静态产物。

该变更属于 L4 测试与发布门禁基础设施，涉及 GitHub Actions、Turbo、Vitest、VS Code 内置 Extension Debug、CDP、fixture、日志和多个功能包。测试系统必须保持在开发工具边界，不把测试 pass/fail、fixture shortcut 或 bypass command 注入生产 Webview、Extension 或 Engine 业务路径。

## Goals / Non-Goals

**Goals:**

- 让 PR、本地 CI 和发布门禁共享相同的 canonical 命令、覆盖率与测试所有权规则。
- 在真实 Extension Development Host 中加载 Neko Extension，通过 VS Code CDP 重复执行结构化 UI 场景。
- 同时验证可见 UI、用户交互、canonical message/command/service path、durable side effect、生命周期和运行错误。
- 在真实 Electron Desktop AppHost 中验证等价的启动、交互、持久化、Engine 和重启路径。
- 生成足以复现失败的结构化报告、DOM、日志和截图，并区分 case、infrastructure、configuration failure。
- 让 PR 运行受影响包的核心场景，nightly/release 运行完整矩阵，控制本地产品边界下的成本。

**Non-Goals:**

- 不用普通浏览器、Vite localhost 或 Playwright 页面代替 VS Code Extension Webview。
- 不把视觉像素快照作为所有 UI 的默认真值；普通表单和面板优先验证语义、布局不变量和功能结果。
- 不在功能测试中验证真实 LLM/Skill 创作质量；该职责属于独立 TUI Agent evaluation。
- 不增加 test-only Webview message、Engine action、项目文件格式或业务成功 shortcut。
- 不为假想远程设备农场、跨租户浏览器服务或未知宿主设计通用测试云平台。

## Decisions

### 1. 通用门禁总是启动，包级工作交给 Turbo 和场景选择器

PR 的 TypeScript build/test/quality jobs 不再由脆弱的手写文件匹配决定是否存在。Job 总是启动，Turbo 根据依赖图和缓存执行必要工作；根配置、workflow、lockfile 和质量配置作为 global inputs。Rust 和 Proto 可以保留独立 change detector，但 detector 本身必须有 fixture tests。

根 `package.json` 提供原子 canonical 命令，例如 `check:ci`、`test:coverage` 和 `check:quality`。GitHub jobs 与 `ci:local` 组合相同原子命令；需要快速反馈时新增明确不等价的 `check:fast`，不得继续把快速命令描述为完整本地 CI。

拒绝继续扩展现有 shell glob，因为遗漏会静默跳过整个 job。也拒绝把所有验证串成单进程 runner，因为 GitHub 仍需要 build/test/quality 并行和独立日志。

### 2. 每个 workspace 只有一个测试 owner，覆盖率显式纳入生产源

所有 Vitest config 复用共享 coverage factory，并按 owning source scope 显式设置 `include`。阈值按 workspace/领域执行，不能用全仓平均值掩盖低覆盖包。机器可读审计检查生产 workspace 是否有 test owner、是否被明确 aggregator 拥有、是否重复扫描，以及 coverage config 是否符合基线。

父聚合包只通过 Turbo `dependsOn` 组织子 workspace，不能再用一个 Vitest include 重复扫描已由子包拥有的测试。暂时没有测试的 source-bearing package 必须登记 owner、理由和关闭条件，不能依赖 `<NONEXISTENT>` 或无说明 `--passWithNoTests` 形成成功。

### 3. VS Code 内置 Extension Debug 是唯一 Extension Webview 验收启动边界

当前仓库开发窗口通过 `.vscode/launch.json` 的 `type: "extensionHost"` 配置启动 Extension Development Host。专用配置声明 extension development paths，并把仓库相邻的 `../neko-test` 作为最终 workspace 参数。开发窗口启动时暴露 CDP endpoint；内置 Debug Host 作为同一 VS Code 应用实例中的独立 `page` target 共享该 endpoint，而不会可靠创建第二个 remote debugging port。场景 fixture 复制到 `../neko-test/.neko/.functional/` 的隔离运行目录，只能由 controller 在该工作区授权根内访问。禁止 runner 调用系统 `code` 命令，禁止以 `@vscode/test-electron` 下载的 `.vscode-test`、普通 Chrome 或独立 Electron 页面替代该宿主。

Extension-side test controller 只使用公开 VS Code API 执行命令、打开文件、reload 和关闭重开；Webview-side CDP adapter 只附加开发窗口已暴露且由内置 Debug Host 共享的 endpoint，校验 controller 报告的 workspace必须等于 `../neko-test`，并以 Debug Host page title、controller PID、extension identity 共同排除开发窗口 target，再定位 `page`/`iframe` 并执行受控 DOM 操作。runner 结束时只断开 CDP/controller 并清理隔离 fixture，不关闭或终止由 VS Code Debug 拥有的宿主。`vscode-extension-debugger` Skill 必须对同一端口执行 preflight、target discovery、DOM、console 和 VS Code screenshot 取证；AppleScript 仅可用于选择/启动内置调试配置，不能成为业务交互或验收替代。

### 4. 场景使用封闭 schema，不允许任意 JavaScript

场景位于 `scripts/webview-functional/scenarios/<package>/`，定义 fixture、依赖、host activation、target matcher、步骤、断言、错误策略和 timeout。核心操作限定为：打开文件、执行命令、等待 selector、click、input、key、选择、reload、hide/reveal、close/reopen 和 wait-for-state。Selector 使用 role、accessible name 或 `data-testid`，CSS selector 只作为受审计的包级补充。

CDP adapter 内部可用 `Runtime.evaluate` 实现这些结构化操作，但 manifest 不接受任意代码。这样可以保持真实 DOM 交互，同时防止场景绕过 UI 直接修改 store、调用私有 handler 或伪造成功状态。

### 5. 功能通过需要结果、路径和错误三类证据

每个场景必须包含用户可见结果和 durable/authoritative 结果。文件编辑场景验证保存后的项目文件/revision 并执行 reopen；Engine 场景验证 EngineClient/Engine observable state 或明确 diagnostic；Webview message 场景通过结构化日志、correlation id、公共命令结果或 durable side effect 证明 canonical path。

现有 Logger、OutputChannel 和 CapturedLogTransport 是首选观测基础。若缺少路径证据，只能在 owning runtime 增加通用、脱敏的 observation event，例如 message received、command dispatched、project saved 或 engine request completed；不得增加 `testPassed`、eval rubric 或绕过真实实现的 test-only command。

全局错误监听在激活前开始，收集 `Runtime.exceptionThrown`、console error/warn、Log entry、CSP violation、unhandled rejection 和 Extension Host error。已知 VS Code 容器 warning 通过版本化 policy 过滤；未知错误默认失败。预期失败必须由场景声明 diagnostic code，不能宽泛忽略 error text。

### 6. 功能测试和 Skill evaluation 在 Agent UI 处保持正交

Agent Webview 功能场景验证真实 Extension、AgentSession host bridge、消息投影、输入、队列、取消、Skill 指示器和生命周期，但外部 chat provider 可以在 provider 边界使用确定性受控配置，避免把 UI 测试变成模型质量测试。真实 Skill 激活质量、模型输出和生成产物语义由 TUI evaluation 覆盖。

该分离仍要求所有 UI 内部路径真实执行；只允许替换外部 provider/网络边界，不能替换 Webview、Extension message、AgentSession assembly 或项目服务。

### 7. Desktop 复用场景语义，拥有独立 host adapter

Desktop runner 启动真实 Electron AppHost 并连接 Electron CDP。它复用 wait/click/input/key/DOM/error/report schema，但启动、IPC、窗口、重启和文件生命周期由 Desktop host adapter 实现。VS Code 与 Desktop 不共享伪造的宿主 API，也不要求 UI 像素完全一致。

Desktop 核心场景覆盖 Workbench 首屏、package Webview 挂载、打开/编辑/保存项目、Engine ready/unavailable、重启恢复和 host-private capability diagnostic。拒绝继续把静态 bundle asset 检查描述为 Desktop 功能验收；它保留为 build smoke。

### 8. 证据分为本地原始产物和可提交摘要

每次运行输出 `result.json`、step/assertion evidence、runtime errors、DOM snapshot、Extension/Desktop logs、截图和 side-effect manifest。原始产物默认写入 gitignored `reports/`；PR/OpenSpec 只提交脱敏摘要、命令、scenario id、宿主/版本、失败分类和 residual risk。

报告 schema 版本未知时 fail-visible。场景成功必须满足业务断言、canonical path、durable side effect 和 error policy；target 数量、截图存在或进程退出码不能单独构成通过。

### 9. 分层执行控制时间和平台风险

P0 场景是每个受影响插件的打开、核心操作、保存/reopen 和错误门禁，进入可信 PR CI。P1 领域完整场景进入 nightly；P2 跨插件、媒体/Engine、长生命周期和平台矩阵进入 nightly/release。Linux/Xvfb 可承担稳定的 PR 场景，macOS 覆盖主开发宿主、媒体和焦点差异；平台要求由场景显式声明。

Infrastructure failure 最多进行一次仅针对启动/CDP连接的重试；业务断言和 runtime error 不重试，以免掩盖竞态。

## Risks / Trade-offs

- [Risk] 内置 Debug Host 未启动、选错配置或宿主版本漂移。 → 校验固定 CDP 端口、controller PID、实际 workspace、扩展 identity 和可选版本；runner fail-visible，且只对附加阶段的 infrastructure failure 重试一次。
- [Risk] GitHub-hosted runner 没有可被 F5 驱动的持久 VS Code 开发窗口。 → `8.2/8.3` 保持阻塞，直到提供经授权的 self-hosted VS Code debugger runner 或等价的内置 Debug 自动化；不得回退直接启动 `code` 并宣称通过。
- [Risk] CDP selector 因布局重构变脆。 → 优先 role/accessible name/test id，将稳定可访问性契约作为 UI 公共行为，限制 CSS selector。
- [Risk] 测试观测代码污染生产边界。 → 优先现有 Logger/diagnostics，只允许通用 observation facts，不增加测试成功 shortcut，并由边界测试扫描。
- [Risk] Provider fixture 让 Agent UI 看似成功但真实 Agent 有问题。 → UI 只声明 host/UI acceptance；Skill/Agent 行为必须另有真实 TUI evaluation，报告禁止互相替代。
- [Risk] 全部源文件进入 coverage 后现有阈值失败。 → 先生成可审计基线和 gap ledger，再按 owning package 提升；不能通过移除 include 或扩大 exclude 恢复绿色。
- [Risk] 历史 OpenSpec 已用 target smoke 关闭任务。 → 不重写历史记录，但新变更和未完成任务必须使用新功能场景；残余风险显式保留。

## Migration Plan

1. 定义测试 ownership/coverage/报告 schema，并为当前 workspace 生成审计报告。
2. 让通用 TS jobs 在 PR 总是启动，统一 GitHub 与本地 canonical 命令；保留旧命令为短期显式 alias 时必须标注非等价并设置移除任务。
3. 重构各 workspace test owner 和 coverage config，先消除 Agent/Cut 等重复扫描，再关闭空测试和遗漏配置。
4. 建立 VS Code 内置 Debug 配置与 attach-only CDP/error/report runner，以 Agent View 和 Canvas Custom Editor 作为两种宿主形态的 feasibility pilot。
5. 将现有 target smoke 改名并从功能验收文档/任务中移除成功语义；迁移代表性 Agent、Canvas、Cut 场景。
6. 建立 Desktop adapter 和 Workbench/save/restart pilot，保留 build smoke 作为前置条件。
7. 扩展 P0 package matrix，接入可信 PR CI；再增加 nightly/release 的 P1/P2、Engine 和平台矩阵。
8. 更新质量 ADR、贡献指南、OpenSpec validation 和报告保留策略，删除到期 alias 与重复 runner。

Rollback 必须 fail-visible：若新的真实宿主 runner 暂时不可用，CI 报 infrastructure failure 或记录明确阻塞，不得回退为 target/build smoke 并宣称功能通过。已有单元和 build 门禁继续运行。

## Open Questions

- 本地固定使用 `../neko-test`；GitHub-hosted CI 如何可靠驱动 VS Code 内置 Extension Debug 仍是显式 blocker，解决前不得新增直接 `code` 或 `.vscode-test` fallback。
- 多扩展使用内置调试配置中的直接 development paths；预构建 dependency VSIX 只作为启动成本调研，不得成为本地 canonical path。
- Extension Host 结构化日志的最小采集入口是 OutputChannel、文件 transport 还是通用 observation transport，需要复用审计后决定。
- Desktop PR lane 是否与 VS Code P0 同批启用，取决于 Electron 启动稳定性；契约要求不变，可分阶段接入。
