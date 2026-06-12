## Why

Comic-to-animation can produce storyboard tables and entity memory contributions in the same Agent turn, but Canvas currently imports storyboard scene/shot nodes without a stable inline entity reference loop. Candidate confirmation can fail to update Canvas shots when import and entity processing race or when multiple characters share a name.

## What Changes

- Add inline entity reference support for Canvas shot characters through `entityRef` and optional `candidateId`.
- Add StoryboardDeliveryService ordering: process entity contributions, inject `entityRef` / `candidateId` into payload, then import storyboard, with explicit timeout diagnostics.
- Add stable decision-to-shot-character mapping requirements so name matching is only a fallback.
- Add Canvas Extension Host entity message routing for Hover Card, confirm, and Inspector actions.
- Enhance shot character rows and Hover Card with confirmed/candidate/unlinked states without projecting entity subgraphs into Canvas.
- Add confirm-event backfill from `CreativeEntityChangeEvent.changedRefs[]` to shot characters.

## Capabilities

### New Capabilities

- `canvas-shot-entity-inline-reference`: Defines storyboard-to-canvas inline entity references, candidateId mapping, Canvas entity message routes, shot character state rendering, and confirm backfill behavior.

### Modified Capabilities

None.

## Impact

- `packages/neko-types`: add `ShotCharacter.candidateId` and payload/projection support.
- `packages/neko-agent`: add StoryboardDeliveryService/post-processor ordering and mapping.
- `packages/neko-canvas`: add Extension Host entity message routes, shot row display, Hover Card, and event backfill.
- `packages/neko-entity`: facade commands and event bus are consumed but not owned by this change.
- Tests cover projection, delivery ordering, ambiguous mapping diagnostics, route validation, rendering states, and confirm backfill.
