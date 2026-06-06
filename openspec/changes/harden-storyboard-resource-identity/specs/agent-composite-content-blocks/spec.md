## ADDED Requirements

### Requirement: Composite storyboard media refs preserve scoped identity
The system SHALL assemble storyboard composite media references from explicit tool-result locators, stable resource references, or scoped aliases. Composite presenters MUST prefer stable refs over runtime paths and MUST NOT persist Webview URIs or cache paths into the composite storyboard identity.

#### Scenario: Composite block references completed document image
- **WHEN** a composite storyboard block references a completed `ReadDocument`, `ReadDocumentImage`, or `ReadImage` result
- **THEN** the presenter resolves the media to its tool call id, asset index, and stable resource metadata when available
- **THEN** the Canvas transfer payload uses the stable reference fields rather than the image cache path

#### Scenario: Composite block references missing tool result
- **WHEN** a composite storyboard block references a tool result that is not ready
- **THEN** the presenter emits a missing-media diagnostic
- **THEN** it does not substitute another image by sequence

### Requirement: Markdown storyboard fallback is bounded by alias scope
The system SHALL allow Markdown storyboard tables to infer image references only when scoped alias or single-batch row-order inference is unambiguous.

#### Scenario: Markdown row names P6
- **WHEN** a Markdown storyboard row names `P6` and exactly one available image batch has page 6 metadata
- **THEN** the inferred Canvas shot uses that batch's tool call id, asset index, and stable resource reference

#### Scenario: Markdown row names duplicate P1
- **WHEN** a Markdown storyboard row names `P1` and multiple available image batches expose page 1
- **THEN** the presenter reports an ambiguous media reference diagnostic
- **THEN** the Canvas transfer does not attach an arbitrary page 1 image
