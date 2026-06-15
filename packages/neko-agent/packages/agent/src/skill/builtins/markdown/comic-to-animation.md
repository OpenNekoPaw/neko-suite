# Comic to Animation

Use this focused entry point when the user wants a comic, manga, webtoon, EPUB, PDF, CBZ/CBR, or storyboard artifact turned into animation-ready media and a video assembly plan.

This is not a hardcoded pipeline. Choose the smallest next skill or tool based on validated artifacts, available capabilities, user approval, and safe media references. Do not claim images, video, Canvas delivery, Cut assembly, voice, or export succeeded unless the relevant tool returned success.

## Workflow Guidance

1. Route intent first:
   - Content understanding only (describe, OCR, panel order, character/scene analysis, quality diagnostics) is content analysis, not a comic-to-animation production run.
   - Storyboard only (for example "make/generate a storyboard table") should stop at `comic-to-storyboard` unless the user also asks for animation, video, batch processing, Canvas/Cut delivery, asset preparation, or export.
   - Animation/video/batch production requests activate this skill and start production orchestration.
2. When this skill is activated for production, create a user-visible `ProductionRun` / task graph before executing generation work. Default tasks should be stable and resumable, for example: read source pages, analyze panels/OCR, draft storyboard, review storyboard, derive shot image prep, approve image prep, run approved image prep, generate animation overlay, approve video generation, run video generation, assemble Cut/export.
3. Auto-run only low-risk, read-only, or draft-producing tasks: source reading, semantic coverage checks, OCR/panel analysis, storyboard draft, image-prep plan derivation, and animation overlay draft. Pause at approval gates for creative-truth acceptance, entity identity merges, destructive or costly media transforms, video/TTS generation, Cut replacement, and export.
4. If no validated storyboard exists, activate `comic-to-storyboard` first.
5. If a `CompositeArtifact` with a `domainKind: "StoryboardTable"` block already exists, validate it and do not rewrite it unless diagnostics require repair.
6. Do not regenerate StoryboardTable at every production step. StoryboardTable is the creative source of truth; ordinary image prep, generation, retry, and execution results should update `ShotImagePrepPlan`, media refs, task state, or execution summaries keyed by stable `shotId`. Revise StoryboardTable only when panel detection, OCR/dialogue meaning, shot split/merge/order, character identity, or story understanding changes.
7. Before long comic/document/video/audio re-analysis, call `QuerySemanticCoverage` when stable source refs and ranges are available. Reuse fresh matched ranges as context and schedule tools only for missing or stale ranges.
8. If no stable source ref exists, continue with normal tool analysis and include an explicit diagnostic that semantic coverage reuse was unavailable.
9. For animation readiness, require or derive a reviewable `comic-shot-asset-prep` projection backed by `ShotImagePrepPlan` records.
10. Before deriving or updating `ShotImagePrepPlan` records, audit each source comic image/page for orientation, panel boundaries, one-page-to-many-shot mapping, text/SFX removal, missing background or margins, inpaint completion, outpaint expansion, monochrome-to-color needs, upscaling, and style normalization.
11. Ask for approval before bulk image prep, page/panel splitting, rotation, colorization, text removal, inpaint/outpaint, video generation, TTS, destructive Cut changes, or export.
12. Route source-bound panel edits through `TransformImage` only when a host-resolved source image URI/base64 is available; stable refs alone are lineage metadata until host IO resolves them.
13. Route new or recomposed keyframes through `GenerateImage` with source refs, character refs, scene refs, and style refs when available.
14. Route animation clips through `GenerateVideo` only after the keyframe/source image refs are real generated assets or host-resolved image-to-video inputs.
15. Send to Canvas or Cut only after the structured payload validates and the target capability exists.

## Structured Artifact Rules

- Markdown is presentation only. Storyboards, shot image prep, animation plans, generated media refs, Canvas payloads, Cut payloads, and execution summaries must be validated structured payloads.
- When producing or repairing the storyboard from comic evidence, emit one `CompositeArtifact` with both the `StoryboardTable` domain block and `extensions["neko.entityMemoryContributionPayload"]`. The contribution payload is the machine-readable unified entity input; review tables are optional projections only.
- When missing/stale semantic ranges are newly analyzed, emit reusable evidence as structured `MediaTextSegment`, `MediaSemanticIndex`, `EntityMemoryContribution`, or reviewable artifact payloads with source refs, ranges, confidence, and provenance. Do not persist prompt context, cache file paths, Webview URIs, or provider runtime handles.
- Keep storyboard and entity memory independent but cross-referenceable. `StoryboardTable` owns shot order and shot-local character appearances. `EntityMemoryContribution` owns reviewable entity/candidate evidence. Link them with stable ids and metadata, not by nesting entity facts into Canvas or storyboard ownership.
- Give every recurring storyboard character a stable `characterId` that is reused across shots when the visual identity is the same. Prefer ids such as `story-char-rin` over display names alone.
- For every durable character candidate/observation, mirror the storyboard mapping keys in `EntityMemoryContribution.entityCandidates[].metadata`, `characterObservations[].extensions["neko.storyboardEntityMapping"]`, and/or `characterObservations[].provenance.metadata`: `storyboardCharacterId`, `characterId`, `shotId`, `shotNumber`, `characterIndex`, and `sourceRef` when available.
- Use mapping keys in this priority order: `storyboardCharacterId`, then `shotId + characterId`, then provenance/source refs, then `name` only as a last fallback. If same-name characters or candidates are ambiguous, do not auto-merge; keep distinct candidate ids and add a diagnostic such as `candidate-ambiguous`.
- Use `entityCandidates[]` for reviewable unified entities. Set `identityBasis: "user-named"` only when a user-provided or source-explicit name identifies the candidate; use `identityBasis: "visual"` for visual-only recurring figures and avoid name-based matching claims for them.
- Use actual tool-result, generated-asset, canvas-node, or workspace-safe refs for media. Do not invent ids.
- Do not embed base64, blob URLs, localhost URLs, Webview URIs, provider-temporary handles, or absolute local cache paths in persistent artifacts.
- Do not inspect `.neko/.cache`, `.neko/semantic-index`, SQLite, FTS, vector stores, scratch paths, or provider-private payloads. Semantic evidence reuse must come from `QuerySemanticCoverage` or another host-mediated facade.
- Keep `StoryboardTable` as the semantic shot plan. Keep `ShotImagePrepPlan` as image-prep intent and status. Keep generated media refs as tool-backed outputs.
- When image analysis suggests whether the storyboard image should be regenerated, express that in `ShotImagePrepPlan.metadata.regenerationRecommendation`. This is a review signal only; it never approves or executes GenerateImage/TransformImage by itself.
- When image analysis finds comic-page handling needs, express them in `ShotImagePrepPlan.operationPlan` and `metadata.imageAudit`. Use `rotate` for page orientation fixes, `split-panels` when one source image/page maps to multiple shots, `remove-text` for dialogue/SFX cleanup, `inpaint` for completion after text removal or missing areas, `outpaint` for expanded storyboard framing, `colorize` for monochrome-to-color animation, `upscale` for low-resolution panels, and `style-normalize` for consistency.
- A single source image may create multiple storyboard shots and multiple shot image prep rows. Each row should keep the same source page/image ref when it comes from that page, with panel identity in `sourceMediaRefs[].label`, `decisionReason`, or `metadata.imageAudit`; do not advance to the next image by row order.

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
- Source orientation fixes, panel splitting, cleanup, inpaint/outpaint/colorize/upscale/style-normalize: `comic-shot-asset-prep` plus `TransformImage`.
- Missing/recomposed keyframes and reference sheets: `GenerateImage`.
- Regeneration recommendation display: `ShotImagePrepPlan.metadata.regenerationRecommendation` and the `comic-shot-asset-prep` review table.
- Image-to-video or text-to-video clips: `GenerateVideo`.
- Timeline assembly: `animation-plan-to-cut`.
- Generated media summary: `generated-shot-assembly`.
- Delivery validation: `export-video-package`.

## Animation Plan Shape

When emitting an animation plan, wrap it in a `CompositeArtifact` domain block as a StoryboardTable overlay keyed by stable `shotId`. Do not duplicate storyboard rows or store async task status in the plan:

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
        "motionIntent": "small character motion and environmental movement",
        "cameraIntent": "slow push-in, eye-level medium shot",
        "videoPromptIntent": { "positive": "video-ready visual prompt grounded in source refs" },
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
