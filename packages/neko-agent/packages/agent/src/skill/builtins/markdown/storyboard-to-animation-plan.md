# Storyboard to Animation Plan

Transform a validated CompositeArtifact with a StoryboardTable domain block, or a legacy bare StoryboardTable, into an animation plan. Preserve scene and shot ids, source media refs, durations, dialogue, sound cues, and continuity notes.

## Structured Artifact Rules

- Markdown is presentation only. For storyboard, animation, Canvas, Cut, generated media, or execution summaries, emit validated structured payloads.
- Use actual tool-result or generated-asset references for media. Do not invent ids.
- Do not embed base64, blob URLs, localhost URLs, or absolute local cache paths.
- Ask for approval before bulk generation, colorization, destructive timeline replacement, or long export unless the user explicitly requested automatic execution and policy allows it.

## Guidance

- When the input is CompositeArtifact, read the StoryboardTable from the `domainKind: "StoryboardTable"` block.
- Do not regenerate or rewrite the storyboard unless validation fails.
- Add motionPrompt, cameraPrompt, generationPrompt, requiresGeneration, and approval notes per shot.
- Mark source shots that need colorization, upscale, inpaint, or image-to-video as planned transformations only until tools run.
