## 1. Boundary Exception Sunset

- [ ] 1.1 Define compatibility exception metadata contract with id, owner, tracking, introducedAt, expiresAt/sunsetMilestone, replacement, and severityAfterExpiry
- [ ] 1.2 Update `scripts/check-neko-agent-boundaries.mjs` to validate exception metadata and include expiry status in JSON output
- [ ] 1.3 Add expiration handling so expired failure-severity exceptions fail `pnpm check:agent-boundaries`
- [ ] 1.4 Add or update guard self-tests for missing metadata, unexpired exceptions, expired exceptions, and renewal rationale
- [ ] 1.5 Add lifecycle metadata for existing compatibility exceptions: `AgentTurnBridge`, `AgentRunner`, `SkillFileService`, command bridges, and tool bridges
- [ ] 1.6 Update `docs/architecture/agent-runtime-boundary-guard.md` with exception sunset rules and renewal requirements

## 2. Runner Adapter Closure

- [ ] 2.1 Split Extension runner implementation into runtime port adapter, VSCode event bridge, and compatibility surface modules
- [ ] 2.2 Preserve `IAgentRunner` public behavior while making internal runtime-facing code consume `AgentRunnerPort`
- [ ] 2.3 Add guard or targeted test coverage that flags new direct usage of individual VSCode runner events outside the bridge/compatibility files
- [ ] 2.4 Migrate eligible Extension consumers to `onDidRunnerEvent`
- [ ] 2.5 Add tests for configure, execute, cancel, confirmation, subagent event forwarding, history hydration, context compression, skill injection, and capability refresh after the split
- [ ] 2.6 Update comments/docs so `AgentRunner` is described as a VSCode adapter, not an owner of agent execution state

## 3. Multimodal Evidence Feedback

- [ ] 3.1 Extend shared contracts for tool-produced multimodal evidence feedback and artifact/evidence lineage
- [ ] 3.2 Implement runtime helpers that convert tool results into `AgentGeneratedArtifactProjection` and `AgentMultimodalEvidenceRef`
- [ ] 3.3 Add policy-aware builder support for injecting prior evidence refs into later `MultimodalContextPacket` instances
- [ ] 3.4 Keep payload loading behind `AgentMultimodalHostAdapter` and enforce bounded payload behavior
- [ ] 3.5 Update prompt/schema generation or packet summary generation to report included versus withheld feedback evidence
- [ ] 3.6 Add tests for image artifact feedback, video perception evidence, summary-only injection, host-adapter payload loading, Webview compact projection, and evidence-feedback ablation

## 4. Evaluator Judge Loop

- [ ] 4.1 Define evaluator result, evaluator runner, judge adapter, correction hint, and workflow recovery signal contracts
- [ ] 4.2 Implement deterministic evaluator fixture for asset/spec compliance with schema-bound output
- [ ] 4.3 Implement mock LLM-as-judge adapter path through existing Platform/AI SDK boundary without network dependency in tests
- [ ] 4.4 Extend workflow evaluation harness to record evaluator results, quality deltas, correction hints, and recovery signals
- [ ] 4.5 Ensure normal PlanMode remains Draft/Plan/Apply and does not insert evaluator or ablation stages by default
- [ ] 4.6 Add tests for deterministic pass/fail, mock judge result, provider identity capture, quality delta comparison, and explicit evaluation workflow recovery

## 5. Legacy Workflow Sunset

- [ ] 5.1 Define legacy workflow adapter deprecation metadata and runtime telemetry contracts
- [ ] 5.2 Mark existing workflow/pipeline compatibility adapter paths with adapter id, owner, sunset milestone, and workflow-native replacement
- [ ] 5.3 Record telemetry for legacy path usage, workflow definition candidate, node mapping, unmapped steps, usage count, and last-used timestamp
- [ ] 5.4 Add validation that rejects new pipeline-only workflows after the sunset gate unless explicit compatibility approval is present
- [ ] 5.5 Add tests for existing legacy flow allowed before sunset, expired adapter requiring approval, missing metadata failure, and unmapped-node telemetry
- [ ] 5.6 Update architecture docs with legacy workflow migration and sunset policy

## 6. Capability Telemetry

- [ ] 6.1 Define capability telemetry event and snapshot contracts distinct from registration and injection diagnostics
- [ ] 6.2 Record field utilization for market, local, builtin, plugin, MCP, and provider capability contributions
- [ ] 6.3 Distinguish used, unknown-field, unsupported-field, withheld-field, policy-skipped, and ablation-skipped telemetry reasons
- [ ] 6.4 Avoid storing raw prompt fragment text, large schemas, file payloads, or user content; store ids, source, versions, hashes, and reason codes
- [ ] 6.5 Add telemetry for skill install/update/remove, prompt fragment changes, schema changes, workflow fragment changes, and provider card changes
- [ ] 6.6 Add tests for unknown field, unsupported known field, policy skip, ablation skip, prompt fragment hash, and market skill update telemetry

## 7. Documentation and Validation

- [ ] 7.1 Update `docs/architecture/agent-unified-workflow.md` with runtime closure: exception sunset, evidence feedback, evaluator judge loop, and legacy sunset
- [ ] 7.2 Update `docs/architecture/assessments/neko-agent-remaining-tasks-2026-05-04.md` or add a follow-up assessment section for R1-R6 closure status
- [ ] 7.3 Run targeted TypeScript checks for `@neko-agent/types`, `@neko/agent`, `@neko/platform`, `@neko-agent/extension`, `@neko-agent/webview`, and `@neko/ai-sdk`; record existing typecheck debt separately
- [ ] 7.4 Run targeted Vitest suites for boundary guard, runner adapter, multimodal feedback, evaluator judge loop, legacy workflow sunset, capability telemetry, Webview projections, and Extension adapters
- [ ] 7.5 Run `pnpm check:agent-boundaries` and guard self-tests
- [ ] 7.6 Run `openspec validate harden-neko-agent-runtime-workflow-closure --strict`
