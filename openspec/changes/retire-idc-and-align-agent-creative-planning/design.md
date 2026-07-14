## Context

Neko Suite 已接受 Agent-native creation 边界：普通 Agent session/turn、ReAct loop、Tool/capability lifecycle、Approval、Task、validation 与领域 owning package 共同完成创作；Skill 提供方法指导，Markdown 提供用户可读内容。当前代码仍保留另一套固定 staged-creation scaffold：`IdcStage = draft | plan | apply`、stage planner/registry/tracker/guardian、stage persona binding、IDC run identity，以及 Draft/ExecutionPlan/Task runtime artifact。

该 scaffold 即使没有显式 IDC 激活也增加耦合：session factory 会因 capability runtime 提供 Skill registry/service 而构造 `stageTracking`，而 `AgentSession` 又把 EventBus、ApprovalEngine、用户偏好、autoheal、artifact watcher、validation 和 ReAct hooks 包在 `if (stageTracking)` 内。直接删除 stage 代码会误删通用安全与诊断能力。

另一方面，现有 Plan Mode 是软件架构导向的“只描述 what/why”，当前 `media-production` Skill 只给出一条高层阶段链，TODO/Task projection 也没有明确区分进度显示和项目事实。结果是内容创作请求可能产生“分析 -> 分镜 -> 生成 -> 后期”式总体规划，而不是基于真实来源、可由创作者审批、能逐项执行和验证的计划。

本变更风险等级为 L3：跨 Agent types、session/runtime、Skill lifecycle、Approval、Task、Markdown/document、Extension/Webview 投影和真实 Agent behavior。它是预发布破坏性清理，不迁移或删除用户项目、生成素材、设置或 trust state。

## Goals / Non-Goals

**Goals:**

- 删除固定 IDC stage/persona/run/artifact 过程，使普通 Agent ReAct 成为唯一下一步判断与执行路径。
- 将 Approval、preferences、logging、autoheal、validation 和 Task continuation 从 `stageTracking` 解耦，保持或加强现有安全语义。
- 让 Agent 根据真实内容证据生成创作者可审批的领域文档，而不是通用总结。
- 让复杂创作使用可选 living `plan.md`，并把计划具体到可执行工作单元、验收和恢复。
- 将 TODO 保持为轻量、可丢弃的 conversation/task progress projection，不创建新的计划状态 owner。
- 让 Plan Mode 只控制副作用并支持领域化只读分析；批准后仍通过当前 Tool resolve、validation、approval 和 execution 路径执行。
- 通过路径级和真实 Agent evaluation 证明无 IDC 仍能完成 plan-only、审批、执行、恢复和交付。

**Non-Goals:**

- 不新增 AgentNativeCreationRuntime、PlanManager、ExecPlan executor、Workflow/DAG、stage scheduler 或中央 target-completion evaluator。
- 不要求每个任务创建 `brief.md`、`plan.md` 或 TODO。
- 不把 Codex 软件工程 `PLANS.md` 模板逐字复制到内容创作，也不要求 Git commit、代码命令或面向代码库新手的冗余说明。
- 不在本变更中实现所有漫画、角色、Puppet、Animatic、Audio 或 Export 领域能力；缺失 Tool 必须显式暴露。
- 不让 Skill 正文承载 Tool 名、参数表、轮询协议、Webview/path 协议或 package-private authoring schema。
- 不新增 IDC、Plan 或 TODO 按钮；用户继续通过现有对话、Markdown 编辑和既有审批/确认边界协作。

## Decisions

### 1. Canonical path 是对话驱动的 Agent ReAct

目标调用链为：

```text
user goal + files
  -> read/analyze current evidence
  -> optional domain Skill guidance
  -> creator-reviewable document or next Tool intent
  -> current Tool resolve / validation / approval
  -> owning capability or async Task
  -> file / ResourceRef / project revision / diagnostic
  -> same conversation observes result and chooses the next action
```

删除固定 `draft -> plan -> apply` 调度不会删除“先分析、再审批、后执行”这种用户体验；这些行为由 Agent 根据请求、风险、当前内容和既有 execution mode 动态决定。Plan Mode 阻止副作用，Approval 保护具体操作，Skill 提供领域方法，均不需要 stage runtime。

拒绝保留 IDC 为“可选 workflow”：即使默认不启用，它仍会维持第二套 run、persona、artifact 和完成语义，并继续要求所有下游代码兼容两条路径。

### 2. 先解耦通用服务，再删除 IDC scaffold

`AgentSession` 中以下能力改为独立于 `stageTracking` 的正常 session 服务：

- ApprovalEngine、Tool traits/policy 和用户 confirmation；
- preferences strategy loading；
- conversation/turn/tool/task event、audit 和 step logging；
- autoheal/recovery diagnostics；
- validation coordinator 和 Tool result validation；
- async Task result observation 与原 conversation continuation；
- 显式配置的普通 document/artifact watcher。

解耦完成并通过回归测试后，删除：

- `IdcStage`、stage task-shape/entry-signal public contracts；
- stage activation matrix、planner、registry、tracker、guardian 和 dispatcher；
- `StagePersonaBinding` 及 stage-enter/exit lifecycle；
- AgentSession 的 `_stageTracker`、`_stageGuardian`、stage activation trace 和相应配置投影；
- IDC-specific run/start/resume/restore、creation-stage events 和成功兼容路径。

普通 ReAct runner 可以继续记录 Tool 结果、错误和恢复证据，但不得再计算或投影固定创作 stage。

拒绝直接删除整个 `if (stageTracking)`：它会无意移除 Approval 和 validation，是不可接受的安全回退。

### 3. Stage persona 被删除，必要行为回归正确层级

`creation-persona`、`execution-persona` 和 `iteration-persona` 不再由 runtime 自动切换：

- 通用“执行请求不得停在计划、没有 Tool 结果不得声称完成”进入基础 system prompt；
- 内容分析、创作判断、角色一致性和局部修订方法进入领域 Skill；
- Tool 调用、权限、审批、失败和恢复保持在 capability/runtime；
- 语气或角色扮演若仍有真实产品需求，只能作为用户显式激活的普通 persona/Skill，不得重新拥有 stage。

删除 `stagePersona` lifecycle slot 和 `creation-stage` lifetime；保留 `domainSkill`、`referenceSkill` 及其他已有、非 IDC 的可组合 Skill 生命周期。若旧 persisted lifecycle record 出现，返回明确的 retired-record diagnostic，不恢复 persona。

### 4. 先分析证据，再生成创作者审批文档

内容创作指导要求 Agent 区分四类信息：

1. 从实际文档、图片、音视频或项目读取到的来源事实；
2. Agent 基于证据作出的解释和置信度；
3. 需要创作者选择或批准的创作决策；
4. 批准后可交给 Tool 执行的操作。

`brief.md` 可用于目标、来源理解、不确定点和审批摘要。正式 Storyboard、Treatment、Character/Style/Color Bible 或其他领域文档应由对应领域契约拥有；它们不是 IDC artifact，也不应全部塞进一个通用 Agent DTO。

创作者审批绑定具体内容和范围，例如改编、角色、视觉/声音方向、制作技术、成本上限、mutation 和交付目标。审批可以通过现有对话表达，Host/Approval 只在需要确定性授权时记录文档 content digest 和批准范围；不要求新增专用按钮。

### 5. Creative ExecPlan 是普通 living Markdown，不是 executable state

复杂、长周期、高成本或跨会话的创作可以使用 `plan.md`。计划至少描述：

- 目标和可观察交付物；
- 当前来源、ResourceRef、已有领域项目和未决问题；
- 已批准创作决策和制作策略；
- 可执行工作单元；
- validation/acceptance、恢复和需重新审批的变化；
- 当前进度、重要发现、决策和最终交付。

每个工作单元包含：对象、触发/跳过条件、输入、能力意图、约束、期望输出、验收、失败分支和审批要求。计划使用人类可读的能力语义，不持久化 resolved executor、完整 Tool schema、Provider handle、Task handle、cache/Webview identity、Workflow node 或 retry state。

执行时 Agent 重新读取当前 `plan.md` 和实际文件，在当前 turn 选择普通 typed Tool call。它不得把 Markdown 解析或编译为命令/DAG，也不得重放计划创建时的 Tool schema。Tool 缺失或支持变化时，Agent更新计划或报告 partial/blocked，而不是伪造可执行性。

拒绝把 `ExecutionPlan` DTO 作为持久恢复状态：它会重新建立 Plan Manager，并与用户可编辑 Markdown、Tool registry 和领域事实分叉。

### 6. TODO 只投影近期进度

TODO 复用现有 conversation/task/progress surface，最小状态为 `pending`、`in_progress`、`completed`、`blocked`，并保持至多一个 `in_progress`。它只展示用户当前应关心的近期工作，不复制整个 Storyboard shot set、Cut timeline 或 project graph。

TODO 可以由 Agent从当前计划和结果更新，但：

- TODO 文本或状态变化不触发 Tool；
- `completed` 不证明文件、镜头或项目完成；
- session resume 不从 TODO 推断当前 ResourceRef 或 project revision；
- 领域大批次进度由 owning project/generated files/Task results 提供；
- 删除或重建 TODO 不影响创作文件。

拒绝新增 TodoManager/PlanProgressStore；现有 TaskManager 或对话 plan projection 足以承担展示。

### 7. Plan Mode 只读但必须具体

Plan Mode 的职责是允许 Read、ReadDocument、ReadImage、必要的无副作用分析和当前能力检查，然后生成或修改 creator-reviewable documents 和 execution-ready `plan.md`。它不再使用“软件架构师、只讲 what/why、不讲 how”的固定提示。

Plan Mode 必须禁止媒体生成、项目/资产 mutation、导出和隐式权限提升。只读但付费、外部、受保护的分析仍走实际 trust/permission/cost policy。切换 `plan`、`ask`、`auto` 不创建 run、不激活 Skill/persona，也不改变项目事实。

用户批准并要求继续后，Agent使用正常执行模式和当前 Tool runtime；不存在“Plan Mode 编译 Apply”的独立路径。

### 8. Approval 保护范围，Agent 在范围内自主重规划

需要确定性审批的 plan 记录 plan digest、关键输入 fingerprint/revision、目标、批准内容、成本/风险上限、mutation 和交付范围。以下变化要求重新审批：故事/角色、核心视觉或声音方向、主要制作技术、成本/风险等级、mutation scope 或交付目标改变。

在批准范围内，Agent可以自主调整工作顺序、拆分批次、使用同语义当前可用 Tool、局部重试和修复。具体调用仍分别经过 Tool policy/Approval；plan approval 不能越过高风险或不可逆操作的现有 gate。

### 9. 文件身份与完成事实保持现有边界

- 来源文件：ResourceRef/fingerprint/content digest；
- 生成结果：`neko/generated/<kind>/` 文件、ResourceRef、digest 和 lineage；
- `.nk*` mutation：owning project revision/baseRevision；
- Quality/preflight：绑定被检查文件 digest 或项目 revision；
- approved plan：仅绑定 plan digest 和批准范围；
- TODO、对话和未批准分析 Markdown：不是完成事实。

不建立全局 current revision、stable artifact promotion 或中央 completion store。Asset Import/Promote 仍是用户显式入库行为。

### 10. 真实 Agent evaluation 是行为验收

至少覆盖：

- 无 IDC/persona 情况下，Agent读取漫画/剧本并区分事实、解释和创作决策；
- plan-only 生成具体工作单元而不是总体阶段；
- creator review 修改 plan 后，旧 digest 审批不能授权重大变化；
- approved execution 调用真实 Tool，并在 Tool/Task result 后继续原对话；
- TODO 更新不触发副作用，且不能伪造完成；
- missing/degraded Tool 产生明确 blocked/partial plan；
- 固定 IDC stage/persona/run 路径被 poison 后，Approval、validation、Task 和交付仍正常。

`pnpm test:agent:eval` 仅验证 harness；release evidence 需要聚焦真实模型/Provider case，并记录输入文件、Tool path、结果文件和 residual risk。

## Five-Layer Analysis

| Layer | Decision |
| --- | --- |
| Responsibility | Agent session/turn owns reasoning and next action；Skill owns domain method；Document Host owns Markdown IO/digest；Task owns one async execution；Approval owns authorization；domain packages own project/media truth；TODO owns display only。 |
| Dependency | Layer 0 只保留最小 conversation/turn/task/approval contracts；Extension owns workspace IO；Webview 只投影；领域包通过 capability/ResourceRef 协作，不 import Agent internals。 |
| Interface | 优先删除 `IdcStage`、stage/run DTO 和 `ExecutionPlan` runtime；不新增 broad CreativePlan DTO。Markdown 模板、Tool schema 和现有 Task/Approval interfaces 足够。 |
| Extension | 新的漫画、剧本、插画、动画方法通过 Skill 与 owning Tools 加入；execution plan 使用稳定工作单元语义，不要求修改 central stage enum 或 planner。 |
| Testing | Contract/poison tests证明 IDC 不可成功；session tests覆盖解耦服务；prompt/Skill tests覆盖计划粒度与协议边界；真实 Agent/provider evaluation覆盖实际文件、审批、执行、恢复和交付。 |

## Risks / Trade-offs

- [Risk] 删除 `stageTracking` 导致 Approval、preferences、logging、autoheal 或 validation 不再初始化。→ 先迁移到普通 session bootstrap，增加无 IDC 回归和 poison tests，再删除 stage code。
- [Risk] `plan.md` 演化成隐藏 DSL。→ 只允许人类可读工作单元和 stable refs；禁止 schema/executor/handle/node；Markdown 修改永不触发副作用。
- [Risk] TODO 被当成项目事实。→ Task/progress API 和 UI 明确 projection 语义；恢复与完成测试 poison TODO-only state。
- [Risk] 没有 IDC 后高成本创作直接执行。→ Plan Mode、Tool traits、ApprovalEngine 和 provider/cost policy 独立保留；真实高风险操作仍逐次检查。
- [Risk] 模型生成看似具体但当前 Tool 无法执行的计划。→ 计划必须检查当前 Tool definitions/result diagnostics；缺失能力标记 blocked/partial，并用 Agent evaluation 验证实际调用。
- [Risk] 长计划挤占上下文。→ 简单任务不建计划；TODO 只投影近期项；长计划保存在用户可见 Markdown并按需读取，不复制全部项目状态。
- [Risk] 删除历史 IDC record 损坏用户内容。→ 仅丢弃 runtime-only state；保留所有用户 Markdown、生成文件、`.nk*`、设置和 trust；发现旧 record 时返回诊断而非静默恢复。
- [Risk] 活跃 OpenSpec 仍描述 IDC 或平行 planning projection。→ 本变更更新相关 ADR/change artifacts并添加架构边界测试，明确 superseding 关系。

## Migration Plan

1. 审计 `stageTracking`、IDC types/personas、Draft/Plan/Task artifacts、Skill lifecycle、events、Webview/TUI 和 active OpenSpec 的所有 production callers；增加旧路径 poison tests。
2. 把 Approval、preferences、logging、autoheal、validation、artifact watcher 和 Task continuation 从 stage bootstrap 迁到普通 Agent session，并验证无 IDC 路径。
3. 删除固定 stage types、planner/registry/tracker/guardian/dispatcher、persona binding、IDC run/restore 和兼容 trigger；旧调用 fail-closed。
4. 删除或重构 stage personas，将通用执行纪律迁入 system prompt、领域判断迁入 Skills；移除 stagePersona lifecycle。
5. 收缩 Draft/ExecutionPlan/Task runtime artifact：保留用户 Markdown和通用 TaskManager，删除 execution-state owner、隐藏索引和 stage coupling。
6. 更新 Plan Mode prompt、creative Skill guidance、optional `brief.md`/`plan.md` templates 和 TODO projection；接入现有 document/Approval/Tool boundaries。
7. 更新 Webview/TUI 投影和 i18n，只展示对话、计划文档、审批、任务/进度和真实结果，不增加编排控制。
8. 运行 contract/unit/integration、legacy-debt、unused、build/test/check、真实 Agent evaluation；涉及 Webview 行为时运行 Extension Development Host 场景。

回滚不得恢复 IDC 成功路径。若迁移中某通用服务尚未解耦，保留新 contract并 fail-close 受影响操作，修复 session bootstrap；不能用 stageTracking fallback 伪装成功。

## Open Questions

- 现有 `Draft`、`ExecutionPlan`、`Task` 类型中哪些仍有非 IDC 调用方？实现审计后应分别迁到普通 Markdown、TaskManager 或删除，不能整体保留为兼容层。
- `creation-persona`、`execution-persona`、`iteration-persona` 是否存在用户显式激活的真实使用？若无则删除；若有，只保留去 stage 化后的普通 Skill 并补独立评价。
- TODO 是否已经有一个同时服务 Webview/TUI 的 canonical progress projection？若现有 TaskManager 足够则直接复用；不足时只补最小只读投影，不新增可变 store。
- 已批准 plan digest 的现有 Approval contract 是否足以表达批准范围？只有审计证明缺失时才补字段，避免新的 PlanApprovalStore。
