# Media to Video Coordinator

Coordinate media-to-video work through focused skills and existing tools. This is not a fixed pipeline: choose the smallest relevant sub-skill, load it only when needed, and keep user-facing claims grounded in tool evidence.

## Workflow Guidance

1. Inspect the user's input and determine the source modality: comic, document, image, image sequence, storyboard, animation plan, or generated media.
2. Route intent before activating production skills:
   - Content understanding only (describe, OCR, summarize, extract text, panel order, character/scene analysis, quality diagnostics, "read/analyze the first N pages") should stay in normal read/analysis tool use and should not activate media-to-video, comic-to-animation, comic-to-storyboard, or storyboard-to-animation-plan.
   - Storyboard-only requests activate comic-to-storyboard and stop after the reviewable Markdown creative table unless the user also asks for animation, video, generated media, Canvas/Cut handoff, or export.
   - Explicit video/animation/generation/export requests activate this coordinator or a focused production skill.
3. Use GetContext to inspect available related skills. Activate a focused skill when its detailed guidance is needed.
4. For comic EPUB/PDF/CBZ/CBR pages, prefer comic-to-storyboard first only when a storyboard artifact is requested; prefer comic-to-animation when the user explicitly requests animation/video production.
5. For still images or image sequences, prefer image-to-shot when the user asks for shot/storyboard planning or media generation.
6. For an existing reviewed storyboard creative table, storyboard Canvas node, or animation plan draft, prefer storyboard-to-animation-plan before generation or Cut.
7. Treat AnimationPlan as a shot-scoped overlay keyed by stable `shotId`, not as a duplicate storyboard table. If shot ids are missing or unstable, stop and request/fix stable ids before planning generation.
8. For an existing animation plan overlay and a Cut target, prefer animation-plan-to-cut.
9. For already generated shots, prefer generated-shot-assembly and export-video-package as needed.
10. Stop after planning when generation providers, target plugins, approvals, or safe media refs are unavailable.

## Structured Artifact Rules

- Markdown creative tables are reviewable authoring artifacts. For production animation, Cut, generated media, export, or execution summaries, invoke validated lifecycle capabilities before claiming handoff success.
- For Canvas review of Markdown tables, use the Canvas lifecycle tool/capability exposed in the runtime tool list and pass original Markdown plus stable resource refs through local UI/tool adapters. Do not output domain node JSON or project-internal handoff objects. Keep useful unknown columns visible as review metadata.
- The reviewed storyboard creative table remains the creative shot source. AnimationPlan carries only provider-neutral execution intent in `shotOverlays[]`; runtime status belongs to Agent async tasks or execution summaries.
- Use actual tool-result or generated-asset references for media. Do not invent ids.
- Do not embed base64, blob URLs, localhost URLs, or absolute local cache paths.
- Do not inspect `.neko/.cache`, `.neko/semantic-index`, SQLite, FTS, vector stores, scratch paths, Webview URIs, or provider-private payloads. Use QuerySemanticCoverage when a focused skill needs semantic evidence reuse for stable source ranges.
- Ask for approval before bulk generation, colorization, destructive timeline replacement, or long export unless the user explicitly requested automatic execution and policy allows it.

## Related Skill Selection

- comic-to-storyboard: comic page reading, panel/OCR evidence, Markdown creative table output with prompts, resource tokens, review status, and next actions.
- image-to-shot: still image references to shot/storyboard plans.
- storyboard-to-animation-plan: storyboard rows to shot-scoped motion/camera/generation overlay plans.
- animation-plan-to-cut: animation plans to Cut timeline payloads.
- generated-shot-assembly: generated media refs to assembly summaries.
- export-video-package: export-oriented packaging and delivery.

## Tool Use

Use QuerySemanticCoverage before expensive long-range analysis when stable source refs and ranges are available. Use ReadDocument and ReadImage for missing/stale evidence. Use generation tools only after approval. Use Canvas/Cut tools only after validation succeeds and the target capability exists.
