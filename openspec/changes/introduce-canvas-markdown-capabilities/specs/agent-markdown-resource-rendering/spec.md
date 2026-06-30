## ADDED Requirements

### Requirement: Agent Webview renders resource-aware Markdown
Agent Webview SHALL render Agent Markdown with resource-aware enhancements for supported Markdown tables and image references while preserving the Webview sandbox boundary.

#### Scenario: Markdown table contains resource tokens
- **WHEN** a Markdown table cell contains a token that matches a known message/tool resource
- **THEN** Agent Webview MUST render the token with visible binding status and projected thumbnail or summary when projection is available
- **AND** it MUST keep the underlying Markdown text unchanged

#### Scenario: Markdown table token is missing
- **WHEN** a Markdown table cell contains a resource-like token that cannot be resolved from known stable refs
- **THEN** Agent Webview MUST render a missing-resource diagnostic for that token
- **AND** it MUST NOT silently bind the token by image order, chat attachment order, raw filename guessing, cache path lookup, or direct filesystem access

### Requirement: CommonMark image references use host-projected resources
Agent Webview SHALL render CommonMark image references only through authorized host projection or safe remote Markdown behavior according to existing Webview policy.

#### Scenario: Workspace image path is renderable
- **WHEN** Markdown contains `![alt](assets/cover.png)` and the host resolves that path as an authorized resource
- **THEN** Agent Webview MUST render the image using a Webview-safe projected URI
- **AND** it MUST NOT write the projected URI back into the Markdown, memory, Canvas payload, or durable draft data

#### Scenario: Image path is not authorized or cannot be projected
- **WHEN** Markdown contains an image path that cannot be authorized or projected
- **THEN** Agent Webview MUST show a diagnostic or non-renderable placeholder
- **AND** it MUST NOT pass raw local paths, cache paths, `file:` URLs, system temp paths, or Webview projection failures into an `<img>` source as a fallback

### Requirement: Neko resource-reference embeds and links are phased Markdown extensions
Agent Webview SHALL treat Neko resource-reference `![[...]]` embeds and `[[...]]` links as explicit Markdown extensions that require parser and resolver support before they are considered renderable.

#### Scenario: Resource-reference embed extension is enabled
- **WHEN** a skill or renderer configuration enables the `resource-reference` extension and Markdown contains `![[cover.png]]`
- **THEN** Agent Webview MUST parse the embed into an explicit resource or document-embed node
- **AND** it MUST resolve the target through a host-provided resolver before rendering media or document content

#### Scenario: Resource-reference link extension is not enabled
- **WHEN** Markdown contains `![[cover.png]]` or `[[Chapter 1#Section]]` but the renderer has not enabled the required extension
- **THEN** Agent Webview MUST render the text safely or show an unsupported-extension diagnostic
- **AND** it MUST NOT guess file access, document sections, or Canvas nodes from the raw bracket syntax

#### Scenario: Embed target is ambiguous
- **WHEN** a resource-reference target could mean both a media resource and a document section or contains ambiguous `#` syntax
- **THEN** Agent Webview MUST show an ambiguity diagnostic or candidate picker summary
- **AND** it MUST NOT choose one interpretation without a resolver result or user/Agent repair action

### Requirement: Skill output declarations advertise Markdown rendering features
Skills that ask the model to produce enhanced Markdown SHALL declare supported Markdown extensions, preferred resource reference syntaxes, forbidden runtime handles, and intended Canvas actions.

#### Scenario: Skill requests storyboard Markdown
- **WHEN** a skill asks Agent to produce a storyboard draft table
- **THEN** the skill metadata or prompt guidance MUST declare supported Markdown features such as `gfm-table`, `commonmark-image`, and optionally `resource-reference`
- **AND** it MUST prefer stable resource tokens, `ResourceRef`-backed labels, CommonMark image paths allowed by content access, or declared embed syntax

#### Scenario: Skill would expose runtime handles
- **WHEN** a skill prompt, example, or generated output would instruct the model to use Webview URIs, blob URLs, cache paths, system temp paths, Engine tokens, or Canvas node JSON as Markdown resource references
- **THEN** that prompt/example/output MUST be rejected, corrected, or covered by a fail-visible diagnostic
- **AND** the skill MUST guide the model toward stable refs, user-readable tokens, or capability actions instead

### Requirement: Renderer diagnostics are user-visible and action-oriented
Agent Webview Markdown resource diagnostics SHALL be visible to the user and structured enough for local repair or Canvas capability invocation decisions.

#### Scenario: Resource reference cannot be resolved
- **WHEN** Markdown contains an unresolved resource token, image path, or embed
- **THEN** Agent Webview MUST display a diagnostic that identifies the unresolved reference
- **AND** Send to Canvas MUST include the unresolved reference in capability diagnostics or block the action when the target capability requires a bound resource

#### Scenario: Resource reference has multiple candidates
- **WHEN** a token or embed resolves to multiple possible resources
- **THEN** Agent Webview MUST display an ambiguous-resource diagnostic with safe candidate summaries when available
- **AND** it MUST NOT expose cache paths, Webview URIs, absolute private paths, or provider-private payloads in those summaries

### Requirement: Enhanced Markdown rendering remains presentation-only
Agent Webview enhanced Markdown rendering SHALL NOT become the durable source of truth for Canvas nodes, project files, or resource identity.

#### Scenario: Render URI is produced for display
- **WHEN** Agent Webview receives a projected URI for a Markdown image or resource token
- **THEN** the URI MUST be used only for current Webview display
- **AND** the durable handoff to Canvas MUST use stable resource refs or unresolved diagnostics rather than the projected URI

#### Scenario: Canvas action is triggered from rendered Markdown
- **WHEN** the user triggers Send to Canvas from a rendered Markdown response
- **THEN** Agent Webview MUST send the original Markdown, stable resource references, target, and provenance through the Canvas Markdown capability path
- **AND** it MUST NOT send the rendered HTML, DOM nodes, projected image URLs, or renderer-only state as the authoring payload

### Requirement: Existing structured content rendering remains separate
Agent Webview SHALL keep validated structured content rendering separate from Markdown authoring draft rendering.

#### Scenario: Composite artifact code fence is rendered
- **WHEN** Markdown contains a valid `CompositeArtifact`, `GenericTable`, or other validated structured tool result
- **THEN** Agent Webview MAY render it through the existing rich content renderer
- **AND** it MUST NOT treat that rendering path as the preferred storyboard Markdown authoring path

#### Scenario: Storyboard authoring prompt is updated
- **WHEN** Agent skills or prompts request new storyboard drafts intended for Canvas
- **THEN** they MUST prefer Markdown plus Canvas capability actions over asking the model to produce `neko-composite` storyboard JSON
- **AND** tests MUST distinguish validated structured tool results from Markdown draft authoring output
