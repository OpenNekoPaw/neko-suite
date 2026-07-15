## Why

Neko Agent 已具备普通对话、Read、Tool schema/call、Skill、审批、异步任务、ResourceRef、生成文件与质量诊断等基础能力，但长周期影视创作仍缺少一条可证明的 Agent-native 闭环：现有影视 Skill 偏总体阶段总结，部分 Tool description/result 与 owning authoring 覆盖不足，异步结果后的原对话续作也不完整，导致 Agent 不能稳定地把实际内容分析转成创作者可审批的文档和逐项可执行工作，再根据真实结果跳步、重排、换策略和恢复。

现有国际化也只覆盖了 UI、部分 System/Plan Prompt 和 builtin Skill 文案选择，尚未明确区分 Agent 指导语言、创作者内容语言、生成 Provider 执行指令语言，以及画面文字、对白、字幕和专有名词的目标语言。参考图 Remix、多视图角色设定卡等当前模型已经能够完成的任务，也仍缺少 capability-neutral 方法、真实支持投影、生成后复查和正式参考绑定，容易退化为一次性 Prompt 或 Provider 专用固定 Pipeline。

本变更依赖 [`retire-idc-and-align-agent-creative-planning`](../retire-idc-and-align-agent-creative-planning/) 删除固定 IDC stage/persona/run 并统一 Plan/TODO/Markdown/Approval 边界。能力感知首先复用现有 Tool definitions、Tool registry、`GetContext`、Read 和 owning results；独立 planning projection 不是前置条件，只有真实 Agent evaluation 证明现有上下文不足时才允许从同一 registry 渐进派生只读视图。

进一步审计发现，仓库仍公开导出 `MediaProductionWorkflowRunState`、固定 stage orchestrator、Task-backed workflow state store 和 workflow recovery；Agent Approval core 也包含创作专用 `ApprovalBinding` 与 replan 分类器。这些 scaffold 没有真实生产调用方，却会把影视阶段、计划授权和领域判断重新固化进 Agent。它们必须在本变更内删除，而不是作为未来编排基础继续扩展。

后续极简内核审计还发现，`agent` / `platform` 中仍存在 creation profile/guidance、创作专用上下文摘要、硬编码影视 Skill 路由、Storyboard 专用输出校验和媒体专用投影等领域语义。即使它们不组成 Workflow，也会让核心层继续认识影视创作对象和方法。Agent/Platform 核心只保留 memory、conversation、context、Plan Mode、Approval、Task、MCP、subagent、Skill、Tool、Provider adapter 与通用执行循环；影视化、动画化及其他非核心能力必须由可注册的 Skill、Tool、subagent 或 owning package 扩展。

## What Changes

- 先校正现有 Tool/capability contribution 的领域用途、输入/输出、mutation、执行类型、真实 support/limits 和 diagnostics，使当前 Tool 注入与 `GetContext` 足以支持 Agent 选择；禁止预建平行 Creative Tool Catalog 或 planning runtime。
- 让 Agent 使用实际来源文件、ResourceRef、生成文件/digest/lineage、适用的 `.nk*` owning revision、capability/Task result、approval 与 QualityEvidence 判断下一步；Agent 只读取和传递 owner 返回的 opaque revision，不生成、递增、合并或持久管理 revision，也不建立全局 `currentRevision`、Agent Revision Store 或 Observation Store。
- 按资源 owner 复用现有并发与陈旧检测：普通文本/Markdown 使用 VS Code document version、文件 digest 或精确 patch context/conflict；generated 输出使用 `ResourceRef`、digest、lineage/generated revision；只有基于先前读取、异步结果、审批、resume 或其他可能陈旧前提的项目 mutation，才由 owning capability 在写入前校验其 owner-specific base revision/digest，并在成功后返回 exact resulting project revision。新建项目和基于当前 live document model 的同步原子操作不强制 Agent 提供 base revision。
- Agent core 保持极简：只组合现有 session/turn、Read/Write、Tool/Skill lifecycle、Task continuation、通用 ApprovalEngine 和模型推理，形成 `observe → decide → approve-if-needed → call Tool → observe result` 循环；删除现存固定 MediaProduction Workflow DTO/runtime/state/recovery，而不只是禁止新增 Workflow。
- Agent/Platform 保持领域无关：删除或迁出 creation profile/guidance、创作专用 summarizer、硬编码媒体 Skill 选择、Storyboard 专用 validator 和媒体专用 task/result 解释；核心只提供通用扩展接口，不内置漫画、角色、分镜、镜头、媒体制作或交付语义。
- 创作方法优先由普通 Skill 提供；需要隔离上下文、并行研究或专业角色时由普通 subagent 承担；实际副作用由 owning Tool/capability 执行。三者都走现有注册、上下文、权限、Task 与结果回传机制，不新增 CreativeAgent、MediaPlanner 或领域 facade。
- 审批完全复用 Agent 原生 ApprovalEngine、Tool confirmation 和 owning policy。Creator review 是普通通用 approval request；计划内容不是未来 Tool 调用的授权令牌，Agent core 不维护创作专用 scope DTO、replan 分类器、PlanApprovalStore 或审批状态机。实际高成本、外部、mutation、export 与 delivery 操作继续分别经过当前 Tool/owner 的确定性审批。
- 将该闭环写入语义等价的中英文核心 Prompt 与创作 Skill：每次 consequential action 前和真实结果返回后重新观察当前事实；区分 `planned/submitted/pending/blocked/completed`，禁止总体规划、Prompt 或任务提交状态冒充交付完成。
- 明确语言职责：`promptLocale` 只控制 System Prompt、Skill 和 model-facing Tool 描述；创作者内容语言、每次生成调用的指令语言、画面/对白/字幕语言和必须原样保留的专有名词按目标与 Provider 能力分别决定。不得将 UI locale 作为唯一语言事实，也不新增全局 Locale Workflow 或翻译状态机。
- 让 Agent先分析实际内容证据并区分来源事实、Agent解释、创作者决策和可执行动作，按需要通过普通文件读写生成 creator-reviewable Markdown；`brief.md`、`plan.md` 只是可选命名约定，不新增文档类型、schema、manager、parser 或专用操作入口。Plan Mode 只读且不创建媒体任务、项目 mutation、导出、IDC 或 persona。
- 将 Markdown/TODO 与执行分离：`plan.md` 使用包含对象、条件、输入、能力意图、约束、输出、验收、失败分支和审批范围的 work units；TODO 只投影近期进度。继续执行时 Agent 重新读取当前文件并发出普通 typed Tool call，禁止把 Markdown/TODO 编译成 Workflow 或重放旧 executor/schema。
- 让漫画、小说、剧本、PDF 和插画等分析优先复用现有 Read、文档分析和感知能力取得当前内容证据；只有下游 owning Tool 明确需要页/格/场景/角色/对白等结构化输入时才生成相应领域 Artifact，不把新的统一结构化分析层设为计划前置条件。
- 在现有 owning Tool/capability contribution 中补齐创作决策需要的稳定语义；只有 evaluation 证明 Tool 上下文无法可靠选择时，才从同一 contribution 派生最小、只读、可丢弃的能力摘要，且不得成为第二 support authority。
- 分离模型无关创作语义、模型绑定执行事实和结果证据：角色不变量、镜头/布局、参考用途、内容语言、禁止项与验收标准不绑定模型；输入数量/格式、参考控制、多视图/文字可靠性、Prompt 方言、尺寸、成本和限制绑定当前 Provider/model/version/profile；完成只由实际有效配置、Task result、生成文件和 Quality evidence 证明。
- Provider/model 绑定信息继续来自 owning contribution 和当前 session 配置，不建立全局模型能力表、营销声明缓存或 Agent 手写 support matrix。模型切换、版本/profile 变化或 capability diagnostic 必须使旧支持假设失效并触发当前 turn re-resolve。
- 让 Story、Canvas、Image/Video Media、Sketch、Puppet、Model/Scene、Cut、Audio、Quality、Export 与受管 External Processor 通过同一发现边界参与镜头/项目级策略选择，禁止默认把所有动画镜头路由到生成式视频模型。
- 将漫画/插画的分格、裁切、文字/OCR、分割、补全、上色、图层合成与角色引用视为 Agent 可条件选择的领域能力；几何/像素操作不得为了统一入口而送入生成模型，生成式编辑必须保留来源、mask、未修改区域、ResourceRef 与 lineage。
- 将参考图启发的新内容生成纳入 `image` 的 capability-neutral 方法：可以提取构图/形式、风格/色彩/质感、氛围/光影/叙事等可观察特征，但不得根据猜测的来源模型硬编码 Provider、工具名、Prompt 方言、固定 Phase、私有输出目录或万能降级。Agent 必须读取真实生成结果并根据保留特征和新内容目标决定接受或局部修复。
- 让多视图角色设定卡、转面、表情/服装/动作参考等用途通过当前 Image capability 暴露真实支持和限制；Provider 明确支持单次多视图时允许一次生成，拆分视图只作为结果不合格后的可选修复。`character-visual-reference` 仅作为聚焦 Skill 候选，是否成为 builtin 由触发、质量和上下文成本 evaluation 决定。
- 将社区 Prompt 图库、示例结果和动态模板视为可选创作参考或 Evaluation 语料，而不是 Skill、Tool、模型能力或完成证据。只有携带授权/provenance、原始与展示语言、参考角色、适用模型/profile 和结果绑定证据的条目才可进入受控检索或 fixture；默认不把大型 Prompt 语料注入 System Prompt、builtin Skill 或 runtime catalog。
- 让 Agent 在分镜、镜头生产和后期判断中消费 owning Entity/Asset/Character revision 与依赖关系；角色外观、服装、配色或正式参考改变后，相关镜头和质量证据必须进入 stale/repair 判断，Agent 不维护第二份角色事实。
- Storyboard、Animatic、样片或动画成品只能由实际文件、生成结果、适用的 owning project revision、accepted shot、final timeline、preflight 与 deliverable verification 证明；不新增中央 target-completion evaluator，缺失 owning capability 进入独立领域 OpenSpec。
- 复用现有 turn、Tool call/result、Task result、diagnostic、Approval decision 和文件/ResourceRef 作为 Evaluation 证据；不为创作编排新增 production trace contract。Prompt-chain observation 若仍被通用 Skill lifecycle 使用，只是可选 telemetry，本变更不扩展或依赖其 started/skipped/reordered/completed 状态。
- 收敛现有 `media-production` 固定阶段措辞为可跳过、重排、重复、并行和回退的方法 checkpoint/production milestone；安全 Gate、项目权威、revision 与交付约束保持确定性。

## Capabilities

### New Capabilities

- `agent-capability-aware-creative-orchestration`: 定义 Agent 如何复用当前 Tool/capability context，理解图片执行类型与动画制作技术，并基于实际文件、ResourceRef、适用的 owning project revision、角色依赖、diagnostic 和直接交付证据动态选择下一步、重规划并验证真实执行路径。

### Modified Capabilities

- None. Accepted Agent-native creation、Skill/prompt-chain、capability lifecycle、creative media 与 external processor 边界保持不变；本变更在这些边界内补齐缺失的组合行为。

## Impact

- `packages/neko-types` 与 `packages/neko-agent/packages/agent-types`：删除固定 MediaProduction Workflow DTO；仅保留真实跨包需要的 Tool/Task/result/通用 approval 契约，不增加 creative planning/replan/trace schema。
- `packages/neko-agent/packages/agent`：删除 fixed-stage media orchestrator、workflow recovery/state store、创作专用 Approval binding/replan policy，以及残余 creation profile/guidance、创作 summarizer、硬编码领域路由和领域 validator；保留通用 Tool/context 注入、turn assembly、普通 ReAct、Task continuation、subagent 与 ApprovalEngine。
- `packages/neko-agent/packages/extension` 与 `packages/neko-agent/packages/platform`：只承担 Host/Provider/配置/注册与通用能力注入；媒体执行与领域结果解释迁到 owning Tool/capability contribution。可选派生摘要只有 evaluation 证明必要时才保留，且必须领域无关。
- `packages/neko-agent/packages/webview`、TUI 与 Host document service：Markdown brief/plan/领域文档的审阅、修改、批准和 bounded TODO 进度投影；不得成为执行或项目状态 owner，也不增加编排按钮。
- `packages/neko-agent/packages/agent/src/prompt` 与 Host prompt composition：维护语义等价的中英文核心执行纪律，并把 Prompt 指导语言与创作者/生成内容语言分离；不引入运行时翻译 Workflow。
- `packages/neko-skills`：`media-production`、`storyboard`、`image`、`video`、`video-editing`、`media-quality-review` 的方法边界、参考图 Remix/角色视觉参考候选和 prompt-chain guidance；不加入工具名教程、Provider 指纹表、固定 Pipeline、私有状态目录或执行 DSL。
- Story、Canvas、Sketch、Puppet、Model/Scene、Cut、Audio、Assets/Entity/Character、Quality、Export owning packages：本变更只消费其现有 Tool/result/diagnostic。审计确认的 authoring、revision dependency、Quality 或 Export 缺口拆分为 owning-package OpenSpec；不得为了完成 Agent change 在 Agent 内补 facade、orchestrator、共享 DTO 或替代实现。
- Image/Perception/Engine/External Processor adapters：审计并校正图片 operation 的真实 deterministic/perception/generative/hybrid executor 与 support 声明；不把 UI 工具存在误报为 provider-independent production support。
- 可选 Prompt example/research source：仅通过现有外部研究、Market 或 Evaluation 边界按需消费带 provenance 的样例；不新增 Prompt Manager、Prompt marketplace runtime、自动 executor 选择或执行状态 owner。
- Agent evaluation：增加漫画/剧本/小说/插画到 Animatic、样片或成片、参考图 Remix、多视图角色设定卡和跨语言生成的聚焦脚本场景，并验证真实 capability selection、Provider/model identity、生成文件复查、owner-specific revision/digest grounding、failure recovery 与 legacy/fallback path 未参与。
