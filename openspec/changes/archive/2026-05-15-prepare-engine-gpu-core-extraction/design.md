## Context

`engine-kernel/src/gpu` is still roughly 27K lines. It contains reusable GPU infrastructure and domain-specific renderers in one module tree. The previous changes removed direct `gpu -> services` and `domain -> gpu` dependencies, but simply moving the whole `gpu` tree into `engine-gpu` would preserve the same mixed responsibilities at crate level.

This change prepares the extraction by classifying GPU modules, tightening imports, and documenting allowed boundaries. It does not create a new crate.

## Goals / Non-Goals

**Goals:**

- Classify GPU modules into core/resource/HAL, pipeline/effects, budget, and renderer companion groups.
- Make extraction-ready GPU modules independent from export, preview, services, domain, and renderer companion internals.
- Create a compatibility module shape that can later re-export from `engine-gpu`.
- Add architecture guardrails for extraction-ready groups and documented exceptions.
- Preserve zero-copy GPU handle paths and all renderer behavior.

**Non-Goals:**

- Do not create `engine-gpu`.
- Do not move files across crates.
- Do not extract scene, puppet, or panoramic renderer companion crates.
- Do not redesign GPU algorithms, shaders, or resource lifetime semantics.
- Do not change host/API protocols.

## Decisions

### Decision 1: Classify before moving

Create explicit group documentation and guardrails:

- Core/resource/HAL: context, texture, buffer pool, readback target, platform import/export, encoder bridge.
- Pipeline/effects: compositor, texture compositor, style/effect processors, transition processors, blur, mask, LUT, shaders.
- Budget: GPU budget controller and queue policy.
- Renderer companions: scene renderer, puppet renderer, panoramic renderer.

**Rationale:** Clear grouping prevents `engine-gpu` from becoming a large mixed crate.

**Alternative considered:** Move the entire `gpu` module at once. Rejected because renderer dependencies and preview/export coupling would move with it.

### Decision 2: Renderer companions are not GPU core

Scene, puppet, and panoramic renderers remain kernel-owned for this preparation. They can depend on extraction-ready GPU APIs but should not be required by core GPU modules.

**Rationale:** Renderers are domain-specific and should later become companion crates.

### Decision 3: Guard dependencies by group

Architecture tests should fail if extraction-ready GPU modules import services, export, preview, domain, or renderer companion internals. Renderer modules may have documented dependencies until companion extraction.

**Rationale:** The preparation is only useful if it gives a clean future crate boundary.

### Decision 4: Preserve compatibility names

Public names currently used by kernel and host should remain available under `engine-kernel::gpu::*` after preparation. Internal grouping can change, but external import churn should wait for actual extraction or facade narrowing.

**Rationale:** This keeps the change focused and lowers risk.

## Risks / Trade-offs

- **Guardrails may be too strict** -> Start with extraction-ready subtrees and explicit allowlists for renderer companion modules.
- **Module classification may reveal hidden coupling** -> Record blockers in tasks and split adapters instead of forcing a bad boundary.
- **No immediate line-count reduction** -> This is intentional; the payoff arrives in `extract-engine-gpu-core`.
- **Zero-copy resource lifetime is subtle** -> Do not alter handle ownership semantics; add tests around existing output shape and unsupported capability behavior.

## Migration Plan

1. Add GPU boundary documentation in code comments or architecture tests.
2. Normalize imports inside extraction-ready GPU modules.
3. Introduce internal prelude/adapter modules only where they reduce future move churn.
4. Add architecture checks for extraction-ready groups.
5. Run GPU, export, preview, sink, and full kernel tests.

Rollback: remove the new guardrails/adapters and restore previous imports. No runtime behavior changes are intended.

## Open Questions

- Should `gpu/budget.rs` move with GPU core or remain kernel-owned until service scheduling boundaries are narrower?
- Should shader modules move with pipeline/effects in the first GPU extraction, or stay kernel-owned until renderer companions move?
- Which platform interop types need pure DTO mirrors in `engine-types` before extraction?
