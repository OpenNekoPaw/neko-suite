## 1. Boundary Audit and Guardrails

- [x] 1.1 Add or update architecture guard coverage for forbidden imports across `webview`, `extension`, `agent`, `platform`, `ai-sdk`, and `agent-types`
- [x] 1.2 Add targeted guard cases for Webview importing core agent/platform runtime and core runtime importing VSCode
- [x] 1.3 Add targeted guard cases for Extension importing React and for host-agnostic packages importing Webview-only APIs
- [x] 1.4 Document current compatibility exceptions for `AgentTurnBridge`, `AgentRunner`, `SkillFileService`, command bridges, and tool bridges
- [x] 1.5 Add minimal CI/check command documentation for the new architecture guard

## 2. Agent Turn Runtime Boundary

- [x] 2.1 Define `AgentTurnHostAdapters`, `AgentTurnAssemblyInput`, and `AgentTurnRuntimeServices` in `@neko/agent/runtime`
- [x] 2.2 Move settings snapshot and provider-source assembly from `AgentTurnBridge` into runtime assembly helpers
- [x] 2.3 Move base prompt, plan mode, active skill, and workflow-mode inputs into runtime assembly helpers
- [x] 2.4 Move workspace/editor/timeline/context packet assembly rules behind runtime-owned builder functions using host adapters
- [x] 2.5 Move task manager and subagent subscription policy wiring into runtime-owned turn execution input
- [x] 2.6 Reduce `AgentTurnBridge.execute()` to Webview/VSCode host adapter creation and runtime invocation
- [x] 2.7 Add unit tests proving turn assembly runs with mock adapters and no VSCode dependency
- [x] 2.8 Add regression tests for image attachments, media model selections, plan mode, active skill, timeline context, and subagent event subscription

## 3. Agent Runner Port

- [x] 3.1 Define host-agnostic `AgentRunnerPort`, runner event types, and `DisposableLike` in `@neko/agent/runtime`
- [x] 3.2 Adapt existing session runner/controller APIs to satisfy the new runner port
- [x] 3.3 Convert Extension `AgentRunner` into a VSCode adapter over the runner port while preserving existing public behavior
- [x] 3.4 Update `AgentManager` and dependent Extension code to depend on runner port semantics where possible
- [x] 3.5 Add compatibility wrappers for remaining VSCode-facing consumers with explicit TODO(P1) cleanup notes
- [x] 3.6 Add tests for start/stop events, confirmation events, subagent events, cancellation, history load, and context compression through the port
- [x] 3.7 Add type-level or guard tests proving `@neko/agent/runtime` runner contracts do not import VSCode

## 4. Unified Workflow Runtime Skeleton

- [x] 4.1 Define `AgentWorkflowDefinition`, `AgentWorkflowRun`, `AgentWorkflowNode`, `AgentWorkflowTransition`, and workflow status contracts in `@neko-agent/types`
- [x] 4.2 Implement workflow runtime skeleton in `@neko/agent/runtime` with run creation, node activation, transition, cancellation, and projection hooks
- [x] 4.3 Model IDC Draft, Plan, and Apply as workflow stage profiles
- [x] 4.4 Route PlanMode and AutoMode entry decisions through workflow runtime instead of UI-only state
- [x] 4.5 Add compatibility adapter for existing pipeline flows to emit workflow run/node projections
- [x] 4.6 Link existing task manager, media task runtime, and subagent event runtime to workflow run/node identity
- [x] 4.7 Ensure all task/media/subagent Webview projections include `conversationId` and workflow identity when available
- [x] 4.8 Add workflow runtime tests for IDC full run, AutoMode stage entry, cancellation, task projection, media task projection, and subagent projection

## 5. Capability Registration and Injection

- [x] 5.1 Define normalized skill/capability schema for built-in, market, local, plugin, and MCP-derived contributions
- [x] 5.2 Implement or complete market-installed skill discovery through the same runtime path as local skill discovery
- [x] 5.3 Add manifest/frontmatter validation for skill identity, source, trust level, prompt fragments, allowed tools, commands, workflow fragments, and host requirements
- [x] 5.4 Split registration diagnostics from injection diagnostics in the capability runtime
- [x] 5.5 Implement deterministic conflict handling for slash commands, tool names, skill ids, prompt fragment ids, and workflow fragment ids
- [x] 5.6 Enforce trust level, host requirements, permission policy, workflow node requirements, and tool budget before injection
- [x] 5.7 Build Webview slash command catalog from normalized runtime projections rather than UI-owned semantics
- [x] 5.8 Add tests for market skill registration, local skill rescan, command collision, tool collision, host requirement skip, trust policy skip, and ablation-disabled injection

## 6. Dynamic Prompt and Schema Generation

- [x] 6.1 Define `PromptGenerationContext`, `GeneratedPromptBundle`, and generated schema bundle contracts
- [x] 6.2 Implement `AgentPromptSchemaGenerator` in runtime with base prompt, locale, settings, AGENTS.md overlay, IDC stage, plan mode, active skill, workflow node, and capability fragments
- [x] 6.3 Move remaining core prompt generation decisions out of Extension handlers and bridges
- [x] 6.4 Generate per-turn tool allowlists and tool schemas from runtime capability injection state
- [x] 6.5 Generate structured output schemas for IDC artifacts, workflow node outputs, evaluator outputs, and recovery decisions
- [x] 6.6 Add provider capability handling for native tool calling, non-tool-calling providers, and structured output support
- [x] 6.7 Add deterministic prompt/schema snapshot tests for baseline, PlanMode, active skill, capability fragment, provider expression fragment, and multimodal context combinations
- [x] 6.8 Add diagnostics for skipped prompt fragments, skipped schemas, and provider-incompatible schema generation

## 7. Multimodal Context and Tooling

- [x] 7.1 Define `MultimodalContextPacket`, evidence references, modality metadata, artifact references, and workflow/conversation linkage contracts
- [x] 7.2 Convert existing text, image attachment, canvas selection, timeline context, and editor selection inputs into the packet
- [x] 7.3 Add packet support for audio/video metadata and optional engine perception evidence references
- [x] 7.4 Define tool modality declarations for accepted modalities, produced modalities, evidence requirements, and output artifact types
- [x] 7.5 Update tool injection and workflow planning to consider modality declarations and evidence availability
- [x] 7.6 Move provider-specific multimodal message projection into AI SDK/platform adapters
- [x] 7.7 Keep file reading, base64 conversion, VSCode URI conversion, and workspace path resolution in host adapters
- [x] 7.8 Add tests for image+timeline packet creation, audio/video metadata preservation, adapter-owned media payload loading, generated artifact projection, and evidence-disabled ablation

## 8. Extension Command and Tool Adapter Cleanup

- [x] 8.1 Review `agentCoreCommands.ts` and keep commands limited to VSCode input collection, command registration, and runtime delegation
- [x] 8.2 Review quality, consistency, puppet face, canvas generation, internal chat, and model refresh bridges for business logic leakage
- [x] 8.3 Move any remaining prompt construction, validation policy, media generation policy, or capability policy from Extension into runtime/platform helpers
- [x] 8.4 Keep file reads, cross-extension API calls, and command invocation behind explicit host adapter interfaces
- [x] 8.5 Add adapter tests for command delegation and tool bridge payload conversion
- [x] 8.6 Update comments to state host adapter responsibilities without implying Extension owns agent business logic

## 9. Evaluation, Ablation, and Dynamic Evolution

- [x] 9.1 Extend ablation toggles for IDC workflow, PlanMode profile, capability protocol enforcement, prompt/schema generator, subagent orchestration, multimodal context, and evaluator hints
- [x] 9.2 Record workflow metrics for node completion, task completion, latency, token usage, tool calls, retries, approvals, generated artifacts, and evaluator outcomes
- [x] 9.3 Capture prompt/schema hashes or snapshot references per workflow run/node/model/variant
- [x] 9.4 Record capability evolution events for skill install/update/remove, prompt fragment changes, schema changes, workflow definition changes, and provider card changes
- [x] 9.5 Add baseline experiment fixtures for IDC creation, skill injection, workflow prompt-chain, subagent task, and multimodal tool call
- [x] 9.6 Add comparison output tests for baseline versus no-skill-injection, no-subagent, no-multimodal-context, and no-dynamic-schema variants
- [x] 9.7 Ensure evaluation harness can run with mock host adapters and no Webview

## 10. Documentation and Validation

- [x] 10.1 Update `docs/architecture/agent-unified-workflow.md` or add a companion implementation note for the new runtime workflow contracts
- [x] 10.2 Update `docs/architecture/assessments/neko-agent-remaining-tasks-2026-05-04.md` after P1 bridge/runner migration progress
- [x] 10.3 Document market/local skill registration versus injection behavior and trust/host requirement rules
- [x] 10.4 Document prompt/schema generation layers and snapshot testing expectations
- [x] 10.5 Document multimodal packet and tool modality declaration rules
- [x] 10.6 Run targeted TypeScript checks for `@neko-agent/types`, `@neko/agent`, `@neko/platform`, `@neko-agent/extension`, and `@neko-agent/webview`
- [x] 10.7 Run targeted Vitest suites for runtime boundaries, workflow runtime, capability injection, prompt/schema generation, multimodal tooling, Webview projections, and Extension adapters
- [x] 10.8 Run `openspec validate unify-neko-agent-runtime-workflow-boundaries --strict` and record the result
