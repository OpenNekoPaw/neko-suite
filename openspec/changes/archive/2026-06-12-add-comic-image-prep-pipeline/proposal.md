## Why

Comic-to-animation currently has storyboard semantics and `imageStrategy` routing, but it does not yet have a reviewable image-preparation layer for panel crop, text removal, colorization, inpaint/outpaint, reference binding, cost approval, and generated keyframe backfill.

Without this layer, the workflow either overuses `StoryboardTable` as a catch-all JSON structure or routes directly from Agent text to generation/edit tools without enough user review, cost control, or character/scene continuity context.

## What Changes

- Add a `ShotImagePrepPlan` contract that sits between `StoryboardTable` and image generation/edit capability execution.
- Add `ShotReferenceBundle` with character, scene, style, previous-shot, source-panel, and perception-card references using stable refs and `CreativeEntityRef`.
- Add a `comic-shot-asset-prep` `GenericTable` profile for reviewing image-prep plans without expanding `StoryboardTable`.
- Keep `GenerateImage` and `TransformImage` distinct at the protocol/capability layer, while allowing the execution layer to map both to a shared media backend when appropriate.
- Add approval, cost-estimation, batch execution, retry, cancellation, and per-shot backfill requirements for image-prep execution.
- Add Canvas review requirements for source/generated refs, masks, reference bundles, prompts, diagnostics, and before/after inspection.
- Update storyboard image-strategy behavior so source-backed generation or transformation can produce reviewable prep plans before executing provider calls.
- Clarify that Skill content may guide comic-to-animation strategy and prompt shape, but runtime contracts, validation, provider execution, approval gates, and persistent entity/memory writes remain code/registry responsibilities.

No breaking changes are intended. Existing storyboard generation and projection remain valid; the new prep plan is an optional intermediate contract used when comic-to-animation image preparation is requested.

## Capabilities

### New Capabilities

- `comic-image-prep-pipeline`: Defines shot image-preparation plans, reference bundles, prep table profile, approval/cost/batch execution, TransformImage facade semantics, and Canvas/Cut handoff for comic-to-animation keyframe preparation.

### Modified Capabilities

- `agent-storyboard-table-contract`: Add requirements that storyboard `imageStrategy` can project into reviewable shot image-prep plans and that generation/transform execution preserves prep-plan lineage and stable media refs.

## Impact

- Shared contracts in `packages/neko-types/src/types/` for shot image-prep plans, operations, reference bundles, cost estimates, batch requests, statuses, and diagnostics.
- Composite artifact/profile validation for `comic-shot-asset-prep` tables and profile-aware action gating.
- Agent runtime helpers that derive image-prep plans from validated storyboard shots and route approved plans through available capabilities.
- Platform/media capability registration for a `TransformImage` facade that can map to provider edit/inpaint/outpaint/image-to-image fields.
- Canvas rendering and property panels for shot image-prep details, before/after refs, prompts, masks, reference bundles, and execution diagnostics.
- Cut/projector handoff that consumes approved generated keyframes and video prompts rather than re-parsing source comics.
- Skill prompt updates for comic-to-animation guidance, limited to output tendencies and field-filling guidance.
- Tests for shared validators, strategy-to-plan derivation, profile validation, approval/cost/batch behavior, provider unavailable degradation, and Canvas rendering.
