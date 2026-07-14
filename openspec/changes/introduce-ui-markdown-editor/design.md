## Context

Neko currently has the right low-level Markdown boundary: `@neko/markdown`
projects CommonMark/GFM-compatible syntax, resource-reference tokens, mentions,
creative tables, semantic prompt spans, diagnostics, and handoff refs without
importing React, DOM, Agent, Canvas, VS Code, or content services. Canvas also
has a package-local semantic prompt editor pattern that renders highlighted
semantic/Markdown tokens behind a native textarea.

The missing layer is a reusable Webview UI surface. Canvas prompt editors, Agent
Markdown previews, and future creative Webviews need the same token chips,
diagnostic surfaces, completion popup behavior, and keyboard/focus treatment, but
the UI must not become a hidden Canvas authoring runtime or a resource access
service.

### Five-layer analysis

| Layer | Analysis |
| --- | --- |
| Responsibility | `@neko/markdown` owns syntax projection. `@neko/ui/markdown` owns React rendering/editing primitives only. Canvas and Agent Webviews own their business adapters, labels, resolver inputs, diagnostics, handoff policy, and mutations. Extension/content-access services own resource authorization and Webview URI projection. |
| Dependency | `@neko/ui/markdown` may depend on React, `@neko/ui/keyboard`, and `@neko/markdown`. It must not import VS Code, Node-only modules, feature packages, `acquireVsCodeApi`, Agent runtime, Canvas internals, or content-access implementations. `@neko/markdown` remains L0 and must not depend on `@neko/ui`. |
| Interface | Public UI contracts are editor profiles, projection options, token render hooks, diagnostic render hooks, completion providers, and keyboard owner metadata. They are not Canvas node schemas, Agent action ids, resource cache handles, or Extension message payloads. |
| Extension | New surfaces add profile-specific adapters and completion providers without changing the shared editor core. Domain-specific behavior stays in thin package adapters. |
| Testing | `@neko/ui` unit tests cover public exports, boundary guards, token rendering, overlay scroll sync, diagnostics, completion trigger behavior, and keyboard boundary metadata. Canvas focused tests prove semantic prompt behavior still uses Canvas-owned spans/diagnostics. A real VS Code Webview functional scenario validates migrated Canvas prompt editing. |
| Proportionality | A lightweight textarea-overlay editor is enough for inline prompt/note editing in a local VS Code client. CodeMirror remains a Desktop-only dependency and is not added to VS Code Webview packages in this change. |
| Fail-visible behavior | Unknown editor profiles, missing required keyboard owner ids, invalid token ranges, overlapping injected spans, unsupported completion edits, or absent domain renderers should produce explicit diagnostics/test failures instead of silently dropping tokens or returning successful no-op UI. |

## Goals / Non-Goals

**Goals:**

- Add `@neko/ui/markdown` as the canonical shared React/Webview Markdown UI
  surface.
- Keep editor behavior projection-driven by `@neko/markdown` and caller-provided
  adapters.
- Provide inline editor, inline text renderer, preview renderer, diagnostics, and
  completion popup primitives that Canvas and Agent Webviews can reuse.
- Support profile-driven behavior for plain Markdown, resource-aware Markdown,
  and semantic prompt editing.
- Migrate Canvas semantic prompt UI through a package-local adapter without
  moving Canvas validation or mutation into shared UI.

**Non-Goals:**

- Do not add CodeMirror to Canvas, Agent, or other VS Code Webview packages.
- Do not implement a full WYSIWYG Markdown document editor.
- Do not put React components in `@neko/markdown`.
- Do not resolve files, authorize resources, generate Webview URIs, validate
  Canvas fields, invoke Agent actions, or mutate project data from
  `@neko/ui/markdown`.
- Do not replace owning document editors for script/document/model resources.

## Decisions

### Decision 1: Add `@neko/ui/markdown` as an L2 UI subpath

The new surface lives under `packages/neko-ui/src/markdown` and is exported as
`@neko/ui/markdown`. The root `@neko/ui` entry can re-export stable primitives
after the subpath is established, following existing public entrypoint patterns.

Rejected alternative: put the editor in `@neko/markdown`. That would violate the
existing L0 boundary and make Node/headless consumers accidentally depend on
React/DOM.

### Decision 2: Use textarea-overlay as the first editor adapter

The inline editor uses a native textarea for input, selection, IME, accessibility,
and form behavior, with a synchronized non-interactive highlight layer behind it.
This matches the existing Canvas semantic prompt pattern and keeps Webview
keyboard/focus handling simple.

Rejected alternative: add CodeMirror to VS Code Webviews. CodeMirror is useful in
Desktop for full document/code editing, but inline Canvas/Agent prompt editing
does not justify the dependency, theming, keymap, and runtime complexity here.

### Decision 3: Define profiles, not domain modes

The shared editor exposes generic profiles such as `plain-markdown`,
`resource-markdown`, and `semantic-prompt`. Profiles control projection defaults,
token classes, and optional UI affordances. Canvas-specific field labels, Agent
handoff metadata, action ids, and resource previews arrive through injected
renderers/providers.

Rejected alternative: add Canvas or Agent profile names. That would turn the
shared UI package into a feature package dependency and make cross-Webview reuse
harder.

### Decision 4: Use provider injection for completions and diagnostics

Completion providers receive text, cursor, profile, projection, and opaque caller
context, then return text edits and display metadata. Diagnostics are supplied as
`@neko/markdown` diagnostics plus optional caller diagnostics. The shared UI
displays them but does not decide resource validity or action readiness.

Rejected alternative: let the shared editor query Canvas stores, Agent state, or
content access directly. That breaks ownership and would bypass host trust and
resource projection boundaries.

### Decision 5: Keep preview/rendering primitives composable

`MarkdownInlineText`, `MarkdownPreview`, `MarkdownDiagnostics`, and
`MarkdownCompletionPopover` are exported independently so Canvas and Agent can
adopt pieces gradually. The editor composes those primitives but does not force a
single panel layout.

Rejected alternative: ship only one monolithic editor. That would either be too
generic for Canvas prompt overlays or too opinionated for Agent message previews.

## Risks / Trade-offs

- [Risk] The inline editor grows into a hand-rolled CodeMirror replacement. ->
  Mitigation: scope it to inline/overlay prompt and note editing; keep long-form
  source editing out of this change.
- [Risk] Shared token rendering leaks domain language. -> Mitigation: keep
  default labels generic and require Canvas/Agent adapters for domain wording.
- [Risk] Overlay highlighting diverges from textarea layout. -> Mitigation:
  test scroll sync, whitespace preservation, line-height, wrapping, and token
  range normalization.
- [Risk] Completion providers become mutation paths. -> Mitigation: providers
  return text edits only; domain mutation remains with Canvas/Agent actions.
- [Risk] Callers rely on missing renderers and see silent plain text. ->
  Mitigation: unsupported token kinds and invalid ranges produce visible
  diagnostics in tests and development builds.

## Migration Plan

1. Add the `@neko/ui/markdown` subpath, types, primitives, and focused tests.
2. Move reusable Canvas `SemanticPromptText` projection/rendering behavior into
   shared primitives while keeping Canvas label/i18n adapters package-local.
3. Replace Canvas `ShotPromptSemanticEditor` internals with
   `InlineMarkdownEditor` through a Canvas adapter.
4. Add optional Canvas adoption for generation prompts, annotation/text Markdown,
   and small resource-reference inputs after the semantic prompt path is stable.
5. Let Agent Webview adopt preview/inline rendering primitives separately from
   any handoff or Canvas capability logic.
6. Validate with targeted unit tests and a real VS Code Webview functional scenario for
   changed Canvas prompt editing surfaces.

Rollback is local: Canvas can temporarily keep its package-local semantic prompt
editor while the shared primitives remain additive. No durable project data or
Markdown projection contracts are changed by this proposal.

## Open Questions

- Should `@neko/ui/markdown` be re-exported from the root `@neko/ui` entry in the
  first slice, or kept subpath-only until the API settles?
- Should profile names include `prompt-markdown` separately from
  `semantic-prompt`, or is semantic prompt enough for prompt-first workflows?
- How much default styling should live in a CSS file versus className/slot props
  supplied by each Webview?
