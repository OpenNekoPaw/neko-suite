## 1. Audit and Contracts

- [x] 1.1 Re-run and record a package-by-package audit for i18n bootstrap, logger setup, ErrorBoundary implementations, production `console.*`, stream lifecycle duplication, generic time formatters, and keyboard/focus local helpers.
- [x] 1.2 Define the `createWebviewI18n` contract in the appropriate shared i18n Webview subpath without importing React, VSCode, Node, or feature packages.
- [x] 1.3 Define the canonical Webview logger facade contract using the existing shared logger registry/factory pattern.
- [x] 1.4 Define the shared Webview ErrorBoundary API in `@neko/ui`, including logger injection, fallback slots/props, reset behavior, and accessible default markup.
- [x] 1.5 Define the Engine media stream lifecycle helper contract in `@neko/neko-client`, separating lifecycle ownership from package playback policy and rendering.
- [x] 1.6 Review `@neko/neko-client` time formatting exports and add missing generic media formatting variants only when existing local generic formatters require them.
- [x] 1.7 Confirm `@neko/ui/keyboard` covers Agent and Sketch residual keyboard/focus behavior; document any package-specific wrapper that must remain.

## 2. Shared Foundation Implementation

- [x] 2.1 Implement `createWebviewI18n` and shared tests for locale detection, bundle registration, missing-key fallback, `t`, `setLocale`, and `getLocale` behavior.
- [x] 2.2 Implement or tighten shared Webview logger factory helpers and tests for root replacement, child logger naming, and test transport injection.
- [x] 2.3 Implement the shared Webview ErrorBoundary primitive/factory and tests for thrown render errors, logger calls, fallback rendering, reset/retry, and custom fallback content.
- [x] 2.4 Implement the Engine A/V stream lifecycle helper with mockable client factories and tests for start, video-only, audio+video, reconnect callback, error callback, descriptor replacement, and disposal ordering.
- [x] 2.5 Add or update generic media time formatting helpers and tests for existing generic display variants.
- [x] 2.6 Add keyboard/focus tests or examples proving shared primitives cover editable target detection and Webview focus reporting currently duplicated by Agent and Sketch.

## 3. Low-Risk Webview Foundation Migration

- [x] 3.1 Migrate Dashboard, Market, Story, and Preview i18n bootstrap to `createWebviewI18n` while preserving exported helper names and translation results.
- [x] 3.2 Migrate Audio, Canvas, Cut, Agent, Model, Live, Puppet, Sketch, and Tools i18n bootstrap to `createWebviewI18n` or document a package-specific reason for staged deferral.
- [x] 3.3 Migrate package logger modules in Audio, Canvas, Cut, Market, Preview, Story, and Tools to the shared logger registry/factory pattern.
- [x] 3.4 Replace Market ErrorBoundary and Live AvatarViewer production `console.error` usage with package loggers.
- [x] 3.5 Migrate Agent, Canvas, Cut, Market, Model, Preview, and Story ErrorBoundary implementations to the shared `@neko/ui` ErrorBoundary primitive or thin package wrappers.
- [x] 3.6 Delete obsolete package-local ErrorBoundary implementations after all production callers migrate, or document retained thin wrappers with owner and removal condition.

## 4. Time Formatting Migration

- [x] 4.1 Migrate generic media time labels in Audio Transport/Recording controls to `@neko/neko-client` helpers or clearly named package facades while preserving visible labels.
- [x] 4.2 Migrate generic media time labels in Tools media diff audio/video controls to `@neko/neko-client` helpers while preserving visible labels.
- [x] 4.3 Migrate generic media time labels in Agent audio/video preview cards to `@neko/neko-client` helpers while leaving chat timestamps and task durations local.
- [x] 4.4 Migrate generic media time labels in Cut preview/speed/timeline utilities where semantics match `@neko/neko-client`, and explicitly keep subtitle/timecode/export ETA formatters local.
- [x] 4.5 Add focused tests or snapshots for changed generic time labels in each migrated package.

## 5. Keyboard and Focus Migration

- [x] 5.1 Replace Agent `useWebviewKeyboardReporting` implementation with `@neko/ui/keyboard` helpers or a thin wrapper that delegates to them.
- [x] 5.2 Delete Sketch local `utils/editable-target.ts` after all callers use `@neko/ui/keyboard`.
- [x] 5.3 Verify Canvas, Audio, Model, Sketch, and Cut still preserve existing `keyboardFocus`, `webviewKeyboardFocus`, and editable-target behavior after shared primitive adoption.
- [x] 5.4 Add focused tests for Agent and Sketch keyboard/focus migration, including editable text inputs, contenteditable, pointer focus, blur/pagehide, and keyboard shortcut suppression.

## 6. Engine Stream Lifecycle Migration

- [x] 6.1 Migrate Preview `VideoPlayer`, `AudioPlayer`, and panorama video runtime to the shared stream lifecycle helper while preserving reconnect, diagnostics, and controls.
- [x] 6.2 Migrate Canvas `InlineVideoPlayer`, `InlineAudioPlayer`, and narrative preview media runtime to the shared stream lifecycle helper where lifecycle semantics match.
- [x] 6.3 Migrate Cut `PreviewPanel` stream lifecycle to the shared helper while preserving timeline preview volume, mute, scheduler stats, and error UI.
- [x] 6.4 Evaluate Live, Model, Puppet, and Tools stream paths against the shared helper; migrate matching lifecycle code and document any retained domain-specific lifecycle with owner and extraction criteria.
- [x] 6.5 Add or update tests for stream helper integration in at least Preview, Canvas, and Cut, covering descriptor replacement and component unmount cleanup.

## 7. Guardrails and Documentation

- [x] 7.1 Extend Webview boundary or quality checks to fail on production direct `console.*` usage outside approved test/dev diagnostics.
- [x] 7.2 Add guardrails for known duplicate i18n/logger bootstrap patterns once packages have migrated.
- [x] 7.3 Add guardrails for package-local editable-target copies and direct imports of obsolete local keyboard reporters.
- [x] 7.4 Add a documented exception mechanism for retained package-local wrappers, requiring owner, reason, replacement, validation command, and removal condition.
- [x] 7.5 Update `docs/architecture/package-boundaries.md` or a focused Webview foundation architecture doc with the stable rules introduced by this change.
- [x] 7.6 Update package README/docs only where package entry points or recommended helper imports change.

## 8. Validation

- [x] 8.1 Run shared tests for `@neko/shared` i18n/logger additions, `@neko/ui` ErrorBoundary/keyboard additions, and `@neko/neko-client` stream/time additions.
- [x] 8.2 Run focused Webview package tests for migrated i18n/logger/ErrorBoundary/time/keyboard paths.
- [x] 8.3 Run focused stream lifecycle tests and representative package tests for Preview, Canvas, and Cut media playback paths.
- [x] 8.4 Run TypeScript checks for migrated Webview packages.
- [x] 8.5 Run `pnpm check:webview-boundaries`, `pnpm check:deps`, and the new/updated duplicate foundation guardrails.
- [x] 8.6 Run `pnpm check:quality` or record unrelated pre-existing failures after proving the new guardrails execute.
- [x] 8.7 Run `pnpm smoke:webview:runtime` or focused `vscode-extension-debugger` validation for representative migrated paths: ErrorBoundary fallback, i18n locale update, keyboard focus reporting, and media stream start/dispose.
- [x] 8.8 Run `openspec validate unify-webview-foundation-capabilities` and record residual validation gaps before implementation is considered complete.
