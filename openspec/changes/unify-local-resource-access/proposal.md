## Why

Neko Suite currently converts local media paths to Webview URIs in multiple packages, while each Webview independently chooses `localResourceRoots`. This causes brittle preview behavior for files outside the workspace, including `401 Unauthorized` failures for extracted document images and external media-library assets.

This change establishes one local resource access contract so users configure where their media libraries live, and the system automatically resolves paths, authorizes Webview roots, and keeps transient preview data in controlled cache locations.

## What Changes

- Add a unified local resource access capability for VSCode Webviews.
- Provide a single Extension Host service for:
  - resolving local resource paths through media-library variables,
  - collecting authorized Webview roots,
  - converting local paths to `webview.asWebviewUri(...)`,
  - rejecting or leaving unresolved paths that are outside authorized roots.
- Extend `neko-assets` integration to expose configured media-library roots for Webview authorization.
- Standardize previewable cache locations:
  - extension-owned cache under `context.globalStorageUri`,
  - project-generated preview cache under workspace `.neko/.cache`,
  - no direct Webview dependency on random system temp directories.
- Migrate high-risk Webview callers in `neko-agent`, then shared media surfaces in `neko-canvas`, `neko-cut`, `neko-tools`, `neko-story`, and related preview packages.
- Integrate with the refactored identity and search boundaries by consuming `neko-entity` asset/entity refs and `neko-search` source refs instead of owning those semantics.
- Preserve existing path-variable usage such as `${WORKSPACE}`, `${PROJECT}`, `${NEKO_HOME}`, and media-library variables.
- No intentional breaking change to stored project files or existing media-library configuration.

## Capabilities

### New Capabilities

- `local-resource-access`: Defines how Extension Host code resolves, authorizes, and projects local files for VSCode Webview display across workspace files, media-library assets, generated caches, and extension caches.

### Modified Capabilities

- None.

## Impact

- Affected packages include `packages/neko-agent`, `packages/neko-assets`, `packages/neko-entity`, `packages/neko-search`, `packages/neko-canvas`, `packages/neko-cut`, `packages/neko-tools`, `packages/neko-story`, and preview/editor packages that expose local files in Webviews.
- New or updated Extension Host APIs will replace scattered `localResourceRoots` assembly and direct `webview.asWebviewUri(vscode.Uri.file(...))` calls.
- `neko-assets` must expose media-library root information through a stable command or provider API.
- `neko-search` remains responsible for search result/source-ref projection, and `neko-entity` remains responsible for creative identity, bindings, and representation resolution.
- Tests will cover root collection, path authorization, Webview URI projection, media-library root updates, and prevention of system temp paths leaking into Webview previews.
