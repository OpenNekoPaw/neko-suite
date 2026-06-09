# Comic to Animation

Use this focused entry point when the user wants a comic, manga, webtoon, EPUB, PDF, CBZ/CBR, or storyboard artifact turned into animation-ready media and a video assembly plan.

This is not a hardcoded pipeline. Choose the smallest next skill or tool based on validated artifacts, available capabilities, user approval, and safe media references. Do not claim images, video, Canvas delivery, Cut assembly, voice, or export succeeded unless the relevant tool returned success.

## Workflow Guidance

1. If no validated storyboard exists, activate `comic-to-storyboard` first.
2. If a `CompositeArtifact` with a `domainKind: "StoryboardTable"` block already exists, validate it and do not rewrite it unless diagnostics require repair.
3. For animation readiness, require or derive a reviewable `comic-shot-asset-prep` projection backed by `ShotImagePrepPlan` records.
4. Ask for approval before bulk image prep, colorization, text removal, video generation, TTS, destructive Cut changes, or export.
5. Route source-bound panel edits through `TransformImage` only when a host-resolved source image URI/base64 is available; stable refs alone are lineage metadata until host IO resolves them.
6. Route new or recomposed keyframes through `GenerateImage` with source refs, character refs, scene refs, and style refs when available.
7. Route animation clips through `GenerateVideo` only after the keyframe/source image refs are real generated assets or host-resolved image-to-video inputs.
8. Send to Canvas or Cut only after the structured payload validates and the target capability exists.

## Structured Artifact Rules

- Markdown is presentation only. Storyboards, shot image prep, animation plans, generated media refs, Canvas payloads, Cut payloads, and execution summaries must be validated structured payloads.
- Use actual tool-result, generated-asset, canvas-node, or workspace-safe refs for media. Do not invent ids.
- Do not embed base64, blob URLs, localhost URLs, Webview URIs, provider-temporary handles, or absolute local cache paths in persistent artifacts.
- Keep `StoryboardTable` as the semantic shot plan. Keep `ShotImagePrepPlan` as image-prep intent and status. Keep generated media refs as tool-backed outputs.

## Required Handoffs

- Comic evidence and OCR: `comic-to-storyboard`.
- Motion, camera, image/video prompt, continuity, and generation readiness: `storyboard-to-animation-plan`.
- Source panel cleanup, inpaint/outpaint/colorize/upscale/style-normalize: `comic-shot-asset-prep` plus `TransformImage`.
- Missing/recomposed keyframes and reference sheets: `GenerateImage`.
- Image-to-video or text-to-video clips: `GenerateVideo`.
- Timeline assembly: `animation-plan-to-cut`.
- Generated media summary: `generated-shot-assembly`.
- Delivery validation: `export-video-package`.

## Animation Plan Shape

When emitting an animation plan, wrap it in a `CompositeArtifact` domain block:

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
        "duration": 3,
        "motionPrompt": "small character motion and environmental movement",
        "cameraPrompt": "slow push-in, eye-level medium shot",
        "generationPrompt": "video-ready visual prompt grounded in source refs",
        "requiresImagePrep": true,
        "requiresVideoGeneration": true,
        "sourceMediaRefs": [],
        "preparedKeyframeRefs": [],
        "referenceBundle": {},
        "dialogueCueRefs": [],
        "voiceCueRefs": [],
        "approvalNotes": "Needs user approval before image prep and video generation."
      }
    ],
    "diagnostics": []
  }
}
```

Only include fields supported by evidence. Prefer diagnostics over guessing when speaker binding, image refs, masks, character identity, scene identity, provider capability, or cost estimate is missing.
