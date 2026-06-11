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
- When producing or repairing the storyboard from comic evidence, emit one `CompositeArtifact` with both the `StoryboardTable` domain block and `extensions["neko.entityMemoryContributionPayload"]`. The contribution payload is the machine-readable unified entity input; review tables are optional projections only.
- Keep storyboard and entity memory independent but cross-referenceable. `StoryboardTable` owns shot order and shot-local character appearances. `EntityMemoryContribution` owns reviewable entity/candidate evidence. Link them with stable ids and metadata, not by nesting entity facts into Canvas or storyboard ownership.
- Give every recurring storyboard character a stable `characterId` that is reused across shots when the visual identity is the same. Prefer ids such as `story-char-rin` over display names alone.
- For every durable character candidate/observation, mirror the storyboard mapping keys in `EntityMemoryContribution.entityCandidates[].metadata`, `characterObservations[].extensions["neko.storyboardEntityMapping"]`, and/or `characterObservations[].provenance.metadata`: `storyboardCharacterId`, `characterId`, `shotId`, `shotNumber`, `characterIndex`, and `sourceRef` when available.
- Use mapping keys in this priority order: `storyboardCharacterId`, then `shotId + characterId`, then provenance/source refs, then `name` only as a last fallback. If same-name characters or candidates are ambiguous, do not auto-merge; keep distinct candidate ids and add a diagnostic such as `candidate-ambiguous`.
- Use `entityCandidates[]` for reviewable unified entities. Set `identityBasis: "user-named"` only when a user-provided or source-explicit name identifies the candidate; use `identityBasis: "visual"` for visual-only recurring figures and avoid name-based matching claims for them.
- Use actual tool-result, generated-asset, canvas-node, or workspace-safe refs for media. Do not invent ids.
- Do not embed base64, blob URLs, localhost URLs, Webview URIs, provider-temporary handles, or absolute local cache paths in persistent artifacts.
- Keep `StoryboardTable` as the semantic shot plan. Keep `ShotImagePrepPlan` as image-prep intent and status. Keep generated media refs as tool-backed outputs.
- When image analysis suggests whether the storyboard image should be regenerated, express that in `ShotImagePrepPlan.metadata.regenerationRecommendation`. This is a review signal only; it never approves or executes GenerateImage/TransformImage by itself.

## Storyboard And Entity Output Contract

When the user asks for comic-to-animation and no validated storyboard exists yet, the first durable output should still be the storyboard artifact:

1. Emit a `neko-composite` JSON block whose root is a `CompositeArtifact`.
2. Include a `domain` block with `domainKind: "StoryboardTable"` and a valid nested StoryboardTable payload.
3. Include `extensions["neko.entityMemoryContributionPayload"]` on the same artifact whenever any persistent character evidence was extracted.
4. In each shot character, include `characterId`, `name`/`characterName`, shot-local role/action/emotion, and `sourceMediaRefs` or character-level source metadata when available.
5. In the contribution payload, include `entityCandidates[]` and/or `characterObservations[]` that cite the same source refs and mapping keys as the storyboard characters.
6. A review-only `GenericTable` with `profile: "character-memory-review"` may be included for humans, but it must not replace the contribution extension.
7. If you output "Character Observations", "Character and Relationship Changes", or any character analysis table, mirror the durable rows into `extensions["neko.entityMemoryContributionPayload"]`; when a complete contribution payload cannot be built, label the table as non-persistent analysis.

Minimal mapping example:

```neko-composite
{
  "schemaVersion": 1,
  "kind": "composite-artifact",
  "artifactId": "comic-animation-plan",
  "profile": "comic-to-animation-plan",
  "title": "Comic Animation Plan",
  "extensions": {
    "neko.entityMemoryContributionPayload": {
      "contributionId": "comic-page-1-character-memory",
      "sourcePackage": "neko-agent",
      "sourceRef": { "kind": "tool-result", "toolCallId": "read-doc-call-id", "assetIndex": 0 },
      "reviewPolicy": "requires-user-review",
      "entityCandidates": [
        {
          "id": "candidate-story-char-rin",
          "kind": "character",
          "name": "Rin",
          "status": "open",
          "identityBasis": "user-named",
          "confidence": 0.82,
          "provenance": [
            {
              "providerId": "neko-agent",
              "sourceKind": "agent",
              "sourceRef": "read-doc-call-id#asset-0#panel-P1",
              "label": "story-char-rin",
              "confidence": 0.82,
              "metadata": {
                "storyboardCharacterId": "story-char-rin",
                "shotId": "scene-1-shot-1",
                "shotNumber": 1,
                "characterIndex": 0
              }
            }
          ],
          "sourceRefs": ["read-doc-call-id#asset-0#panel-P1"],
          "metadata": {
            "storyboardCharacterId": "story-char-rin",
            "characterId": "story-char-rin",
            "sourceRef": "read-doc-call-id#asset-0#panel-P1"
          }
        }
      ],
      "characterObservations": [
        {
          "observationId": "obs-story-char-rin-shot-1",
          "sourceRef": {
            "kind": "tool-result",
            "toolCallId": "read-doc-call-id",
            "assetIndex": 0,
            "range": { "shotId": "scene-1-shot-1", "panelId": "P1" }
          },
          "provenance": {
            "source": "comic",
            "providerId": "neko-agent",
            "toolCallId": "read-doc-call-id",
            "metadata": {
              "storyboardCharacterId": "story-char-rin",
              "shotId": "scene-1-shot-1",
              "shotNumber": 1,
              "characterIndex": 0
            }
          },
          "reviewStatus": "needs-review",
          "candidateId": "candidate-story-char-rin",
          "mention": {
            "mentionId": "mention-story-char-rin-shot-1",
            "kind": "visual",
            "candidateName": "Rin",
            "confidence": 0.82
          },
          "dimensions": [
            {
              "dimension": "appearance",
              "value": "Source-supported visual traits only",
              "confidence": 0.82
            }
          ],
          "confidence": 0.82,
          "extensions": {
            "neko.storyboardEntityMapping": {
              "storyboardCharacterId": "story-char-rin",
              "shotId": "scene-1-shot-1",
              "shotNumber": 1,
              "characterIndex": 0,
              "sourceRef": "read-doc-call-id#asset-0#panel-P1"
            }
          }
        }
      ]
    }
  },
  "blocks": [
    {
      "blockId": "storyboard-domain",
      "kind": "domain",
      "title": "Storyboard Payload",
      "domainKind": "StoryboardTable",
      "schemaVersion": 1,
      "payload": {
        "schemaVersion": 1,
        "kind": "storyboard-table",
        "profile": "manga-to-video",
        "title": "Storyboard",
        "scenes": [
          {
            "sceneId": "scene-1",
            "sceneTitle": "Page 1",
            "shots": [
              {
                "shotId": "scene-1-shot-1",
                "shotNumber": 1,
                "duration": 3,
                "visualDescription": "Panel action and composition",
                "sourceMediaRefs": [
                  {
                    "refId": "source-panel-1",
                    "role": "source",
                    "locator": {
                      "type": "tool-result",
                      "toolCallId": "read-doc-call-id",
                      "assetIndex": 0
                    },
                    "label": "Page 1 / Panel 1",
                    "mimeType": "image/jpeg"
                  }
                ],
                "characters": [
                  {
                    "characterId": "story-char-rin",
                    "name": "Rin",
                    "role": "primary",
                    "action": "Visible action",
                    "emotion": "visible emotion"
                  }
                ],
                "characterAction": "Visible action",
                "imageStrategy": "use-as-reference"
              }
            ]
          }
        ]
      }
    }
  ]
}
```

## Required Handoffs

- Comic evidence and OCR: `comic-to-storyboard`.
- Motion, camera, image/video prompt, continuity, and generation readiness: `storyboard-to-animation-plan`.
- Source panel cleanup, inpaint/outpaint/colorize/upscale/style-normalize: `comic-shot-asset-prep` plus `TransformImage`.
- Missing/recomposed keyframes and reference sheets: `GenerateImage`.
- Regeneration recommendation display: `ShotImagePrepPlan.metadata.regenerationRecommendation` and the `comic-shot-asset-prep` review table.
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
