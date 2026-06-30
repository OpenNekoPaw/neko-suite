## ADDED Requirements

### Requirement: Canvas exposes typed Markdown capabilities
The system SHALL expose typed Canvas Markdown capabilities for creating notes, tables, storyboard drafts, storyboard nodes, resource attachments, and validation-only previews from Markdown input.

#### Scenario: Agent Webview invokes a Canvas Markdown capability
- **WHEN** Agent Webview sends Markdown to Canvas with a supported capability id
- **THEN** Canvas MUST validate the typed input before mutating Canvas state
- **AND** Canvas MUST return a typed result containing the capability id, status, diagnostics, and any created node ids or follow-up actions

#### Scenario: Unsupported capability id is requested
- **WHEN** a caller requests an unknown Canvas Markdown capability id
- **THEN** the system MUST fail visibly with a typed diagnostic or rejected request
- **AND** it MUST NOT fall back to `canvasStructuredContent`, `canvasStoryboard`, `CanvasNode[]`, or an old storyboard compiler path

### Requirement: Capability input keeps Markdown and intent separate from Canvas nodes
Canvas Markdown capability input SHALL carry Markdown text, source format hint, stable resource references, target, and provenance without requiring callers to provide Canvas node JSON or fixed storyboard row DTOs.

#### Scenario: Markdown note is created from text
- **WHEN** a caller invokes `canvas.createMarkdownNote` with Markdown, title, target, and provenance
- **THEN** Canvas MUST create or update Canvas-owned note/text content according to the target
- **AND** the caller MUST NOT provide or persist raw `CanvasNode[]` as the capability input

#### Scenario: Storyboard draft includes skill-specific columns
- **WHEN** a caller invokes `canvas.createStoryboardDraftFromMarkdown` with a Markdown table containing extra columns not known to the shared DTO
- **THEN** Canvas MUST preserve those columns as draft/display metadata or report profile diagnostics
- **AND** the shared capability DTO MUST NOT require a schema change solely because the skill added an extra Markdown table field

### Requirement: Canvas owns Markdown validation and node creation
Canvas SHALL own parsing, validation, resource binding, draft creation, production node creation, persistence, and follow-up action generation for Canvas Markdown capabilities.

#### Scenario: Storyboard draft is created for review
- **WHEN** a caller invokes `canvas.createStoryboardDraftFromMarkdown` with a Markdown storyboard table
- **THEN** Canvas MUST create a reviewable Canvas draft representation or return blocking diagnostics
- **AND** the result MUST include `needs-review`, `created`, or `blocked` status according to validation outcome

#### Scenario: Storyboard nodes are explicitly created
- **WHEN** a caller invokes `canvas.createStoryboardFromMarkdown` after user confirmation or equivalent confirmation-gated Agent action
- **THEN** Canvas MUST create Canvas-owned storyboard nodes only from validated Markdown and bound resources
- **AND** the result MUST identify created node ids and diagnostics without exposing internal compiler-only state

### Requirement: Resource binding uses stable references only
Canvas Markdown capabilities SHALL bind resources from stable identities and SHALL reject runtime-only handles, cache paths, raw Webview URIs, blob URLs, Engine tokens, and system temp paths as durable resource identity.

#### Scenario: Resource token maps to a stable ref
- **WHEN** Markdown references a token that is provided in capability resources with a `ResourceRef` or `DocumentArchiveResourceRef`
- **THEN** Canvas MUST bind the token to that stable ref for node creation or draft metadata
- **AND** Canvas MUST NOT persist any render URI used by Agent Webview display

#### Scenario: Resource token is missing
- **WHEN** Markdown references a resource token that does not match a provided stable resource ref or an authorized source path
- **THEN** Canvas MUST return a missing-resource diagnostic naming the token
- **AND** Canvas MUST NOT bind the token by table row order, chat attachment order, raw filename guessing, cache path lookup, or Webview URI fallback

#### Scenario: Runtime handle is provided as resource identity
- **WHEN** capability input includes a Webview URI, blob URL, `.neko/.cache` path, system temp path, Engine token, or provider-private runtime handle as a durable resource identity
- **THEN** Canvas MUST reject or sanitize that field with a diagnostic before node creation
- **AND** Canvas MUST NOT recover success by reverse-looking-up the runtime handle

### Requirement: Send to Canvas uses capability invocation for Markdown
Markdown-oriented Send to Canvas actions SHALL invoke Canvas Markdown capabilities instead of direct plugin transfer compiler outputs.

#### Scenario: User sends a Markdown table to Canvas
- **WHEN** the user selects a Send to Canvas action for a Markdown table in Agent Webview
- **THEN** Agent Webview or its Extension adapter MUST invoke `canvas.createTableFromMarkdown` or a more specific Canvas Markdown capability
- **AND** tests MUST prove the capability route was called rather than `neko.canvas.importAgentContent` structured fallback

#### Scenario: User sends a storyboard draft to Canvas
- **WHEN** the user sends a storyboard Markdown draft from Agent Webview to Canvas
- **THEN** the default action MUST invoke `canvas.createStoryboardDraftFromMarkdown`
- **AND** production storyboard node creation MUST require `canvas.createStoryboardFromMarkdown` or an equivalent explicit follow-up action

### Requirement: Capability results expose diagnostics and next actions
Canvas Markdown capability results SHALL expose user-visible diagnostics and follow-up actions without requiring Agent to infer Canvas state from created nodes.

#### Scenario: Draft needs user review
- **WHEN** Canvas validates a storyboard Markdown draft that is structurally usable but has unresolved choices
- **THEN** the result MUST use `needs-review` status
- **AND** it MUST include diagnostics or actions that explain the next review or creation step

#### Scenario: Validation-only request is made
- **WHEN** a caller invokes `canvas.validateMarkdownStoryboard`
- **THEN** Canvas MUST return diagnostics and a preview summary when available
- **AND** Canvas MUST NOT create, update, delete, or persist Canvas nodes

### Requirement: Old storyboard compiler paths are not canonical for new Markdown requests
New Markdown-to-Canvas requests SHALL NOT depend on `@neko/draft-runtime` or old plugin transfer storyboard compiler payloads as their public contract.

#### Scenario: New request reaches old compiler transfer
- **WHEN** a new Markdown storyboard Send to Canvas request would be routed through `@neko/draft-runtime`, `canvasStructuredContent`, or direct `canvasStoryboard` compiler output
- **THEN** validation MUST fail or tests MUST poison that route
- **AND** the request MUST be migrated to Canvas Markdown capability invocation before it can return success

#### Scenario: Useful parser behavior is reused
- **WHEN** existing pure parsing, alias, duration, or token binding logic remains useful
- **THEN** it MAY be migrated behind Canvas capability implementation or Agent Webview display helpers
- **AND** it MUST NOT remain the cross-package protocol that callers target
