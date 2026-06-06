## Context

Neko Suite already has the raw ingredients for character validation: project entity identity in `characters.json` / `neko/entities/*`, asset bindings, visual identity drafts, relationship and occurrence projections, Dashboard creative entity actions, Agent slash commands, and SubAgent infrastructure. The missing product surface is a way to test a character as an AI NPC without turning the main creative Agent into that character.

NPC testing is a different application scenario from creative authoring. A creative Agent edits project state through tools; an NPC test session evaluates whether a project character can hold a believable conversation from a bounded profile. Tool access is therefore Runtime / Policy, not character capability. The ADR for NPC Character Test Bench anchors this change around `toolPolicy: { kind: 'none' }`, project-scoped context, and evaluator-backed validation.

Five-layer analysis:

- Responsibilities: `@neko/shared` owns DTO contracts; `@neko/entity/projections` assembles deterministic profile data; `@neko/agent` owns prompt/evaluator projection and runtime presets; `@neko-agent/extension` orchestrates commands, session lifecycle, and persistence; Webview renders NPC conversation state.
- Dependencies: Entity projection depends on shared entity contracts and injected stores/providers, not Agent or LLMs. Agent consumes `NpcProfileSource` and does not read entity stores directly. Dashboard delegates through source actions or VSCode commands.
- Interfaces: Launch, profile, transcript, evaluation, suggestion, and tool-policy contracts are explicit and type-guarded. NPC conversation APIs are multi-turn session APIs, not one-shot SubAgent task result APIs.
- Extension: The initial feature supports one NPC at a time per launch; multi-NPC dialogue, voice playback, and game-world affordances can be added without changing entity fact ownership.
- Testing: Contract tests cover DTO guards; runtime tests prove `toolPolicy: none` creates an empty tool registry; assembler/projector tests use project fixtures; webview tests cover NPC-only controls and session routing.

## Goals / Non-Goals

**Goals:**

- Launch `/as @entity` and dashboard `test-npc` into an isolated NPC conversation session.
- Keep NPC profile data project-scoped and assembled from existing entity facts without introducing a persisted `CharacterCard`.
- Add explicit `toolPolicy` semantics so conversation-only NPC sessions never receive creative authoring tools.
- Support thin-profile handling through skip/ask/auto enrichment while keeping AI-inferred facts as suggestions.
- Persist optional transcript/evaluation artifacts under the current project `.neko/npc-tests/`.
- Return evaluation reports and user-confirmed suggestions into the entity editing loop.
- Keep Dashboard, Story, Canvas, Assets, and Agent package boundaries intact.

**Non-Goals:**

- Building production game AI, long-term NPC memory, or runtime game-world simulation.
- Enabling NPC sessions to edit timelines, generate media, write files, or mutate entity facts directly.
- Persisting NPC transcripts into main Agent conversation history, `.neko/memory.md`, global memory, or standard conversation records.
- Implementing multi-NPC dialogue in the first release.
- Implementing TTS/voice playback or animation/emote affordances in the first release.
- Migrating all character metadata into a new entity schema beyond additive metadata/suggestion contracts.

## Decisions

### 1. Add explicit `toolPolicy`

SubAgent config will gain an explicit tool policy:

```ts
type AgentToolPolicy =
  | { readonly kind: 'none' }
  | { readonly kind: 'all' }
  | { readonly kind: 'allow-list'; readonly tools: readonly string[] };
```

`none` means the created Agent config receives an empty tool registry. `all` preserves unfiltered behavior. `allow-list` filters by registered tool name. Existing `allowedTools` compatibility can remain during migration, but NPC code must use `toolPolicy: { kind: 'none' }`.

Alternative considered: encode no-tool NPC as `allowedTools: []`. Rejected because current worker-agent tooling can interpret an empty allow list as "no filtering", which is unsafe for NPC validation.

### 2. Model NPC as an interactive session, not a one-shot task

The first implementation should introduce an NPC conversation lifecycle API on top of or beside SubAgent infrastructure:

```ts
interface NpcConversationSession {
  readonly id: string;
  readonly entityRef: CreativeEntityRef;
  readonly profileSnapshot: NpcProfileSource;
  sendUserMessage(message: string): Promise<NpcConversationTurn>;
  getTranscript(): readonly NpcTranscriptMessage[];
  dispose(): Promise<void>;
}
```

The existing `SubAgentManager.spawn()/getResult()` task model can provide model execution and event plumbing, but the user-facing NPC test needs repeated user turns, tab state, transcript extraction, and deterministic disposal.

Alternative considered: spawn a new SubAgent per user message. Rejected because it loses conversation continuity or forces manual transcript re-injection on every turn.

### 3. Keep NPC profile as a projection

`NpcProfileAssembler` returns `NpcProfileSource` from current project facts. It reads confirmed facts, suggested facts, source provenance, sparse profile metrics, and optional user supplements. The system does not persist a `CharacterCard`; prompt text and profile snapshots are derived artifacts.

Confirmed character facts remain in project entity facts. Profile snapshots may be stored inside `.neko/npc-tests/*.json` for evaluation reproducibility, but they are test evidence and must not become a second source of truth.

Alternative considered: persist a separate character card file. Rejected because it duplicates entity, asset, visual, relationship, and occurrence data and invites drift.

### 4. Keep NPC context project-scoped

NPC profile assembly, active NPC session memory, transcripts, and evaluations follow the current workspace/project. Global storage is limited to user preferences or explicitly installed reusable identity/character packs. Global memory must not inject character facts into NPC prompts.

Default transcript save policy should be `ask` or project-configurable. If saved, artifacts go to `.neko/npc-tests/{entityId}-{timestamp}.json` with `version`, `entityRef`, `profileSnapshot`, `transcript`, `evaluation`, `createdAt`, and optional `profileHash`.

Alternative considered: store NPC test history globally for convenience. Rejected because character facts are project-specific and global memory would create privacy, contamination, and reproducibility risks.

### 5. Split deterministic assembly from AI enrichment

Phase 1 deterministic assembly runs without LLM calls and reads only project facts and provider projections. Phase 2 enrichment is optional and runs in the main Agent before NPC launch. It may extract dialogue samples from Story/script context or infer speech patterns, but generated facts have `authority: 'suggested'` and require user confirmation before write-back.

Alternative considered: always run enrichment. Rejected because thin-profile quick testing should be fast and because LLM-inferred facts must not silently become entity truth.

### 6. Route Dashboard through source actions and commands

Dashboard adds `test-npc` as a shared action descriptor. Webview emits a typed action request; the owning source or Dashboard extension delegates to `neko.agent.testNpc` with an `NpcTestBenchLaunchRequest`. Dashboard does not import Agent internals and does not assemble NPC profiles.

Alternative considered: Dashboard imports Agent APIs directly. Rejected because it breaks package boundaries and webview/extension separation.

### 7. Evaluation produces suggestions, not mutations

On exit, the controller can evaluate transcript plus profile snapshot and produce `NpcEvaluationReport`. Suggested fixes use a dedicated `NpcEvaluationSuggestion` / entity fact suggestion contract. Applying a suggestion requires explicit user action and routes through `CreativeEntityService.updateMetadata()` or relationship update commands.

Alternative considered: automatically write inferred personality, speech pattern, or knowledge facts after a good test. Rejected because tests can contain user improvisation and model confabulation.

## Risks / Trade-offs

- Existing SubAgent code may treat empty allow lists as allow-all -> add PR0 `toolPolicy` tests before NPC launch work.
- Interactive NPC sessions may not fit the current one-shot SubAgent result model -> introduce a narrow NPC conversation session facade and keep implementation behind `NpcTestBenchController`.
- Sparse profiles may produce believable but invented behavior -> label profile sparsity, offer enrichment, and evaluate knowledge leakage.
- Transcript artifacts may contain private dialogue -> project-local `.neko/npc-tests` is gitignored by default and save policy should be configurable.
- Entity facts may be updated from weak AI suggestions -> require user confirmation and preserve provenance/authority.
- Dashboard and Agent routing may race focus/session creation -> controller should return a launch result and Webview should wait for NPC session projection before switching tabs.
- Profile assembly can become tightly coupled to Story/Assets internals -> use entity/provider ports and keep implementation in `@neko/entity/projections` with injected readers.

## Migration Plan

1. Add `AgentToolPolicy` contract, SubAgent filtering behavior, compatibility mapping from existing `allowedTools`, and tests proving `none` creates zero tools.
2. Add shared NPC contracts and type guards in `@neko/shared`.
3. Add deterministic `NpcProfileAssembler` in `@neko/entity/projections` using injected entity, binding, draft, relationship, occurrence, and optional metadata readers.
4. Add NPC prompt/evaluator projectors and `npc-character` preset in `@neko/agent`.
5. Add `NpcTestBenchController`, `/as`, `/exit-role`, and `neko.agent.testNpc` orchestration in the Agent extension.
6. Add NPC conversation kind and Webview rendering, including hidden creative controls and identity/profile inspection.
7. Add Dashboard `test-npc` action descriptor and command delegation.
8. Add optional enrichment, transcript persistence, evaluation report generation, and suggestion apply flow.

Rollback is additive: keep `toolPolicy` support, disable `/as` and `test-npc` command registration, and leave existing Agent/Dashboard/entity workflows unaffected.

## Open Questions

- Should transcript saving default to `ask`, `always`, or `never` for local single-user projects?
- Should NPC session model tier be fixed by preset or user-overridable per launch?
- Should `/exit` act as `/exit-role` while an NPC tab is active, or should `/exit-role` remain the only explicit role-exit command?
- Should dialogue sample extraction use Story's script index only in Phase 2, or should it also read document/canvas occurrences when available?
