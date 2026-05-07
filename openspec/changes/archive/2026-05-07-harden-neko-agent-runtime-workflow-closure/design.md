## Context

上一份 `unify-neko-agent-runtime-workflow-boundaries` 已经完成六个 agent runtime capability 的主体迁移：runtime owns turn assembly / workflow / capability injection / prompt-schema / multimodal packet / evaluation harness，Extension owns host adapters，Webview owns projection。当前风险不再是“边界是否存在”，而是“边界是否会被兼容例外、旧 pipeline、半闭环 evidence/evaluator 长期侵蚀”。

本设计针对六类 closure 风险：

- compatibility exceptions 缺少 sunset，可能永久化。
- `AgentRunner` 对外是 port，但文件仍承担 VSCode event bridge、runtime adapter 和 compatibility wrapper。
- `MultimodalContextPacket` 已能承载 evidence，但工具产出 artifact/evidence 到下一轮 LLM context 的闭环仍弱。
- evaluation harness 已能做 baseline/variant comparison，但缺少 deterministic compliance 与可插拔 judge result。
- unified workflow 与 legacy pipeline 双轨共存，没有明确退出窗口。
- capability manifest 未注入字段缺少 telemetry，注册/注入调试仍不够细。

## Goals / Non-Goals

**Goals:**

- 给 boundary compatibility exceptions 增加 owner、tracking id、sunset milestone、expiration behavior。
- 拆薄 Extension runner，将 VSCode event bridge 与 runtime port adapter 分开，同时保持现有 public behavior。
- 让工具产出的多模态 artifact / perception evidence 能按引用进入后续 turn 或 workflow node。
- 让 evaluator runner 输出 schema-bound judge result、correction hints 和 recovery signal，并支持 deterministic 与 LLM-as-judge 两类 evaluator。
- 给 legacy pipeline adapter 增加 deprecation marker、telemetry 和 sunset validation，要求新流程走 workflow-native definition。
- 对 capability 未注入字段增加 telemetry：unknown、unsupported、withheld、policy-skipped、ablation-skipped 分开统计。

**Non-Goals:**

- 不重写 Webview UI 或改变 Webview 作为 projection surface 的边界。
- 不实现跨进程 / 跨机器 Multi-Agent Federation。
- 不把 evaluator 或 ablation 插入普通用户 PlanMode 的 Draft / Plan / Apply 主路径。
- 不替代 `neko-market` 的安装职责；agent 仍只消费安装后的 manifest / projection。
- 不一次性删除所有 legacy pipeline；本变更只定义 sunset、telemetry 与 workflow-native migration gate。
- 不引入新的 provider SDK；LLM-as-judge 使用现有 Platform / AI SDK adapter 边界。

## Decisions

### Decision 1: Compatibility exception 需要 metadata 和 hard expiration

`check-neko-agent-boundaries` 中每个 compatibility exception 必须带：

- `id`
- `file`
- `reason`
- `owner`
- `tracking`
- `introducedAt`
- `expiresAt` 或 `sunsetMilestone`
- `replacement`
- `severityAfterExpiry`

guard 默认允许未过期例外，但必须在 JSON 输出中列出。到期后，除非显式使用 test-only override，生产 guard 失败。替代方案是只在文档中写 TODO；这会让例外永久化，无法作为 CI 信号。

### Decision 2: Runner closure 采用 adapter split，不做行为重写

保留 Extension public `IAgentRunner`，但拆出：

- runtime-facing `AgentRunnerPort` consumer path
- VSCode event bridge
- compatibility event surface

新 Extension 内部 consumer 优先订阅 `onDidRunnerEvent`。旧 `onDidStart` / `onDidStop` / `onDidRequestConfirmation` / `onDidSubAgentEvent` 保留兼容，但新增 usage 通过 guard 或 targeted test 标记。替代方案是直接删除单独 events；风险是破坏现有 chat / confirmation / subagent UI 通知。

### Decision 3: 多模态回灌只回传引用和 evidence，不回传无界 payload

工具结果回灌路径使用 `AgentGeneratedArtifactProjection`、`AgentMultimodalEvidenceRef`、`MultimodalContextPacket` metadata 和 host adapter payload loader。runtime 记录 artifact/evidence lineage，后续 turn 可按 workflow node policy 选择注入 summary、URI 或 adapter-loaded payload。

Extension 仍负责文件读取、URI 转换、base64/bytes/url payload；Webview 只收到 compact projection。替代方案是把工具输出二进制直接放进 Webview state 或 conversation history；这会破坏性能、安全和路径策略。

### Decision 4: Evaluator 是 runtime/eval harness，不是普通 IDC stage

新增 evaluator runner contract：

- deterministic evaluator：读取 artifact/schema/evidence，输出 compliance result。
- LLM-as-judge adapter：通过 Platform / AI SDK 调模型，输出 schema-bound judge result。
- correction hint：给 workflow recovery 或后续 turn 的建议。
- recovery signal：可建议 retry node、regress stage、escalate user，但普通用户 IDC 不自动插入 evaluator stage。

替代方案是在每个 PlanMode 自动加 evaluator node；这会污染用户主路径，并与现有 “evaluation non-stage” 决策冲突。

### Decision 5: Legacy pipeline 先 telemetry，再 sunset gate

legacy pipeline compatibility adapter 增加 deprecation marker。运行时每次使用 legacy path 都记录 telemetry，包括 workflow definition candidate、node mapping、missing migration reason。到 sunset milestone 后，新建 pipeline 必须 workflow-native；旧 pipeline 可通过 explicit compatibility id 继续运行一段迁移窗口。

替代方案是立刻删除 legacy pipeline；风险是破坏现有 media generation / prompt-chain 的兼容行为。

### Decision 6: Capability telemetry 是 registration / injection diagnostics 的第三视角

Registration diagnostics 说明 manifest 是否有效；Injection diagnostics 说明当前 turn 是否注入。Telemetry 记录生态演化与字段利用率：

- unknown field: manifest 出现 schema 外字段。
- unsupported field: runtime 认识字段但当前版本不支持注入。
- withheld field: 字段有效但 policy 决定不注入。
- policy-skipped: trust / host / permission / workflow / budget 阻止注入。
- ablation-skipped: 实验开关阻止注入。

替代方案是把这些都塞进 injection diagnostics；会让每次 turn 的诊断过重，也难以观察 market/local skill 生态趋势。

## Risks / Trade-offs

- [Guard 过期导致 CI 突然失败] → expiration 使用明确日期 / milestone，文档要求提前一个迭代清理或续期；续期必须改 tracking id 或记录 rationale。
- [Runner 拆分引入更多文件] → 以职责换体积，保留现有 public API，测试 start/stop/confirmation/subagent/cancel/history/compression 行为。
- [多模态 evidence 回灌导致 token 膨胀] → 默认注入 summary / evidence ref，payload 需要 workflow node policy 与 tool modality declaration 共同允许。
- [LLM-as-judge 成本和稳定性] → deterministic evaluator 是默认；LLM judge 是可插拔 variant，实验记录 model/provider/hash，不作为发布硬闸。
- [Legacy sunset 影响旧流程] → 使用 telemetry 找出仍在使用的 legacy path，先加 warning，再启用 new-pipeline gate。
- [Telemetry 泄漏敏感 manifest 内容] → telemetry 默认记录字段名、source、reason、hash，不记录 prompt fragment 全文或大 payload。

## Migration Plan

1. 扩展 boundary guard exception model、自测和文档，先不改变现有例外状态。
2. 给现有 6 个 compatibility exceptions 补 owner / tracking / sunset metadata，启用未过期 warning 与过期 failure。
3. 拆分 Extension runner adapter 文件，保持 `IAgentRunner` 行为，迁移内部 consumer 到 `onDidRunnerEvent`。
4. 增加 multimodal evidence feedback contracts 和 runtime builder，覆盖 tool result → artifact/evidence → next packet。
5. 扩展 evaluation harness 为 evaluator runner，增加 deterministic compliance fixture 和 mock LLM judge fixture。
6. 给 legacy workflow adapter 增加 telemetry、deprecation marker、sunset gate。
7. 增加 capability telemetry recorder，接入 market/local/plugin/MCP normalizer 与 injection runtime。
8. 更新 architecture docs / remaining-tasks，运行 targeted tsc、vitest、boundary guard、OpenSpec validate。

## Rollback Strategy

每个 closure 子项都保留兼容开关。若 runner split 或 evidence feedback 出现回归，可将 Extension adapter 暂时指回旧 class / 旧 packet builder，但不得重新让 Webview 或 Extension 拥有 agent strategy。Guard expiration 可通过延长 metadata 续期回滚，但必须留下 tracking rationale。

## Open Questions

- 兼容例外的 `expiresAt` 使用绝对日期还是 release milestone；建议同时支持，CI 优先比较绝对日期。
- LLM-as-judge 的首个 provider 是否只走现有 default LLM provider；建议首版只使用已配置 provider，不新增 provider registry。
- Legacy pipeline sunset 的默认窗口多长；建议首版以一个 minor release 或 30 天作为 guard 默认值，具体由 tasks 实施时确认。
