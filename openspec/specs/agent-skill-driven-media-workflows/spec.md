# agent-skill-driven-media-workflows Specification

## Purpose
Define how broad media-to-video Agent workflows are represented through top-level Skills, focused sub-skills, tool execution, and structured artifacts.
## Requirements
### Requirement: Media workflows are skill-driven
The system SHALL represent broad media-to-video workflows as top-level skills and focused sub-skills, rather than as hardcoded Agent route catalogs, route planners, or fixed flow executors.

#### Scenario: Comic-to-animation request uses skills
- **WHEN** a user asks the Agent to convert a comic EPUB into storyboard or animation planning artifacts
- **THEN** the Agent SHALL rely on activated media skills and existing tools for guidance and execution, without requiring a dedicated TypeScript comic-to-animation route branch

#### Scenario: New workflow added by skill files
- **WHEN** a new media workflow skill and related sub-skill files are installed with valid metadata
- **THEN** the Agent SHALL be able to discover and activate them through the skill system without adding a new Agent code route

### Requirement: Top-level media skill composes focused sub-skills
The system SHALL provide a top-level media workflow skill that can discover, reference, and activate focused media sub-skills through existing Skill registry and lazy-loading mechanisms.

#### Scenario: Related sub-skills are visible before full load
- **WHEN** the top-level media skill is discovered
- **THEN** the runtime SHALL expose compact related-skill metadata sufficient for the Agent to choose candidate sub-skills without loading every full SKILL.md body

#### Scenario: Sub-skill loads only when needed
- **WHEN** the Agent chooses a focused media sub-skill for the current task
- **THEN** the runtime SHALL lazy-load that sub-skill's full instructions before it is injected or used

#### Scenario: Missing sub-skill degrades clearly
- **WHEN** a referenced focused media sub-skill is unavailable
- **THEN** the runtime SHALL return a diagnostic that names the missing skill and allows the Agent to continue with available skills when safe

### Requirement: Media workflow metadata remains deterministic but non-orchestrating
The system SHALL allow skill manifests to declare deterministic media workflow hints only for runtime filtering, permission, validation, and UI projection needs.

#### Scenario: Manifest declares media hints
- **WHEN** a media skill manifest declares accepted modalities, produced artifact kinds, cost/risk hints, required tools, or validation requirements
- **THEN** the runtime SHALL use those fields for discovery, filtering, permissions, diagnostics, and artifact validation

#### Scenario: Manifest rejects workflow DSL
- **WHEN** a media skill manifest attempts to declare ordered stages, executable steps, route priorities, branch conditions, or a workflow DAG
- **THEN** validation SHALL reject or ignore those fields with a diagnostic explaining that workflow order belongs in SKILL.md prompt-chain text

### Requirement: Prompt-chain text owns workflow guidance
The system SHALL keep media workflow ordering, decision points, fallback guidance, and sub-skill collaboration instructions in SKILL.md body text.

#### Scenario: Agent reads workflow guidance
- **WHEN** a media skill is activated
- **THEN** its injected prompt SHALL include human-readable guidance for inspection, planning, approval, execution, fallback, and collaboration with related skills

#### Scenario: Runtime does not parse prompt-chain as a route
- **WHEN** a media skill body contains a numbered workflow or section headings
- **THEN** the runtime SHALL NOT parse those headings into a deterministic route, stage machine, or tool execution plan

### Requirement: Tools execute media operations
The system SHALL execute media inspection, extraction, OCR, panel detection, generation, Canvas import, Cut timeline writing, and export through existing tools or service adapters rather than through skill text or mock flow code.

#### Scenario: Image analysis uses tool results
- **WHEN** the Agent needs visual evidence from document or image inputs
- **THEN** it SHALL call the appropriate media reading or vision tool and ground visual claims in the returned tool results

#### Scenario: Duplicate vision calls are avoided
- **WHEN** ReadDocument has already returned image paths or images for a page batch
- **THEN** the Agent SHALL use ReadImage for vision analysis instead of calling ReadDocumentImage for the same images unless it still only has document locators

#### Scenario: Expensive or destructive operations require approval
- **WHEN** a media skill reaches bulk generation, colorization, destructive timeline replacement, or long-running export
- **THEN** the system SHALL require an approval gate unless the user explicitly requested automatic execution and policy allows it

### Requirement: Structured artifacts are authoritative
The system SHALL treat structured storyboard, animation plan, Canvas payload, Cut payload, generated media ref, and execution summary artifacts as authoritative, validated data; markdown SHALL be presentation only.

#### Scenario: Storyboard table renders from structured payload
- **WHEN** the Agent returns a storyboard table
- **THEN** the webview SHALL render it from a validated structured payload rather than parsing a markdown table

#### Scenario: Invalid structured artifact blocks send-to action
- **WHEN** a generated artifact fails schema validation
- **THEN** target send-to actions SHALL be disabled and the UI or Agent SHALL show validation diagnostics

### Requirement: Media references use safe provenance
The system SHALL require images, videos, audio, and document references inside structured media artifacts to point to safe resource references derived from real tool results or generated asset records.

#### Scenario: Source image embedded in storyboard shot
- **WHEN** a storyboard shot references an original comic page or panel image
- **THEN** the reference SHALL identify an actual tool result or generated asset with stable provenance and asset index

#### Scenario: Unsafe paths are rejected
- **WHEN** a structured media artifact includes an absolute local cache path, blob URL, base64 payload, localhost URL, or invented tool-call id as a media reference
- **THEN** validation SHALL reject the reference or prevent it from being rendered/sent to target plugins

### Requirement: Webview displays skill workflow observability
The Agent webview SHALL display media workflow progress as projections of active skills, related skills, tool calls, approvals, produced artifacts, and diagnostics without owning workflow semantics.

#### Scenario: Active media skills are visible
- **WHEN** a media workflow skill or focused sub-skill is activated
- **THEN** the webview SHALL be able to show the active skill name, relevant related-skill candidates, and produced artifact summaries

#### Scenario: Target actions require validated artifacts
- **WHEN** the Agent offers send-to Canvas, Story, Cut, generation, or export actions
- **THEN** those actions SHALL be shown only for validated artifacts and available target capabilities

### Requirement: Code has no fixed media workflow regression
The implementation SHALL include regression coverage that prevents reintroducing a fixed media-to-video route catalog, router, or dry-run flow as the primary workflow mechanism.

#### Scenario: No media route module required
- **WHEN** focused tests exercise a representative media-to-video task with mocked skills and tools
- **THEN** the task SHALL complete through SkillService discovery/activation and structured artifact validation without importing a dedicated media route module

#### Scenario: Skill installation changes available workflows
- **WHEN** test fixtures add or remove media workflow skill files
- **THEN** discovered media workflow capabilities SHALL change accordingly without modifying Agent source code

### Requirement: Agent Queries Semantic Coverage Before Long-Range Analysis
The system SHALL require Agent media workflows to query semantic coverage through a host-mediated tool or facade before analyzing long document, comic, video, or audio ranges when stable source references and locators are available.

#### Scenario: Comic pages reuse existing evidence
- **WHEN** a comic-to-storyboard or comic-to-animation skill analyzes pages 11-20 after pages 1-10 already have fresh semantic evidence
- **THEN** Agent first queries semantic coverage for the relevant source and range
- **THEN** Agent uses fresh evidence from pages 1-10 as context and analyzes only missing or stale ranges needed for the current task

#### Scenario: No stable source falls back clearly
- **WHEN** a media input lacks a stable source reference or locator sufficient for semantic coverage
- **THEN** Agent continues with normal tool-based analysis
- **THEN** Agent emits a diagnostic explaining that semantic coverage reuse was unavailable for that input

### Requirement: Skills Guide Coverage Use Without Owning Workflow Execution
The system SHALL keep semantic coverage guidance in skill prompt-chain text and tool descriptions while executing coverage queries through tools or host facades. Skill manifests MUST NOT define deterministic coverage routes, workflow DAGs, or cache-file readers.

#### Scenario: Skill instructs coverage query
- **WHEN** a media workflow skill is activated for a long-range document or comic task
- **THEN** its prompt guidance can instruct Agent to query semantic coverage before expensive analysis
- **THEN** runtime execution still occurs through registered tools or host services rather than parsed skill headings or hardcoded route code

#### Scenario: Skill does not read cache files
- **WHEN** a skill references semantic evidence reuse
- **THEN** it instructs Agent to call the semantic coverage facade or tool
- **THEN** it does not instruct Agent to inspect `.neko/.cache`, `.neko/semantic-index`, SQLite, FTS, vector stores, scratch paths, or Webview URIs

### Requirement: Agent Submits New Semantic Evidence Through Contributions
After analyzing missing or stale ranges, Agent workflows SHALL submit new semantic evidence as structured contributions or artifacts with provenance rather than persisting prompt context or local cache paths.

#### Scenario: Missing range analysis emits contribution
- **WHEN** Agent analyzes a missing comic page range and derives OCR text, entity mentions, or character observations
- **THEN** it emits `MediaTextSegment`, `MediaSemanticIndex`, `EntityMemoryContribution`, or a reviewable structured artifact with source refs, range, confidence, and provenance
- **THEN** it does not write confirmed entity facts directly

#### Scenario: Coverage source appears in user-facing output
- **WHEN** Agent combines cached evidence and newly analyzed evidence in an execution summary or review artifact
- **THEN** the output distinguishes fresh reused evidence, newly generated evidence, stale evidence, and missing/failed ranges through diagnostics or provenance metadata

