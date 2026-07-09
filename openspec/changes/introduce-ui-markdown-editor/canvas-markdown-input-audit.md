## Canvas Markdown Input Audit

This audit records the Canvas Webview inputs reviewed during the first
`@neko/ui/markdown` adoption slice.

## Migrated In This Change

- Shot creator overlay semantic prompt blocks:
  - `videoPromptDocument`
  - `imagePromptDocument`
  - `voicePromptDocument`
- Generation prompt panel main prompt textarea. Canvas still owns generation
  parameter assembly, semantic prompt document pass-through, and Agent action
  routing metadata.
- Shared behavior now comes from `InlineMarkdownEditor`, `MarkdownInlineText`,
  `MarkdownGenerationPromptParts`, and caller-rendered tokens.
- Canvas remains responsible for semantic prompt span mapping, field labels,
  i18n, alignment diagnostics, and `storyboardPrompt` persistence.
- Canvas read-only prompt summaries and prompt cells use shared generation
  prompt part chips when no explicit Canvas semantic spans are present. Explicit
  Canvas semantic spans still use the Canvas-local adapter.

## Follow-Up Migration Candidates

- Generation prompt panel edit-instruction field, when it needs multiline
  Markdown/resource highlighting instead of short plain-text editing.
- Annotation and text node Markdown-like content, when the owning block already
  treats the durable value as Markdown rather than plain text.
- Small resource-reference inputs, when they benefit from `resource-markdown`
  projection and caller-provided resource chips.
- Markdown review table cells that only need inline token rendering, not a full
  table editor.

## Keep Package-Local Or Owning-Editor Owned

- Titles, labels, port ids, node names, ids, numeric fields, select fields, and
  boolean controls remain plain Canvas form controls.
- Full script, document, model, asset, or table authoring surfaces should open
  their owning editor instead of using the inline textarea overlay.
- Legacy `generationPrompt` migration display remains a Canvas compatibility and
  diagnostic concern; it should not become shared Markdown UI state.
- Canvas node validation, field projection writes, resource authorization, file
  resolution, and Webview URI projection stay outside `@neko/ui/markdown`.

## Extraction Rule

Move an input to `@neko/ui/markdown` only when the durable value is Markdown or a
prompt-like Markdown string, the caller can provide all domain labels/renderers,
and the shared component only applies text edits or displays projected tokens.
