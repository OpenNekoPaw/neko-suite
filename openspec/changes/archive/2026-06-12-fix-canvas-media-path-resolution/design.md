## Context

Canvas media display and playback are intentionally split:

- Webviews can display only safe URLs produced by the Extension Host.
- The media engine can play only real local filesystem paths.
- Canvas documents persist portable references, not runtime URLs or cache paths.

The current failure occurs when a persisted Canvas path is slash-prefixed but not a real absolute file. `resolveAssetPath()` treats all leading-slash strings as absolute files, so paths like `/../cases/test.mp4` bypass the Canvas document/workspace context and are sent to `MediaPlaybackService`.

## Goals

- Keep filesystem/path authority in the Canvas Extension Host.
- Preserve portable Canvas document storage.
- Reuse one path resolution chain for Canvas inline playback and Preview playback.
- Avoid changing `neko-client` or engine contracts.

## Non-Goals

- Do not introduce direct filesystem access in webviews.
- Do not persist `webview.asWebviewUri()` values as source-of-truth asset paths.
- Do not require media import migration for existing `.nkc` files.

## Design

### 1. Runtime Path Resolution Boundary

Canvas media playback requests continue to flow through:

```text
Canvas/Preview webview
  -> Canvas Extension Host
  -> MediaPlaybackService / neko-client
  -> neko-engine
```

The Extension Host must convert incoming Canvas asset references into existing local file paths before calling `probeMedia`, `startPlayback`, or `captureFrame`.

### 2. Portable Canvas Path Interpretation

The Canvas extension resolves paths in this order:

1. Resource references (`resourceRef` / `documentResourceRef`) through the resource cache/read service.
2. `${VAR}/...` paths through the assets `PathResolver` command path.
3. Existing absolute local files.
4. Document-relative paths such as `../cases/test.mp4`.
5. Slash-prefixed Canvas portable paths that are not existing local files:
   - `/cases/test.mp4` resolves against workspace/project/document roots as `cases/test.mp4`.
   - `/../cases/test.mp4` resolves against workspace/project/document roots as `../cases/test.mp4`, with path normalization and existence checks.

Only existing files are returned as playback candidates.

The Canvas webview authorized roots must include the owning workspace folder, every open workspace folder, and the Canvas document directory. This keeps workspace-root paths such as `/cases/test.mp4` displayable after they are resolved to a real local file, while still leaving the Extension Host in charge of path validation.

### 3. Import-Time Storage Contract

Canvas media picker/drop/import messages must keep durable storage paths separate from runtime display URLs:

- `path`: portable, durable Canvas asset path. For files inside the Canvas document's owning workspace, this is a workspace-root-relative path such as `cases/a.mp4`. For files outside that root, it may be a configured non-workspace `${VAR}/...` path or a document-relative fallback.
- `runtimeAssetPath`: runtime-only `webview.asWebviewUri()` URL for immediate Canvas display.
- `originalPath`: optional host-local source path for compatibility with existing import payloads.

The webview creates media nodes with `assetPath = path` and `runtimeAssetPath = runtimeAssetPath`. `normalizeCanvasPathsForSave()` strips runtime fields after resolving the durable path through the same existing-file candidate resolver. This prevents first-open playback from hiding a bad persisted path that fails after reopening.

Canvas load projection follows the same rule: loading a stored `assetPath` must not overwrite it with a webview URL. The extension projects display URLs into `runtimeAssetPath` / `runtimeThumbnailPath` only.

### 4. Multi-Root Workspace Semantics

The canonical persisted path for a local media file inside the Canvas document's owning workspace is relative to that workspace root. `${WORKSPACE}` and `${PROJECT}` are read-time compatibility variables, not process current working directories. In a VSCode multi-root window, a Canvas document can be opened from one workspace while media lives in another workspace. Therefore:

- Read/playback resolution treats plain relative paths as owning-workspace-root-relative first, then falls back to legacy Canvas-document-relative resolution.
- Read/playback resolution treats existing `${WORKSPACE}/path` and `${PROJECT}/path` values as compatibility candidate sets: owning Canvas workspace first, then every open workspace, then the Canvas document directory.
- Only existing files are selected for engine playback.
- Save-time contraction writes `cases/a.mp4` when the media file is inside the Canvas document's owning workspace. Cross-root media should remain a configured non-workspace variable path if `neko.assets.contractPath` can provide one, otherwise fall back to a document-relative path.

This avoids saving a path that implies the wrong root while still recovering older documents that already contain ambiguous `${WORKSPACE}/...` or document-relative media paths.

### 5. Preview Display URL vs Playable Path

Preview enrichment should keep the two concepts separate:

- `previewUrl`: safe webview URL for image/poster/display.
- `previewPlayableAssetPath`: existing local file path for `neko-client`/engine playback.

When a Preview source is resolved through a resource projection, the extension should still resolve and attach `previewPlayableAssetPath` when a local file can be materialized. The webview should continue sending that playable path back on `media:probe` and `media:play`.

### 6. Shared Use Sites

The same local file candidate resolver should be used by:

- `media:probe`
- `media:play`
- `media:captureFrame`
- `preview:resolveVariant`
- Canvas document load media projection (`neko-canvas.load-node-media`)
- Canvas Preview plan enrichment
- `openMediaPreview` where it opens a local media custom editor
- media picker/drop/import save normalization

This avoids the current split where image display can work while audio/video playback fails.

### 7. Preview Media Session Envelope

The Canvas Preview panel is an independent webview, so media playback messages must carry the owning Preview session context instead of relying on the active Canvas editor:

- The Preview media runtime MUST post `sessionId`, `sourceCanvasUri`, and `revision` with `media:probe`, `media:play`, `media:pause`, `media:resume`, `media:seek`, and `media:stop`.
- The Preview bridge MUST route media messages through the owning session's `sourceCanvasUri`.
- The Extension Host MUST respond with either `media:probeResult` / `media:streamReady` or an error for every probe/play request. It must not silently return when source Canvas context is unavailable.
- If the engine returns no usable audio/video stream URL, the Host MUST surface that as a `media:streamReady` error instead of letting the Preview UI remain in a preparing state.

## Risks

- Multi-root workspaces can contain the same relative media path in multiple roots. The resolver should keep deterministic ordering: owning workspace folder first, all workspace folders next, Canvas document directory last.
- Slash-prefixed malformed paths can point outside a workspace after normalization. The resolver should only return existing files, and webview projection still enforces authorized local roots derived from the Canvas workspace/document context.
- Existing user documents may contain mixed path styles. The fix must be tolerant rather than migration-dependent.

## Testing

- Add protocol/source tests verifying media load projection and playback use the shared candidate resolver rather than direct `resolveAssetPath()`.
- Add tests/assertions for slash-prefixed non-existing Canvas paths such as `/../cases/test.mp4`.
- Re-run Canvas extension/webview focused tests and compile root `neko-canvas` output for VSCode runtime testing.
