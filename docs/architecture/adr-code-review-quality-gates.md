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

| 范围                          | 推荐命令                           |
| ----------------------------- | ---------------------------------- |
| TS / Webview / Extension 通用 | `pnpm ci:local`                    |
| Rust Engine                   | `pnpm ci:local:rust`               |
| Proto 契约                    | `pnpm ci:local:proto`              |
| 架构边界                      | `pnpm check`                       |
| Agent 边界                    | `pnpm check:agent-boundaries`      |
| 3D Route A 边界               | `pnpm check:3d-route-a-boundaries` |
| 代码债务台账                  | `pnpm check:legacy-debt:ledger`    |
| Engine runtime smoke          | `pnpm smoke:engine`                |
| Webview build smoke           | `pnpm smoke:webview`               |
| GitHub Actions 形状预检       | `pnpm ci:act`                      |

`act` 只是本地 Linux job 形状预检，不替代 GitHub Actions。Rust macOS runner、平台打包和 release 矩阵以 GitHub Actions 为准。

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
