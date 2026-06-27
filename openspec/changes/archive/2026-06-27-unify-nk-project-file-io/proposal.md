## Why

The `nk*` project formats currently load, save, normalize paths, and manage cache/source boundaries through package-local code paths, which makes save reliability, drag-add/link behavior, portability, diagnostics, backup, and dirty-state handling inconsistent across editors. The recent `.nkv` drag-and-save failure exposed the core risk: Webview interactions can lose real source identity, while individual formats decide independently whether a path is portable, absolute, cache-backed, or only a runtime projection.

This change introduces a shared project file I/O capability so `.nkv`, `.nkc`, `.nks`, `.nkp`, `.nkm`, `.nka`, and later `nk*` formats can keep domain-owned codecs while using one contract for host-side file persistence, portable source paths, Add/Link/Create Asset flows, and diagnostics.

## What Changes

- Add a shared `ProjectFileStore` / document host contract for JSON `nk*` project files, covering load, save, save-as, backup, revert, dirty-state coordination, version/schema guard, and atomic or serialized writes.
- Add a format codec registry contract for `nk*` JSON formats so each domain keeps ownership of schema, validation, migration, defaults, and domain-specific serialization.
- Add a portable source path policy used before durable writes and after reads:
  - Prefer workspace-relative paths for project-local files.
  - Use configured `${VAR}/path` roots for shared media libraries and external source roots.
  - Reject or diagnose absolute local paths that cannot be contracted instead of silently saving them.
  - Never persist Webview URIs, blob URLs, Engine tokens, stream IDs, preview URLs, cache artifact paths, or runtime-only handles as project facts.
- Add a host-mediated Add/Link/Create Asset contract for dragged, pasted, generated, linked, and externally selected sources so Webviews submit user intent and Extension Host resolves real file identity through `ContentIngestService`, `ContentAccessService`, `PathResolver`, asset storage, and Engine file access when needed. Unmanaged local paths are diagnosed until the user explicitly moves/registers/configures them; byte-only inputs must first become durable assets.
- Migrate `.nkv`, `.nkc`, `.nks`, `.nkp`, `.nkm`, and `.nka` read/write entry points toward the shared store in phases, starting with formats that currently perform ad hoc `JSON.parse/stringify`, `workspace.fs.writeFile`, or package-local path conversion.
- Add diagnostics for missing source, unauthorized root, unresolved variable, non-portable absolute path, stale cache-only reference, unsupported future format version, invalid JSON, and migration failure.
- Document the source/cache/runtime boundary at the implementation entry points, reusing `docs/architecture/cache-file-access-and-paths.md` rather than creating a parallel model.
- Non-goals:
  - Do not merge all `nk*` schemas into one universal project format.
  - Do not move domain schema ownership out of the owning package or shared format SDK.
  - Do not let Webviews directly access Node, VSCode APIs, local files, or cache manifests.
  - Do not treat cache artifacts, preview proxies, or projected URIs as durable source identity.
  - Do not redesign editor UI panels as part of this file I/O proposal.

## Capabilities

### New Capabilities

- `project-file-io`: Shared behavior for loading, saving, validating, migrating, backing up, restoring, and path-normalizing `nk*` project files, including host-mediated Add/Link/Create Asset flows and durable source/cache/runtime identity rules.

### Modified Capabilities

- None.

## Impact

- Shared contracts and implementations:
  - `packages/neko-types/src/path/*`
  - `packages/neko-types/src/vscode/extension/*`
  - Existing `packages/neko-types/src/nkv`, `nkc`, `nks`, and `nka` format SDKs
  - New shared project-file I/O contracts, adapters, diagnostics, and test utilities in `@neko/shared`
- Domain package integrations:
  - `packages/neko-cut` (`.nkv`, timeline media source save/load, drag-add/link path reliability)
  - `packages/neko-canvas` (`.nkc`, source/resource refs and workspace path setup)
  - `packages/neko-sketch` (`.nks`, webview serializer and future host persistence)
  - `packages/neko-puppet` (`.nkp`, current direct JSON read/write and bundle/source references)
  - `packages/neko-model` (`.nkm`, model document persistence and sibling resources)
  - `packages/neko-audio` (`.nka`, audio project codec and source references)
- Runtime and architecture boundaries:
  - Extension Host remains responsible for file I/O, VSCode `workspace.fs`, URI authorization, Add/Link/Create Asset decisions, and Webview projection.
  - Webviews continue to exchange typed DTOs and do not persist runtime handles or local absolute paths.
  - Engine file access remains the authority for large media, range/seek, container entries, sibling resources, and source tokens.
- Compatibility and migration:
  - Prelaunch `nk*` draft formats may receive explicit breaking cleanup where old fields represented runtime/cache state rather than durable facts.
  - Existing valuable local project data must be migrated, relinked, moved into managed storage, configured through variables, or diagnosed; it must not be silently discarded.
  - Higher-version project files must fail closed with actionable diagnostics.
- Success criteria:
  - A media file dragged into `neko-cut` is saved as a durable workspace-relative or `${VAR}/path` source when possible, and reloads after closing/reopening VS Code.
  - Moving a project folder with project-local media keeps project-local references working.
  - Moving a workspace with `${VAR}` media roots works after configuring the variable on the new machine.
  - Cache deletion does not break project files that still have valid sources.
  - Invalid, future-version, missing-source, unresolved-variable, and non-portable path states produce consistent diagnostics across participating `nk*` editors.
