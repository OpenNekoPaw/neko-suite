# Media to Video Coordinator

Coordinate media-to-video work through focused skills and existing tools. This is not a fixed pipeline: choose the smallest relevant sub-skill, load it only when needed, and keep user-facing claims grounded in tool evidence.

## Workflow Guidance

1. Inspect the user's input and determine the source modality: comic, document, image, image sequence, storyboard, animation plan, or generated media.
2. Use GetContext to inspect available related skills. Activate a focused skill when its detailed guidance is needed.
3. For comic EPUB/PDF/CBZ/CBR pages, prefer comic-to-storyboard first.
4. For still images or image sequences, prefer image-to-shot.
5. For an existing CompositeArtifact with a StoryboardTable domain block, or a legacy bare StoryboardTable, prefer storyboard-to-animation-plan before generation or Cut.
6. For an existing animation plan and a Cut target, prefer animation-plan-to-cut.
7. For already generated shots, prefer generated-shot-assembly and export-video-package as needed.
8. Stop after planning when generation providers, target plugins, approvals, or safe media refs are unavailable.

## Structured Artifact Rules

- Markdown is presentation only. For storyboard, animation, Canvas, Cut, generated media, or execution summaries, emit validated structured payloads.
- Use actual tool-result or generated-asset references for media. Do not invent ids.
- Do not embed base64, blob URLs, localhost URLs, or absolute local cache paths.
- Do not inspect `.neko/.cache`, `.neko/semantic-index`, SQLite, FTS, vector stores, scratch paths, Webview URIs, or provider-private payloads. Use QuerySemanticCoverage when a focused skill needs semantic evidence reuse for stable source ranges.
- Ask for approval before bulk generation, colorization, destructive timeline replacement, or long export unless the user explicitly requested automatic execution and policy allows it.

## Related Skill Selection

- comic-to-storyboard: comic page reading, panel/OCR evidence, CompositeArtifact output with a StoryboardTable domain block.
- image-to-shot: still image references to shot/storyboard plans.
- storyboard-to-animation-plan: storyboard rows to motion/camera/generation plans.
- animation-plan-to-cut: animation plans to Cut timeline payloads.
- generated-shot-assembly: generated media refs to assembly summaries.
- export-video-package: export-oriented packaging and delivery.

## Tool Use

Use QuerySemanticCoverage before expensive long-range analysis when stable source refs and ranges are available. Use ReadDocument, ReadImage, or ReadDocumentImage for missing/stale evidence. Use generation tools only after approval. Use Canvas/Cut tools only after the structured payload validates and the target capability exists.
