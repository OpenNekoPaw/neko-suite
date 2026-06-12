# storyboard-resource-identity Specification

## Purpose
Define stable storyboard media identity across Agent, Canvas, document readers, and resource cache surfaces. This capability separates durable source references from runtime preview handles so storyboard image binding can survive cache regeneration, extension boundaries, and repeated document reads.
## Requirements
### Requirement: Storyboard media identity uses stable refs
The system SHALL represent cross-surface storyboard media identity with stable resource references, document source locators, or tool-result locators that can resolve to stable resource references. Runtime cache paths, Webview URIs, blob URLs, object URLs, and extension-private scratch paths MUST NOT be used as the primary identity for new Agent-to-Canvas storyboard media.

#### Scenario: Agent sends document shot to Canvas
- **WHEN** Agent sends a storyboard shot whose reference image came from a document page or archive entry
- **THEN** the transfer payload contains a stable document or resource reference for that page or entry
- **THEN** Canvas can preview the shot by resolving the reference through content access
- **THEN** the payload does not require Canvas to trust an Agent cache path as identity

#### Scenario: Runtime path is present only as fallback
- **WHEN** a transfer payload contains both a stable resource reference and a runtime path
- **THEN** consumers prefer the stable resource reference
- **THEN** the runtime path is treated only as a preview or migration fallback

### Requirement: Agent image aliases are scoped
The system SHALL scope readable image aliases such as `page_1`, `P1`, `image_1`, and `panel_1` to a tool call, source document, result batch, or explicit alias scope before they are used to bind storyboard shots to media.

#### Scenario: Two tool calls both expose page_1
- **WHEN** a conversation contains two completed document or image tool calls that both expose alias `page_1`
- **THEN** storyboard transfer resolves a shot by scoped alias or explicit tool-result locator
- **THEN** it does not bind the shot to the first global `page_1` by accident

#### Scenario: Row-order fallback is unambiguous only
- **WHEN** a storyboard row lacks explicit media refs and only one eligible image batch is available
- **THEN** the system MAY infer the image by row order
- **THEN** the inferred binding records the selected tool call and asset index

#### Scenario: Ambiguous alias keeps structured Canvas transfer safe
- **WHEN** a storyboard row references an alias that maps to multiple image batches and no scope disambiguates it
- **THEN** Send to Canvas can still send the semantic storyboard rows
- **THEN** it reports a bounded diagnostic and omits the ambiguous image reference instead of silently assigning a sequential image

### Requirement: Runtime handles are separated from durable storyboard data
The system SHALL keep local cache paths, projected Webview URIs, object URLs, blob URLs, preview tokens, and engine tokens out of durable storyboard and Canvas node data when a stable reference is available.

#### Scenario: Canvas saves a shot with resource reference
- **WHEN** Canvas saves a shot node that has a stable reference image resource
- **THEN** saved node data preserves the reference
- **THEN** saved node data omits runtime reference image paths and projected Webview URIs

#### Scenario: Agent displays image preview
- **WHEN** Agent Webview displays a document image returned by a tool
- **THEN** it MAY use a runtime path or projected URI for display
- **THEN** Send to Canvas still uses the stable resource reference or tool-result locator for transfer

### Requirement: Manga storyboard shots carry source media refs
For `manga-to-video` and image-sequence storyboard payloads, every source-backed shot using `reuse-original`, `use-as-reference`, or `transform-original` SHALL carry `sourceMediaRefs` that resolve to real tool results or stable resource references.

#### Scenario: Model emits sourcePage only
- **WHEN** a manga storyboard shot has `sourcePage` or `sourceImage` but no `sourceMediaRefs`
- **THEN** the Agent Webview attempts to resolve the field through scoped aliases and real tool results
- **THEN** it writes the resolved `sourceMediaRefs` before Canvas transfer when the match is unambiguous

#### Scenario: Model emits cache path in referenceImagePath
- **WHEN** a manga storyboard shot uses an absolute cache path, Webview URI, blob URL, or fabricated id as its image reference
- **THEN** validation reports an unsafe or unresolved media reference
- **THEN** Canvas transfer does not use that value as source identity

### Requirement: Legacy cache paths are migration-only
The system SHALL support legacy cache path payloads only as migration input. New Agent storyboard transfers MUST NOT depend on `document-image-cache` paths, `cachePath` fields, or `referenceImagePath` values to carry document image identity.

#### Scenario: Legacy Canvas file still opens
- **WHEN** Canvas opens an existing file that contains only a legacy document image cache path
- **THEN** Canvas MAY project the path if it is still authorized and present
- **THEN** the node records a migration or unavailable status when projection fails

#### Scenario: New Agent transfer avoids legacy cache identity
- **WHEN** Agent creates a new storyboard transfer after this change
- **THEN** the transfer contains stable refs or scoped tool-result locators for document images
- **THEN** it does not use `document-image-cache` as the cross-package identity channel

### Requirement: Storyboard local media refs use shared path semantics
Storyboard, Story, and Agent-to-Canvas payloads that include local media paths SHALL apply the shared workspace-relative media path contract when stable resource refs are not available.

#### Scenario: Storyboard shot references workspace image
- **WHEN** a storyboard shot references `cases/panel-01.png`
- **AND** the receiving Canvas document belongs to a workspace containing that file
- **THEN** Canvas resolves the reference against the receiving document's owning workspace context
- **AND** the saved Canvas data keeps the durable workspace-relative media ref rather than a runtime preview URL.

#### Scenario: Storyboard prefers stable resource ref over path fallback
- **WHEN** a storyboard shot contains both a stable resource reference and a local path fallback
- **THEN** consumers prefer the stable resource reference for durable identity
- **AND** the local path fallback is resolved through workspace-relative media path semantics only if the stable reference cannot be materialized.

#### Scenario: Story preview does not fabricate absolute roots
- **WHEN** Story or storyboard preview receives a local media path without a variable prefix
- **THEN** it resolves the path through the source document workspace context
- **AND** it does not fabricate `/cases/...` as an absolute filesystem path.

