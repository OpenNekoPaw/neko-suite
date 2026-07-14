## Why

Neko Agent 已具备普通对话、Read、Tool schema/call、Skill、审批、异步任务、ResourceRef、生成文件与质量诊断等基础能力，但长周期影视创作仍缺少一条可证明的 Agent-native 闭环：现有影视 Skill 偏总体阶段总结，部分 Tool description/result 与 owning authoring 覆盖不足，异步结果后的原对话续作也不完整，导致 Agent 不能稳定地把实际内容分析转成创作者可审批的文档和逐项可执行工作，再根据真实结果跳步、重排、换策略和恢复。

本变更依赖 [`retire-idc-and-align-agent-creative-planning`](../retire-idc-and-align-agent-creative-planning/) 删除固定 IDC stage/persona/run 并统一 Plan/TODO/Markdown/Approval 边界。能力感知首先复用现有 Tool definitions、Tool registry、`GetContext`、Read 和 owning results；独立 planning projection 不是前置条件，只有真实 Agent evaluation 证明现有上下文不足时才允许从同一 registry 渐进派生只读视图。

## What Changes

- 先校正现有 Tool/capability contribution 的领域用途、输入/输出、mutation、执行类型、真实 support/limits 和 diagnostics，使当前 Tool 注入与 `GetContext` 足以支持 Agent 选择；禁止预建平行 Creative Tool Catalog 或 planning runtime。
- 让 Agent 使用实际来源文件、ResourceRef、生成文件/digest/lineage、`.nk*` owning revision、capability/Task result、approval 与 QualityEvidence 判断下一步；不建立全局 current revision 或 Observation Store。
- 在现有 Agent session/turn、capability lifecycle、validator feedback、approval、task 与 artifact 服务内形成 `observe → plan → validate → approve → execute → review → replan` 闭环；不新增 Workflow/DAG/Creation runtime、node executor 或平行状态机。
- 让 Agent先分析实际内容证据并区分来源事实、Agent解释、创作者决策和可执行动作，按需要生成 creator-reviewable `brief.md`、领域文档和 living `plan.md`；Plan Mode 只读且不创建媒体任务、项目 mutation、导出、IDC 或 persona。
- 将 Markdown/TODO 与执行分离：`plan.md` 使用包含对象、条件、输入、能力意图、约束、输出、验收、失败分支和审批范围的 work units；TODO 只投影近期进度。继续执行时 Agent 重新读取当前文件并发出普通 typed Tool call，禁止把 Markdown/TODO 编译成 Workflow 或重放旧 executor/schema。
- 让漫画、小说、剧本、PDF 和插画等文档分析先通过 owning Content/Story/Perception 能力形成可引用的页/格/场景/角色/对白等来源 evidence；自然语言总结不能作为可执行方案的唯一输入，来源内容或 owning project revision 改变必须触发计划失效与 replan。
- 在现有 owning Tool/capability contribution 中补齐创作决策需要的稳定语义；只有 evaluation 证明 Tool 上下文无法可靠选择时，才从同一 contribution 派生最小、只读、可丢弃的能力摘要，且不得成为第二 support authority。
- 让 Story、Canvas、Image/Video Media、Sketch、Puppet、Model/Scene、Cut、Audio、Quality、Export 与受管 External Processor 通过同一发现边界参与镜头/项目级策略选择，禁止默认把所有动画镜头路由到生成式视频模型。
- 将漫画/插画的分格、裁切、文字/OCR、分割、补全、上色、图层合成与角色引用视为 Agent 可条件选择的领域能力；几何/像素操作不得为了统一入口而送入生成模型，生成式编辑必须保留来源、mask、未修改区域、ResourceRef 与 lineage。
- 让 Agent 在分镜、镜头生产和后期判断中消费 owning Entity/Asset/Character revision 与依赖关系；角色外观、服装、配色或正式参考改变后，相关镜头和质量证据必须进入 stale/repair 判断，Agent 不维护第二份角色事实。
- Storyboard、Animatic、样片或动画成品只能由实际文件、生成结果、适用的 owning project revision、accepted shot、final timeline、preflight 与 deliverable verification 证明；不新增中央 target-completion evaluator，缺失 owning capability 进入独立领域 OpenSpec。
- 增加 capability selection、skip/reorder/replan、unsupported/degraded recovery、artifact-grounded continuation 和 legacy workflow poison 的 trace/evaluation 证据；真实模型必须证明能选择 canonical owning capability，而不仅是生成文字计划。
- 收敛现有 `media-production` 固定阶段措辞为可跳过、重排、重复、并行和回退的方法 checkpoint/production milestone；安全 Gate、项目权威、revision 与交付约束保持确定性。

## Capabilities

### New Capabilities

- `agent-capability-aware-creative-orchestration`: 定义 Agent 如何复用当前 Tool/capability context，理解图片执行类型与动画制作技术，并基于实际文件、ResourceRef、适用的 owning project revision、角色依赖、diagnostic 和直接交付证据动态选择下一步、重规划并验证真实执行路径。

### Modified Capabilities

- None. Accepted Agent-native creation、Skill/prompt-chain、capability lifecycle、creative media 与 external processor 边界保持不变；本变更在这些边界内补齐缺失的组合行为。

## Impact

- `packages/neko-agent/packages/agent-types`：仅保留真实跨包需要的 Tool/Task/result/approval 与最小 evaluation trace；不得引入 planning graph、广义 Creation/Workflow runtime DTO。
- `packages/neko-agent/packages/agent`：现有 Tool/context 注入、turn assembly、Plan/TODO 之后的普通 ReAct、validator/recovery 与 Agent evaluation trace；不得依赖 IDC stage/persona/run。
- `packages/neko-agent/packages/extension` 与 `packages/neko-agent/packages/platform`：复用并完善现有 Tool/capability contribution、Provider/model support、Plan Mode 只读上下文与普通执行 turn 的当前 schema 解析；可选派生摘要只有 evaluation 证明必要时才保留。
- `packages/neko-agent/packages/webview`、TUI 与 Host document service：Markdown brief/plan/领域文档的审阅、修改、批准和 bounded TODO 进度投影；不得成为执行或项目状态 owner，也不增加编排按钮。
- `packages/neko-skills`：`media-production`、`storyboard`、`video`、`video-editing`、`media-quality-review` 的方法边界和 prompt-chain guidance；不加入工具名教程或执行 DSL。
- Story、Canvas、Sketch、Puppet、Model/Scene、Cut、Audio、Assets/Entity/Character、Quality、Export owning packages：复用或补充小型 capability descriptor、revision dependency 或 authoring entry，不允许功能包交叉 import，也不新增平行项目 IO、DTO 或状态 owner。
- Image/Perception/Engine/External Processor adapters：审计并校正图片 operation 的真实 deterministic/perception/generative/hybrid executor 与 support 声明；不把 UI 工具存在误报为 provider-independent production support。
- Agent evaluation：增加漫画/剧本/小说/插画到 Animatic、样片或成片路径的聚焦脚本场景，并验证真实 capability selection、revision grounding、failure recovery 与 legacy path 未参与。
