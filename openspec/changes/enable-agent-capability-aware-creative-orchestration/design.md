## Context

> **Dependency and precedence (2026-07-14):** [`retire-idc-and-align-agent-creative-planning`](../retire-idc-and-align-agent-creative-planning/) removes fixed IDC stage/persona/run and defines Plan/TODO/creator-review documents. This design must run on that ordinary Agent ReAct path. Existing Tool definitions, Tool registry, `GetContext`, Read and owning results are the default capability-awareness mechanism; the planning-projection scaffold described below is experimental and MUST be removed or kept unconnected unless focused Agent evaluation proves a minimal derived read view is necessary. It is never a prerequisite for creative orchestration.

Neko Suite 已接受 Agent-native creation 边界：现有 Agent session/turn loop、capability lifecycle、validator feedback、approval、artifact service、task runtime 与 quality runtime 共同拥有创作执行；Skill prompt-chain 只提供可跳过、重排和重复的方法指导。当前媒体 Skill 也已收敛到 `storyboard`、`image`、`video`、`media-production`、`video-editing` 与 `media-quality-review`，并具备 Image/Video operation registry、canonical Storyboard、Canvas/Cut handoff、ResourceRef、生成资产 lineage 和 Quality Gate 基础。

缺口位于这些能力之间：现有 Tool/capability 描述不足以稳定表达创作用途、输入输出、执行类型、真实 support/limits 和 diagnostics，`media-production` Skill 又偏固定阶段总结；一次执行后，异步结果也不能稳定回到原对话驱动下一步。影视创作因此可能退化为文字方案、把所有镜头默认交给生成式视频、依赖聊天历史判断完成状态，或误把 prompt-chain checkpoint 当成真实产物。

本变更跨 Agent runtime、Skill、媒体 capability 与多个 owning package，风险等级为 L3。它不得建立新的 workflow/creation runtime，不得让功能包交叉依赖，也不得把 tool schema、轮询协议或 package authoring 细节写入 Skill content。

## Goals / Non-Goals

**Goals:**

- 让 Agent 按需感知当前真实可用的 Story、Canvas、Image/Video、Sketch、Puppet、Scene、Cut、Audio、Quality、Export 与 External Processor 能力。
- 先复用并完善现有 Tool definitions、registry、Skill context、`GetContext` 和 owning diagnostics，使模型能够选择创作策略；只有 evaluation 证明必要时才派生紧凑只读视图。
- 让每次下一步判断以当前文件/ResourceRef、生成结果、适用的 owning project revision、task/capability result、approval 与 QualityEvidence 为事实来源。
- 允许 Agent 解释性地选择、跳过、重排、重复、并行、回退或切换 Skill/capability，同时由确定性 validator、approval 和 Quality Gate 守住边界。
- 通过真实 Agent evaluation 证明从漫画、剧本、小说或插画目标出发时，Agent 能执行 canonical owning capability、响应 unavailable/degraded diagnostics 并从当前文件或 owning project revision 继续。

**Non-Goals:**

- 不新增 WorkflowRuntime、WorkflowRun、WorkflowNode、DAG scheduler、node executor 或平行 Creation 状态机。
- 不把 prompt-chain 扩展成执行 DSL，也不以 observation 事件作为 Artifact 完成证明。
- 不一次性向模型注入所有工具 schema，不允许 Skill content 包含具体工具名教程或参数表。
- 不让 Agent、Webview 或跨包共享层拥有 `.nk*` 项目真值；mutation 继续由 owning package 和 Engine 权威路径执行。
- 不在本变更内实现所有影视制作技术；缺失能力必须通过当前 Tool/capability support 或 diagnostic 暴露，并进入后续 owning-package change。

## Decisions

### 1. 先完善现有 Tool/capability contribution，不建立第二规划契约

Agent 当前已经获得 Tool definition、description、input schema、Skill metadata 和执行结果，并可通过 `GetContext` 查看当前分类与 Skill。实施首先应校正同一 owning contribution 中的领域用途、输入/输出、mutation、deterministic/perception/generative/hybrid 语义、真实 support/limits 与 diagnostics，使这些 canonical 信息足以支持模型选择。

只有真实 Agent evaluation 证明现有上下文产生能力遗漏、明显 Tool 误选或不可接受的 token 成本，并且不能通过 Tool description/schema、Skill 或 `GetContext` 修复时，才允许从同一 registry/contribution 派生只读、按需、可丢弃的紧凑视图。该视图不新增 support authority，不进入 Markdown，不携带 executor、transition、runtime state、Provider handle、Webview identity 或项目事实。

现有 `CreativeCapabilityPlanningProjection` scaffold 只是实验代码，不构成已接受公共契约；实施前应通过 ablation 决定删除还是缩减接入。选择该方案而不是默认新增 projection，是因为 Tool registration/injection 已经是模型执行上下文，预建第二种模型可读能力协议会产生漂移和过度设计。

### 2. 能力上下文优化由 evaluation 驱动

默认 Agent turn 继续使用现有 Tool/Skill 注入与按需 `GetContext`。需要比较 Puppet、逐帧、Scene、生成视频等技术时，Agent 应先从当前真实可调用 Tool 和 owning diagnostics 判断，不要求固定经过 domain index、operation discovery、selected-schema 三段协议。

Registration 继续决定能力是否存在，Injection 根据当前 host、trust、model/provider、artifact context、policy 与 token budget 决定模型可见 Tool。未知、禁用、未安装或不匹配的能力不得以“看似可用”形式出现。

同一 creative purpose 出现多个由不同 owner 正常注册的 capability 是策略选择输入，不是 selection collision。Discovery 必须把这些候选及各自当前约束交给 Agent 比较；只有同一 canonical capability identity 被重复拥有、无法唯一 resolve，或 selected identity 仍解析到多个 executor 时才 fail-visible。不得为了获得确定性而把所有可替代制作技术标记为 unavailable。

如果 ablation 证明 Tool 上下文过大，可在现有 PromptComposer/token budget 中增加派生过滤或按需摘要，但正常 Tool/lifecycle registry 始终是唯一执行权威。实现不得把优化方案升级为新的 discovery runtime 或 creative catalog。

### 3. Agent loop 直接查询当前事实并重规划，不新增通用 Observation 平台

每次多步骤创作决策前以及 mutation/task 完成后，现有 Agent loop 通过 Read、当前 Tool result 或已有 owner facade 查询与当前目标相关的事实：

- active Skill 与 prompt-chain guidance/observations；
- 当前用户文件、ResourceRef、digest 与适用的 owning project revision；
- 生成文件、Task status/result 与 lineage；
- capability discovery/support/limits；
- async task status 与结构化 result/diagnostic；
- approval decision；
- current QualityEvidence/Gate 与 stale state；
- 用户最新目标、成本和审阅约束。

查询结果只用于当前 think/act 边界和 trace，不成为新的 canonical `CreationState` store。聊天历史、Journal、Markdown 和旧 Tool result 可以帮助定位需要重新读取的文件或项目，但不能替代当前文件内容或 owning project revision。下一步由模型直接形成普通 typed Tool call，确定性 runtime 负责 resolve、validation、approval 和执行；`.nk*` mutation 结果携带 exact revision，并在下一项 consequential mutation 前由 owning capability 通过 `baseRevision` 或等价契约重新校验。

实现不得为了统一输入而递归扫描任意聊天/Tool payload、复制所有 Quality/Task/Approval 类型守卫，或把全会话事实装入通用 Creative Observation DTO。若当前 owner 尚无可查询的 revision/read model，应返回 missing-capability 或 degraded diagnostic，并在 owning package 补最小只读/authoring contract。

选择现有 loop 而不是 workflow engine，因为创作路径需要动态跳步、重排和回退，同时 Accepted ADR 已将 lifecycle/state 权威限定在 Agent-native services。`beforeAct` 的重新观察只有在 owning validator 消费 current/base revision 并能拒绝 stale invocation 时才构成安全 Gate；单纯重算提示上下文不算执行前校验。

### 4. 实际文件和 owning project 结果证明完成，prompt-chain observation 只说明方法采用

checkpoint completion 不得解除 Gate 或触发下游 mutation。阶段性完成必须由实际文件、owning project 结果与适用 validator 证明，例如：

- Storyboard：当前 Storyboard 文档或项目 revision + validation result + source coverage；
- Animatic/Cut：当前 `.nkv` revision + owning validation/export readiness；
- generated shot：实际生成文件 + ResourceRef/digest/lineage + required QualityEvidence；
- export：实际交付文件 + 适用的 project revision、preflight 和 lineage/verification。

Prompt-chain observation 如因解释或 evaluation 需要而保留，可记录 started/checkpoint/skipped/reordered/completed 和理由；它不是 Agent 继续执行所必需的 runtime state，也不包含 executable node、retry policy 或隐式状态迁移。

### 5. 镜头制作采用 capability strategy selection，不默认视频生成

Shot/scene 规划时，Agent 必须从当前注册能力中比较适用策略，例如 generative video、keyframe video、Puppet、frame animation、layered 2D、3D scene/camera 或 compositing。选择依据至少包括输入 artifact、动作/镜头要求、时长、连续性、Provider limits、成本、质量证据和 owning project target。

如果目标技术没有 production capability，Agent 必须返回明确 unavailable diagnostic、提出最小可恢复替代方案或请求安装/启用能力；不得将语义降级为自由文本 prompt 后继续声称成功。

### 6. 事务性 mutation 留在 owning capability

Agent 选择的是 creative intent；跨多个低级 mutation 才能保持原子性的 authoring 必须由 owning package 提供事务性 operation，并返回 exact revision。优先复用已有 headless authoring API；只有审计证明现有低级调用无法避免半完成项目状态时，才为 Story/Canvas/Cut/Audio 等增加小型 operation。

Agent 不直接拼装 `.nk*` 文件，不通过 active Webview 状态猜目标，不把另一个功能包的内部实现导入 Agent 或 Skill。

### 7. 可解释选择与恢复进入 trace/evaluation，不成为第二份计划

为 evaluation 和诊断记录最小选择证据：目标、候选 capability ids、selected capability id、拒绝原因、输入/输出 artifact refs、diagnostics、approval 与下一步原因。该记录是 trace/audit evidence，不是可恢复执行状态或用户项目事实。

真实 Agent evaluation 至少覆盖：

- 已有 Storyboard 时跳过重复来源归一化；
- 不支持尾帧时不静默丢字段，并选择修复/替代路径；
- 插画动画在可用时选择 layered/Puppet 而非默认视频生成；
- QualityEvidence stale 后回到 owning revision 修复并重新审查；
- 会话恢复后从 durable revision/ResourceRef 继续，而不是重放聊天步骤；
- legacy workflow runtime/node 路径被 poison 后 canonical Agent loop 仍可完成任务。

### 8. 图片编辑按执行语义路由，不直接绑定生成图片模型

Canonical Image operation 继续由 `ImageOperationCapabilityRegistry` 协商，Agent 可见的 Tool/capability 语义必须反映真实 executor：

- `deterministic`：crop、resize、rotate、panel split、mask、图层与像素合成等可重复操作；
- `perception`：OCR、分格检测、人物/背景分割、depth、pose、lineart 等结构证据；
- `generative`：inpaint、outpaint、遮挡补全、上色、重绘和风格转换；
- `hybrid`：多个显式 operation 的组合，例如文字检测、mask、确定性移除、背景补全和原图合成。

当前 `TransformImage` 与多个 Sketch AI operation 最终调用 `media.generateImage`，因此实施前必须区分“工具/UI 存在”“可写回 Sketch”与“存在真实 provider-independent executor”。Capability matrix 不得将后两者推断为所有 Provider 下无条件 `supported`。确定性 operation 不经生成模型；生成式 operation 必须声明 source/mask/reference、未修改区域保留语义、模型/网络要求和 Quality profile。Hybrid 操作保持多个可审计 invocation，不折叠成隐藏 shell、Prompt 或单个伪原子工具。

选择 operation registry 协商而不是让 Agent 直接选择模型 API，因为同一 upscale、colorize 或 split 语义可能由 Engine、本地模型、受管 External Processor 或生成 Provider 实现，且不同 adapter 的可重复性、成本和保真度不同。

### 9. 角色依赖和目标完成条件参与观察，但不进入 Agent 状态所有权

漫画/插画到动画时，Agent 应读取 owning 领域提供的角色身份、正式参考、外观/服装/配色 revision 与镜头依赖。Shot 需要引用适用的角色/外观 revision；相关 revision 改变后，依赖结果、accepted shot evidence 与 QualityEvidence 按 owning contract 标记 stale，Agent 再决定重新生成、局部修复或请求显式保留。Agent 不创建平行 `CharacterProductionProfile` store，也不从 Prompt 中猜测 canonical 角色版本。

Agent 根据用户批准的目标直接检查 owning domain 已有的文件、project result、validator、Quality 和 Export 证据，不建立中央 target-completion profile/evaluator。目标完成判断示例：

- Storyboard/Animatic：current owning revision + validation + 必要审批；
- 样片：目标 shot set 全部绑定 accepted revision 与 required evidence；
- 动画成品：required shots、final Cut/Audio/subtitle revisions、non-stale preflight、export lineage 与 deliverable verification 均绑定同一当前项目事实。

本变更只要求 Agent 能读取这些 owning 结果并在能力缺失时 fail-visible，不建立通用 planning/observation/completion projection。改编稿、角色/Style/Color Bible、Animatic、多镜头依赖、后期完整性和成品契约的 owning schema/authoring 实现必须先做公共能力审计，并由独立动画生产领域 OpenSpec 承接；不得把它们实现为 Agent runtime 内的大 DTO 或固定流水线。

### 10. Plan Mode 生成创作者可审批 Markdown，执行使用普通 Tool call

Plan/TODO 的完整边界由 [`retire-idc-and-align-agent-creative-planning`](../retire-idc-and-align-agent-creative-planning/) 拥有。Plan Mode 复用现有 Agent turn/session、Approval、document service 和 Tool context，不增加 Plan runtime/store，也不启动 IDC。进入 Plan Mode 后，Agent可以执行符合 policy 的只读内容分析与当前能力检查，按需要生成：

- `brief.md`：目标、来源理解、结构化 evidence 引用和不确定点；
- `plan.md`：已批准的制作策略，以及按对象、条件、输入、能力意图、约束、输出、验收、恢复和审批范围描述的 work units；
- bounded TODO：面向用户的近期进度和阻塞投影；默认不持久化成单独 checklist 文件。

Markdown 只保存用户可审阅的来源证据、创作决策、work units、stable references、验收和恢复，不保存完整 operation schema、resolved executor、task handle 或 hidden transition。需要执行时，Agent 在当前 turn 重新读取 Markdown 和实际文件，直接形成普通 typed Tool call，并通过现有 registry/lifecycle 完成 resolve、validation、approval 和 dispatch；不新增 `CapabilityIntent` graph 或 plan-specific invocation contract。

计划批准应绑定至少目标 identity、计划 content digest、关键输入文件/ResourceRef 或适用的 project revision、批准范围和时间。用户要求继续执行时，Agent 在普通 turn 中重新读取这些事实：

- 未改变且 capability 仍可用时，执行当前 intent；
- capability/Provider 变化但仍在批准的目标、cost/risk、mutation 和交付范围内时，Agent可做小范围 replan 并记录原因；
- 来源内容或项目 revision、目标、核心制作技术、cost/risk、mutation scope 或交付条件发生实质变化时，旧批准不能授权新路径，必须修订 `plan.md` 并重新审批。

文档分析由 Content/Story/Perception owner 产出 page/panel/scene/character candidate/source-trace 等结构化 Artifact。Agent 可以在 `brief.md`/`plan.md` 中解释这些结果，但不能把自然语言摘要当作执行证据。只读分析若调用外部模型、受管 Processor 或受保护内容，仍经过真实 trust、permission、cost 和 approval policy；“Plan Mode”本身不自动授予读取或 Provider 权限。

选择 Markdown + ordinary Tool call 而不是持久 executable plan DTO，是为了保留用户可编辑性和 Agent 动态重规划，同时避免用 `CapabilityIntent`、`PlanDefinition` 或 `PlanNode` 重新创造被禁止的 Workflow runtime。

## Risks / Trade-offs

- [Risk] 可选派生能力摘要与 Tool schema 重复并发生漂移。→ 默认不建设；只有 evaluation 证明必要时才从同一 owning contribution 派生，并增加 parity contract test，禁止手写平行 catalog。
- [Risk] 当前 Tool 上下文过大，挤压模型上下文。→ 先改进 description/schema、Skill 和 `GetContext`；仍有实证问题时再增加最小派生过滤或摘要并测量 token/context。
- [Risk] 模型忽略 prompt-chain 或选择次优制作技术。→ 通过明确 purpose/limits/diagnostics、validator feedback、Quality Gate 和真实 evaluation 改进；不使用隐藏 DAG 强制创作顺序。
- [Risk] trace 被误用为恢复状态或项目事实。→ trace 仅引用文件/ResourceRef 或 owning project revision；恢复重新读取 owning services，测试 poison trace-only continuation。
- [Risk] 多个包为同一创作语义提供近似能力。→ capability id、domain、artifact kinds 和 mutation owner 必须明确；两种实现只有在真实可替换时共享 operation，否则保留领域差异。
- [Risk] Agent 自主性导致昂贵调用过多。→ cost/risk/approval projection、batch preflight、预算策略和 bounded recovery 在调用前确定性执行。
- [Risk] 现有 `media-production` 实现包含固定 stage state。→ 先区分 task/processor 的执行状态与创作方法顺序；保留真实异步 task state，移除或隔离把创作决策锁定为固定 stage progression 的路径。
- [Risk] 当前图片能力矩阵把 Sketch 工具存在误解为独立算法支持。→ 审计每个 operation 的最终 executor、Provider validation 和 headless 可用性；Agent 可见 support 必须绑定真实 adapter，并对 outpaint/split/background/upscale/colorize 等缺口 fail-visible。
- [Risk] 目标完成条件扩张为新的跨领域项目模型。→ Agent 只读取 owning 文件、project result 与当前 validation evidence，不保存角色、镜头、timeline 或 deliverable 真值；领域 schema 缺口拆分为独立 OpenSpec。
- [Risk] 用户误以为批准 Markdown 等于批准任意后续副作用。→ Approval 绑定计划 digest、关键输入 revision 和明确范围；重大 replan 失效旧批准，小范围 replan 也记录 trace。
- [Risk] Plan Mode 为获得分析证据而意外调用收费 Provider 或读取受保护内容。→ 只读不等于无风险；所有分析 capability 继续通过 trust/permission/cost policy，Plan Mode 禁止隐式权限提升。
- [Risk] 为了“可执行方案”引入 `CapabilityIntent` graph 或 plan-specific invocation contract。→ 不新增这类契约；Agent 在当前 turn 从 Markdown 和 owning facts 直接形成普通 typed Tool call。

## Migration Plan

1. 审计并映射现有 capability contribution、media metadata、provider support、permission、结果字段与各 owning authoring API，建立唯一字段来源表。
2. 先校正 Storyboard、Image、Video、Canvas、Cut、Quality 等现有 Tool description/schema/result 的 creative purpose、execution kind、support/limits 和 diagnostics，并清理未被实证需要的 planning-projection scaffold。
3. 在真实 Agent evaluation 中验证现有 Tool injection、Skill 和 `GetContext`；只有它们存在可测的能力遗漏、误选或 token 问题时，才增加从同一 registry 派生的最小只读摘要。
4. 将 Agent multi-step creative turn 和 Plan Mode 接入 actual-file/project-grounded reads、当前 Tool context 与 Markdown planning；保留现有 session/task/approval/validator owner，不迁移用户项目数据。
5. 扩展到 Puppet、Scene/Model、Sketch/frame animation、Audio、Assets/Entity/Character、Export 与 External Processor；接入角色 revision dependency 与目标完成 evidence，缺失 owning capability 记录为后续领域变更，不在 Agent 层伪造。
6. 收敛 creative media Skill prompt-chain 文案和 metadata，删除固定流水线成功暗示，保持方法 checkpoint 与质量不变量。
7. 接入普通执行 turn 的计划 digest/input 校验、当前 Tool re-resolve 与重大 replan 重新审批，证明旧 executor/schema 和过期计划无法直接执行。
8. 运行聚焦 contract/unit/integration、真实 Agent evaluation，以及涉及 Plan Mode、Canvas/Cut UI 时的 Extension Development Host 场景；确认 legacy workflow path 被 poison。

若最终保留了可选派生摘要，回滚时可停止该摘要并继续使用既有 capability injection；它不得修改项目格式。任何已生成文件、ResourceRef 和项目 revision 继续由原 owner 管理，不需要数据回滚。

## Open Questions

- 现有 Tool definition、`AgentCapabilityArtifactFacet`、`mediaWorkflow` 和 provider operation descriptor 是否已经足以支持模型选择？若不足，最小缺口应优先补回哪个 owning contribution？
- 真实 evaluation 是否证明需要派生能力摘要？若没有明确的 omission、mis-selection 或 token 证据，就删除实验 scaffold，不引入 domain index 或 intent-router 协议。
- Animatic、批量镜头接收等事务性 authoring 是否已有足够的 owning API？不足部分应拆到对应包的后续 OpenSpec，避免本变更扩张为所有领域实现。
- 当前 Image capability matrix 中哪些 `supported` 项只有 Webview/Sketch 写回工具、哪些具有独立 executor、哪些最终依赖生成 Provider？该问题必须在 1.x 审计中以路径证据解决。
- 角色/外观 revision dependency 与 target completion evidence 是否已有可复用的 Entity、Asset、Storyboard、ProjectQuality 和 Export contract？缺失 schema 应形成独立动画生产领域 proposal，而不是在本变更内臆造。
