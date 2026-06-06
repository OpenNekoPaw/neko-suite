## 1. Runtime Contracts

- [x] 1.1 Add `character-evidence.ts` under `packages/neko-agent/packages/agent/src/runtime` with `CharacterEvidenceLoader`, request, bundle, chunk, source-ref, omission, budget, and relevance types.
- [x] 1.2 Export the new evidence contracts from Agent runtime and package index surfaces used by Extension and Skills.
- [x] 1.3 Add pure helper functions for normalized query tokens, deterministic relevance scoring, source/range dedupe, and budget trimming.
- [x] 1.4 Add runtime unit tests proving helpers are host-agnostic and do not import VSCode/Webview/Extension modules.

## 2. Extension Loader Implementation

- [x] 2.1 Create `packages/neko-agent/packages/extension/src/evidence/characterEvidenceLoader.ts` with injected readers for Dashboard details, project search, Story APIs, and text file reads.
- [x] 2.2 Implement locator collection from Dashboard creative entity detail, entity occurrence projections, Story `ScriptIndex`, and optional `ProjectSearchItem` results.
- [x] 2.3 Implement project-local path parsing and validation for supported character evidence source files.
- [x] 2.4 Implement bounded script/scene text loading with line ranges, source refs, freshness, and omission metadata.
- [x] 2.5 Implement duplicate source/range/text detection across Dashboard, entity, Story, and search locators.

## 3. Role Controller Integration

- [x] 3.1 Add a `createEvidenceLoader` or `loadEvidence` dependency port to Character Dialogue and Embody Character controllers.
- [x] 3.2 Replace launch-time script context snippet loading in Character Dialogue with Character Evidence Loader bundles while preserving safe fallback behavior.
- [x] 3.3 Load turn-scoped evidence before Character Dialogue responder invocation and render it as a bounded evidence section.
- [x] 3.4 Load turn-scoped evidence before Embody Character feedback responder invocation and render it into the feedback prompt.
- [x] 3.5 Ensure loaded evidence is not appended to ordinary Agent conversation history, global memory, `.neko/memory.md`, or standard creative chat records.

## 4. Skill Primitive Integration

- [x] 4.1 Expose Character Evidence Loader through character role Skill primitive ports.
- [x] 4.2 Update `character-validation` Skill guidance or integration to use the loader for project-scoped evidence collection.
- [x] 4.3 Update `character-improvement` Skill guidance or integration to use the loader for evidence-backed suggestions.
- [x] 4.4 Verify Skill usage does not grant evidence/file/search tools to a live Character Dialogue responder.

## 5. Tests And Safety Gates

- [x] 5.1 Add extension tests for loading late-scene evidence when a character has more than six occurrences.
- [x] 5.2 Add extension tests for absolute path, parent-directory escape, unsupported extension, missing file, and stale/unavailable source omissions.
- [x] 5.3 Add controller tests proving Character Dialogue and Embody Character request turn-scoped evidence and keep `toolPolicy: { kind: 'none' }`.
- [x] 5.4 Add tests for budget trimming, deterministic ordering, and duplicate evidence dedupe.
- [x] 5.5 Add tests proving ordinary Agent conversation state is not polluted by loaded role evidence.

## 6. Documentation And Verification

- [x] 6.1 Update the character role ADR/OpenSpec notes to describe Agent-owned dynamic evidence loading and entity/search locator boundaries.
- [x] 6.2 Run targeted Agent runtime tests for `character-evidence` helpers and role sessions.
- [x] 6.3 Run targeted Extension tests for Character Dialogue, Embody Character, and `characterEvidenceLoader`.
- [x] 6.4 Run `cd packages/neko-agent && pnpm run compile:extension`.
- [x] 6.5 Run or document the narrowest available TypeScript validation; record unrelated existing type failures separately if full package checks remain red.
