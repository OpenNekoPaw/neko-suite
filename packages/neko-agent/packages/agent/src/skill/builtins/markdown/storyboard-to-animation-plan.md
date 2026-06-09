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
- Emit the animation plan as a `CompositeArtifact` domain block with `domainKind: "AnimationPlan"` and `payload.kind: "animation-plan"`.
- Preserve sceneId, shotId, shot order, sourceMediaRefs, generatedMediaRefs, textCues, voiceCues, character refs, scene refs, duration, and diagnostics from the storyboard.
- Use `preparedKeyframeRefs` only for real generated or transformed keyframe refs. Use `sourceMediaRefs` or `referenceBundle` for planned references.
- Set `requiresImagePrep` when `imageStrategy` implies `transform-original`, source cleanup, text removal, colorization, outpaint, upscale, or style normalization.
- Set `requiresVideoGeneration` only when the user wants clips rather than a static storyboard/Cut draft.
- Add diagnostics instead of guessing when speaker binding, source refs, masks, cost estimate, provider support, character identity, or scene identity is missing.

## AnimationPlan Domain Payload

```json
{
  "kind": "domain",
  "domainKind": "AnimationPlan",
  "schemaVersion": 1,
  "payload": {
    "kind": "animation-plan",
    "sourceStoryboardRef": "artifact-or-storyboard-id",
    "shots": [
      {
        "sceneId": "scene-1",
        "shotId": "scene-1-shot-1",
        "shotNumber": 1,
        "duration": 3,
        "motionPrompt": "small subject and environment motion",
        "cameraPrompt": "slow push-in, eye-level medium shot",
        "generationPrompt": "video-ready prompt grounded in source refs",
        "requiresImagePrep": true,
        "requiresVideoGeneration": true,
        "sourceMediaRefs": [],
        "preparedKeyframeRefs": [],
        "referenceBundle": {},
        "textCueRefs": [],
        "voiceCueRefs": [],
        "approvalNotes": "Needs user approval before image prep and video generation."
      }
    ],
    "diagnostics": []
  }
}
```
