## Context

Comic-to-animation now has several useful building blocks:

- `StoryboardTable` captures shot semantics, media refs, dialogue/voice cues, characters, prompts, and `imageStrategy`.
- `CompositeArtifact` and `GenericTable` can carry reviewable structured artifacts without making every workflow a storyboard table.
- Progressive character memory and unified entity references provide identity and continuity inputs for long-form generation.
- PerceptionCard and media semantic index work provide source evidence for panel detection, OCR, masks, and visual summaries.
- Media generation already has `GenerateImage` fields that can carry reference, mask, control, and edit-like inputs, but `TransformImage` is currently more of a strategy route name than a complete facade capability.

The missing layer is a deterministic, reviewable image-preparation contract between storyboard planning and media generation/edit execution. The system needs to express how each shot image should be prepared, what sources and references are used, what operations are requested, which masks and perception cards support the decision, whether the user approved it, and how provider results backfill into stable media refs.

Five-layer analysis:

| Layer | Design stance |
| ----- | ------------- |
| Responsibilities | Agent derives prep plans and routes approved execution; shared contracts validate; Canvas reviews; Cut consumes prepared keyframes; providers execute. |
| Dependencies | Shared types remain host-agnostic; provider IO and Webview URI resolution stay in Extension Host/provider adapters; Canvas/Cut consume contracts through projectors. |
| Interfaces | `ShotImagePrepPlan`, `ShotReferenceBundle`, `comic-shot-asset-prep` profile, `TransformImage` facade, cost/batch request DTOs. |
| Extension | New operations, provider mappings, reference roles, and profile display hints can register without changing Skill Markdown or Canvas internals. |
| Testing | Unit-test validators/derivation; integration-test provider unavailable/backfill; render-test Canvas panels; task-test batch/cost behavior. |

## Goals / Non-Goals

**Goals:**

- Add a shared `ShotImagePrepPlan` contract with stable refs, operation plans, status, diagnostics, perception card refs, masks, prompts, and outputs.
- Add a `ShotReferenceBundle` that reuses `CreativeEntityRef`, character memory evidence, semantic index refs, and stable media refs.
- Add a `comic-shot-asset-prep` table profile as the review surface for image-prep plans.
- Preserve semantic distinction between `GenerateImage` and `TransformImage`.
- Require approval and cost estimation before expensive batch execution.
- Support controlled batch execution, retry, cancellation, independent per-shot backfill, and execution summaries.
- Render shot image-prep details in Canvas and pass approved generated keyframes to Cut.
- Keep Skill guidance limited to generation tendencies, prompt templates, and field-filling heuristics.

**Non-Goals:**

- Do not implement production OCR, ASR, panel detection, segmentation, inpaint, outpaint, colorization, or embedding providers in this change.
- Do not make `ShotImagePrepPlan` a long-term entity or memory fact source.
- Do not make Skill Markdown dynamically register runtime capabilities or bypass validators.
- Do not require every storyboard flow to use image prep; ordinary storyboard projection remains valid.
- Do not replace existing `GenerateImage` provider infrastructure.

## Decisions

### Decision 1: Add `ShotImagePrepPlan` between storyboard and execution

`StoryboardTable` remains the semantic shot plan. `ShotImagePrepPlan` captures how visual assets for each shot should be prepared before image/video generation:

- source refs;
- image strategy;
- operations such as crop, remove text, inpaint, outpaint, colorize, redraw, generate keyframe;
- masks;
- prompts;
- perception card refs;
- reference bundle;
- status and diagnostics;
- generated output refs.

Alternative considered: add these fields directly to `StoryboardShotRow`. Rejected because that would turn `StoryboardTable` back into a workflow-specific catch-all table and make non-comic storyboard workflows carry irrelevant image-prep state.

### Decision 2: Use `GenericTable(profile="comic-shot-asset-prep")` as the review projection

The persisted plan remains `ShotImagePrepPlan`; the table is a profile-driven view for Agent Webview and Canvas review. The profile projects plan status rather than maintaining separate approval state.

Alternative considered: define a bespoke React-only prep table. Rejected because it would not be portable to Agent artifacts, Dashboard-style review surfaces, or future package renderers.

### Decision 3: Keep `GenerateImage` and `TransformImage` separate at the semantic layer

`GenerateImage` creates or re-composes new images from prompts and references. `TransformImage` performs source-bound editing with source image, mask, edit instruction, and references. A provider adapter may map both to the same backend endpoint, but runtime actions, diagnostics, review UI, and backfill lineage remain distinct.

Alternative considered: collapse transform into `GenerateImage` with more fields. Rejected because transform needs before/after review, source-bound provenance, mask diagnostics, and different failure handling.

### Decision 4: Reference bundles reuse existing identity and evidence systems

Character references use `CreativeEntityRef` with `entityKind: "character"` and can cite visual asset refs and memory observation ids. Scene references use `CreativeEntityRef` with `entityKind: "scene"` or `"location"` and can cite semantic index refs. `ShotImagePrepPlan` can cite `PerceptionCardRef` but does not embed full PerceptionCard payloads.

Alternative considered: create comic-only character/scene reference ids. Rejected because it would fragment the unified entity model and cause duplicate characters or locations in long-form projects.

### Decision 5: Approval and cost estimation precede batch execution

The table/profile may suggest actions, but capability execution only occurs after validators pass and the user approves. Batch execution requires `estimate-batch-cost` before `run-approved-shot-prep-batch`. Ref/schema/provider diagnostics block queuing.

Alternative considered: run generation immediately after Agent emits plans. Rejected because comic-to-animation can involve hundreds of shots and real provider cost.

### Decision 6: Runtime code owns execution; Skill owns guidance

Skill content can guide Agent to choose fields and write prompts, but code owns contracts, validators, provider calls, capability discovery, approval gates, cost estimates, stable refs, and persistent entity/memory writes.

Alternative considered: let Skill Markdown describe action availability and execution rules. Rejected because child packages cannot safely parse prompt text as a runtime contract.

## Risks / Trade-offs

- **Risk: The prep plan adds another protocol layer.** -> Keep it narrow and source-bound; use GenericTable as a projection, not a second data owner.
- **Risk: Provider adapters differ widely in edit support.** -> Register `TransformImage` as a facade with capability diagnostics and conservative feature detection.
- **Risk: Batch execution cost is hard to estimate accurately.** -> Require explicit unknown-cost display and approval rather than silent execution.
- **Risk: Reference bundles can become large.** -> Store stable refs and ids only; do not embed media payloads or complete PerceptionCards.
- **Risk: Skill authors over-specify fields.** -> Validators and profile descriptors enforce required fields, shallow JSON shapes, and safe refs.
- **Risk: Canvas and Agent Webview state can diverge.** -> Treat `ShotImagePrepPlan` status as the source; table rows only project that status.

## Migration Plan

1. Add shared contracts and validators without changing existing storyboard generation.
2. Add plan derivation helpers that can be used by comic-to-animation flows while leaving normal storyboard projection untouched.
3. Add `comic-shot-asset-prep` profile and render it read-only until approval/execution actions are registered.
4. Register `TransformImage` facade and provider mapping where media backend fields can support source-bound edits.
5. Add Canvas review display and action dispatch for approved prep plans.
6. Add batch execution with cost estimate and backfill summaries.

Rollback for early phases is straightforward: stop deriving or rendering prep plans and continue using existing storyboard table projection and image strategy diagnostics.

## Open Questions

- Which provider should be the first complete `TransformImage` facade target for inpaint/outpaint/colorize behavior?
- Should accepted keyframes be persisted primarily in Canvas project state, generated asset registry, or both?
- Should `comic-shot-asset-prep` be a built-in shared profile descriptor immediately, or start as a Skill-local profile promoted after implementation stabilizes?
