## Why

Agent can already render `storyboard-table` composite blocks and send inferred storyboard payloads to Canvas and Cut, but the current contract is display-first: rows are represented as generic sections, invalid JSON is mostly discarded, and image generation decisions are not modeled as verifiable runtime behavior.

We need to promote storyboard-table output into a schema-first semantic plan so Agent can remain prompt-first while producing storyboard data that is validated, repairable, safely routed through providers, and reliably projected into downstream workspaces.

## What Changes

- Add a shared `StoryboardTableV1` semantic contract with scene rows, shot rows, media refs, image strategy, profile, namespaced extensions, and stable-core required field constants.
- Add storyboard-table validator and normalizer behavior with graded diagnostics: `error`, `warning`, `suggestion`, and `profileHint`.
- Preserve prompt-first / agent-first behavior by keeping creative choices in the LLM output while using runtime validation only as a safety and projection boundary.
- Support legacy `sections` / `mediaRefs` composite storyboard tables during migration by normalizing them into the v1 structure when possible.
- Update storyboard-table rich content assembly and Canvas/Cut projectors to prefer validated `StoryboardTableV1` over inferred section-based projection.
- Add image strategy interpretation for `reuse-original`, `use-as-reference`, `generate-new`, and `transform-original`, including user override and provider availability diagnostics.
- Keep Agent decoupled from subpackage Webviews and private models; generation and transformation actions route through capability/provider contracts and backfill results via stable refs.
- Update skills/prompts so LLM outputs a structured storyboard plan and does not claim images or media have been generated before runtime/provider completion.

## Capabilities

### New Capabilities

- `agent-storyboard-table-contract`: Defines the shared semantic storyboard table plan, validation/normalization rules, image strategy interpretation, and projection/backfill behavior for Agent-generated storyboard tables.

### Modified Capabilities

- `agent-composite-content-blocks`: Storyboard-table composite blocks gain a schema-first semantic data path while preserving legacy section-based rich content rendering during migration.

## Impact

- Affected packages:
  - `packages/neko-types` / `@neko/shared`: new shared storyboard table types, diagnostics, validator/normalizer contracts, and stable-core constants.
  - `packages/neko-agent/packages/agent-types`: composite contract compatibility and possible re-exports/adapters.
  - `packages/neko-agent/packages/agent`: composite extraction, validation/repair orchestration, prompt/skill guidance, strategy runtime, and tests.
  - `packages/neko-agent/packages/webview`: rich content projection, missing capability diagnostics, and Canvas/Cut send-to enablement.
  - `packages/neko-agent/packages/extension`: runtime/provider routing and storyboard-level result backfill integration.
- Affected downstream integrations:
  - Canvas import continues to consume `CanvasStoryboardPayload`.
  - Cut import continues to consume `PluginTransferCutStoryboardPayload`.
  - Tool result backfill remains the source for generated media assets; storyboard refs point to stable tool/asset refs rather than webview URLs.
- No breaking changes are intended for legacy `storyboard-table` composite blocks; legacy blocks remain displayable and are normalized where possible.
