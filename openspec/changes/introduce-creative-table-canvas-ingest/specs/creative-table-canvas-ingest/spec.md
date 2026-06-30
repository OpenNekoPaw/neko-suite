## ADDED Requirements

### Requirement: Canvas provides a unified Markdown ingest capability
The system SHALL provide a Canvas-owned Markdown ingest capability or facade that accepts Markdown content, stable resource references, target information, provenance, and optional intent/profile hints, then resolves the request to a Markdown note, generic table, or creative table result.

#### Scenario: Markdown note is ingested
- **WHEN** a caller sends Markdown without a GFM table and without a creative table hint
- **THEN** Canvas MUST resolve the ingest result as a Markdown note
- **AND** Canvas MUST create or preview Canvas-owned note/text content without requiring the caller to provide Canvas node JSON

#### Scenario: Generic table is ingested
- **WHEN** a caller sends a GFM table without a supported creative profile hint or recognizable creative table intent
- **THEN** Canvas MUST resolve the ingest result as a generic table
- **AND** Canvas MUST preserve the original Markdown, columns, rows, cells, unknown columns, media/resource bindings, and diagnostics in Canvas-owned table metadata

#### Scenario: Creative table is ingested
- **WHEN** a caller sends a GFM table with a supported creative profile hint or a supported creative table intent
- **THEN** Canvas MUST resolve the ingest result as a creative table
- **AND** Canvas MUST apply the matched Creative Table profile before exposing creative field roles or follow-up actions

### Requirement: Table Core preserves table content and media bindings
Canvas SHALL use a media-aware Table Core for Markdown tables that preserves table structure and resource binding information independently of creative profile semantics.

#### Scenario: Ordinary table contains media references
- **WHEN** a generic Markdown table contains resource tokens or CommonMark image targets that match provided stable resources
- **THEN** Canvas MUST record bound media/resource metadata for display
- **AND** Canvas MUST NOT require the table to be a storyboard or creative table before rendering media status

#### Scenario: Table contains extra columns
- **WHEN** a table contains columns that are not consumed by the active profile
- **THEN** Canvas MUST preserve those columns and cell values as display metadata
- **AND** Canvas MUST NOT require a shared DTO change solely because a Skill added a new column

#### Scenario: Runtime-only resource identity is provided
- **WHEN** a table or ingest resource contains a Webview URI, blob URL, cache path, system temp path, Engine token, provider-private handle, or raw chat attachment order as durable identity
- **THEN** Canvas MUST reject or diagnose the value before binding
- **AND** Canvas MUST NOT recover success by guessing a stable resource from that runtime handle

### Requirement: Creative Table profiles define field roles
Canvas SHALL represent creative-table semantics through validated Creative Table profiles whose fields declare aliases, value types, and one of the creative roles `approval`, `plan`, or `execution`.

#### Scenario: Profile declares approval fields
- **WHEN** a Creative Table profile maps table columns to `approval` fields
- **THEN** Canvas MUST expose those fields as user-review information such as text, media, IP, character, scene, source, risk, or keep/skip decisions
- **AND** Canvas MUST NOT treat approval fields as executable actions by themselves

#### Scenario: Profile declares plan fields
- **WHEN** a Creative Table profile maps table columns to `plan` fields
- **THEN** Canvas MUST expose those fields as suggested next operations, prompts, parameters, durations, motion notes, decision reasons, or other planning information
- **AND** Canvas MUST NOT execute plan suggestions without a resolved execution action and lifecycle approval

#### Scenario: Profile declares execution fields
- **WHEN** a Creative Table profile maps table columns to `execution` fields
- **THEN** Canvas MUST validate that executable actions resolve to trusted registered capabilities before presenting them as runnable actions
- **AND** Canvas MUST block unknown, unsupported, or unapproved execution actions with diagnostics

### Requirement: Storyboard is a built-in Creative Table profile
The system SHALL treat storyboard planning as a built-in Creative Table profile rather than a standalone storyboard draft runtime or cross-package protocol.

#### Scenario: Storyboard profile is requested
- **WHEN** a caller sends a creative table with a storyboard profile hint
- **THEN** Canvas MUST resolve the table using the built-in storyboard Creative Table profile
- **AND** Canvas MUST group storyboard fields into approval, plan, and execution roles according to the profile descriptor

#### Scenario: Legacy storyboard-draft alias is used
- **WHEN** a caller uses `storyboard-draft`, `markdown-storyboard-draft`, or the existing Canvas storyboard draft profile id as a profile hint
- **THEN** Canvas MUST map the alias to the built-in storyboard profile or return a visible unsupported-profile diagnostic
- **AND** Canvas MUST NOT route the request through `@neko/storyboard-draft`, `@neko/draft-runtime`, or `StoryboardDraftNormalized`

### Requirement: Generic fallback is display-only
The system SHALL allow unsupported or invalid creative tables to fall back to generic table display while blocking creative semantics and execution.

#### Scenario: Creative profile is unknown
- **WHEN** a caller requests a creative profile that Canvas does not support
- **THEN** Canvas MAY return a generic table display result with a diagnostic explaining the unsupported profile
- **AND** Canvas MUST NOT expose creative field roles, execution readiness, or production actions as successful

#### Scenario: Creative table is invalid for execution
- **WHEN** a creative table is displayable but lacks fields or resource bindings required by an execution action
- **THEN** Canvas MUST preserve the table for review with diagnostics
- **AND** Canvas MUST block the affected execution action until the profile requirements are satisfied

### Requirement: Old draft runtime and compiler paths are not canonical
New Markdown-to-Canvas table requests SHALL NOT depend on old storyboard draft runtime, draft-runtime, or plugin-transfer compiler payloads as successful handoff paths.

#### Scenario: New handoff reaches an old compiler path
- **WHEN** a new Markdown table handoff would be routed through `@neko/storyboard-draft`, `@neko/draft-runtime`, `StoryboardDraftNormalized`, `canvasStructuredContent`, or a direct storyboard compiler payload
- **THEN** the route MUST fail visibly, be poisoned by tests, or be migrated to Canvas Markdown ingest before returning success

#### Scenario: Useful parser behavior remains needed
- **WHEN** existing table parsing, alias mapping, duration parsing, or resource token binding behavior remains useful
- **THEN** it MAY be migrated behind Canvas Table Core or Creative Table profile implementation
- **AND** it MUST NOT remain the public contract targeted by Agent Webview or Skills
