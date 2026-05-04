## Why

`unify-neko-agent-runtime-workflow-boundaries` 已经把 Webview / Extension / Agent runtime / Platform / AI SDK 的职责边界落到可测试契约，但仍有几处“协议已完成、闭环未完成”的风险：compatibility exceptions 没有 sunset，runner adapter 偏厚，多模态工具结果尚未稳定回灌到下一轮 LLM context，Evaluator 仍是比较器而非裁判，legacy pipeline 与 workflow runtime 双轨共存，skill manifest 未注入字段缺少 telemetry。

本变更把这些风险收敛为后续可实施的 closure 提案：不扩大 agent 核心范围，不重写 UI，也不回滚刚完成的 runtime boundary，而是给兼容面、evidence loop、evaluator loop、legacy migration 和 capability diagnostics 增加明确退出标准。

## What Changes

- 为 `scripts/check-neko-agent-boundaries.mjs` 的 compatibility exceptions 增加 sunset metadata、owner / milestone / tracking id，并让过期例外变为 guard failure。
- 将 Extension `AgentRunner` 的 VSCode event bridge 与 runtime port adapter 拆分，保留 public compatibility surface，但禁止新 consumer 依赖单独 VSCode event 形态。
- 建立多模态工具结果回灌闭环：工具产出的 image/video/audio/data artifact 与 engine perception evidence 可作为 `MultimodalContextPacket` evidence ref 进入后续 turn / workflow node。
- 将 evaluation harness 从 metrics comparator 扩展为 evaluator runner：支持 deterministic asset/spec compliance、可插拔 LLM-as-judge adapter、修正建议与 workflow recovery signal，但仍不进入普通用户 IDC stage。
- 给 legacy pipeline compatibility adapter 定义 deprecation marker、sunset milestone 和 runtime warning/telemetry，逐步要求新 pipeline 以 workflow definition / node profile 表达。
- 为 market/local/plugin/MCP skill manifest 中“已注册但未注入字段”增加 telemetry 和 diagnostics，明确 unknown / withheld / policy-skipped / unsupported-field 的差异。
- 更新 docs 与 remaining-tasks assessment，明确哪些历史债被 closure 完成，哪些仍属正交后续提案。

## Capabilities

### New Capabilities

- `agent-boundary-exception-sunset`: Runtime boundary guard 的 compatibility exception 生命周期、过期失败策略和跟踪元数据。
- `agent-runner-adapter-closure`: Extension runner adapter 拆分、VSCode event 兼容面收口和 port-first consumer 迁移。
- `agent-multimodal-evidence-feedback`: 多模态工具结果、artifact、perception evidence 回灌到后续 LLM context / workflow node 的闭环。
- `agent-evaluator-judge-loop`: evaluator runner、deterministic compliance、LLM-as-judge adapter、修正建议与 recovery signal。
- `agent-legacy-workflow-sunset`: legacy pipeline compatibility adapter 的 deprecation、sunset、telemetry 和 workflow-native migration。
- `agent-capability-telemetry`: skill/capability manifest 未注入字段、policy skip、unsupported field、unknown field 的 telemetry 与 diagnostics。

### Modified Capabilities

- None. 当前已归档 OpenSpec specs 中没有 agent 相关 baseline；本变更新增 closure 能力基线，不修改 3D / render 既有 specs。

## Impact

- `scripts/check-neko-agent-boundaries.mjs`: compatibility exception metadata、expiration check、自测更新。
- `docs/architecture/agent-runtime-boundary-guard.md`: guard exception 生命周期与维护规则。
- `docs/architecture/agent-unified-workflow.md`: runtime workflow closure 说明，特别是 evidence feedback、evaluator loop、legacy sunset。
- `docs/architecture/assessments/neko-agent-remaining-tasks-2026-05-04.md`: 剩余风险更新为 closure tracking。
- `packages/neko-agent/packages/extension/src/ai/agentRunner.ts`: adapter 拆分与 consumer migration warning。
- `packages/neko-agent/packages/agent/src/runtime`: multimodal evidence feedback、workflow recovery signal、legacy workflow adapter telemetry。
- `packages/neko-agent/packages/agent/src/experiment`: evaluator runner、judge adapter contracts、baseline fixture result 扩展。
- `packages/neko-agent/packages/agent-types`: evidence feedback、evaluator result、recovery signal、compatibility exception、capability telemetry shared contracts。
- `packages/neko-agent/packages/ai-sdk` / `platform`: optional LLM-as-judge projection and provider adapter boundary where needed.
- Tests: guard self-tests, runner adapter tests, multimodal feedback tests, evaluator judge-loop tests, legacy sunset tests, capability telemetry tests.
