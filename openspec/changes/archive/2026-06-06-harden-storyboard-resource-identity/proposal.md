## Why

Agent-to-Canvas storyboard image transfer is now functional, but the business contract still leaks runtime cache paths through `imagePaths`, `cachePath`, `referenceImagePath`, and legacy `document-image-cache` fallbacks. This keeps future regressions likely: multiple Agent reads can reuse aliases such as `page_1`, Canvas can silently fall back to stale cache paths, and package/export flows can accidentally treat derived cache artifacts as source identity.

## What Changes

- Treat storyboard and document-image business identity as `ResourceRef` / `DocumentArchiveResourceRef` plus source locator data, not cache paths.
- Add request-scoped image aliases for Agent storyboard planning so `page_1` is only meaningful within a tool call, batch, or explicit alias scope.
- Split Agent tool result image fields into stable refs and runtime preview handles; keep local paths only as runtime transport for Agent context or direct `ReadImage`, not as Canvas transfer identity.
- Route Agent-to-Canvas storyboard transfer through stable refs and `ContentAccessService` materialization; cache paths become migration-only fallback.
- Tighten manga/storyboard profile handling so document/image sourced shots require `sourceMediaRefs` with real `tool-result` locators or stable resource refs.
- Remove legacy cross-package dependence on `document-image-cache` roots after migration tests prove ResourceCache materialization covers the same cases.
- Update documentation and built-in skills so they no longer instruct models or users to send cache paths to Canvas.

## Capabilities

### New Capabilities
- `storyboard-resource-identity`: Defines stable storyboard media identity, scoped aliases, runtime handle boundaries, and legacy cache-path cleanup rules.

### Modified Capabilities
- `agent-composite-content-blocks`: Composite/storyboard assembly must preserve scoped media identity and avoid persisting Webview/cache paths.
- `canvas-agent-composite-operations`: Canvas imports and previews from Agent storyboard payloads must resolve images through resource refs and content access, with legacy paths restricted to migration fallback.
- `agent-multimodal-tooling`: Multimodal tool results must distinguish stable media refs from runtime preview/read handles.

## Impact

- Affected packages:
  - `packages/neko-agent/packages/extension`: `ReadDocument`, `ReadDocumentImage`, `ReadImage`, document cache service, local resource roots, plugin transfer bridge.
  - `packages/neko-agent/packages/webview`: storyboard/composite presenters, tool call presenters, Send to Canvas payload assembly.
  - `packages/neko-agent/packages/agent/src/skill/builtins`: manga/storyboard skill instructions.
  - `packages/neko-canvas/packages/extension` and `packages/neko-canvas/packages/webview`: storyboard import, node creation, preview materialization, legacy fallback removal.
  - `packages/neko-types`: storyboard table validation/projection and content/resource contracts if additional fields are needed.
- Existing payloads with only legacy cache paths remain readable during a migration window, but new Agent-to-Canvas payloads should not rely on those paths.
- Tests need to cover multi-request alias conflicts, missing cache rematerialization, stale legacy fallback behavior, and save/load without runtime path persistence.
