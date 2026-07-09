# Comic to Animation

Use this focused entry point when the user wants a comic, manga, webtoon, EPUB, PDF, CBZ/CBR, storyboard creative table, or image sequence turned into animation-ready planning, media generation guidance, and video assembly steps.

This is not a hardcoded pipeline. Choose the smallest next skill or lifecycle capability based on reviewed artifacts, available capabilities, user approval, and safe media references. Do not claim images, video, Canvas delivery, Cut assembly, voice, or export succeeded unless the relevant capability reports success.

## Workflow Guidance

1. Route intent first:
   - Content understanding only (describe, OCR, panel order, character/scene analysis, quality diagnostics) is content analysis, not a comic-to-animation production run.
   - Storyboard only (for example "make/generate a storyboard table") should stop at `comic-to-storyboard` unless the user also asks for animation, video, batch processing, Canvas/Cut delivery, asset preparation, or export.
   - Animation/video/batch production requests activate this skill and start production orchestration.
2. When production is requested, create or update a user-visible task plan before executing generation work. Default tasks should be stable and resumable, for example: read source pages, analyze panels/OCR, create storyboard review creative table, review storyboard, derive shot image prep, approve image prep, run approved image prep, draft animation plan, approve video generation, run video generation, assemble Cut/export.
3. Auto-run only low-risk, read-only, or review-producing tasks: source reading, semantic coverage checks, OCR/panel analysis, storyboard review table creation, image-prep plan derivation, and animation plan draft.
4. Pause at approval gates for creative-truth acceptance, entity identity merges, destructive or costly media transforms, video or voice/audio generation, Cut replacement, and export.
5. If no reviewed storyboard exists, activate `comic-to-storyboard` first and produce the Markdown creative table with resource tokens, generation-effective prompts, and plan-only next actions when useful.
6. Do not regenerate the storyboard at every production step. Revise the storyboard only when panel detection, OCR/dialogue meaning, shot split/merge/order, character identity, or story understanding changes.
7. Before long comic/document/video/audio re-analysis, use the runtime semantic-evidence reuse capability when stable source refs and ranges are available. Reuse fresh matched ranges as context and schedule perception work only for missing or stale ranges.
8. If no stable source ref exists, continue with normal content/perception analysis and include an explicit diagnostic that semantic coverage reuse was unavailable.
9. Before deriving image-prep work, audit each source comic image/page for orientation, panel boundaries, one-page-to-many-shot mapping, text/SFX removal, missing background or margins, inpaint completion, outpaint expansion, monochrome-to-color needs, upscaling, and style normalization.
10. Source-bound panel edits require an image-edit capability with host-resolved source media; stable refs alone are lineage metadata until host IO resolves them.
11. New or recomposed keyframes require an image-generation capability with source refs, character refs, scene refs, and style refs when available.
12. Animation clips require a video-generation capability only after keyframe/source image refs are real generated assets or host-resolved image-to-video inputs.
13. Send to Canvas or Cut only after validation succeeds and the target capability exists.

## Lifecycle Artifact Rules

- Markdown creative tables are reviewable authoring artifacts. Canvas ingest, generation, Cut, export, and execution handoff should go through lifecycle capabilities or focused domain capabilities.
- For Canvas review of Markdown tables, use the Canvas authoring lifecycle capability with the original Markdown and stable resources when appropriate.
- When sending generated media or storyboard data into Cut, Sketch, Model, or other project files, use the owning package's canonical authoring capability with target, reveal preference, stable source/ref data, and provenance. UI-bound import commands are not durable write paths.
- Playback, selection, viewport, camera, focused editor state, and live preview are interactive-editor operations. If the required editor/runtime is missing, return diagnostics instead of opening a hidden Webview and claiming a write succeeded.
- If an authoring capability returns `ok:false` or diagnostics, report the failure reason to the user; command completion alone is not Canvas/Cut/Sketch/Model delivery.
- Do not output domain node JSON, project-internal handoff objects, Webview URIs, blob URLs, localhost URLs, provider-temporary handles, cache paths, temp paths, or absolute private paths.
- Use actual capability-result, generated-asset, Canvas node, or workspace-safe refs for media. Do not invent ids.
- Keep storyboard, animation plan, image-prep plan, entity evidence, generated media refs, and execution summaries separate but cross-referenceable through stable shot/source ids.
- Entity memory and character evidence are owned by the appropriate entity/contribution flow. If this skill surfaces character observations, label them as review evidence unless a trusted contribution capability is invoked.
- If character identity, source refs, masks, cost estimate, provider support, scene identity, or speaker binding is uncertain, add diagnostics and keep the plan reviewable.

## Review Tables

When producing user-facing planning tables, prefer compact Markdown tables:

- Storyboard: use the comic-to-storyboard creative table headers.
- Image prep: use columns such as `scene`, `shot`, `source`, `operation`, `reason`, `prompt`, `maskNeeded`, `approvalNotes`, `nextAction`.
- Animation plan: use columns such as `scene`, `shot`, `motionIntent`, `cameraIntent`, `videoPrompt`, `audioPrompt`, `requiresImagePrep`, `requiresVideoGeneration`, `approvalNotes`, `diagnostic`, `nextAction`.
- Execution summary: use columns such as `step`, `target`, `status`, `resultRef`, `diagnostic`, `nextAction`.

Unknown columns are allowed as review metadata when they are useful, but executable actions must map to trusted lifecycle capabilities.

## Image Prep Guidance

- A single source image may create multiple storyboard shots and multiple image-prep rows. Keep the same source token/ref when a row comes from the same page, and distinguish panel identity with `sourcePanel`, `decisionReason`, or `imageAudit`.
- Express image handling needs as plan/review data: `rotate`, `split-panels`, `remove-text`, `inpaint`, `outpaint`, `colorize`, `upscale`, and `style-normalize`.
- Do not claim rotated, cropped, colored, inpainted, outpainted, or generated images exist before a capability actually creates them.
- When analysis suggests regeneration or source-image editing, express it as a review recommendation; it never approves or executes repair by itself.

## Capability Use

- Use the runtime perception/content capability for missing visual evidence.
- Use semantic-evidence reuse only for reusable semantic evidence with stable source refs; it never replaces visual analysis.
- Use image generation, image editing, video generation, voice/audio, Canvas, Cut, and export capabilities only after validation and approval requirements are satisfied.
