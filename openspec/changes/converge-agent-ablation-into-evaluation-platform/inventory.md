# Agent Ablation Inventory and Classification

## Platform Dependency Audit

`establish-agent-evaluation-platform` is the required owner and is complete at
49/49 tasks. The current `scripts/agent-eval` implementation already provides:

| Contract                | Canonical owner/evidence                                                                                                            |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Real execution path     | `runner/run-v2-case.mjs` spawns `neko debug automation --stdio` and drives the TUI input queue through `runTuiWorkflowController`   |
| Runtime/model profiles  | strict `RUNTIME_PROFILE_SCHEMA` and `MODEL_PROFILE_SCHEMA`; `createSessionParams` passes only TUI-supported settings                |
| Effective configuration | `session.facts.configuration`, checked by `validateEffectiveConfiguration`; requested/effective mismatch is `configuration-invalid` |
| Repeated samples        | `runV2Case` creates a new fixture and TUI session for every sample and retains every sample report                                  |
| Hard gates and quality  | `evaluateHardGates`, owning artifact validators, evidence-restricted rubric Judge                                                   |
| Comparison and reports  | approved baseline comparison plus versioned result/evidence/artifact/quality/aggregate reports                                      |

Conclusion: ablation extends these contracts. It does not create a temporary
runner, direct `AgentSession` assembly, evaluator, or report fact source.

## Canonical Configuration Audit

The TUI debug `session.create.runtimeConfig` boundary accepts exactly
`temperature`, `maxTokens`, `thinkingBudget`, and `outputFormat`. Model/provider
selection is represented by Evaluation model profiles. The boundary currently
does not accept execution mode, context/memory policy, Skill enabled state,
Capability enabled state, retry policy, hook selection, or maximum iterations.

Therefore the initial configuration pilot uses one numeric TUI-supported
dimension. A field is not configuration ablation merely because an internal
`AgentSessionConfig` property exists.

## Toggle Inventory

Classification values are `configuration`, `implementation`, `obsolete`, and
`not-applicable`. `implementation` means an isolated source/worktree/build
variant; it does not authorize a product runtime switch.

| Legacy toggle                   | Classification | Owning responsibility and migration evidence                                                                                                              |
| ------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `compression`                   | implementation | Context/memory implementation. The debug boundary has no compression policy setting.                                                                      |
| `creativeCompression`           | implementation | Context summarization implementation, not a supported TUI off-state.                                                                                      |
| `skillDiscovery`                | implementation | Skill lifecycle implementation. Current marker mutates a shared `SkillService`, so it cannot become session configuration.                                |
| `skillInjection`                | implementation | Skill prompt lifecycle implementation. Rebuild as an isolated Skill/runtime revision.                                                                     |
| `dynamicToolSets`               | implementation | Tool routing implementation; current marker creates a no-op activation branch.                                                                            |
| `toolInjection`                 | implementation | Internal Tool layer selection, absent from the canonical TUI configuration contract.                                                                      |
| `validation`                    | implementation | Hook-chain implementation; disabling correctness gates is not a product evaluation profile.                                                               |
| `retry`                         | implementation | Retry implementation/policy is not accepted by debug runtime configuration.                                                                               |
| `permissionMode`                | not-applicable | A real product mode exists, but debug automation does not expose it as immutable session configuration. Re-audit only after that product contract exists. |
| `traitsRegistry`                | implementation | Permission implementation dependency, not a supported setting.                                                                                            |
| `settingsHooks`                 | implementation | Host integration implementation, not a session profile field.                                                                                             |
| `projectMemory`                 | implementation | Memory dependency removal; no canonical debug policy exists.                                                                                              |
| `compactLogging`                | implementation | Journal observability implementation. Evaluate only if a real diagnostic consumer remains.                                                                |
| `autoMemoryExtraction`          | implementation | Memory extraction implementation, not a supported profile.                                                                                                |
| `memoryRecall`                  | implementation | Prompt/memory implementation, not a supported profile.                                                                                                    |
| `providerCardAutoEvolve`        | implementation | Provider-card authoring side effect, not a supported profile.                                                                                             |
| `agentFirst.enabled`            | obsolete       | Ambiguous group switch spanning observation, evidence, and recovery responsibilities. Split into focused revisions if still valuable.                     |
| `agentFirst.observation`        | implementation | Journal observation implementation.                                                                                                                       |
| `agentFirst.toolEvidence`       | implementation | Perception/evidence implementation.                                                                                                                       |
| `agentFirst.recoveryGuidance`   | implementation | Prompt/recovery implementation.                                                                                                                           |
| `agentFirst.toolEvidenceMode`   | not-applicable | Internal validation policy exists but is not accepted by TUI debug configuration.                                                                         |
| `narrative.preview`             | not-applicable | Canvas product feature, outside Agent Evaluation ownership.                                                                                               |
| `narrative.typewriterEffect`    | not-applicable | Canvas presentation behavior, outside Agent Evaluation ownership.                                                                                         |
| `narrative.autoExpressionMatch` | not-applicable | Canvas narrative behavior, outside Agent Evaluation ownership.                                                                                            |
| `narrative.showLockedChoices`   | not-applicable | Canvas narrative behavior, outside Agent Evaluation ownership.                                                                                            |
| `narrative.previewAutoSync`     | not-applicable | Canvas selection/UI behavior, outside Agent Evaluation ownership.                                                                                         |
| `narrative.live2dPerformance`   | not-applicable | Canvas renderer behavior, outside Agent Evaluation ownership.                                                                                             |
| `creationProfileGuidance`       | obsolete       | Marker field is produced but has no runtime consumer.                                                                                                     |
| `planModeProfile`               | obsolete       | Marker field is produced but has no runtime consumer.                                                                                                     |
| `capabilityProtocol`            | obsolete       | Marker field is produced but has no runtime consumer.                                                                                                     |
| `promptSchemaGenerator`         | obsolete       | Legacy marker field and the separate capability-runtime ablation object were removed.                                                                     |
| `subagentOrchestration`         | obsolete       | Marker field is produced but has no runtime consumer.                                                                                                     |
| `multimodalContext`             | obsolete       | Legacy marker field has no consumer; separate capability-runtime test switches are implementation-only.                                                   |
| `evaluatorHints`                | obsolete       | Marker field is produced but has no runtime consumer.                                                                                                     |
| `thinkingBudget`                | configuration  | Supported by TUI debug runtime configuration and projected in effective configuration facts.                                                              |
| `maxIterations`                 | not-applicable | Internal session field, not accepted by the TUI debug runtime configuration boundary.                                                                     |

Additional runtime-only ablation objects previously existed in
`runtime/capability/agent-capability-injection-runtime.ts`,
`runtime/capability/agent-prompt-schema-generator.ts`, and
`runtime/turn/multimodal-context-packet.ts` are not configuration candidates.
They were implementation test switches and were deleted with their public DTO
fields and dedicated tests; future comparisons use isolated builds.

## Preset and Suite Inventory

| Legacy preset/suite                                                                                                                                                                                                                                                                                                | Classification and migration                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `BASELINE`                                                                                                                                                                                                                                                                                                         | Rebuilt as the explicit Evaluation plan baseline.                                                                                      |
| `NO_THINKING`                                                                                                                                                                                                                                                                                                      | Configuration; migrate to a focused `thinkingBudget` plan.                                                                             |
| `NO_COMPRESSION`, `NO_CREATIVE_COMPRESSION`, `NO_SKILL_DISCOVERY`, `NO_SKILL_INJECTION`, `NO_DYNAMIC_TOOLSETS`, `NO_VALIDATION`, `NO_RETRY`, `NO_SETTINGS_HOOKS`, `NO_PROJECT_MEMORY`, `NO_COMPACT_LOGGING`, `NO_AUTO_MEMORY_EXTRACTION`, `NO_MEMORY_RECALL`, `NO_TRAITS`, `ALWAYS_ONLY_TOOLS`, `SINGLE_ITERATION` | Implementation variants when still valuable; none becomes an Evaluation-only runtime flag.                                             |
| `NO_CREATION_PROFILE_GUIDANCE`, `NO_PLAN_MODE_PROFILE`, `NO_CAPABILITY_PROTOCOL`, `NO_PROMPT_SCHEMA_GENERATOR`, `NO_SUBAGENT_ORCHESTRATION`, `NO_MULTIMODAL_CONTEXT`, `NO_EVALUATOR_HINTS`                                                                                                                         | Obsolete legacy marker variants; recreate only from evidence as focused implementation revisions.                                      |
| `PLAN_PERMISSION_MODE`, `ASK_PERMISSION_MODE`                                                                                                                                                                                                                                                                      | Not applicable until the canonical debug session contract supports execution mode.                                                     |
| `NO_NARRATIVE_PREVIEW`, `NO_NARRATIVE_TYPEWRITER`, `NO_NARRATIVE_AUTO_EXPRESSION`, `HIDE_LOCKED_NARRATIVE_CHOICES`, `NO_NARRATIVE_PREVIEW_AUTO_SYNC`, `NARRATIVE_LIVE2D_PERFORMANCE`, `NO_NARRATIVE_PREVIEW_STACK`                                                                                                 | Not applicable to Agent Evaluation; Canvas/Webview functional testing owns these behaviors.                                            |
| `NO_ALL_COMPRESSION`, `NO_ALL_SKILLS`, `NO_ALL_EXTERNAL`, `MINIMAL`                                                                                                                                                                                                                                                | Obsolete as default matrices. They mix independent responsibilities and may only be reintroduced as explicitly evidenced interactions. |
| `createStandardAblationSuite`                                                                                                                                                                                                                                                                                      | Deleted; it mixed obsolete, unrelated, and non-Agent dimensions.                                                                       |
| `createGroupAblationSuite`                                                                                                                                                                                                                                                                                         | Deleted; its group switches were not attributable.                                                                                      |
| `createParameterAblationSuite`                                                                                                                                                                                                                                                                                     | Deleted; only supported settings are authored as Evaluation profiles.                                                                  |

## Removed Consumers, Metrics, Reports, Fixtures, and Tests

- Before cleanup, `applyAblationToggles` wrote top-level `AgentSessionConfig` overrides and
  prepends `AblationMarkerHook`; `agent-session-initializer.ts` extracts it,
  filters hooks, changes Tool injection, mutates Skill discovery, and forwards
  it into `AgentSession`.
- `AgentSession` consumed the marker for Skill injection/discovery restoration,
  ProviderCard writes, perception/evidence behavior, recovery guidance, and
  Journal observation. `SkillInjectionCoordinator`, `SkillService`,
  `ToolInjectionManager`, and `ExecutorHooksFactory` contain experiment-only
  gates/no-op paths.
- `ExperimentRunner` was exported from both the experiment entrypoint and Agent
  root. Its only production caller is CLI `core/experiment.ts`, which directly
  creates `AgentSession`. CLI registration, runtime classification, human
  presentation, i18n strings, completion/help snapshots, and tests all expose
  `neko experiment`.
- `MetricsHooks` owned token, turn, iteration, latency, Tool success/failure, and
  retry observations only for the direct runner. `comparison.ts` owns averages
  and Markdown; `ExperimentRunner` owns repetitions, timeout, optional evaluator,
  `.neko/experiments` isolation metadata, JSON, and comparison reports.
- Experiment tests were the five files under `agent/src/experiment/__tests__`,
  CLI `__tests__/experiment.test.ts`, CLI help snapshots, and three marker-driven
  cases in `session/__tests__/agent-session.test.ts`. Skill/Tool/hook tests named
  `ablation` characterized the no-op switches. All were removed with the old path.
- `.neko/experiments` is a rebuildable developer-output location. No committed
  acceptance baseline or user creative data was found there; the new raw owner
  is gitignored `reports/agent-eval/`.

## Removal Result

The old CLI, exports, direct runner, marker, runtime ablation DTOs, no-op branches,
and experiment-only metrics are removed. Static poison tests cover the Agent
source tree, public root and CLI registration; the external ownership test still
proves ablation calls `runV2Case`. Both real pilots remain infrastructure failures,
so this cleanup is not evidence that provider-backed behavior or quality passed.
