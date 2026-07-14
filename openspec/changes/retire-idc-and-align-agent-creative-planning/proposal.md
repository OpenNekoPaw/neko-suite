## Why

Neko Agent 已经能够通过普通对话、Read、Tool call、Approval、异步 Task 和文件写入完成基础分析与执行，但残留的固定 `Draft -> Plan -> Apply` IDC stage、stage persona、run/artifact 状态仍与 Agent-native ReAct 边界冲突；同时现有 Plan Mode、`plan.md` 和 TODO 投影缺少面向内容创作的具体契约，导致影视化、动画化请求容易停留在总体规划，不能稳定地产出创作者可审批的领域文档和逐项可执行计划。

## What Changes

- **BREAKING** 删除 runtime-only IDC staged-creation 过程：固定 `IdcStage`、stage planner/registry/tracker/guardian、stage persona 自动切换、IDC run identity 和把 Draft/Plan/Task 作为必经执行状态的 canonical 成功路径。
- 将当前错误地挂在 `stageTracking` 下的 Approval、用户偏好、event/audit/step logging、autoheal、validation 和异步 continuation 迁回普通 Agent session/turn 边界；清理不得削弱安全、审批、诊断或用户数据保护。
- 保留 `auto`、`ask`、`plan` execution modes；Plan Mode 成为用户显式选择的只读分析/审阅模式，不启动 IDC、不激活 persona、不创建媒体任务或项目 mutation。
- 让 Agent 在内容创作请求中先基于实际文档、图片、ResourceRef 和项目文件区分来源事实、Agent 解释、待审批创作决策和可执行动作，再按需要生成创作者可读的 `brief.md`、领域审批文档和 `plan.md`。
- 采用面向创作的 execution-plan 语义：每个工作单元声明对象、触发/跳过条件、输入、能力意图、约束、输出、验收、失败恢复和审批范围；禁止只列“分析、生成、后期、导出”等总体阶段。
- 将 TODO 限定为 conversation/task-scoped progress projection，只投影近期 `pending`、`in_progress`、`completed` 或 `blocked` 工作；TODO 修改不触发 Tool、不证明产物完成，也不成为镜头、项目或恢复状态的事实来源。
- `brief.md`、`plan.md` 和领域审批文档保持普通、用户可编辑的 Markdown；简单任务不强制建文档，复杂/长周期/高成本任务才使用 living plan。Apply/继续执行时由 Agent 重新读取当前文件并发出普通 typed Tool call，不解析 Markdown 为 DAG 或持久 executable plan。
- 审批绑定创作者真正批准的内容、制作策略、成本/风险、mutation 和交付范围；批准后的局部重排、同语义替换和局部恢复可由 Agent 自主完成，故事、角色、核心风格、主要技术、成本等级或交付目标变化需要重新审批。
- 保护用户文件：已有 Markdown、生成素材、ResourceRef、`.nk*` 项目、设置和 trust state 不删除；只有无用户数据价值的 IDC runtime state、fixture 和内部 DTO 被有意丢弃或重建。
- 扩展真实 Agent evaluation，分别验证 plan-only、creator-review、approved-execution、TODO projection、异步续作和 legacy IDC poison 路径；不能只匹配最终回答文本。

## Capabilities

### New Capabilities

- `agent-native-creative-planning`: 定义 Agent 如何从实际内容证据生成创作者可审批的领域文档、创作 execution plan 和轻量 TODO 进度投影，并在批准后通过普通 ReAct/Tool path 持续执行。
- `agent-idc-retirement`: 定义固定 IDC stage/persona/run/artifact 过程的删除、通用 Agent 服务解耦、旧状态处理和 legacy-path poison 要求。

### Modified Capabilities

- `agent-mode-configuration`: 将 Plan Mode 明确为领域无关、只读、可分析真实内容并生成具体执行计划的用户模式，且不得隐式启动 IDC 或执行副作用。
- `legacy-fallback-surface-elimination`: 将残留 IDC stage、persona、run、Draft/Plan/Task runtime 和兼容 trigger 纳入必须删除或 fail-closed 的旧成功路径。

## Impact

- `packages/neko-agent/packages/agent-types`：删除或迁移固定 `IdcStage`、stage activation、IDC run 和 execution-plan runtime DTO；保留真正跨层需要的 conversation/turn/task/result/approval contracts。
- `packages/neko-agent/packages/agent`：简化 AgentSession、ReAct hooks、Skill lifecycle、Plan Mode、Approval、Task、artifact/document 和 progress projection；不新增 Plan Manager、Creation runtime 或 Workflow DTO。
- `packages/neko-agent/packages/extension`：保持 Host IO、文档 digest、conversation continuation 和 capability composition；删除 IDC start/resume/stage persona 适配与兼容成功路径。
- `packages/neko-agent/packages/webview` 与 TUI：复用现有对话、Markdown、Task/progress 和审批投影；不增加 IDC/编排按钮，不让 Webview 拥有计划或执行状态。
- `packages/neko-skills`：删除或重构 creation/execution/iteration stage personas；影视动画 Skill 提供内容分析、创作决策、审批文档和执行工作单元方法，但不包含 Tool 协议。
- `docs/architecture` 与活跃 OpenSpec：把 IDC 从运行过程移除，统一 Plan/TODO/Markdown/Approval/Tool 边界，并显式 supersede 仍要求固定 staged-creation 的旧设计语义。
- 兼容性：这是预发布内部破坏性清理；runtime-only IDC state 和 fixtures 可重建或有意丢弃，用户项目、素材和设置不迁移也不删除。
