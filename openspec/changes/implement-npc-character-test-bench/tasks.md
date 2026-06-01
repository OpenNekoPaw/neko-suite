## 1. Runtime Tool Policy Foundation

- [x] 1.1 Add shared or agent-runtime `AgentToolPolicy` types with `none`, `all`, and `allow-list` modes.
- [x] 1.2 Extend `SubAgentConfig` and preset handling to accept `toolPolicy` while preserving existing `allowedTools` compatibility.
- [x] 1.3 Update `SubAgentManager` tool filtering so `toolPolicy: { kind: 'none' }` passes an empty tool registry to the executor.
- [x] 1.4 Add unit tests for `none`, `all`, `allow-list`, and legacy `allowedTools` behavior.
- [x] 1.5 Add or update architecture guard coverage for NPC runtime modules and Webview/runtime boundaries.

## 2. Shared NPC Contracts

- [x] 2.1 Add `NpcTestMode`, `NpcTestBenchLaunchRequest`, `NpcProfileSource`, `NpcProfileFact`, and profile sparsity contracts in `@neko/shared`.
- [x] 2.2 Add `NpcTranscriptArtifact`, transcript message, evaluation report, and evaluation suggestion contracts.
- [x] 2.3 Add command/action constants for `/as`, `/exit-role`, `neko.agent.testNpc`, and Dashboard `test-npc`.
- [x] 2.4 Add type guards and contract tests for launch requests, profile sources, transcript artifacts, reports, and suggestions.
- [x] 2.5 Export contracts through existing shared package entrypoints without introducing feature-package imports.

## 3. Entity Profile Assembly

- [x] 3.1 Create `NpcProfileAssembler` under `@neko/entity/projections` with injected readers for entities, bindings, drafts, relationships, occurrences, and optional asset metadata.
- [x] 3.2 Implement deterministic assembly for identity, aliases, role, age, gender, visual facts, representation bindings, relationships, and scene/occurrence summaries.
- [x] 3.3 Implement profile sparsity scoring for `thin`, `partial`, and `rich` profiles.
- [x] 3.4 Preserve fact source and authority metadata, including confirmed vs suggested facts.
- [x] 3.5 Add fixture tests for thin, partial, rich, missing entity, candidate entity, and provider-unavailable cases.
- [x] 3.6 Add dependency-boundary tests proving `@neko/entity/projections` does not import Agent, Story, Assets implementation, Dashboard, React, Webview, or VSCode-only modules.

## 4. Agent Prompt And Evaluation Projectors

- [x] 4.1 Add `npc-profile-projector.ts` to render NPC system prompts from `NpcProfileSource`.
- [x] 4.2 Add roleplay and consult mode prompt differences, including explicit uncertainty handling for suggested facts.
- [x] 4.3 Add `npc-evaluator-projector.ts` to render transcript evaluation prompts and expected structured output.
- [x] 4.4 Add `npc-character` preset with `toolPolicy: { kind: 'none' }`, balanced model tier, and NPC-specific max iteration defaults.
- [x] 4.5 Add snapshot/unit tests for prompt projection, consult mode, thin-profile prompt rendering, and evaluator prompt rendering.

## 5. NPC Conversation Orchestration

- [x] 5.1 Add `NpcConversationSession` or equivalent multi-turn facade for NPC test sessions.
- [x] 5.2 Implement `NpcTestBenchController` in the Agent extension for launch, project-root resolution, profile assembly, session creation, turn routing, transcript extraction, and disposal.
- [x] 5.3 Add `/as` parsing with mention/entity resolution, `--consult`, enrichment mode flags, and picker fallback when no entity is supplied.
- [x] 5.4 Add `/exit-role` handling that extracts transcript before disposal and returns to the main Agent conversation.
- [x] 5.5 Register `neko.agent.testNpc` command and focus the Agent panel before starting the NPC session.
- [x] 5.6 Add controller tests for successful launch, unresolved entity, project-scope selection, no-tool session config, turn routing, exit, and cancellation.

## 6. Agent Webview NPC Session UI

- [x] 6.1 Add `ConversationKind = 'chat' | 'npc-test'` or equivalent projection without extending media `SessionMode`.
- [x] 6.2 Add NPC tab/header projection with character name, role/age/personality summary, and full profile inspection.
- [x] 6.3 Hide model selector, execution mode selector, and media generation controls when `conversationKind === 'npc-test'`.
- [x] 6.4 Add NPC exit action and route `/exit-role` or exit button events through the extension controller.
- [x] 6.5 Add Webview tests for NPC projection rendering, control hiding, profile inspection, and exit action dispatch.

## 7. Dashboard Launch Integration

- [x] 7.1 Extend `DashboardCreativeEntityAction` with `test-npc` and update type guards/i18n labels.
- [x] 7.2 Add `test-npc` action descriptors for character entities and disabled/omitted behavior for unsupported kinds.
- [x] 7.3 Implement source or host action delegation from Dashboard action requests to `neko.agent.testNpc`.
- [x] 7.4 Add Dashboard extension/webview tests for action rendering, delegation payload shape, invalid refs, and unsupported entity kinds.

## 8. Enrichment, Persistence, And Evaluation

- [x] 8.1 Add thin-profile handling flow with start-now, project-evidence enrichment, and manual supplement options.
- [x] 8.2 Implement optional project-scoped dialogue/sample extraction through Story/script evidence ports where available.
- [x] 8.3 Add `.neko/npc-tests/{entityId}-{timestamp}.json` persistence with version, createdAt, entityRef, profileSnapshot, transcript, evaluation, and optional profileHash.
- [x] 8.4 Ensure NPC transcripts are not written to main Agent history, `.neko/memory.md`, global memory, or standard conversation records.
- [x] 8.5 Implement post-exit evaluation report generation from transcript plus profile snapshot.
- [x] 8.6 Implement `NpcEvaluationSuggestion` apply flow through entity metadata or relationship update commands with explicit user confirmation.
- [x] 8.7 Add tests for save policy, project-local path resolution, artifact schema, evaluator output parsing, and suggestion apply/no-auto-write behavior.

## 9. Documentation And Verification

- [x] 9.1 Update ADR references or architecture docs if implementation decisions diverge from `adr-npc-character-test-bench.md`.
- [x] 9.2 Update README or user-facing command documentation for `/as`, `/exit-role`, and Dashboard Test NPC action.
- [x] 9.3 Run targeted TypeScript tests for shared contracts, entity projection, Agent runtime, Agent extension, Agent webview, and Dashboard.
- [x] 9.4 Run `pnpm check` or the narrowest available repo validation command after targeted tests pass.
- [x] 9.5 Record any deferred items such as multi-NPC dialogue, TTS/voice preview, and NPC interaction affordances as follow-up tasks or open questions.

Verification note: targeted Vitest suites and narrow TypeScript checks for NPC/shared/entity/webview/dashboard passed. `pnpm check` was run and still fails on the repository's existing knip unused/unlisted dependency/export inventory, unrelated to the NPC test bench files.
