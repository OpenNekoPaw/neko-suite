## Context

`adr-unified-entity-memory-semantic-index.md` establishes that Agent should perceive semantic cache coverage and orchestrate incremental analysis, but must not own cache storage, invalidation, index manifests, or confirmed fact writes. Existing `project-cache-search-service` already owns neutral project search orchestration and optional semantic/RAG provider boundaries. Existing skill-driven media workflow specs require tools and structured artifacts rather than hardcoded workflow routes.

The missing implementation boundary is a host-mediated semantic coverage facade. Long comic/document/video workflows need to ask: "for this stable source and range, which semantic evidence is fresh, stale, missing, partial, or failed?" Without that DTO, Agent integration will either repeat analysis or be tempted to inspect `.neko/.cache` / `.neko/semantic-index` internals.

Five-layer analysis:

- **Responsibilities**: `@neko/shared` owns DTOs and guards; `neko-search` or an equivalent neutral host service owns coverage aggregation and freshness; domain providers own evidence interpretation; Agent owns planning and contribution submission; Dashboard/Entity own review and confirmation.
- **Dependencies**: consumers depend on shared DTOs and host commands/adapters, not on cache files or provider internals. `neko-search/core` remains free of Agent, Dashboard, React, and concrete VSCode-only modules.
- **Interfaces**: the facade accepts stable source refs, optional range, analysis kind, and optional provider/skill/schema hints; it returns coverage, freshness, matched ranges, stale reasons, diagnostics, and provider metadata.
- **Extension**: providers can add new analysis kinds or sidecar projections through registry capabilities without changing Agent workflow code.
- **Tests**: shared guard tests cover DTO validity; core tests cover coverage merge/freshness; host boundary tests prevent cache schema reads; Agent tests prove long-range workflows query coverage before re-analysis.

## Goals / Non-Goals

**Goals:**

- Define and implement a shared semantic coverage DTO contract.
- Expose coverage through a neutral host-mediated facade, preferably via `neko-search` host integration.
- Let Agent and media skills reuse fresh semantic evidence and analyze only missing/stale ranges.
- Keep semantic sidecar facts separate from rebuildable search/FTS/vector/RAG cache projections.
- Ensure semantic sidecar, character memory, entity binding, and project fact projections converge through one project index coordinator boundary.

**Non-Goals:**

- Implement OCR, ASR, embeddings, VLM perception, or RAG generation.
- Confirm entities or accepted character memory automatically.
- Replace `ReadDocument`, `ReadImage`, storyboard generation, or entity review flows.
- Store prompt text, LLM context, Webview URIs, scratch paths, base64, or provider runtime handles as semantic cache entries.
- Build a new deterministic media workflow router; workflow ordering remains skill/prompt-chain guidance plus tool execution.

## Decisions

### 1. Coverage DTOs Live In `@neko/shared`

`SemanticCoverageQuery`, `SemanticCoverageResult`, coverage values, stale reason codes, analysis kinds, and validation guards belong in `packages/neko-types` / `@neko/shared`.

Rationale: consumers span Agent, search, Dashboard, and future providers. The DTO must not be owned by Agent or by a cache implementation package.

Alternatives considered:

- **Agent-local DTO**: rejected because it would make Agent the de facto owner of coverage semantics.
- **neko-search-only DTO**: rejected for cross-package contracts because shared guards are already the repository pattern for host-mediated DTOs.

### 2. `neko-search` Hosts The Initial Facade

The initial runtime surface should be a neutral project search host command/adapter, for example `neko.projectSearch.querySemanticCoverage` or an equivalent method exposed through `@neko/search/host-vscode`.

Rationale: `project-cache-search-service` already owns project resolution, freshness metadata, provider fan-out, boundary tests, and optional semantic provider capability.

Alternatives considered:

- **New `neko-semantic-cache` package immediately**: deferred until coverage logic outgrows project search. The DTO should not prevent that extraction.
- **Agent extension bridge owns it**: rejected because Agent would become cache coordinator and risk reading sidecar/cache schemas.

### 3. Coverage Aggregates Facts, Not Cache Internals

The facade answers from semantic sidecars, character evidence ledgers, entity bindings, project facts, and provider status. SQLite/FTS/vector/RAG rows are acceleration only.

Rationale: deleting `.neko/.cache` must not erase semantic evidence. Coverage results must preserve source refs and freshness rather than exposing local cache paths.

Alternatives considered:

- **Answer directly from vector/FTS stores**: allowed only as an optimization when rows can be traced back to sidecar/fact identities.

### 4. Agent Consumes Coverage Before Range Analysis

Agent workflows should query coverage before analyzing long document/comic/video/audio ranges. Fresh matched ranges are used as context; missing/stale ranges are analyzed; partial/failed coverage produces diagnostics and fallback guidance.

Rationale: this closes the repeated-analysis problem while preserving prompt-first / skill-first design. The skill says when to query and how to reason; tools/services execute the operation.

Alternatives considered:

- **Always reanalyze all pages**: wasteful and causes duplicate entity candidates.
- **Persist Agent context as cache**: rejected because it is not source-located, versioned, or reviewable.

### 5. One Projection Coordinator Boundary

Semantic sidecar, CharacterEvidenceLedger, entity binding, asset facts, and generated index projections should refresh through one project index coordinator boundary or equivalent neutral host service.

Rationale: multiple package-local watcher/indexer pipelines would produce inconsistent freshness and duplicate cache writes.

Alternatives considered:

- **Each domain package writes its own SQLite/FTS/vector projection**: rejected because consumers could see contradictory freshness and cache schemas.

## Risks / Trade-offs

- **Facade API too thin** -> Agent creates workarounds. Mitigation: deliver DTO schema and tests before Agent integration.
- **Coverage matching becomes expensive** -> keep project-open work lightweight; heavy OCR/embedding/perception runs only on idle/import/on-demand/manual refresh.
- **Freshness semantics drift by provider** -> centralize freshness values, stale reason codes, and provider metadata in shared contracts.
- **Partial coverage is hard to explain** -> return matched ranges and diagnostics so Agent can show clear summaries and only analyze gaps.
- **Future package extraction** -> keep the DTO host-mediated and neutral so `neko-search` can later delegate to `neko-semantic-cache` without changing Agent.

## Migration Plan

1. Add shared semantic coverage DTOs, guards, and tests.
2. Add `neko-search` core interfaces and fake provider tests for coverage aggregation.
3. Add VSCode host command/adapter and boundary tests preventing Agent/Webview cache-file reads.
4. Add Agent host bridge/tool adapter that calls the facade and returns structured diagnostics.
5. Update relevant media skills to instruct coverage query before long-range analysis.
6. Add focused Agent workflow tests proving fresh ranges are reused and missing/stale ranges are analyzed.

Rollback is straightforward: keep DTOs and host command inert, and let Agent workflows continue current full analysis behavior. No fact migration is required for the initial facade.

## Open Questions

- Should the public command name be `neko.projectSearch.querySemanticCoverage` or a shorter `neko.semanticCoverage.query` alias?
- Which sidecar filename/layout should be canonical for large multi-document semantic indexes?
- When coverage has stale but usable evidence, should Agent default to weak-context reuse or immediate re-analysis? This may become policy/skill-specific.
