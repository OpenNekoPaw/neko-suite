# canvas-markdown-capabilities Specification

## Purpose

TBD - created by archiving change introduce-conversation-draft-workspaces. Update Purpose after archive.

## Requirements

### Requirement: Markdown is automatically authored into the resolved Board

The system SHALL retain creator-useful Markdown through the resolved `neko/boards/*.nkc` document using existing Canvas Markdown authoring capabilities. Specialized Storyboard/table or other professional node creation SHALL remain explicit and outside Basic catalog behavior.

#### Scenario: Markdown artifact is produced

- **WHEN** Agent produces a creator-useful Markdown document without explicit professional Canvas creation intent
- **THEN** the document is automatically authored into the resolved Board Canvas through the typed Canvas Markdown path

#### Scenario: Structured Canvas creation is requested

- **WHEN** the user explicitly chooses structured Canvas creation through a professional action or target
- **THEN** the matching typed Canvas validation/creation capability receives the Markdown, stable references, provenance, and explicit authoring intent

#### Scenario: Canvas Markdown implementation is unavailable

- **WHEN** explicit structured authoring requires a Canvas Markdown capability that is missing or unsupported
- **THEN** the request fails visibly and MUST NOT fall back to generic structured Canvas content, raw Canvas nodes, or a legacy storyboard compiler

### Requirement: Storyboard stays Markdown until explicit structured authoring

The system SHALL keep an unspecified Storyboard plan as reviewable Markdown in its resolved Board `.nkc`. Basic catalog behavior MUST NOT create production Storyboard nodes; structured nodes require validated explicit professional authoring.

#### Scenario: Storyboard is explored in Basic mode

- **WHEN** a caller creates or revises an exploratory storyboard without professional creation intent
- **THEN** flexible Markdown remains normal document content and no Canvas scene/shot nodes are created

#### Scenario: Storyboard nodes are explicitly created

- **WHEN** the user explicitly chooses Create Structured Storyboard for usable Markdown
- **THEN** Canvas validates and creates Canvas-owned semantic storyboard nodes from bound resources and returns stable professional identity/revision

#### Scenario: Markdown has unresolved production choices

- **WHEN** professional validation finds ambiguous media bindings, missing required shot information, or conflicting production intent
- **THEN** Canvas returns review diagnostics and MUST NOT claim structured storyboard creation success

### Requirement: Generic Send to Canvas is not the default Board retention path

The system SHALL automatically retain eligible Markdown through resolved Board delivery. Add to Board Canvas MAY handle historical or external content that was not part of current typed delivery.

#### Scenario: Current Agent result is already auto-delivered

- **WHEN** a creator-useful Markdown result appears on the resolved Board Canvas
- **THEN** the UI does not require Send to Canvas to keep it

#### Scenario: Historical content is added to a Board

- **WHEN** the user explicitly adds an older unprojected Markdown result to the current Board
- **THEN** the Board Canvas path performs idempotent delivery without creating specialized Storyboard/professional nodes

#### Scenario: Legacy Send-to-Canvas route is invoked for a new Basic request

- **WHEN** a new Basic Markdown request attempts to return success through the old generic handoff/compiler path
- **THEN** the route fails closed and does not mutate another Canvas through fallback
