## Why

Neko Webviews still duplicate several cross-cutting foundations after the VS Code bridge migration: i18n bootstrap, ErrorBoundary/logger setup, media stream lifecycle, time formatting, and keyboard/focus handling. This makes each Webview slightly different, leaves production `console.*` usage in some packages, and allows future features to copy old local patterns instead of using shared foundations.

This change is needed now because `standardize-webview-vscode-bridge` established the canonical transport boundary, exposing the next layer of repeated Webview infrastructure that should be consolidated before more editors build on it.

## What Changes

- Add shared Webview foundation APIs for:
  - i18n bootstrap from locale bundles,
  - package-level Webview logger creation,
  - shared ErrorBoundary rendering/logging behavior,
  - common Engine A/V stream lifecycle orchestration,
  - media time formatting helpers,
  - keyboard/focus reporting and editable-target detection adoption.
- Migrate representative and then broad Webview callers away from package-local duplicates while preserving domain-specific message contracts and UI copy.
- Remove production `console.error` / `console.log` fallback logging from affected Webviews in favor of shared loggers.
- Add guardrails or focused checks that prevent reintroducing package-local copies for the most important foundations where static detection is reliable.
- Document which package-local wrappers may remain as thin domain facades and which duplicate implementations should be deleted.

### Non-Goals

- Redesign domain-specific Webview message protocols or Extension Host handlers.
- Move feature-specific copy, message unions, media business policy, or editor workflow state into `@neko/shared`.
- Replace Engine-owned stream protocols, codecs, or Rust media authority.
- Unify all visual layouts of ErrorBoundary fallback UIs beyond shared structure, logging, and accessible recovery actions.
- Convert every timeline/subtitle/timecode-special formatter to a single media display helper when the format is domain-specific.

### Compatibility

This is a prelaunch cleanup of internal Webview infrastructure. Runtime behavior should remain stable for users, but package-local helper exports may be removed when all production callers migrate in the same change. Any retained wrapper must be a thin facade with owner, reason, validation, and removal condition recorded in this change.

## Capabilities

### New Capabilities

- `webview-foundation-capabilities`: Defines canonical shared Webview foundations for i18n bootstrap, logging/ErrorBoundary, Engine stream lifecycle helpers, time formatting, keyboard/focus adoption, and duplication guardrails.

### Modified Capabilities

- `webview-vscode-bridge`: Treat the standardized bridge as a prerequisite and integration point for Webview foundation APIs; no new bridge transport semantics are introduced.

## Impact

- Shared packages:
  - `packages/neko-types/src/i18n/*`
  - `packages/neko-types/src/logger/*`
  - `packages/neko-types/src/errors/*`
  - `packages/neko-client/src/*`
  - `packages/neko-ui/src/keyboard/*`
  - potentially `packages/neko-ui/src/*` for React ErrorBoundary primitives
- Webview packages:
  - `packages/neko-agent/packages/webview`
  - `packages/neko-audio/packages/webview`
  - `packages/neko-canvas/packages/webview`
  - `packages/neko-cut/packages/webview`
  - `packages/neko-dashboard/packages/webview`
  - `packages/neko-live/packages/webview`
  - `packages/neko-market/packages/webview`
  - `packages/neko-model/packages/webview`
  - `packages/neko-preview/packages/webview`
  - `packages/neko-puppet/packages/webview`
  - `packages/neko-sketch/packages/webview`
  - `packages/neko-story/packages/webview`
  - `packages/neko-tools/packages/webview`
- Tests and quality gates:
  - shared unit tests for new helpers,
  - package focused tests for migrated i18n/logger/ErrorBoundary/time/keyboard flows,
  - stream lifecycle tests or harnesses for common Engine A/V player behavior,
  - guardrails covering direct production `console.*` and reintroduced duplicate foundation patterns where feasible,
  - VS Code Webview runtime smoke for representative migrated UI/runtime paths.
