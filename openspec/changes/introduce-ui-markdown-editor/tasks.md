## 1. Public Package Surface

- [x] 1.1 Add `packages/neko-ui/src/markdown/` with public `index.ts`, shared types, and no feature-package imports.
- [x] 1.2 Add the `@neko/ui/markdown` package export and update public entrypoint tests for the new subpath.
- [x] 1.3 Add or extend boundary tests proving `@neko/ui/markdown` does not import VS Code, Node-only modules, feature packages, `acquireVsCodeApi`, or `@neko/markdown` reverse dependencies.

## 2. Projection And Rendering Primitives

- [x] 2.1 Implement `useMarkdownProjection` around `@neko/markdown` projection options without adding domain validation.
- [x] 2.2 Implement `MarkdownInlineText` for strong/emphasis/code, mentions, CommonMark images, resource references, and caller-provided semantic spans.
- [x] 2.3 Implement token range normalization with fail-visible diagnostics for invalid or overlapping caller spans.
- [x] 2.4 Implement `MarkdownDiagnostics` for projection diagnostics and caller-provided diagnostics.
- [x] 2.5 Add unit tests for token order, unsupported/invalid ranges, diagnostics, and text preservation.

## 3. Inline Editor And Completion UI

- [x] 3.1 Implement `InlineMarkdownEditor` using native textarea input plus synchronized highlight layer.
- [x] 3.2 Integrate `@neko/ui/keyboard` metadata so callers provide a stable keyboard owner id for text-input shortcut isolation.
- [x] 3.3 Implement editor profiles for `plain-markdown`, `resource-markdown`, and `semantic-prompt`.
- [x] 3.4 Implement completion provider contracts and `MarkdownCompletionPopover` that applies text edits only.
- [x] 3.5 Add unit tests for controlled value updates, scroll sync, keyboard metadata, profile behavior, completion trigger/edit application, and invalid edit rejection.

## 4. Canvas Adoption Slice

- [x] 4.1 Replace Canvas package-local reusable semantic prompt rendering pieces with `@neko/ui/markdown` primitives behind a Canvas-local adapter.
- [x] 4.2 Migrate `ShotPromptSemanticEditor` internals to `InlineMarkdownEditor` while keeping Canvas-owned labels, diagnostics, field projections, and persistence callbacks in Canvas.
- [x] 4.3 Add focused Canvas Webview tests proving semantic prompt spans, markdown inline tokens, diagnostics, keyboard isolation, and data updates still work through the Canvas adapter.
- [x] 4.4 Record remaining package-local Canvas markdown/prompt inputs that should or should not migrate in follow-up tasks.

## 5. Agent And Cross-Webview Reuse Preparation

- [x] 5.1 Document how Agent Webview can consume `MarkdownInlineText`, `MarkdownPreview`, or diagnostics primitives without moving Agent handoff policy into `@neko/ui`.
- [x] 5.2 Add example or test-only adapter coverage showing resource/mention renderers are injected by the caller and do not resolve resources inside shared UI.
- [x] 5.3 Confirm no Agent Header/Input/selector surfaces are migrated into `@neko/ui/markdown`.

## 6. Validation

- [x] 6.1 Run `pnpm --filter @neko/ui check` and `pnpm --filter @neko/ui test`.
- [x] 6.2 Run focused Canvas Webview tests for migrated semantic prompt editor behavior.
- [x] 6.3 Run package boundary or dependency checks covering `@neko/ui`, `@neko/markdown`, Canvas Webview, and Agent Webview imports.
- [x] 6.4 Run a real VS Code Extension Development Host Webview functional scenario for the migrated Canvas prompt editing path, or record why it is blocked with residual risk.
- [x] 6.5 Run `openspec validate introduce-ui-markdown-editor --strict`.
