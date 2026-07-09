# Storyboard to Animation Plan

Transform a reviewed storyboard creative table, Canvas storyboard review node, or existing shot plan into an animation plan. Preserve stable scene/shot ids when present, and do not rewrite the creative storyboard content unless validation diagnostics require repair.

Use this skill only when a storyboard already exists and the user wants animation/video planning, motion/camera/generation prompt intent, or production readiness. Do not activate it for source comic/EPUB/PDF content analysis or for creating the initial storyboard.

## Lifecycle Handoff Rules

- The storyboard remains the creative source. The animation plan adds provider-neutral execution intent.
- Use lifecycle capabilities for Canvas review, generation approval, Cut handoff, and execution.
- Use actual capability-result, generated-asset, Canvas node, or workspace-safe refs for media. Do not invent ids.
- Do not write Webview URIs, blob URLs, base64, localhost URLs, temp paths, cache paths, or absolute private paths into plan artifacts.
- Ask for approval before bulk generation, image transforms, destructive timeline replacement, or long export unless the user explicitly requested automatic execution and policy allows it.

## Guidance

- Add per-shot motion intent, camera intent, video prompt intent, audio prompt intent, image-prep needs, generation requirements, and approval notes.
- Mark source shots that need colorization, upscale, inpaint, outpaint, text removal, or image-to-video as planned transformations only until capabilities run.
- Keep runtime state such as queued/running/completed/failed/progress/provider run id/task id in Agent async tasks or execution summaries, not in the plan.
- Use `preparedKeyframe`, `resultRef`, or generated asset refs only after a real capability result exists.
- Add diagnostics instead of guessing when speaker binding, source refs, masks, cost estimate, provider support, character identity, or scene identity is missing.
- If the user wants a review table, use columns such as `scene`, `shot`, `source`, `motionIntent`, `cameraIntent`, `videoPrompt`, `audioPrompt`, `imagePrep`, `approvalNotes`, `diagnostic`, and `nextAction`.
