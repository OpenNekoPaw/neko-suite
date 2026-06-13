## Why

The current cleanup ADR still treats many `legacy`, `fallback`, and `deprecated` surfaces as if Neko Suite already had a public compatibility contract. The project has not launched a compatibility-sensitive service yet, so keeping old schema, old message, and old adapter paths in runtime code creates unnecessary branching and hides real architecture debt behind broad fallback logic.

This change establishes a prelaunch cleanup policy: old formats and old protocol surfaces are not preserved by default; runtime code should accept one canonical model, while only current feature dependencies and real runtime resilience paths may remain.

## What Changes

- **BREAKING**: Remove or migrate prelaunch-only legacy schema fields, old message fields, deprecated re-export modules, compatibility shims, and unused webview helper surfaces when no current caller or fixture requires them.
- **BREAKING**: Stop treating old `.nk*`, agent message, config, canvas, asset, market, and skill metadata shapes as automatically protected compatibility contracts unless an explicit current consumer is documented.
- Classify `legacy`, `fallback`, and `deprecated` hits by semantics instead of raw search count:
  - delete-now dead code and unused shims,
  - migrate-now deprecated API surfaces,
  - current-runtime dependency bridges,
  - true runtime fallback/resilience,
  - test-only terminology,
  - false-positive status labels or domain enum values.
- Update `adr-code-debt-cleanup-strategy.md` so its numbers, examples, and cleanup phases use current-code scans and the prelaunch no-backcompat assumption.
- Extend the machine-readable cleanup register so all remaining legacy/deprecated surfaces have owner, replacement, remove condition, tests, and a reason grounded in current functionality rather than hypothetical external compatibility.
- Remove the remaining Agent Webview re-export shims (`message-helpers.ts`, `media-extractors.ts`, `tool-constants.ts`) after proving there are no imports.
- Split fallback handling into two allowed categories:
  - runtime resilience for provider/network/GPU/model/file availability failures,
  - canonicalization at a single boundary when current data still enters through multiple sources.
- Reject new scattered `legacyField ?? fallbackField` style runtime branching for old formats; callers must either migrate input at a boundary or delete the old path.

## Capabilities

### New Capabilities

- `prelaunch-legacy-surface-cleanup`: Defines the prelaunch cleanup policy, classification rules, guardrails, and validation gates for legacy, fallback, deprecated, and compatibility surfaces across TypeScript packages.

### Modified Capabilities

- `agent-runtime-boundaries`: Strengthen Agent Webview/Extension/Runtime boundaries so prelaunch deprecated fields, Webview helper shims, and compatibility projections cannot remain unless they are current runtime dependencies with explicit sunset metadata.

## Impact

- Documentation and governance:
  - `docs/architecture/adr-code-debt-cleanup-strategy.md`
  - `docs/architecture/agent-code-debt-lcd-register.json`
  - OpenSpec cleanup governance specs and tasks
- Static analysis and guards:
  - `knip.config.ts`
  - `scripts/check-neko-agent-boundaries.mjs`
  - potential new or extended cleanup scan scripts for `legacy` / `fallback` / `deprecated`
- Agent cleanup candidates:
  - `packages/neko-agent/packages/webview/src/utils/message-helpers.ts`
  - `packages/neko-agent/packages/webview/src/components/ChatView/ToolCallDisplay/media-extractors.ts`
  - `packages/neko-agent/packages/webview/src/components/ChatView/ToolCallDisplay/tool-constants.ts`
  - deprecated agent message and platform type surfaces after caller migration
- Cross-package cleanup candidates:
  - old schema migrators and fixtures that only protect prelaunch formats
  - UI compatibility exports such as legacy shared components
  - config/canvas/asset/market compatibility normalizers that only serve old unpublished shapes
- Current functionality that should remain protected:
  - AI SDK provider bridges still needed by fal.ai, DashScope, and Kling until native/configured paths pass tests
  - runtime resilience fallback for provider, network, GPU, model, media, and file availability failures
  - domain enum values named `deprecated` when they represent a current product state rather than compatibility code
