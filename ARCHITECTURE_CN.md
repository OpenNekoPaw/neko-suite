# 系统架构总览

> **语言:** 中文 | [English](./ARCHITECTURE.md)

本文是 Neko Suite 当前架构入口，只描述稳定边界和不变量。详细架构文档、ADR 和领域文档导航见 [docs/README.md](./docs/README.md) 与 [docs/architecture/README.md](./docs/architecture/README.md)。

## 系统定位

Neko Suite 是集成在 VS Code 内的创意工作套件，由三个协作平面组成：

| 平面     | 职责                                                                                                               |
| -------- | ------------------------------------------------------------------------------------------------------------------ |
| 创作平面 | Story、Canvas、Timeline、Preview、Model、Sketch、Puppet、Audio、Assets、Market、Dashboard、Search 等 React Webview |
| 编排平面 | VS Code Extension Host 包，负责工作区访问、扩展激活、跨扩展协调、Agent 会话和命令路由                              |
| 引擎平面 | Rust sidecar，负责媒体权威、GPU 渲染、编解码、音频、设备 I/O、ML 推理、场景和 Puppet 运行时                        |

核心挑战是在 VS Code 沙箱内暴露专业创作和 AI 工作流，同时不破坏 Webview 安全边界，也不在 TypeScript 层重复引擎权威计算。

## 客户端产物目标

Neko Suite 的客户端产物按目标分工：

| 产物              | 目标                                                                                     |
| ----------------- | ---------------------------------------------------------------------------------------- |
| TUI 客户端        | Agent 功能验证、模型效果验证、eval 场景验收、消融实验、回归测试和结构化报告              |
| VSCode 插件客户端 | 插件化轻量创作客户端，方便 VSCode 等插件继续扩展能力，并支持快速创作编辑                 |
| 独立编辑器        | 专业创作客户端，提高编辑器上限和渲染效果，绕开 VSCode 限制，并提供更可控的自动化测试宿主 |

三个客户端共享 Agent runtime、领域 capability、Host adapter ports、Engine client 与 Rust Engine，但不追求功能完全等价。详细边界见 [`docs/architecture/client-targets.md`](./docs/architecture/client-targets.md)。

## 分层

| 层级          | 所有者                                             | 规则                                              |
| ------------- | -------------------------------------------------- | ------------------------------------------------- |
| L0 共享契约   | `neko-types`、`neko-proto`、`neko-workbench-core`、部分 schema 和工具模块 | 零内部包依赖，可被 Extension 和 Webview 复用      |
| L1 宿主服务   | Extension Host 包与 `neko-client` 适配层           | 可使用 VS Code API；不得导入 React                |
| L2 Webview UI | React 包与 `neko-ui`                               | 只运行在浏览器沙箱；不得导入 `vscode` 或 Node API |
| Engine        | `neko-engine` Rust crates                          | 权威计算和运行时状态；宿主无关                    |

依赖方向应流向契约层和 engine/client 边界。功能扩展之间不要直接依赖；能用共享契约、命令总线或 exported API 表达的关系，不要用包级耦合表达。

## 通信

| 边界                      | 机制                                                  | 不变量                                            |
| ------------------------- | ----------------------------------------------------- | ------------------------------------------------- |
| Webview 到 Extension Host | typed bridge 上的 `postMessage`                       | Webview 不直接调用 VS Code 或 Node API            |
| Extension Host 到 Engine  | `EngineClient` 的 HTTP/WebSocket，以及受控 N-API 表面 | Extension Host 不重复引擎计算                     |
| Webview 到 Engine 流媒体  | Extension Host 授权后的 WebSocket stream descriptor   | Extension Host 负责授权，媒体帧尽量不经 Node 中继 |
| Extension 到 Extension    | 共享 exported API 或 VS Code command bus              | 功能扩展之间不隐藏包级依赖                        |

## 核心契约

| 契约                          | 单一事实来源                                 |
| ----------------------------- | -------------------------------------------- |
| 跨层 IDL                      | `packages/neko-proto`                        |
| TypeScript 共享契约和基础设施 | `packages/neko-types`                        |
| Host Adapter ports            | `packages/neko-host`                         |
| Workbench / Plugin Host 契约  | `packages/neko-workbench-core`               |
| 跨领域内容语义服务            | `packages/neko-content`                      |
| Engine client 与流客户端      | `packages/neko-client`                       |
| 媒体与运行时权威              | `packages/neko-engine`                       |
| 架构决策                      | 本文与 `docs/architecture/`                  |
| 质量门禁                      | `AGENTS.md`、`CONTRIBUTING_CN.md` 与包级检查 |

## 引擎权威

Rust 引擎是以下能力的权威来源：

- 媒体探测、解码、编码、导出和二进制文件访问；
- GPU 渲染和流生产；
- scene、puppet、audio、device、media、ML runtime 状态；
- 重计算感知和转换管线；
- 必须跨未来宿主继续稳定存在的运行时能力。

TypeScript 可以编排、展示、请求和校验，但不应重写引擎已经拥有的媒体或运行时计算。

## Webview 约束

所有 Webview 必须遵守：

1. 不直接访问 Node.js API。
2. 不绕过 host bridge 直接访问 VS Code API。
3. 工作区和扩展资源必须通过宿主授权 URI 暴露。
4. 持久项目数据不保存 Webview URI、blob URL、stream ID、preview token 或 engine token 作为事实来源。
5. UI 组件消费抽象 host bridge 和共享契约，不消费具体 Extension Host 服务。

## Agent 工作流

Agent 遵循 Draft / Plan / Apply 稳定工作流。

关键不变量：

- Skill 描述行为和领域策略，不是工作流引擎。
- Approval、Policy、Memory、Runtime、Schema、Evaluator、Prompt 是分离的控制平面。
- 高成本或不可逆动作必须有审批路径。
- Agent 工具通过包能力和共享契约工作，不直接耦合 Webview。
- 生成媒体和项目事实必须重新接地到资产、实体记忆或搜索索引，才能成为持久上下文。

## 创作数据流

Neko Suite 收敛到一个共享创作闭环：

1. 用户意图从 Agent、Story、Canvas 或其他创作界面进入。
2. 意图与项目文件、资产、实体、记忆和当前 UI 选择接地。
3. Agent 和包能力创建或修改结构化项目产物。
4. 引擎权威的预览、渲染、感知或导出路径产出可观察结果。
5. 结果回写到资产、搜索、实体记忆和审阅界面。

Story、Canvas、Cut、Preview、Assets、Entity、Search、Agent 和 Engine 各自保留职责，通过共享契约连接。

## 文件与路径策略

持久项目记录只保存可移植引用：

- workspace-relative path；
- `${VAR}/path` 形式，由路径系统解析；
- stable resource ref；
- 带 locator 的 document source ref；
- asset/entity ID 和 provenance 记录。

除明确属于本地设置外，不保存绝对机器路径；也不保存 Webview URI、blob URL、stream ID、preview token 等瞬时运行时句柄。

## 本地元数据与工作区身份

Extension 与 TUI 共享唯一用户级数据库 `~/.neko/neko.db`。不可静默丢失的本机状态使用逻辑 `state` ownership；conversation、ResourceCache、Search、Entity/Asset 和 catalog 等可重建 read model 使用逻辑 `cache` ownership。两者共用 schema、migration、backup 与并发边界，但使用独立事务语义。

Remote SSH、Dev Container 或 Codespace 使用实际运行 Extension Host/TUI 的远端用户目录和远端 `~/.neko/neko.db`。该契约只保证同一 Host 内的共享与 workspace 重绑，不提供本机与远端、不同容器或不同机器之间的会话/Task/catalog 同步。

所有 workspace-scoped row 必须携带 `.neko/workspace.json` 中的稳定 UUID `workspaceId`。descriptor 与用户数据库 `workspaces` registry 通过同一个 Host resolver 协同：descriptor 删除后按唯一 portable locator 恢复原 UUID；目录移动保留 UUID；新旧 locator 同时存在或 registry 歧义时 fail-visible，要求显式 clone/rebind。identity 恢复只重建 descriptor，不生成可选配置、memory 或其他用户文件。绝对路径、active workspace、VS Code Memento、Webview URI 和 cache path 都不能作为跨 Host identity。项目事实继续位于 `neko/` 或 owning domain file；Journal、raw logs、用户可编辑文件和 artifact bytes 继续使用文件。workspace `.neko/.cache/` 不创建 SQLite 数据库或 canonical metadata manifest。

## 文档策略

架构文档只描述当前决策、边界、不变量、风险和后果。不要把代码片段、命令输出、实现状态、路径索引或历史开发日志放进架构入口文档。

文档分类遵循以下规则：

- 系统级架构和 ADR 放入 `docs/architecture/`。
- 领域能力和领域内部架构放入 `docs/domains/<domain>/`。
- 调研、竞品和技术 spike 放入 `docs/research/`。
- Gap、迁移和健康度快照放入 `docs/status/`。
- 活跃设计变更放入 `openspec/changes/`。

## 设计原则

1. 契约先行，实现后置。
2. 接口小而稳定。
3. 优先依赖注入、注册表、策略和事件边界，避免直接包耦合。
4. 引擎计算保持权威且宿主无关。
5. Webview 体验可以丰富，但必须沙箱正确。
6. 架构文档只作为当前契约或明确历史快照，不作为实现台账。
