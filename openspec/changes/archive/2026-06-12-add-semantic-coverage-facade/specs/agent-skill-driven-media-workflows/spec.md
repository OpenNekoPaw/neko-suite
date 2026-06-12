## ADDED Requirements

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
