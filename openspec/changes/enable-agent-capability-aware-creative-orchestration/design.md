## Context

> **Dependency and precedence (2026-07-14):** [`retire-idc-and-align-agent-creative-planning`](../retire-idc-and-align-agent-creative-planning/) removes fixed IDC stage/persona/run and defines Plan/TODO/creator-review documents. This design must run on that ordinary Agent ReAct path. Existing Tool definitions, Tool registry, `GetContext`, Read and owning results are the default capability-awareness mechanism; the planning-projection scaffold described below is experimental and MUST be removed or kept unconnected unless focused Agent evaluation proves a minimal derived read view is necessary. It is never a prerequisite for creative orchestration.

Neko Suite 已接受 Agent-native creation 边界：现有 Agent session/turn loop、capability lifecycle、validator feedback、approval、artifact service、task runtime 与 quality runtime 共同拥有创作执行；Skill prompt-chain 只提供可跳过、重排和重复的方法指导。当前媒体 Skill 也已收敛到 `storyboard`、`image`、`video`、`media-production`、`video-editing` 与 `media-quality-review`，并具备 Image/Video operation registry、canonical Storyboard、Canvas/Cut handoff、ResourceRef、生成资产 lineage 和 Quality Gate 基础。

缺口位于这些能力之间：现有 Tool/capability 描述不足以稳定表达创作用途、输入输出、执行类型、真实 support/limits 和 diagnostics，`media-production` Skill 又偏固定阶段总结；一次执行后，异步结果也不能稳定回到原对话驱动下一步。影视创作因此可能退化为文字方案、把所有镜头默认交给生成式视频、依赖聊天历史判断完成状态，或误把 prompt-chain checkpoint 当成真实产物。

代码审计同时确认两组现存 scaffold 仍越过该边界：`@neko/shared` 中的 `MediaProductionWorkflowRunState` 与 Agent 中的 fixed-stage orchestrator/state store/recovery 形成一套可执行媒体 Workflow；Agent Approval core 的 `ApprovalBinding` 和 `creator-replan-policy` 则把创作 scope 与重大 replan 分类固化进通用审批。它们都没有真实生产调用方，应在预发布边界内删除，而不是继续兼容。

提示词国际化和参考图创作进一步暴露了相同边界问题：UI/System/Skill 语言不能替代作品内容语言或 Provider 执行指令语言；模型能够生成多视图角色卡，不代表 Agent 已经具备角色参考准备、结果复查、审批和下游绑定方法；参考图的视觉特征也不能通过猜测来源模型、硬编码工具映射或固定 Phase 获得可靠执行。它们应继续由核心 Prompt 纪律、领域 Skill 方法、现有 capability truth 和 owning result 共同解决。

本变更跨 Agent runtime、Skill、媒体 capability 与多个 owning package，风险等级为 L3。它不得建立新的 workflow/creation runtime，不得让功能包交叉依赖，也不得把 tool schema、轮询协议或 package authoring 细节写入 Skill content。

## Goals / Non-Goals

**Goals:**

- 将 `agent` / `platform` 收敛为领域无关的极简内核，只拥有 memory、conversation、context、Plan Mode、Approval、Task、MCP、subagent、Skill、Tool、Provider adapter 和通用执行循环。
- 让 Agent 按需感知当前真实可用的 Story、Canvas、Image/Video、Sketch、Puppet、Scene、Cut、Audio、Quality、Export 与 External Processor 能力。
- 先复用并完善现有 Tool definitions、registry、Skill context、`GetContext` 和 owning diagnostics，使模型能够选择创作策略；只有 evaluation 证明必要时才派生紧凑只读视图。
- 让每次下一步判断以当前文件/ResourceRef、生成结果、适用的 owning project revision、task/capability result、approval 与 QualityEvidence 为事实来源。
- 允许 Agent 解释性地选择、跳过、重排、重复、并行、回退或切换 Skill/capability，同时由确定性 validator、approval 和 Quality Gate 守住边界。
- 让中英文核心 Prompt 和创作 Skill 保持等价的自主执行语义，并把 Agent 指导语言、创作者内容语言、生成执行指令语言和作品内文字/对白语言分离。
- 让 Agent 能用 capability-neutral 方法完成参考图启发的新内容生成与多视图角色参考准备，观察实际输出后再接受、修复、审批或绑定正式参考。
- 清楚区分不随模型变化的创作意图/验收、随当前 Provider/model/version/profile 变化的执行支持，以及实际 Task/result/Quality 证据；模型或 profile 改变时重新解析支持，不复用静态假设。
- 通过真实 Agent evaluation 证明从漫画、剧本、小说或插画目标出发时，Agent 能执行 canonical owning capability、响应 unavailable/degraded diagnostics 并从当前文件或 owning project revision 继续。

**Non-Goals:**

- 不在 Agent/Platform core 内保留 creation profile/guidance、创作专用 summarizer、影视关键词路由、Storyboard validator、媒体 task projector、CreativeAgent 或 MediaPlanner；领域能力通过 Skill、Tool、subagent 和 owning package 扩展。
- 不新增 WorkflowRuntime、WorkflowRun、WorkflowNode、DAG scheduler、node executor 或平行 Creation 状态机。
- 不保留已存在但无生产调用方的固定 MediaProduction Workflow DTO/runtime/state/recovery public path；禁止测试白名单让旧路径继续编译成功。
- 不把 prompt-chain 扩展成执行 DSL，也不以 observation 事件作为 Artifact 完成证明。
- 不在 Agent core 定义创作专用 Approval scope、replan taxonomy 或 plan authorization token；creator review 和实际操作审批均复用通用 ApprovalEngine/Tool policy。
- 不一次性向模型注入所有工具 schema，不允许 Skill content 包含具体工具名教程或参数表。
- 不让 Agent、Webview 或跨包共享层拥有 `.nk*` 项目真值；mutation 继续由 owning package 和 Engine 权威路径执行。
- 不在本变更内实现所有影视制作技术；缺失能力必须通过当前 Tool/capability support 或 diagnostic 暴露，并进入后续 owning-package change。
- 不建立全局 Locale Workflow、运行时 Prompt 翻译状态机、Provider 专用 Remix runtime、来源模型指纹路由或固定角色卡生成 Pipeline。
- 不建立全局模型能力表、Prompt Manager、Prompt example 执行 catalog，也不把社区图库、营销声明或单次成功样例当作 capability truth。

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

每次多步骤创作决策前以及 mutation/task 完成后，现有 Agent loop 通过 Read、当前 Tool result 或当前注册的 owning capability 查询与当前目标相关的事实：

- active Skill guidance；
- 当前用户文件、ResourceRef、document/file version、digest 与适用的 owning project revision；
- 生成文件、Task status/result 与 lineage；
- capability discovery/support/limits；
- async task status 与结构化 result/diagnostic；
- approval decision；
- current QualityEvidence/Gate 与 stale state；
- 用户最新目标、成本和审阅约束。

查询结果只用于当前 think/act 边界和 trace，不成为新的 canonical `CreationState` store。聊天历史、Journal、Markdown 和旧 Tool result 可以帮助定位需要重新读取的文件或项目，但不能替代当前文件内容、document/file version、digest 或 owning project revision。下一步由模型直接形成普通 typed Tool call，确定性 runtime 负责 resolve、validation、approval 和执行。Agent 只临时携带 owner 返回的 opaque revision/digest，不生成、递增、合并或持久管理 revision。

陈旧校验按 owning resource 的现有契约完成，而不是统一为 Agent/project-wide revision protocol：普通文本/Markdown 复用 VS Code `TextDocument.version`、外部修改检测、文件 digest 或 exact patch context；generated 输出使用 `ResourceRef`、content digest、lineage/generated revision。只有 mutation 依赖先前 read、异步结果、审批、跨 turn/resume 或其他可能陈旧的项目前提时，owning capability 才必须在真正写入前校验其 owner-specific base revision/digest，并在成功后返回 exact resulting project revision。新建项目没有 base revision；基于 owner 当前 live document model 的同步原子操作可以直接使用当前状态并返回适用的结果 identity/revision，无需 Agent 强制传入 revision。

实现不得为了统一输入而递归扫描任意聊天/Tool payload、复制所有 Quality/Task/Approval 类型守卫，或把全会话事实装入通用 Creative Observation DTO。若 stale-risk mutation 的当前 owner 尚无可查询和校验的 revision/digest contract，应返回 missing-capability 或 degraded diagnostic，并在 owning package 补最小 owner-specific read/authoring contract；不得因此扩展全局 `NekoProjectAuthoringTarget`、为所有 `.nk*` 引入统一 revision DTO，或建立 Agent revision store。

选择现有 loop 而不是 workflow engine，因为创作路径需要动态跳步、重排和回退，同时 Accepted ADR 已将 lifecycle/state 权威限定在 Agent-native services。对于依赖旧快照的 mutation，`beforeAct` 的重新观察只有在 owning validator 校验适用的 base revision/digest 并能拒绝 stale invocation 时才构成安全 Gate；单纯重算提示上下文不算执行前校验。对同步 live-document operation，则由 owner 当前模型、原子写入和既有冲突检测承担该 Gate。

### 4. 实际文件和 owning project 结果证明完成，Skill checkpoint 不形成状态

checkpoint completion 不得解除 Gate 或触发下游 mutation。阶段性完成必须由实际文件、owning project 结果与适用 validator 证明，例如：

- Storyboard：当前 Storyboard 文档或项目 revision + validation result + source coverage；
- Animatic/Cut：当前 `.nkv` revision + owning validation/export readiness；
- generated shot：实际生成文件 + ResourceRef/digest/lineage + required QualityEvidence；
- export：实际交付文件 + 适用的 project revision、preflight 和 lineage/verification。

Agent 可以在普通对话中解释某个方法步骤为何采用、跳过、重排或重复。Evaluation 可以从现有 turn、Tool call/result 和文件证据验证该行为；本变更不要求记录 started/checkpoint/skipped/reordered/completed observation。若通用 Skill lifecycle 暂时保留这类 telemetry，它不得成为当前 change 的依赖、验收条件、恢复输入或产品状态。

### 5. 镜头制作采用 capability strategy selection，不默认视频生成

Shot/scene 规划时，Agent 必须从当前注册能力中比较适用策略，例如 generative video、keyframe video、Puppet、frame animation、layered 2D、3D scene/camera 或 compositing。选择依据至少包括输入 artifact、动作/镜头要求、时长、连续性、Provider limits、成本、质量证据和 owning project target。

如果目标技术没有 production capability，Agent 必须返回明确 unavailable diagnostic、提出最小可恢复替代方案或请求安装/启用能力；不得将语义降级为自由文本 prompt 后继续声称成功。

### 6. 事务性 mutation 留在 owning capability

Agent 选择的是 creative intent；跨多个低级 mutation 才能保持原子性的 authoring 必须由 owning package 提供事务性 operation，并返回 exact resulting project revision。当前 change 只调用已注册的 owning operation：审计发现缺口时返回 missing/degraded diagnostic 并创建对应 owning-package OpenSpec，不在 Agent package 内实现该 operation、adapter 或 facade。该要求不把所有低级 editor operation 统一为同一种 revision schema：能在 owner 当前 live document model 上同步、原子完成的操作继续使用 owner 既有并发语义；依赖 active-editor/Webview 状态、异步 writeback 且无法证明目标或陈旧性的路径应保持 degraded/unavailable。

Agent 不直接拼装 `.nk*` 文件，不通过 active Webview 状态猜目标，不把另一个功能包的内部实现导入 Agent 或 Skill。

### 7. 可解释选择与恢复进入 trace/evaluation，不成为第二份计划

Evaluation 优先复用已有 Agent turn、Tool call/result、Task terminal result、diagnostic、Approval decision、文件/ResourceRef 与 owning validation 证据。只有现有事件无法证明某个跨场景通用事实时，才在其 owning runtime 补最小中立 observability；不得为本 change 增加 capability-selection/replan production trace DTO。Evaluation 报告是审计证据，不是可恢复执行状态或用户项目事实。

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

Creator review 通过现有 ApprovalEngine 的通用 request/user-prompt 路径表达“用户已审阅当前内容”，必要的文档 identity/digest 由 Host 作为普通 request context 提供。它不是 future Tool call 的授权令牌，也不要求 Agent core 解释 `creativeScope`、`costRiskCeiling`、`mutationScope` 或 `deliveryBoundary`。用户要求继续执行时，Agent 在普通 turn 中重新读取当前文档和实际输入；内容或目标实质改变时，Agent可以再次发起通用 creator review。每个真实高成本、外部、mutation、export 或 delivery Tool call 仍独立经过当前 Tool policy/Approval，不能被一次计划审批绕过。

文档分析由 Content/Story/Perception owner 产出 page/panel/scene/character candidate/source-trace 等结构化 Artifact。Agent 可以在 `brief.md`/`plan.md` 中解释这些结果，但不能把自然语言摘要当作执行证据。只读分析若调用外部模型、受管 Processor 或受保护内容，仍经过真实 trust、permission、cost 和 approval policy；“Plan Mode”本身不自动授予读取或 Provider 权限。

选择 Markdown + ordinary Tool call 而不是持久 executable plan DTO，是为了保留用户可编辑性和 Agent 动态重规划，同时避免用 `CapabilityIntent`、`PlanDefinition` 或 `PlanNode` 重新创造被禁止的 Workflow runtime。

### 15. Agent core 只拥有原生智能循环，不拥有影视领域过程

Agent core 的 canonical path 是：读取当前事实、模型判断下一步、必要时调用通用 Approval、形成一个当前 typed Tool call、观察同步或异步结果，再进入下一轮。可持久状态只来自既有 AgentSession/conversation、单次 Task lifecycle、用户文件和 owning domain；不增加创作 run、stage、plan authorization、workflow recovery 或 completion state。

因此本变更直接删除 `MediaProductionWorkflowRunState`、fixed-stage media orchestrators、Task-backed workflow state store 与 recovery coordinator，并删除创作专用 `ApprovalBinding`/replan classifier。原生 Task result observation/continuation 保留，因为它只把一个已存在 Task 的终态送回原对话，不决定下一创作步骤。原生感知 observation 也保留其证据职责，不与被删除的 creative workflow state 混同。

### 16. Agent/Platform 是领域无关内核，创作能力通过扩展组合

极简内核只拥有通用机制：session/conversation、memory/context、Prompt 与 Plan Mode、Approval/Policy、Task、MCP、subagent、Skill lifecycle、Tool lifecycle、Provider adapter、模型调用和结果续作。它可以承载“注册、发现、激活、调用、观察”这些通用动作，但不能理解漫画分格、角色设定、Storyboard、镜头、Animatic、后期或成品交付的领域含义。

因此下列内容不得留在 `agent` 或通用 `platform` core：creation profile/creation guidance、按影视概念分类的 summarizer、硬编码媒体关键词和 Skill 优先级、Storyboard 专用输出 validator、媒体专用 Task/result projector，以及任何 CreativeAgent、MediaPlanner、character state 或 production completion service。通用 validator/summary/matcher 只有在不枚举领域对象、且由注册元数据或注入 adapter 驱动时才可保留。

扩展组合遵循三个现有入口：

- Skill 提供影视化、动画化、角色资产准备、参考图、多视图、镜头选择、后期与质量判断的方法；
- subagent 在需要独立上下文、并行研究或专业角色时执行同一普通 Agent 协议，不获得创作专用 runtime；
- Tool/capability 由 owning package 提供 typed schema、真实 support、权限、Task、结果和 validator。

Agent 只根据当前注入的通用上下文决定是否激活 Skill、派生 subagent 或调用 Tool。核心不得为提高某个创作场景命中率而加入领域词表或专用分支；若扩展元数据不足，优先修正 Skill description、Tool contribution 或 owning diagnostic，并用 Evaluation 证明。

### 11. 提示词国际化分离指导语言、内容语言和 Provider 指令语言

国际化不是把所有 Prompt 绑定到 UI locale。现有 `promptLocale` 继续控制 System Prompt、Skill content 和 model-facing Tool description 的语言；中英文版本必须表达同一套观察、执行、结果验证、审批、恢复和 fail-visible 约束。创作者文档、剧本、对白、字幕、角色描述和目标市场使用的语言由用户目标与来源决定，不能因为 Agent 或 Provider 偏好英文而改变。

支持的 locale 集合由 Host 声明；当前 builtin 基线是 `en` 与 `zh-cn`。未来支持 `zh-hant` 或其他语言时必须增加独立内容和路径验证，不能继续把所有 `zh-*` 静默归一化为简体中文并宣称已经国际化。

每次图片、视频、语音或音乐生成前，Agent 根据当前 Provider/model 的真实支持和限制选择本次执行指令语言。画面文字、对白、歌词、字幕、角色名、地名和其他专有名词作为独立内容约束保留；Provider 指令翻译不得修改它们。Provider 不可靠支持目标文字或语言时必须在 dispatch 前暴露 degraded/unavailable diagnostic，或要求明确的后期文字/字幕策略，不能静默生成另一种语言。

第一版不新增全局 `creatorContentLocale` 或 `generationPromptLocale` store。它们是当前目标、领域文档和单次 capability invocation 的派生决策；实际执行 Prompt、所用指令语言、必须保留的内容字符串和输入参考在现有 task/result 或生成 lineage 能够承载时随结果记录。若现有 contract 无法证明实际发送内容，再由 owning media capability 补最小字段，而不是在 Agent 层建立翻译历史或 Prompt registry。

### 12. 参考图 Remix 和角色视觉参考是动态创作方法，不是 Provider Pipeline

参考图启发的新内容生成可以在 `image` 方法中分析可观察的形式/构图、风格/色彩/质感和氛围/光影/叙事，并由用户目标明确哪些特征保留、哪些内容替换。模型来源猜测不能决定 Provider 或 executor；工具选择只依据当前注册能力、输入要求、质量、成本和 diagnostics。Skill 不保存模型指纹表、工具映射、固定 Phase、默认批次数量、私有 `.image-remix` 状态目录或 `all-in-one` 降级。

多视图角色设定卡属于角色视觉参考准备。当前 Provider 明确支持单张多视图时，Agent 可以一次生成正/侧/背、近景或动作视图，并在结果返回后读取实际图片，检查所需视图、全身裁切、跨视图身份、服装/配色/道具一致性、文字和水印。只有观察到具体质量缺口时才拆分视图、局部重做或更换策略；不得把保守拆分固化为必经流程，也不得因为模型名称推断支持。

`character-visual-reference` 是否成为独立 builtin Skill 由真实触发和质量 evaluation 决定。若现有 `image` 与 `media-production` 指导已经能稳定完成该任务，就保留为聚焦方法；若独立 Skill 能显著改善触发、身份不变量提取、结果复查和下游绑定且不造成 Skill 冲突，再增加精简、双语、capability-neutral 的 Skill。生成文件仍直接进入 `generated/`；只有用户需要正式实体绑定或跨项目复用时，才通过 Entity/Asset/Character owner 审批并登记为正式参考。

### 13. 模型绑定只拥有执行支持，不拥有创作意图或完成事实

创作请求应分成三层：

| 层级 | 示例 | 权威 owner |
| --- | --- | --- |
| 模型无关创作语义 | 主体、角色身份不变量、镜头/布局、参考图角色、内容语言、精确文字、禁止项、验收标准 | 用户目标、领域文档与 Skill 方法 |
| 模型绑定执行事实 | 输入模态/数量/格式、参考控制、多视图/跨图/嵌入文字可靠性、Prompt 方言、尺寸/时长、成本、并发、安全和当前 support/limits | owning Provider/model capability + 当前 session/profile |
| 实际执行与完成证据 | requested/effective Provider、model/version/profile、实际请求或 digest、输入 references、Task terminal result、输出 ResourceRef/lineage、diagnostic 与 Quality evidence | Task/result、生成文件和 owning validator |

“需要三视图并保持服装一致”不绑定模型；“当前模型是否能在一次调用中可靠生成三视图”绑定具体 Provider/model/version/profile；“本次角色卡是否完成”只由实际返回文件和检查证据决定。参考图的 `identity`、`appearance`、`costume`、`prop`、`style`、`composition`、`structure-only`、`first-frame`、`last-frame` 或 `product-preservation` 等语义角色不绑定模型，但当前 adapter 是否接受、如何传递和能否可靠遵守这些角色属于模型绑定事实。

Capability registration/contribution 与 session effective configuration 继续是模型支持的唯一事实来源。不得在 Agent、Skill 或共享层维护手写 Provider matrix；营销文案、模型名称推断、社区示例或历史成功结果不能把当前 support 从 unknown/degraded 提升为 supported。模型、版本、profile、权限或 Provider 配置变化后，Agent 必须在当前 turn 重新 resolve 和 validate；旧 Prompt、计划、样例或 capability snapshot 不得直接执行。

### 14. Prompt 示例库是可选参考和 Evaluation 语料，不是执行能力

社区 Prompt 图库可以提供布局、角色一致性、精确文字、多视图、多分镜、参考图转换和动态变量等方法样例，但它本身不是 Agent Skill、Provider capability 或质量证据。若样例缺少精确模型/version/profile、输入参考、实际执行 Prompt/digest、参数、失败样本、输出绑定和质量验证，它只能证明“曾展示过类似结果”，不能注册为当前模型的可靠支持。

默认不把大型 Prompt 语料复制进 System Prompt、builtin Skill 或 Tool catalog。需要时可以通过现有 External Research/Market 边界按需检索少量、带来源和许可的示例，或将受控样本纳入 Evaluation fixture；检索结果只帮助 Agent形成当前创作意图，不选择 executor、不触发调用、不持久化运行状态，也不能解除 approval/Quality Gate。

可复用模板变量应投影到已有 Semantic Prompt Document/领域字段，而不是把 Raycast 等第三方占位语法提升为 Neko 执行协议。若未来 evaluation 证明 Prompt example retrieval 显著改善质量，最小接入还必须保留作者、来源、许可、原始语言、展示翻译、参考输入角色、适用模型证据和内容 digest；否则保持外部研究用途。

## Risks / Trade-offs

- [Risk] 可选派生能力摘要与 Tool schema 重复并发生漂移。→ 默认不建设；只有 evaluation 证明必要时才从同一 owning contribution 派生，并增加 parity contract test，禁止手写平行 catalog。
- [Risk] 当前 Tool 上下文过大，挤压模型上下文。→ 先改进 description/schema、Skill 和 `GetContext`；仍有实证问题时再增加最小派生过滤或摘要并测量 token/context。
- [Risk] 模型忽略 prompt-chain 或选择次优制作技术。→ 通过明确 purpose/limits/diagnostics、validator feedback、Quality Gate 和真实 evaluation 改进；不使用隐藏 DAG 强制创作顺序。
- [Risk] trace 被误用为恢复状态或项目事实。→ trace 仅引用文件/ResourceRef 或 owning project revision；恢复重新读取 owning services，测试 poison trace-only continuation。
- [Risk] 为所有 `.nk*` mutation 增加统一 `expectedProjectRevision` 会把不同 document/project owner 的并发语义压成跨领域共享协议。→ 普通文件沿用 VS Code/file conflict detection，generated 输出沿用 ResourceRef/digest/lineage；仅 stale-risk project mutation 复用或补充 owner-specific base revision/digest contract，Agent 只透传 opaque 值。
- [Risk] 多个包为同一创作语义提供近似能力。→ capability id、domain、artifact kinds 和 mutation owner 必须明确；两种实现只有在真实可替换时共享 operation，否则保留领域差异。
- [Risk] Agent 自主性导致昂贵调用过多。→ cost/risk/approval projection、batch preflight、预算策略和 bounded recovery 在调用前确定性执行。
- [Risk] 现有 `media-production` 实现包含固定 stage state。→ 先区分 task/processor 的执行状态与创作方法顺序；保留真实异步 task state，移除或隔离把创作决策锁定为固定 stage progression 的路径。
- [Risk] 通用 ApprovalEngine 被创作专用 binding/replan policy 污染，形成隐性 Plan Manager。→ 删除 Agent core 的创作 scope DTO 与分类器；creator review 使用通用 request/context，实际副作用仍由 Tool/owner policy 逐次审批。
- [Risk] 当前图片能力矩阵把 Sketch 工具存在误解为独立算法支持。→ 审计每个 operation 的最终 executor、Provider validation 和 headless 可用性；Agent 可见 support 必须绑定真实 adapter，并对 outpaint/split/background/upscale/colorize 等缺口 fail-visible。
- [Risk] 目标完成条件扩张为新的跨领域项目模型。→ Agent 只读取 owning 文件、project result 与当前 validation evidence，不保存角色、镜头、timeline 或 deliverable 真值；领域 schema 缺口拆分为独立 OpenSpec。
- [Risk] 用户误以为 creator review 等于批准任意后续副作用。→ 通用 Approval context 只展示当前审阅内容，不形成 plan authorization；每个高成本、外部、mutation、export 或 delivery Tool 仍通过当前 owner policy 独立审批。
- [Risk] Plan Mode 为获得分析证据而意外调用收费 Provider 或读取受保护内容。→ 只读不等于无风险；所有分析 capability 继续通过 trust/permission/cost policy，Plan Mode 禁止隐式权限提升。
- [Risk] 为了“可执行方案”引入 `CapabilityIntent` graph 或 plan-specific invocation contract。→ 不新增这类契约；Agent 在当前 turn 从 Markdown 和 owning facts 直接形成普通 typed Tool call。
- [Risk] 中英文核心 Prompt 或 Skill 在迭代中语义漂移。→ 维护双语行为不变量、确定性 parity 检查和相同高层目标的真实 Agent 路径用例，不以逐字翻译作为验收。
- [Risk] Provider 执行 Prompt 翻译破坏中文对白、字幕或专有名词。→ 将执行指令语言与内容语言分开，保留精确字符串，并在 Provider 不支持时 dispatch 前 fail-visible。
- [Risk] 参考图 Remix 根据不可靠模型指纹选错 Provider，或以“文生图”声称零版权风险。→ 删除来源模型到 executor 的硬映射；只使用授权来源和当前 capability/policy，权利判断不由 Prompt 路径替代。
- [Risk] 为每种图片用途增加重叠 Skill。→ 先扩展现有 `image`/`media-production` 方法，通过 Skill activation 与 quality ablation 决定角色视觉参考是否值得独立。
- [Risk] 把创作专用摘要、路由或 validator 误认为通用 Agent 智能。→ 核心只保留由注册元数据/adapter 驱动的通用机制；领域词表、格式和判断迁到 Skill、Tool、subagent 或 owning validator，并由架构测试禁止回流。
- [Risk] 把领域语义与某个模型参数结构绑定，导致模型切换时计划和素材失效。→ 领域意图/验收保持 capability-neutral，adapter 在当前 turn 投影执行请求，结果记录 requested/effective model identity。
- [Risk] 手写模型能力表或营销声明快速漂移。→ 只接受 owning contribution、当前配置和真实 evaluation；版本/profile 改变后重新 resolve，未知支持保持 unavailable/degraded。
- [Risk] 大型社区 Prompt 语料污染上下文、引入许可问题或把单次成功误当可靠性。→ 默认不导入；只按需消费带 provenance 的小样本或 Evaluation fixture，检索与执行严格分离。

## Migration Plan

1. 删除无生产调用方的 fixed MediaProduction Workflow shared DTO、Agent orchestrator/state store/recovery/public exports/tests，并取消 architecture guard 对 legacy 文件的白名单；保留用户项目、素材、设置和真实 Task 数据。
2. 删除创作专用 `ApprovalBinding` 与 `creator-replan-policy`，证明 permission、creator-review、quality-gate 继续通过通用 ApprovalEngine 工作，且计划审阅不能授权未来 Tool 副作用。
3. 先校正真实 evaluation 暴露的现有 Tool description/schema/result 缺口并保持 planning-projection scaffold 已删除；所有新增领域 authoring/Quality/Export 能力转入 owning-package change。
4. 将 Agent multi-step creative turn 和 Plan Mode 限定为 actual-file reads、当前 Tool context、普通 Markdown 与原生 Task/Approval；普通文档、generated 输出和 owner-specific revision 分别沿用既有契约。
5. 收敛 creative media Skill 文案，删除固定流水线成功暗示，加入参考图 Remix/角色视觉参考的 capability-neutral 方法，并补齐双语执行纪律。
6. 运行聚焦 contract/unit/integration 和真实 Agent evaluation，证明正常 session/turn + Tool/Task/Approval 路径在 legacy workflow 被删除后仍可选择、执行、观察与恢复。

若最终保留了可选派生摘要，回滚时可停止该摘要并继续使用既有 capability injection；它不得修改项目格式。任何已生成文件、ResourceRef 和项目 revision 继续由原 owner 管理，不需要数据回滚。

## Open Questions

- 现有 Tool definition、`AgentCapabilityArtifactFacet`、`mediaWorkflow` 和 provider operation descriptor 是否已经足以支持模型选择？若不足，最小缺口应优先补回哪个 owning contribution？
- 真实 evaluation 是否证明需要派生能力摘要？若没有明确的 omission、mis-selection 或 token 证据，就删除实验 scaffold，不引入 domain index 或 intent-router 协议。
- Animatic、批量镜头接收等事务性 authoring 是否已有足够的 owning API？不足部分应拆到对应包的后续 OpenSpec，避免本变更扩张为所有领域实现。
- 当前 Image capability matrix 中哪些 `supported` 项只有 Webview/Sketch 写回工具、哪些具有独立 executor、哪些最终依赖生成 Provider？该问题必须在 1.x 审计中以路径证据解决。
- 角色/外观 revision dependency 与 target completion evidence 是否已有可复用的 Entity、Asset、Storyboard、ProjectQuality 和 Export contract？缺失 schema 应形成独立动画生产领域 proposal，而不是在本变更内臆造。
- 当前 `image` 与 `media-production` guidance 是否已经能稳定触发和完成多视图角色参考任务？只有独立 Skill 在真实 activation、质量、token/context 和相邻负例上显著更好时，才接受 `character-visual-reference` builtin。
- 当前 Provider capability 是否足以表达生成指令语言偏好、作品内文字/对白语言可靠性和必须保留的精确字符串？若不足，最小字段应由 owning media contribution 提供，而不是新增 Agent locale store。
- 现有 media result/lineage 是否已经能证明 requested/effective Provider、model/version/profile、实际请求 digest、参考角色和输出绑定？若不足，最小证据字段应补在 owning Task/result contract，而不是创建 Prompt Manager。
- 外部 Prompt 示例检索是否在真实 holdout 上显著改善生成质量且不增加错误 Tool 选择、上下文成本和许可风险？没有证据时保持外部研究或 Evaluation fixture，不进入产品 runtime。
