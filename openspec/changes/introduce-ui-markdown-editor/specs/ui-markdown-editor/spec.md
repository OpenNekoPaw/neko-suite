## ADDED Requirements

### Requirement: Markdown UI package boundary
The system SHALL provide a shared `@neko/ui/markdown` React/Webview UI subpath
for Markdown editing and rendering primitives. The subpath MUST consume
`@neko/markdown` projections and MUST NOT import VS Code APIs, Node-only modules,
feature packages, Agent runtime, Canvas internals, content-access
implementations, or `acquireVsCodeApi`.

#### Scenario: Shared Markdown UI stays in L2
- **WHEN** dependency boundary tests inspect `packages/neko-ui/src/markdown`
- **THEN** no source file imports forbidden host, Node, or feature-package APIs

#### Scenario: Markdown core remains host agnostic
- **WHEN** `@neko/ui/markdown` consumes Markdown projection behavior
- **THEN** the dependency direction is from `@neko/ui/markdown` to
  `@neko/markdown`, and `@neko/markdown` does not import React or DOM APIs

### Requirement: Projection-driven Markdown rendering
The system SHALL render Markdown inline tokens, resource-reference tokens,
mentions, CommonMark image references, diagnostics, and semantic prompt spans
from `@neko/markdown` projections plus caller-provided span data. The renderer
MUST preserve source text order and MUST treat invalid or overlapping token
ranges as visible diagnostics or test failures instead of silently producing
misleading output.

#### Scenario: Inline token rendering preserves order
- **WHEN** a caller renders text containing strong text, code, an image
  reference, a resource reference, and a mention
- **THEN** `@neko/ui/markdown` displays the projected tokens in source order
  without rewriting the durable Markdown value

#### Scenario: Invalid token ranges fail visibly
- **WHEN** a caller provides a semantic span whose range is outside the current
  text
- **THEN** the shared renderer omits the invalid highlight and exposes a
  diagnostic or test-observable failure state

### Requirement: Inline Markdown editor
The system SHALL provide an `InlineMarkdownEditor` that uses a native textarea as
the editable input and a synchronized highlight layer for projected Markdown and
semantic prompt tokens. The editor MUST accept controlled `value` and `onChange`
props and MUST expose keyboard boundary metadata so VS Code Webview shortcuts and
Canvas pointer interactions can be isolated by the caller.

#### Scenario: Editor updates controlled value
- **WHEN** the user types in `InlineMarkdownEditor`
- **THEN** the component calls `onChange` with the next Markdown text and does
  not mutate any domain state directly

#### Scenario: Highlight layer follows textarea scroll
- **WHEN** the textarea scroll position changes
- **THEN** the highlight layer scroll position is synchronized so token
  highlights remain aligned with text

#### Scenario: Keyboard owner is required
- **WHEN** a caller renders `InlineMarkdownEditor`
- **THEN** the editor exposes caller-provided keyboard owner metadata for
  text-input shortcut isolation

### Requirement: Editor profiles
The system SHALL support profile-driven behavior for at least
`plain-markdown`, `resource-markdown`, and `semantic-prompt`. Profiles MUST
control projection defaults and generic UI affordances only; they MUST NOT encode
Canvas node schemas, Agent action ids, provider commands, or resource
authorization policy.

#### Scenario: Resource Markdown profile enables reference projection
- **WHEN** `InlineMarkdownEditor` is rendered with the `resource-markdown`
  profile
- **THEN** resource-reference tokens and CommonMark image references are
  projected and made available to renderers without resolving files directly

#### Scenario: Semantic prompt profile renders caller spans
- **WHEN** `InlineMarkdownEditor` is rendered with the `semantic-prompt` profile
  and caller-provided semantic spans
- **THEN** the editor highlights those spans without validating Canvas fields or
  writing Canvas data

### Requirement: Completion provider injection
The system SHALL allow callers to inject completion providers for Markdown
editing. Completion providers MUST receive editor context and return text edits
or display metadata only. The shared editor MUST NOT call Canvas mutations, Agent
actions, Extension commands, or resource access APIs from completion handling.

#### Scenario: Mention completion inserts text only
- **WHEN** a caller-provided provider returns a completion for an `@` mention
- **THEN** selecting the completion applies the provider's text edit and does not
  invoke domain mutation behavior

#### Scenario: Unsupported completion edit is rejected
- **WHEN** a completion provider returns an edit outside the current text range
- **THEN** the editor rejects the edit with a visible diagnostic or
  test-observable failure state

### Requirement: Diagnostics display
The system SHALL provide reusable Markdown diagnostics UI that can display
`@neko/markdown` diagnostics and caller-provided diagnostics. Diagnostics MUST be
presentational and MUST NOT decide whether Canvas authoring, Agent handoff, or
resource access succeeds.

#### Scenario: Projection diagnostics are visible
- **WHEN** `@neko/markdown` reports an unresolved resource reference
- **THEN** `@neko/ui/markdown` can display the diagnostic with severity, code,
  message, token, and range metadata

#### Scenario: Domain diagnostics remain caller-owned
- **WHEN** Canvas supplies a field validation diagnostic to the shared
  diagnostics UI
- **THEN** the diagnostic is displayed without `@neko/ui/markdown` mutating
  Canvas state or invoking Canvas capabilities

### Requirement: Package-local adapters
Canvas and Agent Webviews SHALL consume `@neko/ui/markdown` through
package-local adapters for labels, i18n, semantic span mapping, resource
rendering, and diagnostics. Shared UI primitives MUST remain generic enough that
Agent does not depend on Canvas internals and Canvas does not depend on Agent
Webview internals.

#### Scenario: Canvas semantic prompt adapter
- **WHEN** Canvas migrates a semantic prompt editor to `@neko/ui/markdown`
- **THEN** Canvas supplies its own labels, span metadata, field projection
  summaries, and persistence callbacks through a Canvas-local adapter

#### Scenario: Agent preview adapter
- **WHEN** Agent Webview reuses Markdown preview primitives
- **THEN** Agent handoff policy and Canvas capability invocation remain in Agent
  or Canvas-owned code, not in `@neko/ui/markdown`
