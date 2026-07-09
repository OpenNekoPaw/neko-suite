## Why

Canvas, Agent Webview, and future Webview surfaces all need consistent Markdown
editing and rendering for prompt text, resource references, semantic spans,
diagnostics, and lightweight previews. Today those behaviors are either
package-local or read-only projections, which risks duplicate editors and pushes
callers toward the wrong boundary: making `@neko/markdown` a React UI package
instead of keeping it as a host-agnostic syntax/projection layer.

## What Changes

- Add a reusable `@neko/ui/markdown` Webview React surface for lightweight
  Markdown editing, inline rendering, preview rendering, diagnostics display,
  and completion popovers.
- Keep `@neko/markdown` as the L0 syntax/projection authority. It remains free of
  React, DOM, VS Code, Canvas, Agent, content-access, and mutation behavior.
- Define editor profiles for plain Markdown, resource-aware Markdown, and
  semantic prompt text so Canvas and Agent can share UI behavior while injecting
  their own resolvers, diagnostics, labels, completions, and resource renderers.
- Migrate the Canvas semantic prompt overlay pattern into the shared UI layer
  through a thin Canvas adapter, starting with prompt/note-style inputs rather
  than every property field.
- Provide a path for Agent Webview to reuse shared Markdown inline/preview
  primitives without moving Agent handoff policy or Canvas capability invocation
  into `@neko/ui`.

Non-goals:

- Do not introduce CodeMirror into VS Code Webview packages. CodeMirror remains a
  Desktop-specific editor dependency unless a later change proves a VS Code
  Webview need.
- Do not make `@neko/markdown` export React components or import DOM libraries.
- Do not let `@neko/ui/markdown` validate Canvas fields, mutate Canvas nodes,
  authorize resources, resolve file paths, project Webview URIs, invoke Agent
  actions, or call Extension Host APIs.
- Do not replace full document editors for script/document/model resources; this
  change targets inline and overlay Markdown/prompt editing.

### Compatibility

This is additive for package APIs. Existing Canvas and Agent Webview Markdown
renderers may be migrated incrementally behind package-local adapters. No project
file format, Agent capability payload, Canvas authoring capability, or
`@neko/markdown` projection contract is intended to break.

## Capabilities

### New Capabilities

- `ui-markdown-editor`: Defines the shared `@neko/ui/markdown` React/Webview
  Markdown editor and renderer contract, including editor profiles, token/chip
  rendering, diagnostics, completion provider injection, keyboard/focus
  boundaries, and package-boundary rules.

### Modified Capabilities

- None.

## Impact

- `packages/neko-ui`: Add a `markdown` public subpath with React components,
  hooks, contracts, tests, and optional CSS for shared Markdown editing/rendering.
- `packages/neko-markdown`: Remains the L0 projection dependency consumed by
  `@neko/ui/markdown`; no React or DOM imports are added.
- `packages/neko-canvas/packages/webview`: Replace package-local semantic prompt
  rendering/editor duplication with shared UI primitives through Canvas-owned
  adapters for labels, diagnostics, and semantic prompt spans.
- `packages/neko-agent/packages/webview`: Can adopt shared preview/inline
  rendering primitives later while retaining Agent-owned handoff and action
  policy.
- Validation: `@neko/ui` unit tests for rendering, overlay scroll sync,
  completions, keyboard boundaries, and boundary guards; Canvas focused tests for
  adapter behavior; VS Code Webview runtime smoke when Canvas prompt editing is
  migrated.
