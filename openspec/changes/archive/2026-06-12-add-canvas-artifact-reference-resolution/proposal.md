## Why

Canvas nodes, Agent artifacts, entity memory, and media providers all need to pass references to source panels, generated assets, character representations, masks, and keyframes. Today those references are split across node-specific fields, artifact payloads, and provider-specific tool inputs, which makes preview, execution, backfill, and long-form consistency fragile.

This change introduces a common stable reference resolution path so Canvas and Agent can store stable references while Extension Host resolves them into preview projections or provider inputs only at runtime.

## What Changes

- Add a shared `ReferenceDescriptor` contract for stable Canvas / Artifact / Entity / Media references, including source kind, role, modality, confidence, diagnostics, and lineage metadata.
- Add `ReferenceContributorManifest` / `ReferenceContributor` as a typed capability facet so node types, artifact blocks, table profiles, and domain plans can register pure reference collectors.
- Add deterministic adapter/projector helpers that normalize current internal fields such as `referenceImageResourceRef`, `referenceResourceRef`, `referenceImagePath`, `runtimeReferenceImagePath`, Canvas `referenceRefs`, `sourceMediaRefs`, `maskRefs`, and `generatedMediaRefs` into `ReferenceDescriptor`.
- Add severity-aware reference diagnostics and a diagnostic factory that computes severity from `targetCapability`, `purpose`, and `phase`.
- Add host-side resolver contracts for preview projection and provider input materialization, including batch resolution, dry-run/estimate mode, cancellation, partial results, and per-reference diagnostics.
- Integrate the resolver path with Canvas preview/generation references, Agent shot image prep references, and provider input assembly for `GenerateImage`, `TransformImage`, and `GenerateVideo` without persisting runtime handles.
- Update Canvas rendering metadata to show lightweight multi-node reference summaries while keeping provider execution behind approval and host-side resolution.

## Capabilities

### New Capabilities

- `canvas-artifact-reference-resolution`: Defines stable reference descriptors, contributor registration, adapter projection, host-side resolution, diagnostics, batch behavior, and provider input injection for Canvas nodes and Agent artifacts.

### Modified Capabilities

None. Existing Canvas, artifact, media generation, and entity capabilities will integrate with the new reference-resolution capability through adapters and typed facets, but their standalone requirements are not changed by this proposal.

## Impact

- `packages/neko-types`: shared reference descriptor, contributor manifest, diagnostics, validators, adapter/projector helpers, and tests.
- `packages/neko-agent`: contributor registration for artifacts and shot image prep plans; runtime use of resolved provider input bundles.
- `packages/neko-canvas`: contributor registration for Canvas nodes; preview summary projection; bridge from current `referenceRefs` and reference resource fields.
- `packages/neko-cut`: consumption of resolved keyframe/video reference descriptors for handoff readiness.
- Extension Host packages: resolver/materializer implementation for Webview preview URI and provider input bundles.
- Media provider adapters: provider input assembly from resolved references, with diagnostics instead of persisted runtime handles.
- Documentation: keep `adr-canvas-artifact-reference-resolution.md` as the architecture source and link implementation behavior from related ADRs.
