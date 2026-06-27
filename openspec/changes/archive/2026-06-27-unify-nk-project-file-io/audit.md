## Current nk* File I/O Audit

Date: 2026-06-17

### Format Persistence Baseline

| Format | Current format support | Current host persistence | Notes |
| --- | --- | --- | --- |
| `.nkv` | Pure codec exists in `packages/neko-types/src/nkv/codec.ts` with load, validate, migrate, and save helpers. | `packages/neko-cut/packages/extension/src/services/ProjectSessionService.ts` directly uses `fs.readFile`, `JSON.parse`, `JSON.stringify`, and `fs.writeFile`; `packages/neko-cut/packages/extension/src/services/tools/helpers.ts` owns local path normalization. | Highest priority because drag/add-media can lose durable source identity. |
| `.nkc` | Pure codec exists in `packages/neko-types/src/nkc/codec.ts`. | `packages/neko-canvas/packages/extension/src/editor/canvasEditorProvider.ts` uses the codec for load but still writes JSON through `vscode.workspace.fs.writeFile` in provider-local paths. | Codec is ready; host lifecycle still package-local. |
| `.nka` | Pure codec exists in `packages/neko-types/src/nka/codec.ts` with compatibility metadata for future versions. | Host persistence entry points are less centralized in the current scan, but format codec is ready to register in shared project-file I/O. | Must preserve readonly/future-version behavior. |
| `.nks` | Types and migrator exist in `packages/neko-types/src/types/sketch.ts` and `packages/neko-types/src/nks/migrator.ts`; Webview serializer exists in `packages/neko-sketch/packages/webview/src/utils/document-serializer.ts`. | Host save paths are currently command/provider-specific, for example `packages/neko-sketch/packages/extension/src/commands/index.ts` writes `.nks` JSON. | Needs a thin codec or serializer adapter before host lifecycle alignment. |
| `.nkp` | Types exist in `packages/neko-types/src/types/puppet.ts`; validation fixtures cover native puppet contracts. | `packages/neko-puppet/packages/extension/src/editor/puppetEditorProvider.ts` directly reads/writes JSON through `vscode.workspace.fs` and manages backup/revert locally. | Needs migration after `.nkv` because persistence and source references are inline. |
| `.nkm` | Types and defaults exist in `packages/neko-types/src/types/model-project.ts`. | `packages/neko-model/packages/extension/src/editor/ModelDocument.ts` owns `.nkm` document JSON behavior. | Needs a compatibility codec plus source descriptors for `model.src`. |

### First Migration Source Fields

| Format | Source-bearing fields | Durable policy |
| --- | --- | --- |
| `.nkv` | `tracks[].elements[].src` for `media`, `audio`, `scene3d`, and `puppet` timeline elements. | Save as workspace-relative or `${VAR}/path`; reject Webview/blob/Engine/cache handles; resolve through host/Engine for runtime. |
| `.nkp` | `puppet.src`, `puppet.bundle.path`, bundle locators such as `puppet.bundle.manifest`, `puppet.bundle.moc`, `bundleIndex.manifest`, `bundleIndex.moc`, and `bundleIndex.textures[].locator` where they carry bundle/file paths. | Preserve project-relative or `${VAR}` refs; do not replace bundle identity with extracted cache paths. |
| `.nkm` | `model.src`. | Preserve project-relative or `${VAR}` refs; sibling resources use model source and Engine file access at runtime. |
| `.nka` | `tracks[].elements[].src` for timeline-backed audio/media elements. | Same source policy as `.nkv`, with audio-specific codec behavior preserved. |
| `.nkc` | Canvas project nodes and media/resource refs may reference `.nkv`, `.nka`, `.nkm`, `.nkp`, images, videos, or generated assets. | Prefer `ResourceRef`, asset refs, workspace-relative, or `${VAR}`; never persist projected preview URLs. |
| `.nks` | Current persisted raster/vector document is mostly embedded data; future linked brushes, references, imports, or generated outputs must be expressed as source descriptors before host persistence. | No Webview/runtime handles in durable fields. |

### Implementation Constraints Confirmed

- Webviews do not own durable path facts and cannot safely derive local paths from browser `File.name`.
- VS Code `workspace.fs` is an adapter, not the source of truth; durable creative facts live in `nk*` files or explicit project fact stores.
- Cache artifacts remain derived and must not become source identity.
- Existing dirty worktree contains unrelated docs, Agent, Cut Webview, and Sketch Webview changes; implementation should avoid editing those files unless a later migration step requires it.
