# Storyboard to Animation Plan

Transform a validated CompositeArtifact with a StoryboardTable domain block into an AnimationPlan overlay. Preserve stable scene and shot ids from the storyboard; do not duplicate storyboard rows or rewrite creative shot content.

Use this skill only when a validated StoryboardTable already exists and the user wants animation/video planning, motion/camera/generation prompt intent, or production readiness. Do not activate it for source comic/EPUB/PDF content analysis or for creating the initial storyboard.

## Structured Artifact Rules

- Markdown is presentation only. For storyboard, animation, Canvas, Cut, generated media, or execution summaries, emit validated structured payloads.
- Use actual tool-result or generated-asset references for media. Do not invent ids.
- Do not embed base64, blob URLs, localhost URLs, or absolute local cache paths.
- Ask for approval before bulk generation, colorization, destructive timeline replacement, or long export unless the user explicitly requested automatic execution and policy allows it.

## Guidance

- When the input is CompositeArtifact, read the StoryboardTable from the `domainKind: "StoryboardTable"` block.
- Do not regenerate or rewrite the storyboard unless validation fails.
- Add provider-neutral motionIntent, cameraIntent, videoPromptIntent, audioPromptIntent, imagePrep, generation requirements, and approval notes per shot.
- Mark source shots that need colorization, upscale, inpaint, or image-to-video as planned transformations only until tools run.
- Emit the plan as a `CompositeArtifact` domain block with `domainKind: "AnimationPlan"` and `payload.kind: "animation-plan-overlay"`.
- Include `sourceStoryboardRef` and `shotOverlays[]` keyed by stable `shotId`. Do not copy scene order, shot order, dialogue, character participation, source media facts, or runtime task status into the plan.
- Use `preparedKeyframeRefs` only for real generated or transformed keyframe refs. Use `sourceMediaRefs` or `referenceBundle` for planned references.
- Set `requiresImagePrep` when `imageStrategy` implies `transform-original`, source cleanup, text removal, colorization, outpaint, upscale, or style normalization.
- Set `requiresVideoGeneration` only when the user wants clips rather than a static storyboard/Cut draft.
- Runtime fields such as queued, running, completed, failed, progress, attempt count, provider run id, task id, generated output status, and retry state belong in Agent async task or execution summary data, not in AnimationPlan.
- Add diagnostics instead of guessing when speaker binding, source refs, masks, cost estimate, provider support, character identity, or scene identity is missing.

## AnimationPlan Domain Payload

```json
{
  "kind": "domain",
  "domainKind": "AnimationPlan",
  "schemaVersion": 1,
  "payload": {
    "kind": "animation-plan-overlay",
    "overlayType": "AnimationPlan",
    "sourceStoryboardRef": { "kind": "artifact", "artifactId": "artifact-or-storyboard-id" },
    "shotOverlays": [
      {
        "sceneId": "scene-1",
        "shotId": "scene-1-shot-1",
        "motionIntent": "small subject and environment motion",
        "cameraIntent": "slow push-in, eye-level medium shot",
        "videoPromptIntent": { "positive": "video-ready prompt grounded in source refs" },
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
