## Why

Canvas media nodes can play immediately after import, but after closing and reopening a Canvas document the same audio/video paths can be replayed as malformed absolute paths such as `/../cases/test.mp4`. The Preview panel and inline Canvas playback then pass those strings to `neko-client`/engine, producing file-not-found errors even though the media exists relative to the workspace or Canvas document.

## What Changes

- Store new Canvas local media paths as owning-workspace-root-relative paths, and normalize persisted paths before playback so workspace-relative, legacy document-relative, and `${VAR}/...` paths resolve to existing local files.
- Treat slash-prefixed non-existent Canvas paths such as `/cases/a.mp4` and `/../cases/a.mp4` as portable Canvas references, not as engine-ready absolute paths.
- Ensure Preview playback metadata carries a real playable local file path whenever the display URL is derived from a Canvas resource or local media path.
- Reuse the same Extension Host path resolution for inline Canvas playback, Preview playback, frame capture, and variant projection.
- Add regression coverage for reopened Canvas media paths so malformed root paths are not sent to the engine.

No breaking changes are expected.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `canvas-preview-capabilities`: Canvas Preview and inline media playback must resolve persisted media references through the Canvas document/workspace/path-variable context before calling the media engine.

## Impact

- `packages/neko-canvas/packages/extension/src/editor/canvasEditorProvider.ts`
- Canvas Preview bridge/media runtime metadata passed to the webview
- Canvas extension protocol tests covering media playback and variant resolution
- No engine API or protobuf changes
