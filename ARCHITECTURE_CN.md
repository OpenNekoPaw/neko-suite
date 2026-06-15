# 系统架构总览

> **语言:** 中文 | [English](./ARCHITECTURE.md)

本文是 Neko Suite 当前架构入口，只描述稳定边界和不变量。详细架构文档、ADR 和领域文档导航见 [docs/README.md](./docs/README.md) 与 [docs/architecture/README.md](./docs/architecture/README.md)。

## 系统定位

Neko Suite 是集成在 VS Code 内的创意工作套件，由三个协作平面组成：

| 平面 | 职责 |
|------|------|
| 创作平面 | Story、Canvas、Timeline、Preview、Model、Sketch、Puppet、Audio、Assets、Market、Dashboard、Search 等 React Webview |
| 编排平面 | VS Code Extension Host 包，负责工作区访问、扩展激活、跨扩展协调、Agent 会话和命令路由 |
| 引擎平面 | Rust sidecar，负责媒体权威、GPU 渲染、编解码、音频、设备 I/O、ML 推理、场景和 Puppet 运行时 |

核心挑战是在 VS Code 沙箱内暴露专业创作和 AI 工作流，同时不破坏 Webview 安全边界，也不在 TypeScript 层重复引擎权威计算。

## 分层

| 层级 | 所有者 | 规则 |
|------|--------|------|
| L0 共享契约 | `neko-types`、`neko-proto`、部分 schema 和工具模块 | 零内部包依赖，可被 Extension 和 Webview 复用 |
| L1 宿主服务 | Extension Host 包与 `neko-client` 适配层 | 可使用 VS Code API；不得导入 React |
| L2 Webview UI | React 包与 `neko-ui` | 只运行在浏览器沙箱；不得导入 `vscode` 或 Node API |
| Engine | `neko-engine` Rust crates | 权威计算和运行时状态；宿主无关 |

依赖方向应流向契约层和 engine/client 边界。功能扩展之间不要直接依赖；能用共享契约、命令总线或 exported API 表达的关系，不要用包级耦合表达。

## 通信

| 边界 | 机制 | 不变量 |
|------|------|--------|
| Webview 到 Extension Host | typed bridge 上的 `postMessage` | Webview 不直接调用 VS Code 或 Node API |
| Extension Host 到 Engine | `EngineClient` 的 HTTP/WebSocket，以及受控 N-API 表面 | Extension Host 不重复引擎计算 |
| Webview 到 Engine 流媒体 | Extension Host 授权后的 WebSocket stream descriptor | Extension Host 负责授权，媒体帧尽量不经 Node 中继 |
| Extension 到 Extension | 共享 exported API 或 VS Code command bus | 功能扩展之间不隐藏包级依赖 |

## 核心契约

| 契约 | 单一事实来源 |
|------|--------------|
| 跨层 IDL | `packages/neko-proto` |
| TypeScript 共享契约和基础设施 | `packages/neko-types` |
| Engine client 与流客户端 | `packages/neko-client` |
| 媒体与运行时权威 | `packages/neko-engine` |
| 架构决策 | 本文与 `docs/architecture/` |
| 质量门禁 | `AGENTS.md`、`CONTRIBUTING_CN.md` 与包级检查 |

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
