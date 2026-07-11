# Creative Media Skill and Quality Implementation Audit

Date: 2026-07-11
Scope: implementation baseline for `converge-creative-media-skills-and-quality-gates`.

This document records the pre-migration facts used by tasks 1.1-1.6. It is an implementation snapshot, not a long-term architecture source. Stable decisions belong in the change design/specs and, after implementation, the relevant domain architecture documents.

## 1. Builtin Skill and catalog inventory

Canonical registry assembly currently lives in `packages/neko-skills/src/builtins/builtin-definitions.ts`; `packages/neko-skills/src/builtins/index.ts` re-exports the definitions, locale helpers, and ToolSets.

### Current creative/media entries

| Current Skill | Current responsibility | Current exposure/debt | Canonical disposition |
|---|---|---|---|
| `ai-generate` | Image, video, TTS, music, transcription provider entry | Contains copied `toolDefinitions`; mixes multiple media domains | Replace user-facing image/video semantics with `image` and `video`; keep provider execution in runtime capability catalog |
| `scene-to-music` | Scene-conditioned music generation | Ordinary Skill still has `command: scene-to-music` | Retain as audio-domain Skill/profile if needed; remove ordinary command exposure |
| `video-editing` | Timeline editing method | Valid user intent; content overlaps Cut operations | Retain canonical Skill; keep Cut schema in capability prompt/tool schema |
| `color-grading` | Color correction method | Narrow peer Skill increases catalog size | Retain as related method/profile under video editing unless independent demand is proven |
| `audio-mixing` | Timeline/audio mixing method | Narrow peer Skill | Retain as audio-domain method; not part of Image/Video provider contract |
| `subtitle-assistant` | Subtitle authoring | Valid focused method | Retain; route mutation through Cut/owning authoring API |
| `script-generation` | Script creation | Valid Story user intent | Retain in Story domain |
| `script-to-timeline` | Direct script to Cut project | Skips canonical Storyboard/production stages | Migrate to `media-production` source profile or explicit Story-to-Cut handoff |
| `media-to-video` | Workflow coordinator | Closest existing end-to-end entry | Rename/refactor to `media-production` |
| `comic-to-animation` | Comic end-to-end adaptation | Duplicates coordinator plus comic profile | Migrate to `media-production/from-comic` |
| `comic-to-storyboard` | OCR/panel/reading-order mapping | Source-specific top-level Skill | Migrate to `storyboard/from-comic` |
| `image-to-shot` | Reference image breakdown | Source/stage-specific top-level Skill | Migrate to Storyboard or Video source profile |
| `storyboard-to-animation-plan` | Storyboard to generation plan | Internal artifact conversion | Internal workflow stage/builder |
| `animation-plan-to-cut` | AnimationPlan to Cut payload | Internal handoff | Cut authoring capability/stage |
| `generated-shot-assembly` | Apply generated media | Internal mutation stage | Owning authoring stage |
| `export-video-package` | Validate/export package preparation | Internal release stage | Preflight/export service stage |
| `quality-assessment` | Generated media quality review/repair planning | Has `command: quality-check`; path-based runtime | Replace with `media-quality-review` and QualityTarget contract |

### Catalog/tool protocol observations

- Ordinary creative Skills are already collected through `builtinSkills`/`getBuiltinSkills`; explicit invocation is governed by the repository `$skill` namespace specs.
- `quality-assessment` and `scene-to-music` still declare ordinary `command` metadata.
- `ai-generate.ts` defines a parallel `aiGenerateToolDefinitions` array including `TransferStyle`, `EnhanceVideo`, and other schemas; this can drift from runtime tools in `packages/neko-agent/packages/platform/src/media/media-agent-tools.ts`.
- Builtin Skill tests are concentrated in `packages/neko-skills/src/builtins/builtin-skills.test.ts`; portable Skill and prompt-boundary tests also exist under `packages/neko-agent/packages/agent/src/skill/__tests__` in the current workspace.
- Runtime ToolSets are separate in `packages/neko-skills/src/builtins/tool-skills.ts`; they are capability groupings and must not become user Skill duplicates.

## 2. Storyboard and production DTO audit

### Reusable canonical candidate

`packages/neko-types/src/types/storyboard-table.ts` already provides the strongest shared Storyboard contract candidate:

- versioned kind/schema constants;
- profiles including script, manga, image sequence, advertising, short video, character design, and manual;
- stable `ResourceRef`/document archive refs;
- scenes, shots, text cues, source/generated media roles, image strategies, camera guidance, creative entity refs, validation helpers, and authoring lineage;
- no dependency on a feature package.

Decision for implementation: extend and normalize `StoryboardTable` in `@neko/shared` rather than introduce a parallel `StoryboardPlan` DTO. `CreativeTable` remains the UI/table family; Storyboard-specific durable handoff uses `StoryboardTable`. Any missing prompt/document/existing-storyboard profile, revision, source trace, or projection metadata will be added there or in a narrowly related shared contract.

### Existing projections/handoffs

| Surface | Existing contract family | Disposition |
|---|---|---|
| Canvas | `canvas.ts`, `canvas-layered.ts`, `canvas-markdown-capabilities.ts`, Canvas storyboard review/draft contracts | Retain as projection and review state; reference Storyboard scene/shot ids and revision |
| Cut | Canvas-Cut draft, storyboard import utilities, `CutProjectAuthoringService.importStoryboard` | Retain as one-way/import handoff; Cut owns `.nkv`, not Storyboard truth |
| Media workflow | `AnimationPlan` and workflow overlays in `media-to-video.ts`/shared media workflow types | Retain only as internal stage artifact if still required; do not expose as peer Skill |
| Generated assets | `GeneratedStoryboard` in `packages/neko-types/src/types/generated-asset.ts` | Retain generated asset representation; bind to canonical Storyboard schema/revision rather than inventing another editable truth |
| Story | `generateScenePlans`/`generateShotPlan` extension API | Retain as source adapter implementation; normalize output to StoryboardTable |

## 3. Image and Video capability audit

### Image

| Operation | Current owner/evidence | Baseline status |
|---|---|---|
| generate | Agent Media `GenerateImage`; Sketch/Canvas provider bridges | Supported |
| transform/edit | Agent Media `TransformImage` | Supported, provider-dependent |
| inpaint | Sketch `SketchInpaint`, mask/selection state | Supported when Sketch context or explicit mask exists |
| smart selection | Sketch `SketchSmartSelection` | Supported, Sketch-owned |
| upscale | Sketch `SketchUpscale` | Supported |
| line-art colorize | Sketch `SketchLineartColorize` | Supported |
| style transfer | Sketch and Canvas style operations; generic transform request | Supported/degraded by adapter |
| auto-layer | Sketch `SketchAutoLayer` | Degraded/provider-dependent |
| composite/fuse | Canvas node/layer composition and Sketch layers | Supported as authoring composition; no single canonical AI-fusion contract |
| outpaint | Expressible through transform/mask/aspect semantics | No explicit canonical operation; must not claim full support before adapter registration |
| background remove/replace | Composable through selection/mask/inpaint/provider operations | No unified canonical support declaration |
| split | Comic panel analysis and deterministic crop utilities exist in separate contexts | Ambiguous; grid/crop, panel segmentation, and semantic segmentation must be distinct profiles |

### Video

| Operation | Current owner/evidence | Baseline status |
|---|---|---|
| prompt-to-video | Agent Media `GenerateVideo` | Supported by configured providers |
| image-to-video | `VideoGenerationRequest.referenceImage*` | Supported by capable providers |
| first/end-frame video | `startFrameImageBase64`/`endFrameImageBase64`; Canvas keyframe tool | Contract and Canvas entry exist; provider support must be negotiated |
| reference/video-to-video | source/reference video plus edit instruction | Contract exists; adapter support varies |
| transform/restyle | Source video + edit instruction | Degraded until explicit operation support is declared |
| extend/enhance | Skill-level TODO/schema references exist | Not canonical production support |
| trim/split/retime | Cut timeline operations | Supported; Cut-owned |
| transitions/effects/color/audio/subtitles | Cut/Audio capabilities | Supported as timeline/project authoring, not single-clip provider operations |
| generated clip insertion | Cut headless `CutProjectAuthoringService` | Supported with explicit target |

## 4. Quality runtime and evidence audit

### Current runtime inputs and dependencies

`packages/neko-skills/src/quality/media-quality-runtime.ts` currently defines `MediaQualitySceneInput { index, mediaPath, prompt, description? }` and detects media type from file extension. `quality-check-tools.ts` accepts scene arrays with required `mediaPath` and prompt.

Injected dependencies are:

- `MediaQualityLLMService` for multimodal chat;
- `MediaQualityGenerator` for approved regeneration attempts;
- `readFileAsBase64(filePath)`;
- optional provider/model ref;
- optional `IAudioAnalyzer` for loudness/silence;
- optional `IFrameExtractor` for probe/frame extraction;
- optional logger.

`consistency-evaluator.ts` adds optional `IClipScorer`, frame extraction, character refs, and multimodal comparison. `quality-review-validation.ts` already provides Agent result/evidence projection helpers but is not a cross-format project Gate contract.

### Current evidence and storage facts

- Runtime result contains overall/final score, dimensions, issues, attempts, final path, optional time range, remediation actions, audio metrics, and video metrics.
- Current durable identity is insufficient because `finalPath/mediaPath` can be a materialized path rather than a stable ResourceRef/revision.
- Generated asset contracts already distinguish durable generated assets, pathless public projections, generated draft refs, render URIs, promotion, and workspace durable roots.
- `packages/neko-agent/packages/platform/src/media/generated-asset-index.ts` is a reconstructible version-1 index and currently stores `GeneratedAsset`; it catches read/write failures because the index is reconstructible. It is a candidate integration point for lineage/evidence references, but the design decision remains to avoid embedding all evidence directly until storage ownership is confirmed.
- Existing generated asset lifecycle correctly rejects cache paths and render URIs as durable public identity; Quality must reuse this boundary.

## 5. `.nk*` ownership and validation audit

| Format | Owning package | Current canonical authoring/codec baseline | Revision/validation baseline | Missing for this change |
|---|---|---|---|---|
| `.nks` | Sketch/Image | Sketch editor/provider and document serializer; headless authoring work exists in current architecture changes | Versioned serializer and project state; image operations remain partly active-editor dependent | Unified ProjectQuality facade, explicit revision/digest evidence, export readiness |
| `.nkv` | Cut/Video | `CutProjectAuthoringService`, `ProjectSessionService`, storyboard/canvas draft import, `ExportService` | Strongest headless authoring and timeline validation baseline; project version/revision concepts present | ProjectQuality facade wrapper, preflight evidence contract, deliverable lineage/post-export verifier |
| `.nka` | Audio | `AudioProjectProvider`, project store, headless authoring tests, versioned project | Extension cache is authoritative while open; save/reopen/headless paths exist | ProjectQuality facade, mix readiness evidence and revision-bound loudness checks |
| `.nkp` | Puppet/Character | Puppet provider/runtime adapters and profile-specific project facts | Version/profile/adapter diagnostics exist | Unified structural validator facade, revision identity, runtime-preview evidence |
| `.nkm` | Model/Scene | Model provider, SceneService/runtime profiles, export service for model assets | Version/profile/runtime boundaries exist | Unified scene ProjectQuality facade, revision identity, scene render/export readiness |

No package currently exposes the complete common facade (`validateProject`, `getProjectSnapshot`, `renderPreview`, `probeRuntime`, `checkExportReadiness`) with one shared result envelope. This facade must compose existing package services rather than replace codecs or domain rules.

## 6. Legacy-to-canonical migration table

| Legacy surface | Canonical replacement | Owner | Compatibility policy | Removal condition | Poison-test expectation |
|---|---|---|---|---|---|
| `comic-to-storyboard` | `storyboard` + `from-comic` | Neko Skills + Story/Content | Optional bounded alias only | Comic adapter and `$storyboard` eval pass | Legacy handler throws if invoked by a new canonical request |
| `comic-to-animation` | `media-production` + `from-comic` | Neko Skills + Agent workflow | Optional bounded alias | End-to-end comic scenario passes | Canonical test poisons legacy Skill activation |
| `media-to-video` | `media-production` | Neko Skills + Agent workflow | Rename migration allowed | New catalog/docs/evals updated | Old name cannot be selected by natural-language canonical routing |
| `image-to-shot` | `storyboard/from-image-sequence` or `video/from-image` according to intent | Storyboard/Video profiles | Diagnostic may request intent if ambiguous | Both canonical profiles exist | No silent stage selection through old Skill |
| `storyboard-to-animation-plan` | internal production planning stage | Agent workflow | No ordinary Skill after migration | Typed stage implemented | `$storyboard-to-animation-plan` returns replacement diagnostic |
| `animation-plan-to-cut` | Cut storyboard/generated media authoring stage | Cut | No ordinary Skill after migration | Explicit-target Cut path passes | Old path poisoned; no active-Webview fallback |
| `generated-shot-assembly` | owning Canvas/Cut/Audio authoring stage | Owning package | No ordinary Skill after migration | Stable generated asset handoff passes | Old handler cannot report success |
| `export-video-package` | preflight + Cut export + deliverable verification | Cut/Quality | No ordinary Skill after migration | Pre/post Gate path passes | Direct legacy export cannot bypass current-revision preflight |
| `ai-generate` copied tool schemas | `image`/`video` semantics + runtime provider schemas | Agent Media | Remove copied schemas; provider tool names remain machine metadata | Capability registries cover supported operations | Test changes runtime schema without Skill schema copy |
| `quality-assessment` | `media-quality-review` | Neko Skills/Quality | Optional bounded Skill-name alias | QualityTarget path and evals pass | Canonical request poisons old Skill/tool input path |
| `command: quality-check` | `$media-quality-review` or Agent activation | Skill runtime | Remove ordinary command metadata | Catalog test passes | Slash catalog contains no ordinary Skill alias |
| `command: scene-to-music` | `$scene-to-music` or future audio profile | Skill runtime/Audio | Remove ordinary command metadata | Explicit Skill invocation test passes | Slash catalog excludes it |
| `MediaQualitySceneInput.mediaPath` | `QualityTarget.resourceRef` + revision/digest | Quality/shared contracts | Explicit migration/rejection adapter only | All call sites migrated | Default parser rejects path-only input |
| `finalPath` as evidence identity | stable target/repair ResourceRef + lineage | Quality/generated asset lifecycle | Projection field may remain non-authoritative during migration | Evidence store uses stable refs | Gate fails if only path identity is available |
| cache/render/Webview URIs in workflow artifacts | stable ResourceRef/project ref + session projection | Generated asset/owning package | No durable compatibility | Existing lifecycle migrations pass | Durable validators reject runtime/cache handles |

## 7. Implementation ordering conclusions

1. Reuse and extend `StoryboardTable`; do not create a parallel Storyboard truth.
2. Add shared operation support and Quality contracts before changing Skill names.
3. Preserve current dirty-workspace edits in builtin/portable Skill files and integrate around them rather than reverting.
4. Migrate Quality identity before declaring project or export Gates complete.
5. Implement Cut/Sketch/Audio facades first because they have the strongest headless authoring paths; Puppet/Model follow with explicit unavailable diagnostics for unsupported readiness operations.
