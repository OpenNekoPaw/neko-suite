## ADDED Requirements

### Requirement: Neko provides a public Markdown extension package
The system SHALL provide a public `@neko/markdown` package for Neko Markdown extension syntax, pure projection contracts, diagnostics, and rendering adapter boundaries.

#### Scenario: Package core is imported
- **WHEN** Agent, Canvas, or another package imports `@neko/markdown` core exports
- **THEN** the package MUST expose host-agnostic syntax parsing, tokenization, projection DTOs, diagnostics, and normalizers
- **AND** core exports MUST NOT import Agent, Canvas, VS Code, React, DOM, Extension Host modules, or feature package internals

#### Scenario: React rendering helpers are needed
- **WHEN** a Webview needs reusable React rendering helpers for Markdown extension projections
- **THEN** those helpers MUST live behind a React-safe subpath such as `@neko/markdown/react`
- **AND** the core package entry MUST remain usable by non-React callers

#### Scenario: Domain semantics are needed
- **WHEN** a Markdown token needs entity, asset, file, Canvas node, document, or resource semantics
- **THEN** `@neko/markdown` MUST use resolver/projection adapter contracts
- **AND** it MUST NOT directly call domain services, content access services, Canvas APIs, Agent runtime, or VS Code APIs

### Requirement: Markdown extension syntax is unified
`@neko/markdown` SHALL define the canonical Neko Markdown extension syntax and interpretation boundaries used by Agent rendering, Canvas handoff, and future Markdown-capable surfaces.

#### Scenario: Markdown is parsed for projection
- **WHEN** Markdown is parsed for enhanced rendering or handoff
- **THEN** CommonMark/GFM MUST remain the baseline
- **AND** Neko extensions MUST be represented as projections for tables, resources, mentions, semantic prompt spans, diagnostics, and handoff metadata without altering the source Markdown text

#### Scenario: Extension syntax is unsupported
- **WHEN** Markdown contains extension syntax that is not enabled in the current implementation slice
- **THEN** `@neko/markdown` or its caller MUST preserve the text and return a diagnostic when appropriate
- **AND** it MUST NOT silently resolve the syntax by raw path guessing, hidden Canvas commands, or feature-package fallback logic

### Requirement: Creative tables are enhanced Markdown projections
`@neko/markdown` SHALL support creative table projection over GFM tables without making Markdown rendering the field authority.

#### Scenario: Markdown table matches a creative profile hint
- **WHEN** a Markdown table appears to be a storyboard or creative table
- **THEN** the projection MAY include header classification, resource token candidates, semantic field hints, prompt span hints, and diagnostics
- **AND** Canvas MUST remain responsible for profile matching, field validation, resource binding, and node creation

#### Scenario: Table contains unknown fields
- **WHEN** a creative table contains columns not recognized by the projection layer
- **THEN** the projection MUST preserve the columns as Markdown table content
- **AND** it MUST NOT drop the columns or normalize them into Canvas fields before Canvas validation

### Requirement: At-mentions are semantic reference projections
`@neko/markdown` SHALL model `@` references as semantic mention tokens that can be resolved by caller-provided adapters.

#### Scenario: Mention resolves to a stable ref
- **WHEN** Markdown or prompt text contains an `@` mention that a caller-provided adapter resolves to an attached context chip, mention item, ambient Canvas node, entity, asset, or file ref
- **THEN** the projection MAY mark the mention as resolved and provide a display chip model
- **AND** handoff metadata MUST carry the stable ref rather than relying on the display label alone

#### Scenario: Mention is ambiguous or missing
- **WHEN** an `@` mention matches multiple candidates or no candidate
- **THEN** the projection MUST preserve the visible mention text and expose an ambiguous or missing-reference diagnostic when the mention is used for handoff
- **AND** it MUST NOT choose a candidate by display order without explicit resolution

### Requirement: CommonMark images are resource projections
`@neko/markdown` SHALL model CommonMark image syntax as media/resource embed projection with stable identity and optional placement hints.

#### Scenario: Image target contains a fragment
- **WHEN** Markdown contains an image such as `![alt](P1#panel_2)`
- **THEN** the projection MUST use the base token `P1` for resource lookup
- **AND** it MUST treat `panel_2` as placement, crop, panel, or section hint metadata rather than durable resource identity

#### Scenario: Image target resolves to a resource
- **WHEN** a CommonMark image target resolves through a caller-provided adapter to a stable `ResourceRef`, document resource ref, or authorized source
- **THEN** the projection MAY include renderable display metadata such as a Webview-safe URI supplied by the caller
- **AND** Canvas handoff metadata MUST carry only the stable resource identity and safe hint metadata

#### Scenario: Image target cannot resolve
- **WHEN** a CommonMark image target cannot resolve to a stable resource
- **THEN** the projection MUST include an unresolved-resource diagnostic or fallback token
- **AND** it MUST NOT persist a Webview URI, blob URL, cache path, or raw runtime handle as the resource identity

### Requirement: Neko resource-reference syntax is distinct from CommonMark images
`@neko/markdown` SHALL model `![[...]]` and `[[...]]` as Neko resource-reference extension syntax distinct from CommonMark image rendering.

#### Scenario: Resource-reference embed is enabled
- **WHEN** Markdown contains `![[...]]` and the resource-reference extension is enabled
- **THEN** the projection MUST resolve the target through an explicit caller-provided resource/document/entity resolver
- **AND** it MUST represent the resolved type as media preview, document excerpt, entity chip, link, or diagnostic according to resolver output

#### Scenario: Resource-reference link is not media
- **WHEN** Markdown contains a link such as `[[script.md#Scene 2]]`
- **THEN** the projection MUST treat it as a document/entity/context link unless the resolver identifies it as media
- **AND** it MUST NOT force it into an image preview based only on embed syntax or a `#` fragment

#### Scenario: Resource-reference extension is not enabled
- **WHEN** Markdown contains `![[...]]` or `[[...]]` before the extension is implemented
- **THEN** the projection MUST preserve the text and report an unsupported-extension diagnostic
- **AND** Send to Canvas MUST NOT treat the raw bracket text as a successfully resolved stable resource

### Requirement: Semantic prompt spans are Markdown projections
`@neko/markdown` SHALL model semantic prompt spans as projection metadata for display and handoff while leaving validation to Canvas or the owning domain.

#### Scenario: Prompt spans are present
- **WHEN** Markdown or structured assistant content includes semantic prompt span metadata
- **THEN** the projection MAY include span display metadata such as kind, field id, range, label, tone, stable ref, and tooltip content
- **AND** the projection MUST preserve the original prompt text

#### Scenario: Prompt span is edited outside Canvas
- **WHEN** a caller cannot validate an edited prompt span against Canvas field descriptors
- **THEN** the projection MUST preserve the edit as handoff content or prompt override metadata
- **AND** Canvas MUST validate the span before accepting field updates or execution actions
