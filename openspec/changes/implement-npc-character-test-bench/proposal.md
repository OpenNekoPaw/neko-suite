## Why

Neko Suite already tracks character identity, asset bindings, visual drafts, relationships, and occurrences, but users cannot validate whether a character works as an AI NPC without contaminating the main creative Agent session. NPC validation needs a project-scoped, isolated conversation loop that tests persona consistency and knowledge boundaries without granting creative authoring tools.

## What Changes

- Add an NPC Character Test Bench launched from `/as @character` and dashboard `test-npc` actions.
- Add explicit runtime `toolPolicy` semantics so NPC sessions can request an empty tool registry without relying on ambiguous `allowedTools: []` behavior.
- Add shared NPC test contracts for launch requests, project-scoped profile sources, profile facts, transcripts, evaluation reports, and user-confirmed suggestions.
- Add deterministic NPC profile assembly from existing project entity facts, bindings, visual drafts, relationships, and occurrences without introducing a persisted `CharacterCard`.
- Add prompt/evaluator projectors for rendering an NPC system prompt and evaluating persona consistency, knowledge leakage, sparse relationship coverage, and suggested fact improvements.
- Add an isolated NPC conversation session kind in the Agent panel with identity header, hidden creative controls, and explicit exit behavior.
- Persist NPC transcript/evaluation artifacts under the current project `.neko/npc-tests/` only when the user chooses to keep validation evidence; do not write NPC dialogue to main Agent history, `.neko/memory.md`, or global memory.
- Add optional sparse-profile enrichment using Story/script evidence and user supplements, with AI-inferred facts remaining suggestions until user confirmation.

## Capabilities

### New Capabilities

- `npc-character-test-bench`: Defines project-scoped NPC profile assembly, isolated NPC conversation sessions, transcript/evaluation artifacts, and suggestion write-back semantics.

### Modified Capabilities

- `agent-runtime-boundaries`: Add explicit SubAgent `toolPolicy` behavior, including `none` producing an empty tool registry for isolated NPC sessions.
- `creative-entity-asset-composition`: Add requirements for confirmed/suggested NPC profile facts, profile projection inputs, and user-confirmed write-back to entity metadata or relationships.
- `dashboard-creative-entity-management`: Add `test-npc` as a delegated creative entity action that launches the Agent-owned NPC test bench without importing Agent internals into Dashboard.

## Impact

- Shared contracts: `packages/neko-types` / `@neko/shared` NPC test DTOs, `DashboardCreativeEntityAction`, command constants, type guards, and artifact contracts.
- Entity runtime: `@neko/entity/projections` deterministic `NpcProfileAssembler` and read-only profile projection tests.
- Agent runtime: SubAgent `toolPolicy` semantics, `npc-character` preset, prompt/evaluator projectors, and NPC evaluator result projection.
- Agent extension: `/as`, `/exit-role`, `neko.agent.testNpc`, `NpcTestBenchController`, project-local `.neko/npc-tests` persistence, and transcript lifecycle.
- Agent webview: NPC conversation kind, identity header, full-profile debug view, hidden creative controls, and NPC exit/report flow.
- Dashboard and feature packages: new `test-npc` action descriptors and command delegation path.
- Tests: contract/type guard tests, tool-policy isolation tests, assembler fixtures, prompt/evaluator snapshot tests, slash/dashboard routing tests, persistence scope tests, and webview state tests.
