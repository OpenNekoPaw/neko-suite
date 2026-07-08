## Why

Desktop currently imports several feature Webview roots directly while VSCode and future hosts use separate adapter paths. This risks duplicated UI, divergent theme/i18n/error behavior, and desktop-local switch statements becoming the de facto editor registry instead of package-owned public entries.

This change normalizes feature Webview host adapters so Canvas, Cut, Agent, Audio, Model, Sketch, Preview, and future creative packages expose host-neutral adapter metadata from their owning package, while VSCode/Desktop supply only host bridges and rendering containers.

## What Changes

- Define a package-owned feature Webview host adapter contract for public Webview roots, custom editor runtimes, surface ids, i18n/theme requirements, and host capability requirements.
- Add Workbench Core DTOs/helpers for adapter descriptors so hosts can validate and register package-owned Webview adapters without importing feature internals.
- Update Desktop bootstrap wiring to consume a registry of package-owned adapter descriptors instead of treating desktop switch statements as canonical feature UI ownership.
- Preserve current Desktop rendering behavior for the MVP while making temporary desktop mappings explicit and fail-visible.
- Keep VSCode Webview style/runtime behavior unchanged; this slice does not redesign feature UI or migrate VSCode-specific CSP/resource bridges.
- **BREAKING**: Unsupported or unregistered feature adapter ids fail with diagnostics instead of silently falling back to a desktop-local empty/editor placeholder.

## Capabilities

### New Capabilities

- `feature-webview-host-adapters`: Defines package-owned, host-neutral Webview adapter descriptors and host consumption rules for shared feature UI across VSCode, Desktop, and future hosts.

### Modified Capabilities

- None.

## Impact

- Affected packages:
  - `packages/neko-workbench-core`: adds feature Webview host adapter DTOs, validation helpers, and tests.
  - `packages/neko-desktop`: consumes package-owned adapter descriptors in its bootstrap adapter and records temporary mappings explicitly.
  - Feature Webview packages such as `@neko-agent/webview`, `@neko-canvas/webview`, `@neko-audio/webview`, `@neko-model/webview`, `@neko-sketch/webview`, `@neko/preview-webview`, and `@neko/webview`: become adapter descriptor owners through public subpaths as they are migrated.
- Affected APIs:
  - New Workbench Core adapter descriptor type and validation function.
  - New Desktop registry/projection for feature Webview adapters.
- Validation:
  - Workbench Core contract tests for adapter descriptor validation and host capability matching.
  - Desktop tests proving feature editor adapters come from package-owned descriptors rather than desktop-owned canonical metadata.
  - Focused typecheck/tests for Workbench Core and Desktop.
