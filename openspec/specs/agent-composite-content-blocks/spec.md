# agent-composite-content-blocks Specification

## Purpose
Define the Webview-facing composite content block contract for structured multimodal layout intent. This capability keeps layout/presentation concerns in the message and RichContent presentation layer while resolving media only through backfilled tool results and host-provided render URIs.
## Requirements
### Requirement: Composite content blocks express structured multimodal layout intent
The system SHALL support a `composite` content block type that carries a template, optional title, and ordered sections. Sections MUST be able to reference media by tool call id, optional asset index, caption, role, and layout hint.

#### Scenario: LLM emits storyboard table intent
- **WHEN** an assistant response contains a composite block with template `storyboard-table`
- **THEN** the message model preserves the ordered sections and media references for Webview presentation

#### Scenario: Composite block coexists with text and tool blocks
- **WHEN** an assistant response includes text, tool calls, and a composite block
- **THEN** content blocks preserve chronological ordering without converting composite data into plain markdown

### Requirement: Webview assembly resolves media references through tool results
The system SHALL resolve composite media references in the Webview presentation layer by locating the corresponding backfilled tool result and selecting stable asset or thumbnail references. The assembly layer MUST use Extension adapter output for webview-safe URIs and MUST NOT persist webview URI values into agent history.

#### Scenario: Media reference resolves to generated asset
- **WHEN** a composite section references a completed image generation tool call
- **THEN** Webview assembly resolves the section media to the tool result asset reference and renderable webview URI

#### Scenario: Missing media reference renders diagnostic state
- **WHEN** a composite section references a tool call without a backfilled asset result
- **THEN** the Webview renders a bounded missing-media diagnostic state without crashing the message presenter

### Requirement: RichContent renderers cover storyboard, comparison, and gallery templates
The system SHALL register RichContent renderers for storyboard tables, comparison grids, and asset galleries. These renderers MUST consume resolved projection data rather than reading agent runtime state directly.

#### Scenario: Storyboard renderer shows section rows
- **WHEN** the resolved projection uses storyboard table template
- **THEN** the renderer displays ordered rows containing shot text, media preview, captions, and timing or role metadata when available

#### Scenario: Comparison renderer shows multiple variants
- **WHEN** the resolved projection uses comparison template with multiple media references
- **THEN** the renderer displays comparable media cells with labels or captions from the composite sections

#### Scenario: Gallery renderer shows generated assets
- **WHEN** the resolved projection uses gallery template
- **THEN** the renderer displays available generated assets and exposes host-mediated actions such as save or export without embedding raw payloads

### Requirement: Composite blocks stay out of provider context
The system SHALL treat CompositeBlock as presentation intent for Webview rendering. Provider message assembly MUST NOT feed rendered CompositeBlock output back into LLM context unless a separate summarization or export step explicitly requests it.

#### Scenario: Next LLM turn reads tool result rather than rendered table
- **WHEN** a previous assistant message contains a rendered storyboard composite block
- **THEN** the next LLM context uses patched tool results and perception cards rather than the Webview-rendered table as hidden context

#### Scenario: Export is explicit host action
- **WHEN** a user chooses to export a composite storyboard
- **THEN** the export flow uses a host-mediated action and does not change the default provider message projection

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

### Requirement: Storyboard composite blocks support semantic storyboard tables
The system SHALL support `storyboard-table` composite blocks that carry validated `StoryboardTableV1` semantic data in addition to legacy section-based rich content. When semantic data is present and valid, rich rendering and downstream projection MUST prefer the semantic storyboard table while retaining legacy display compatibility during migration.

#### Scenario: Semantic storyboard table is extracted from composite content
- **WHEN** an assistant response contains a `neko-composite` fenced JSON block with template `storyboard-table` and valid `StoryboardTableV1` fields
- **THEN** the message model preserves the semantic storyboard table for validation, rendering, and downstream projection

#### Scenario: Invalid semantic storyboard renders diagnostics
- **WHEN** a `storyboard-table` composite block has schema errors that block projection
- **THEN** the Webview renders a bounded diagnostic state and does not expose executable Canvas/Cut send-to actions for that block

#### Scenario: Legacy storyboard sections remain renderable
- **WHEN** an assistant response contains an existing section-based `storyboard-table` composite block
- **THEN** the Webview continues to render the legacy rows and attempts compatibility normalization without requiring immediate v1 adoption

#### Scenario: Semantic projection takes precedence over inferred projection
- **WHEN** a `storyboard-table` block has valid semantic scenes and shots plus legacy sections
- **THEN** Canvas/Cut projectors use the semantic `StoryboardTableV1` data rather than inferring shots from display sections

### Requirement: Storyboard composite diagnostics do not leak runtime resources
The system SHALL show storyboard validation, media resolution, and provider availability diagnostics without persisting host-only render URIs, blob URLs, inline base64, or absolute local paths in composite content.

#### Scenario: Missing provider diagnostic is displayed
- **WHEN** a valid storyboard table requires an unavailable provider
- **THEN** the Webview displays a missing capability diagnostic and keeps the storyboard plan visible

#### Scenario: Unsafe media ref is blocked from rendering
- **WHEN** a storyboard media ref contains runtime-only or unsafe resource data
- **THEN** the presenter excludes that resource from rendering and displays a bounded diagnostic instead of crashing
