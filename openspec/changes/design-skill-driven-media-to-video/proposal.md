## Why

The previous media-to-video direction placed route and flow decisions in Agent code, which conflicts with the accepted Skill-as-prompt-chains architecture and makes comic/script/image workflows harder to extend without code changes. Media-to-video should instead be expressed as a top-level skill that composes smaller domain skills, while code only provides deterministic discovery, permission, lazy loading, artifact validation, and tool execution boundaries.

## What Changes

- Introduce a skill-driven media workflow design where `media-to-video` is a top-level SKILL.md prompt-chain, not a hardcoded TypeScript flow.
- Define how media sub-skills such as comic-to-storyboard, image-to-shot, storyboard-to-animation-plan, animation-plan-to-cut, and export helpers are discovered, referenced, and lazily loaded through the existing Skill registry.
- Keep ordered workflow guidance in SKILL.md body sections; avoid reintroducing phases/pipelines DSL or a code-owned workflow DAG.
- Add a small program-facing manifest contract only for deterministic needs: modality hints, produced artifact kinds, tool permissions, risk/cost metadata, dependency skill references, and validation requirements.
- Require generated storyboard, animation plan, Canvas, Cut, and media refs to be structured artifacts validated by existing shared contracts; markdown remains presentation only.
- Remove the concept of a dedicated hardcoded media-to-video orchestrator module; any implementation should wire into SkillService, capability injection, multimodal tooling, composite content, and existing target-plugin send-to contracts.

## Capabilities

### New Capabilities

- `agent-skill-driven-media-workflows`: Covers top-level media workflow skills, media sub-skill discovery, prompt-chain composition, lazy loading, structured artifact handoff, and deterministic code boundaries for skill-driven media-to-video work.

### Modified Capabilities

- None. This change should reuse existing capability surfaces such as `agent-capability-injection`, `agent-multimodal-tooling`, `agent-composite-content-blocks`, `canvas-agent-composite-operations`, `story-video-readiness-table`, and `storyboard-execution-summary` without changing their external requirements.

## Impact

- Agent skill runtime: Skill registry/loading, skill metadata projection, active skill injection, and optional related-skill discovery.
- Shared contracts: small additions or refinements for skill manifest metadata only if existing `SkillManifest` cannot express media workflow hints.
- Built-in/project skills: add or update SKILL.md files for `media-to-video` and focused sub-skills.
- Agent webview: render skill-driven structured artifacts through existing composite/storyboard renderers rather than markdown table parsing.
- Tool/capability layer: route actual work through existing tools such as ReadDocument, ReadDocumentImage, ReadImage, OCR/panel detection, generation, Canvas import, Cut timeline, and export adapters.
- Documentation/tests: update media and skill architecture docs; add tests for skill discovery, lazy loading, artifact validation, and no fixed-flow regression.
