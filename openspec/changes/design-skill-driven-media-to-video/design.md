## Context

Neko Agent already has a skill runtime with lazy loading, active skill injection, tool permissions, related skill metadata, and the accepted ADR that skill workflows are prompt-chains rather than phases/pipelines DSL. The previous media-to-video attempt added a TypeScript catalog/router/flow skeleton, which solved some route visibility problems but put the workflow shape back into code. That direction does not match the repository architecture because adding a new media workflow would require code edits even when the desired change is only a new skill package.

Media-to-video also crosses multiple domains: document/image reading, comic perception, OCR, storyboard structure, generation, Canvas, Cut, export, and webview rendering. The stable boundary should be contracts and tools, not a hardcoded end-to-end route. The Agent should read a top-level `media-to-video` skill, select or activate focused sub-skills, call the existing tools, and emit structured artifacts that downstream surfaces can validate and render.

Five-layer analysis:

| Layer | Design stance |
| ----- | ------------- |
| Responsibilities | Skill text owns domain workflow guidance; Agent runtime owns discovery/injection/tool permission; shared contracts own artifact validation; target plugins own editing/import behavior. |
| Dependencies | Agent runtime may depend on shared skill/artifact contracts and tool registries; Webview consumes projections only; no Webview import from Agent/Platform/VSCode. |
| Interfaces | Use `SkillManifest`/skill registry for media hints and related skills; use existing tool contracts for execution; use existing composite/storyboard artifacts for display and send-to actions. |
| Extension | New workflows are added by installing or editing skills/sub-skills, not by adding TypeScript route branches. New deterministic metadata must be small and runtime-consumed. |
| Testing | Test manifest discovery, lazy loading, related-skill activation, tool permission enforcement, artifact validation, and no-code-route behavior with mocked skills/tools. |

## Goals / Non-Goals

**Goals:**

- Make `media-to-video` a top-level skill prompt-chain that can compose sub-skills.
- Let media sub-skills be regular skills with optional manifest metadata, not a separate registry type.
- Keep ordered workflow instructions in SKILL.md body text, preserving AI-native prompt-chain behavior.
- Add only deterministic metadata that runtime or UI must consume before full skill injection.
- Ensure Agent output for storyboard/animation/canvas/cut remains structured and validated.
- Allow skills to reference real tool-result media refs without absolute file paths or invented resource ids.
- Support future comic-to-animation, image-to-shot, storyboard-to-cut, and other media routes by adding skills rather than code paths.

**Non-Goals:**

- Do not implement a media-to-video TypeScript router, catalog, DAG, or fixed flow executor.
- Do not revive `phases`, `pipelines`, or any workflow-order DSL in skill manifests.
- Do not make markdown tables authoritative structured data.
- Do not require Canvas, Cut, or generation providers for planning-only workflows.
- Do not implement new image segmentation, colorization, video generation, or timeline algorithms in skill text.

## Decisions

### Decision 1: Top-level skill owns orchestration semantics

`media-to-video/SKILL.md` SHALL describe the broad workflow in natural language: inspect inputs, choose relevant sub-skills, produce structured planning artifacts, ask for approvals before expensive/destructive work, then call target tools when available. It may say "for comic EPUB, use comic-to-storyboard first; for an existing StoryboardTableV1, use storyboard-to-animation-plan or storyboard-to-cut", but this is prompt guidance read by the Agent, not a runtime route table.

Alternative considered: a `MediaToVideoRouter` in Agent code. Rejected because it hardcodes evolving creative decisions and duplicates the skill system.

### Decision 2: Sub-skills are normal skills with manifest hints

Focused workflows such as `comic-to-storyboard`, `image-to-shot`, `storyboard-to-animation-plan`, `animation-plan-to-cut`, `generated-shot-assembly`, and `export-video-package` SHALL be regular skills discoverable through the existing registry. The top-level skill references them through `SkillManifest.referencedSkills` and body text. If additional machine-readable filtering is needed, extend `SkillManifest` with a small `mediaWorkflow` block, for example modality hints, produced artifact kinds, risk/cost hints, and validation requirements.

The `mediaWorkflow` block MUST NOT include ordered steps, stages, route priorities, or branching conditions that become an executable workflow. Those remain prompt-chain content.

Alternative considered: a separate `MediaSubSkillManifestV1` registry. Rejected because it creates a parallel skill system and encourages fixed route planning.

### Decision 3: Runtime composes skills through existing activation mechanisms

Agent runtime SHALL provide discovery and activation affordances for related skills:

- List candidate skills by metadata, tags, description, and related-skill links.
- Lazy-load the top-level skill first.
- Let the Agent activate a focused sub-skill when the task needs its detailed instructions.
- Preserve tool allowlists from the active skill and any approved sub-skill activation.
- Project skill activation and produced artifacts to the webview for observability.

Runtime may improve skill matching with deterministic hints, but it must not execute a media workflow without LLM/tool-loop participation.

### Decision 4: Tools perform operations; skills instruct when to use them

Actual work SHALL go through existing tools/services:

- ReadDocument for manifests/text document inspection.
- ReadDocumentImage or ReadImage for vision analysis, with the existing rule to avoid duplicate calls for the same image batch.
- OCR/panel/color tools when present.
- Generation/editing tools only after approval and provider availability checks.
- Canvas/Story/Cut/export tools only after structured artifact validation.

Skill text can recommend the order and decision points, but code should only enforce tool availability, permissions, request validation, retry/timeout/cancellation, and safe resource access.

### Decision 5: Structured artifacts are authoritative

For storyboards, animation plans, Canvas payloads, Cut payloads, generated media refs, and summaries, the Agent SHALL emit structured composite payloads validated by shared contracts. Markdown prose may summarize or present the result, but it is not parsed as the source of truth.

When a storyboard shot references a source image, it SHALL use a safe media reference derived from an actual tool result, such as a tool-call asset locator or existing generated asset reference. It MUST NOT embed absolute local cache paths, blob URLs, base64, or invented IDs.

### Decision 6: Webview renders projections, not workflows

The Agent webview SHALL display route/skill/progress information as a projection of active skills, tool calls, approvals, artifacts, and diagnostics. It should not infer a workflow from markdown or own send-to semantics. Send-to actions are enabled only when a validated artifact exists and the target capability is available.

## Risks / Trade-offs

- [Risk] Without a code router, the Agent may choose inconsistent sub-skill ordering. → Mitigation: strengthen top-level skill prompt-chain, add examples, and test expected skill activation/tool-use transcripts with mocked tools.
- [Risk] Too much metadata in `mediaWorkflow` can recreate a DSL. → Mitigation: enforce a schema that only accepts filtering/validation hints; explicitly reject ordered step/stage fields.
- [Risk] Sub-skill activation can bloat context. → Mitigation: lazy-load only selected sub-skills and keep top-level skill concise.
- [Risk] Existing built-in `comic-to-storyboard` content already contains broad video-generation instructions. → Mitigation: split it into focused sub-skills or update body sections so `comic-to-storyboard` stops claiming ownership of generation/assembly.
- [Risk] Tool-result media refs may be hard for the Agent to cite accurately. → Mitigation: expose stable asset indexes/tool-call IDs in tool results and document the exact reference format in media skills.
- [Risk] Provider/tool failures could be mistaken for skill failure. → Mitigation: project diagnostics separately for skill activation, tool availability, artifact validation, and target send-to failures.

## Migration Plan

1. Keep the reverted hardcoded media-to-video modules absent.
2. Add or refine `mediaWorkflow` manifest hints only if existing `SkillManifest` cannot express deterministic filtering.
3. Add `media-to-video` as a built-in or project skill with concise prompt-chain instructions and related sub-skill references.
4. Split/refine focused media skills so each owns one domain transformation and declares only the tools it needs.
5. Wire skill discovery/activation affordances through the existing SkillService and meta-tools.
6. Validate structured artifacts and webview rendering using existing composite/storyboard paths.
7. Add regression tests proving new media workflows can be introduced by skill files without Agent route code changes.

Rollback is straightforward: disable the new skills or remove their manifests. No persisted user artifact format should depend on the top-level skill itself.

## Open Questions

- Should `mediaWorkflow` live directly in `SkillManifest`, or should it be a namespaced `extensions["neko.mediaWorkflow"]` block to keep shared skill metadata generic?
- Should the built-in `comic-to-storyboard` skill be replaced in place, or should a new project skill override it while retaining backward compatibility?
- Which tool result projection should be treated as the canonical image locator in structured storyboard media refs: composite asset index, generated asset ref, or a dedicated evidence ref?
