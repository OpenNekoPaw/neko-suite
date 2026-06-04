## 1. Contracts and Metadata

- [x] 1.1 Audit existing `SkillManifest`, `Skill`, `RelatedSkill`, tool permission, composite content, storyboard, generated asset, and multimodal evidence contracts to identify the minimum metadata needed for media workflow discovery.
- [x] 1.2 Add a small media workflow hint contract only if existing `SkillManifest` is insufficient; keep it limited to modalities, artifact kinds, cost/risk hints, validation requirements, and tags.
- [x] 1.3 Add validation that rejects or diagnoses ordered stages, executable steps, branch conditions, route priorities, or DAG-like fields in media workflow metadata.
- [x] 1.4 Export any new shared contract through existing `@neko/shared` entry points without adding Agent, Webview, VSCode, Canvas, Cut, Story, or Platform dependencies.
- [x] 1.5 Add shared contract tests for valid media skill hints, invalid workflow DSL fields, related-skill metadata, and backward-compatible manifest-less skills.

## 2. Skill Package Content

- [x] 2.1 Add or update a top-level `media-to-video` skill with prompt-chain guidance for input inspection, sub-skill choice, artifact planning, approval boundaries, tool use, send-to behavior, and fallback handling.
- [x] 2.2 Refine `comic-to-storyboard` so it focuses on comic reading, panel/OCR evidence, and `StoryboardTableV1` output instead of owning generation and timeline assembly.
- [x] 2.3 Add or refine focused sub-skills for `image-to-shot`, `storyboard-to-animation-plan`, `animation-plan-to-cut`, `generated-shot-assembly`, and `export-video-package` as normal skills.
- [x] 2.4 Declare related-skill links, tool permissions, optional subpackage requirements, and media workflow hints in skill manifests where runtime needs deterministic metadata.
- [x] 2.5 Add skill body examples showing safe image refs from actual tool results and structured `neko-composite` storyboard payloads, without base64, absolute paths, or invented IDs.

## 3. Skill Runtime Discovery and Activation

- [x] 3.1 Extend skill loading or manifest projection to expose compact media workflow hints and related skill references without loading every SKILL.md body.
- [x] 3.2 Add skill discovery helpers or meta-tool output that can list media workflow candidates by modality, artifact kind, tags, related-skill links, and availability.
- [x] 3.3 Ensure activating the top-level skill can lazily load a selected focused sub-skill using the existing `SkillRegistry.ensureLoaded` and SkillService injection path.
- [x] 3.4 Preserve tool allowlist and activation diagnostics across top-level skill and focused sub-skill activation without granting tools that neither skill declares.
- [x] 3.5 Add runtime tests for top-level skill activation, lazy sub-skill loading, missing related-skill diagnostics, disabled skill filtering, and no fixed media route module import.

## 4. Tool Use and Structured Artifacts

- [x] 4.1 Update media skills and runtime prompts so actual document/image/OCR/panel/generation/canvas/cut/export work happens through existing tools or service adapters.
- [x] 4.2 Ensure tool results expose stable media asset references that can be cited by structured storyboard and animation artifacts without absolute cache paths.
- [x] 4.3 Validate storyboard, animation plan, Canvas payload, Cut payload, generated media ref, and execution summary artifacts before rendering or send-to actions.
- [x] 4.4 Enforce approval diagnostics before bulk generation, colorization, destructive timeline replacement, or long-running export unless explicit auto-execution policy allows it.
- [x] 4.5 Add contract/integration tests with mocked skills and tools for comic EPUB to storyboard, image to shot plan, storyboard to animation plan, storyboard to Cut payload, and degraded missing-provider paths.

## 5. Webview and Target Plugin Projection

- [x] 5.1 Project active media skill, selected sub-skill, related-skill candidates, tool calls, approvals, diagnostics, and produced artifact summaries through existing Agent message/projection contracts.
- [x] 5.2 Render structured storyboard and animation artifacts through existing rich content/composite renderers rather than markdown table parsing.
- [x] 5.3 Enable send-to Canvas, Story, Cut, generation, and export actions only when validation passes and the target capability is available.
- [x] 5.4 Verify thumbnails/media previews use safe resource access and can render tool-result or generated-asset refs without direct absolute file access.
- [x] 5.5 Add webview tests for media skill observability, disabled invalid send-to actions, safe media refs, validation diagnostics, and target capability absence.

## 6. Documentation and Quality Gates

- [x] 6.1 Update `docs/architecture/agent-media-architecture.md` to describe media-to-video as skill-driven composition rather than code-owned orchestration.
- [x] 6.2 Update skill authoring guidance to explain media workflow hints, related sub-skills, prompt-chain sections, structured artifact output, and forbidden workflow DSL fields.
- [x] 6.3 Add a regression note or test fixture proving a new media workflow can be introduced by adding skill files only.
- [x] 6.4 Run focused shared contract tests covering skill metadata and artifact validation.
- [x] 6.5 Run focused Agent skill runtime tests covering discovery, lazy loading, activation, permissions, and mocked media workflow execution.
- [x] 6.6 Run focused webview tests covering structured artifact rendering and safe media previews.
- [x] 6.7 Run the narrowest package typechecks/checks covering touched packages and document any existing unrelated failures.
