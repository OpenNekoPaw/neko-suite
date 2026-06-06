## Context

Character role workflows now have three distinct interaction patterns:

```text
Character Dialogue: Agent plays the character; user tests it.
Embody Character:   User plays the character; Agent gives read-only feedback.
Validation Skill:   one Agent plays the character while another probes it.
```

The current implementation assembles a character profile and hydrates script context during launch. That fixed the immediate "only first script snippets are known" problem, but it still treats evidence as mostly static launch context. Long scripts and late-scene questions need a more selective per-turn loader.

Existing project search already provides `ProjectSearchItem` results for mention, picker, and navigation. It does not own evidence text. Existing entity and Dashboard sources provide entity rows, detail projections, relationships, and occurrences. Story indexes provide script symbol locations and scene line ranges. The loader must compose these sources without moving runtime prompt policy into `neko-entity` or giving role responders file/search tools.

Five-layer analysis:

- Responsibilities: `neko-entity` owns entity/profile/occurrence projections; `neko-search` owns project search item orchestration; `@neko/agent/runtime` owns evidence request/bundle contracts and pure ranking/budget helpers; Agent Extension owns VSCode, Dashboard, Story, and file-reading adapters; role controllers own when evidence is requested and injected.
- Dependencies: runtime contracts must not import VSCode; Webview must not read files or enforce evidence policy; Extension may use VSCode commands and workspace file APIs; role LLM responders continue to receive no tools.
- Interfaces: introduce `CharacterEvidenceLoader` and `CharacterEvidenceBundle` as Agent-owned contracts. Keep `ProjectSearchItem` as a locator input, not the evidence payload.
- Extension: future evidence sources can register behind loader readers without changing Webview messages or role session projections.
- Testing: pure runtime tests cover ranking/budget behavior; extension tests cover Dashboard/Story/file integration and path safety; controller tests cover turn injection and context isolation.

## Goals / Non-Goals

**Goals:**

- Load relevant, bounded character evidence at launch and before role-session turns.
- Keep Character Dialogue and Embody Character isolated from ordinary Agent history and creative capabilities.
- Reuse entity/search/story indexes as location and scope inputs without changing their ownership.
- Support long scripts and late-scene knowledge through scene/chunk selection instead of fixed first-N snippets.
- Preserve path safety, project scoping, and knowledge-boundary metadata.
- Make validation and improvement Skills able to reuse the same evidence loader primitives.

**Non-Goals:**

- Moving Character Evidence Loader into `neko-entity`.
- Changing `ProjectSearchItem` into a prompt evidence DTO.
- Giving roleplay or feedback LLM responders read-file, project-search, skill activation, or creative authoring tools.
- Implementing semantic vector search as a required dependency.
- Mutating entity facts or script files based on loaded evidence.
- Rewriting historical `.neko/npc-tests` or `.neko/character-tests` artifacts.

## Decisions

### 1. Own loader contracts in Agent runtime, concrete IO in Agent Extension

Add host-agnostic contracts and pure helpers under:

```text
packages/neko-agent/packages/agent/src/runtime/character-evidence.ts
```

Add VSCode-backed implementation under:

```text
packages/neko-agent/packages/extension/src/evidence/characterEvidenceLoader.ts
```

The runtime file defines request/bundle/source-ref/ranking/budget types and helper functions. The Extension file uses Dashboard creative entity detail, Story APIs, project search commands, and workspace file reads.

Alternative considered: put the loader in `neko-entity`. Rejected because dynamic evidence loading depends on current user message, transcript, role mode, prompt budget, and model injection policy. Those are Agent runtime concerns, not entity source-of-truth concerns.

### 2. Treat entity search as a locator, not an evidence owner

Project search and entity search can identify:

- selected character refs
- candidate entities
- related entities
- occurrence locations
- script files and navigation metadata

The loader converts those locators into `CharacterEvidenceChunk` records only after applying project scope, source allowlists, and budget policy.

Alternative considered: extend `ProjectSearchItem` with large text snippets. Rejected because project search is shared by UI/picker/mention surfaces and should remain lightweight, cacheable, and domain-neutral.

### 3. Use turn-scoped evidence bundles

The loader accepts:

```ts
interface CharacterEvidenceRequest {
  entityRef: CreativeEntityRef;
  mode: 'character-dialogue' | 'embody-character' | 'character-validation';
  query: string;
  transcript?: readonly NpcTranscriptMessage[];
  projectRoot: string;
  budget: CharacterEvidenceBudget;
}
```

It returns:

```ts
interface CharacterEvidenceBundle {
  entityRef: CreativeEntityRef;
  query: string;
  chunks: readonly CharacterEvidenceChunk[];
  omitted: readonly CharacterEvidenceOmission[];
  freshness: ProjectIndexFreshness;
}
```

Chunks include source refs, line ranges, relevance scores, authority, and a `knowledgeBoundary` hint where available.

Alternative considered: keep launch-only full script injection. Rejected because long scripts can overflow context and dilute relevant evidence.

### 4. Start with deterministic lexical ranking and scene windows

Initial ranking should use deterministic signals:

- selected character occurrence lines
- current user query tokens
- related entity names from profile/relationships
- current transcript recency
- scene membership from Story `ScriptIndex`
- exact name/alias matches
- source freshness and authority

Semantic/vector ranking remains optional future work behind the same loader interface.

Alternative considered: require embeddings immediately. Rejected because the repository already has strong structured story/entity indexes and the first fix should remain local, deterministic, and testable.

### 5. Read only project-local source ranges selected by trusted indexes

The Extension loader may read script text only when all conditions hold:

- source location came from Dashboard detail, entity occurrence projection, Story script index, or project search metadata
- path is project-relative or resolves inside `projectRoot`
- file extension is supported for character evidence
- requested range is bounded by line/window/budget policy

This keeps evidence loading as a host-side read-only capability while role responders keep `toolPolicy: { kind: 'none' }`.

Alternative considered: let the role LLM call read/search tools. Rejected because this breaks Character Dialogue and Embody Character isolation.

### 6. Inject evidence per turn without polluting ordinary Agent context

Character Dialogue and Embody Character controllers request evidence before calling their responders. The evidence bundle is rendered into the role session system prompt or a turn-local evidence section. It must not be appended to ordinary Agent conversation history, global memory, `.neko/memory.md`, or standard creative chat records.

Alternative considered: write loaded evidence into hidden Agent conversation context. Rejected because this caused role/ordinary Agent context contamination in prior workflow iterations.

## Risks / Trade-offs

- Evidence retrieval misses relevant late-scene content -> start with occurrence-file and scene-neighbor fallback, add regression tests for late occurrences and multi-scene questions.
- Prompt context grows too large -> enforce budgets, chunk caps, omission metadata, and deterministic ordering.
- Search freshness is stale -> include freshness in bundles and allow stale evidence only when policy permits.
- Duplicate evidence from Dashboard, entity, and Story sources -> dedupe by source path + line range + normalized text hash.
- Unsaved editor content differs from disk -> prefer Story index/live document APIs when available; fall back to workspace file reads.
- Loader becomes a broad project reader -> keep source allowlists, path guards, and tests for absolute/out-of-project paths.
- More controller complexity -> introduce a narrow loader port and keep ranking helpers pure in runtime.

## Migration Plan

1. Add runtime contracts and pure helpers for character evidence requests, bundles, ranking, dedupe, and budget trimming.
2. Add the Extension `CharacterEvidenceLoader` implementation with injected readers for Dashboard details, project search, Story script indexes, and file text.
3. Replace launch-time script context helper in Character Dialogue with the loader, preserving current behavior as a fallback path.
4. Update Embody Character to request the same evidence bundles and render chunk text in feedback prompts.
5. Expose the loader through character role Skill primitive ports for validation/improvement Skills.
6. Add tests for path safety, budget trimming, dedupe, late-scene loading, stale/fallback behavior, and no-tool role isolation.
7. Update ADR/OpenSpec docs that describe role context loading.

Rollback is branch-level. Do not ship a mixed state where role responders can both receive projected evidence and call general project search/file tools.

## Open Questions

- Whether evidence should refresh before every turn by default or only when the query changes materially.
- Whether validation Skills need a larger budget tier than interactive Character Dialogue and Embody Character.
- Whether future semantic ranking belongs behind `CharacterEvidenceLoader` as an optional provider or in `neko-search` as a general RAG partition.
- Whether source snippets should be saved into transcript artifacts for reproducibility or referenced by source refs only.
