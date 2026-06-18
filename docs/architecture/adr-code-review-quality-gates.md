# ADR: 代码审查与质量门禁

状态：Accepted
日期：2026-06-15
范围：全仓库 TypeScript、React Webview、VSCode Extension、Rust Engine、Proto、文档、打包和 OpenSpec 变更。

本文记录当前稳定的代码审查与质量门禁规则。它补充根目录 `AGENTS.md`、`ARCHITECTURE_CN.md`、`CONTRIBUTING_CN.md` 和 `openspec/project.md`，不保存单次实现日志或历史进度。

## 决策

Neko Suite 采用“架构优先、契约优先、风险分级、证据驱动”的质量门禁。

所有非平凡变更在实现或交付前必须回答：

1. 是否符合现有架构？
2. 如何进一步降低耦合？
3. 是否易于扩展与测试？

多模块改动或新功能还必须做五层分析：

| 层面 | 检查点                                                               |
| ---- | -------------------------------------------------------------------- |
| 职责 | 谁拥有数据、行为、生命周期和清理？                                   |
| 依赖 | L0/L1/L2、Webview/Extension、TS/Rust 和包边界是否正确？              |
| 接口 | DTO、message、schema、Proto、command 和 extension API 是否小而稳定？ |
| 扩展 | 下一类相似能力是否能通过 port、registry、strategy 或事件扩展？       |
| 测试 | 哪些行为由单元、契约、集成、smoke、VSCode 验证或人工证据覆盖？       |

## 风险等级

| 等级 | 适用改动                                                                | 最低验证期望                                                                 |
| ---- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| L0   | 文档、文案、低风险单文件修复                                            | 聚焦检查、文档 review 或截图。                                               |
| L1   | 局部组件、hook、service、state 逻辑                                     | 聚焦单元测试和相关包 build/typecheck。                                       |
| L2   | Webview/Extension message、共享包、公共类型、EngineClient、跨包契约     | 契约测试、message/schema 测试、依赖边界检查和相关包 build。                  |
| L3   | Rust Engine、Proto、媒体流、渲染、项目格式、AI workflow、打包、资源访问 | 架构 review、单元/契约/集成测试、smoke 或 fixture 验证，必要时性能/UX 证据。 |
| L4   | release、安装、重大 UX、核心创作工作流                                  | 完整本地/CI 门禁、安装或运行 smoke、UX 证据和明确残余风险。                  |

## 通用检查

- 不新增生产 `any`、不安全 `as Type` 或正式 `console.log` 日志。
- 不破坏 TypeScript `strict`、`noUncheckedIndexedAccess`、`noImplicitOverride`。
- Webview 不导入 `vscode`、Node API 或 Extension 实现。
- Extension Host 不导入 React/ReactDOM 或 Webview 实现。
- TypeScript 不重复 Rust Engine 已拥有的权威计算。
- Protobuf 和共享契约仍是跨层类型单一事实来源。
- 持久项目数据使用相对路径、`${VAR}/path`、stable refs、asset/entity ID 或 document locator，不保存 Webview URI、blob URL、stream ID、preview token 或 engine token。
- 异步流程处理错误、取消、超时、资源释放和竞态边界。
- 公共契约、关键分支和失败路径有测试或明确残余风险。
- 影响行为、架构、配置、包入口或公共契约时同步更新对应文档。

## 验证命令矩阵

按影响范围选择最小可靠验证，并在交付说明或 PR 中记录命令和结果。

| 范围                          | 推荐命令                                        |
| ----------------------------- | ----------------------------------------------- |
| TS / Webview / Extension 通用 | `pnpm ci:local`                                 |
| Rust Engine                   | `pnpm ci:local:rust`                            |
| Proto 契约                    | `pnpm ci:local:proto`                           |
| 架构边界                      | `pnpm check`                                    |
| 未使用/冗余代码               | `pnpm check:unused`                             |
| Agent 边界                    | `pnpm check:agent-boundaries`                   |
| 3D Route A 边界               | `pnpm check:3d-route-a-boundaries`              |
| 残留/债务关键词扫描           | `pnpm check:legacy-debt`                        |
| 代码债务台账                  | `pnpm check:legacy-debt:ledger`                 |
| 质量门禁组合                  | `pnpm check:quality`                            |
| Engine runtime smoke          | `pnpm smoke:engine`                             |
| Webview build smoke           | `pnpm smoke:webview`                            |
| Webview runtime smoke         | `pnpm smoke:webview:runtime`                    |
| VS Code debugger Skill smoke  | `pnpm smoke:vscode-debugger -- --skill <skill>` |
| GitHub Actions 形状预检       | `pnpm ci:act`                                   |

`act` 只是本地 Linux job 形状预检，不替代 GitHub Actions。Rust macOS runner、平台打包和 release 矩阵以 GitHub Actions 为准。

代码债务、边界例外、发布通道等机器可读门禁输入放在 `quality/`，由脚本和 CI 消费；本文只记录质量政策、验证矩阵和人工 review 边界。

开发验证中若新增、修改或移除 `legacy`、`fallback`、`deprecated`、`compat`、`shim`、`dirty`、`hack`、`temporary`、`workaround`、dead code、unused 或 duplicate 相关代码，交付说明或 PR 必须记录 `pnpm check:legacy-debt`、`pnpm check:unused`，或说明已由 `pnpm ci:local` / `pnpm check:quality` 覆盖。

## 新需求可行性检查

L3/L4 变更在大规模实现前必须先证明关键路径可行：可以通过 spike、fixture、失败测试、Engine smoke、Webview runtime smoke、VSCode debugger Skill smoke、VSCode 调试证据或原型完成。可行性证据写入 OpenSpec design/tasks；若无法运行，必须记录原因、风险和后续关闭方式。

## Prelaunch 兼容策略

项目尚未发布时，可以选择显式破坏未发布的内部 API、DTO、Webview message、Agent workflow payload、测试 fixture 和 nk\* 草稿格式，用于移除 legacy debt 或保持 canonical 架构清晰。此类破坏性调整不需要为所有历史草稿保留长期兼容 shim。

但 prelaunch 不等于忽略版本兼容性。Review 必须确认：

- proposal/design 说明了破坏内容、原因和影响面。
- 旧数据处理策略明确：迁移、重建、重新导入、忽略或有意丢弃。
- load/save、contract fixture、失败 diagnostic、迁移或重建路径有验证任务。
- 新路径引入时，旧 compatibility shim、legacy adapter、fallback branch、dual-read/dual-write、旧字段映射和旧命令入口默认删除或改为 fail-closed，避免验证继续走旧路径。
- 兼容 shim 只有在保护有价值本地数据、已记录公共契约或外部信任边界时才保留，并且有 owner、replacement、验证命令、移除条件和到期任务。
- 开发和测试新路径时默认禁用兼容 fallback；若执行流命中旧路径，必须立即抛错、返回 fail-closed diagnostic 或触发可断言的 telemetry/log failure，不得继续返回旧路径成功结果；只有明确标记为迁移、拒绝或诊断测试时才可观测旧路径。
- 新路径验收必须是路径级验收，不得只断言最终结果成功；review 必须确认测试断言 canonical path、新 handler、新 renderer、新 adapter 或新 contract 被命中，并通过 spy、counter、log assertion 或将 legacy path poison 成抛错来证明旧路径未参与。
- 验证必须证明 canonical path 默认命中；如果 legacy path 仍可触发，必须有显式 feature flag、迁移入口、fail-closed diagnostic、telemetry/log assertion 或测试覆盖，并断言旧路径不会为新路径请求返回成功结果。
- legacy fixture、旧字段 fallback、旧 message handler、旧 renderer 或旧 command alias 的测试不能作为新路径完成证据，只能作为迁移/诊断证据。
- VS Code、Node、pnpm、Rust、OS、Webview sandbox、CSP、codec、Range、Engine、Proto、marketplace trust 和安全边界不能以“未发布”为由忽略。
- 有价值的本地项目数据、用户设置、trust state、entitlement、插件安装记录和生成产物不能静默丢失；必须迁移、重建、提示确认或 fail-closed。

## Engine 与 Webview 专项约束

Engine 变更涉及 Rust action、stream、file access、runtime state、native packaging 或 EngineClient contract 时，应单独记录 Rust/Proto/client/fixture/smoke 验证。Webview 变更涉及 runtime behavior、Extension/Webview message、layout、keyboard/focus、i18n、VSCode lifecycle、CSP、媒体 codec 兼容或 Range/seek 读取时，应单独记录 message contract、focused build/test、CSP/HTML helper 测试、Engine file-access 测试、Webview runtime smoke、VSCode debugger Skill smoke 或截图证据。

普通浏览器、Chrome、Browser 插件、Playwright 或 Vite/localhost 只能作为热重载和显式浏览器兼容性辅助；它们不经过 VS Code Webview CSP、`webview.asWebviewUri(...)`、Extension/Webview message、焦点生命周期或 VS Code 主题注入，因此不能作为 Extension Webview 视觉/交互变更的默认验收证据。此类变更必须使用 Extension Development Host + `vscode-extension-debugger` Skill，运行 `pnpm smoke:webview:runtime` 或等价命令；若无法运行，必须记录原因、剩余风险和关闭方式。

VS Code/Electron 在创建任意 Webview 编辑器或 Webview View 时，可能在 DevTools 中输出以下容器级 warning：

- `Unrecognized feature: 'local-network-access'`
- `An iframe which has both allow-scripts and allow-same-origin for its sandbox attribute can escape its sandboxing.`

这些 warning 来自 VS Code Workbench 的 Webview iframe 创建逻辑，不由 Neko 的 Webview HTML、CSP、`webview.options` 或业务脚本产生。若堆栈指向 `webviewElement.ts`、`overlayWebview.ts`、`customEditorInput.ts` 或 `webviewEditor.ts`，它们应在运行态验收中作为已知良性容器 warning 过滤；不得把它们当作 Canvas/Cut/Audio/Model 等编辑器保存、路径、媒体或 CSP 的失败证据。仍需追踪 Neko 自身 logger、CSP violation、`preview:*`、`media:*`、`Failed to save NK*` 等业务错误。

## 组件复用审计

Webview/React 变更新增组件前，review 必须确认已经做过组件复用审计：

- 是否搜索过 `@neko/ui`、当前包 `components/`、`hooks/`、`shared/`、相邻领域包和已有测试。
- 是否可以通过增强已有组件的 prop、slot、variant、composition hook 或 package-local adapter 完成需求。
- 新组件与旧组件的职责、状态生命周期、交互契约、可访问性语义或领域边界是否真的不同。
- 如果跨两个以上 Webview 复用，是否应进入 `@neko/ui`；如果只服务某个领域，是否留在 owning package。
- PR/OpenSpec/交付说明是否记录了查过哪些组件、为何不复用、为何不抽共享层以及新增/回归测试。

没有复用审计证据的新增按钮、选择器、面板、空状态、工具栏、列表、卡片、输入区、Header/Input 等模式，应视为功能偏离或维护风险，而不是普通实现细节。

## 公共基础能力审计

新功能涉及组件样式、主题、国际化、日志、错误/诊断、配置、路径、文件保存/读写、资源授权、缓存、DTO 或跨包契约时，review 必须确认已经做过公共基础能力审计：

- 是否优先复用或更新 `@neko/shared`、`@neko/ui`、`@neko/neko-client`、`@neko/proto`、`@neko/entity`、`@neko/search`、project-file-io、resource cache 或既有 domain service。
- 是否避免了 package-local design system、theme token、i18n runtime、logger/error 类型、项目文件 IO、cache manager、path resolver、Engine HTTP/WS client 或共享 DTO 的并行实现。
- 如果公共入口缺少能力，是否优先扩展公共契约、公共 adapter、公共 hook/primitive 或 domain service，而不是复制一份功能包私有实现。
- 如果能力留在 owning package，是否说明了业务边界、依赖方向、后续提取条件和验证命令。

缺少公共基础能力审计的新横切能力，应视为架构风险；若影响多个包或公共契约，应进入 OpenSpec proposal/design 后再实现。

## 跨子包能力复用审计

新功能涉及 provider、registry、bridge、protocol、message router、status bar、tree view、file decoration、history、selection、recent items、projector、facade、command router、capability provider、store slice 或 workflow adapter 时，review 必须确认已经做过跨子包能力复用审计：

- 是否搜索过其他子包和共享层中同类能力、相同交互模式、相同 host adapter、相同协议形态或可复用测试。
- 两个以上子包需要同类能力时，是否优先提取为中立共享契约、domain service、adapter factory、registry、strategy、hook、test utility 或 `@neko/ui` primitive。
- 是否避免复制其他功能包实现，或直接 import 另一个功能包内部模块。
- 如果保留 package-local 实现，是否说明职责、生命周期、领域语义、依赖方向或运行环境为何不同。
- OpenSpec/PR/交付说明是否记录查过哪些包、为何不能复用、为何不抽共享层、后续提取条件和验证命令。

缺少跨子包能力复用审计的重复 provider/registry/bridge/protocol/status/tree/history/selection 等实现，应视为维护风险。需要共享时必须经公共包、public subpath、command/API facade、port、provider registry 或 domain service，而不是功能包互相依赖内部实现。

## 功能偏离检查

OpenSpec 变更必须把需求、实现和验证连起来：

```text
proposal / spec scenario
  -> design boundary
  -> task
  -> code change
  -> test / smoke / manual evidence
  -> residual risk or archive
```

非平凡变更交付时应说明：

- 主用户路径是否覆盖。
- 是否违反 proposal non-goals。
- 每个新增公共契约或关键 scenario 对应哪个测试或 smoke。
- 哪些验证未运行以及原因。
- 剩余风险进入 OpenSpec follow-up、`TODO_CN.md` / `TODO.md`、`ROADMAP_CN.md` / `ROADMAP.md` 或带日期的 `docs/status/` 快照。

## 自动化与人工边界

机器检查负责格式、类型、依赖、台账、契约和可重复测试。人工 review 负责架构取舍、功能偏离、UX、专业创作工作流、性能解释和残余风险判断。

新增质量工具时，应优先接入现有脚本或 OpenSpec validation tasks，避免形成只靠口头约定的并行流程。
