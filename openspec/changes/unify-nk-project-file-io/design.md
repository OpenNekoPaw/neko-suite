## Context

Neko Suite has several durable `nk*` JSON project formats, but their persistence paths are uneven:

- `.nkv`, `.nkc`, and `.nka` already have pure codec-style helpers in `@neko/shared`.
- `.nks` has migration and Webview serialization helpers, but host persistence is not yet aligned with the same project-file store model.
- `.nkp` and `.nkm` still contain direct Extension-side `JSON.parse`, `JSON.stringify`, and `workspace.fs.writeFile` usage in editor providers and documents.
- `neko-cut` has local `normalizePathsForSave` and `resolveMediaPath` helpers, but dragged files can still arrive without a durable source path if the Webview only knows `File.name` or a runtime projection.
- `PathResolver`, workspace media path helpers, `ContentAccessService`, `ContentIngestService`, `ResourceCacheService`, and Engine file access already define most low-level boundaries, but `nk*` project documents do not consume them through one shared persistence contract.

The durable answer to "where is data saved?" is: project facts must be saved into the `nk*` project file or the relevant project fact store, while VS Code state, Webview state, cache artifacts, and Engine/runtime handles are only projections or local session state. VS Code may host editors and expose `workspace.fs`, but it is not the source of truth for creative project data.

This design is an L3 project-format and file/resource-access change. It touches shared contracts, Extension Host adapters, multiple domain packages, and migration behavior. It must be contract-first, host-mediated, and testable without giving Webviews filesystem authority.

### Five-layer analysis

| Layer | Analysis |
| --- | --- |
| Responsibility | Domain codecs own schema, validation, migration, defaults, and domain serialization. Shared project-file I/O owns host-side document lifecycle, serialized writes, backup/revert/save-as, path normalization, diagnostics, and Add/Link/Create Asset orchestration. Cache services own derived artifacts only. |
| Dependency | L0 shared contracts stay host-agnostic where possible. VSCode `workspace.fs`, `Uri`, and `Disposable` usage stays in `@neko/shared/vscode/extension` or feature Extension packages. Webviews receive typed projections and commands only. Engine file access remains behind `@neko/neko-client` and host authorization. |
| Interface | Use narrow interfaces: `ProjectFormatCodec<T>`, `ProjectFileStore<T>`, `PortableSourcePathPolicy<T>`, `ProjectDocumentHost<T>`, `ProjectFileDiagnostic`, and Add/Link/Create Asset request/result DTOs. Avoid a catch-all file manager. |
| Extension | Adding a future `.nkb` or revising `.nks` should require registering a codec and source-field policy, not duplicating document lifecycle, atomic writes, path contraction, or missing-source diagnostics. |
| Testing | Pure codec roundtrip tests cover format ownership. Path policy tests cover workspace-relative, `${VAR}`, missing variable, unauthorized root, and non-portable absolute paths. Store tests cover load/save/save-as/revert/backup/dirty serialization. Package integration tests cover `nkv`, `nkp`, `nkm`, and Webview message contracts. |

## Goals / Non-Goals

**Goals:**

- Provide one shared, typed project-file I/O capability for JSON `nk*` files.
- Keep each domain format's codec, schema, migration, and default document data under domain ownership.
- Make load/save behavior consistent: parse, validate, migrate, normalize durable paths, write atomically or through a serialized queue, and return diagnostics.
- Make source references portable by default: workspace-relative first, `${VAR}/path` second, diagnostic for uncontracted absolute local paths.
- Ensure dragged, pasted, generated, and externally selected sources are resolved by Extension Host Add/Link/Create Asset flows before becoming project facts.
- Preserve the boundary that cache artifacts, Webview URIs, blob URLs, stream IDs, Engine tokens, range URLs, preview URLs, and local runtime paths never become durable project identity.
- Support multi-root workspaces by carrying the owning workspace root and document URI through path policy context.
- Make data movement explicit: project-local files move with the project folder; asset-library, media-library, or OSS-backed files move by reconfiguring `${VAR}` or asset roots; unmanaged external files require a user-visible move/register/configure action or a diagnostic.
- Produce reusable diagnostics that editors can surface without inventing package-specific error strings.

**Non-Goals:**

- Create one universal `nk*` schema.
- Replace domain-specific codecs with a generic JSON serializer.
- Make cache a source of truth or write cache paths into project files.
- Add direct filesystem access to Webviews.
- Redesign existing editor panels or timeline UX.
- Implement full asset-library semantics inside project-file I/O. Ingest may return asset/source refs, but asset governance remains separate.

## Decisions

1. **Use a layered project-file I/O model instead of a universal file manager.**
   - Model:
     ```text
     nk* file
       -> ProjectFormatCodec<T>
       -> ProjectFileStore<T>
       -> PortableSourcePathPolicy<T>
       -> ContentIngest / ContentAccess / ResourceCache / Engine file access
     ```
   - Rationale: This keeps domain facts close to their formats while centralizing the error-prone cross-cutting lifecycle.
   - Alternative considered: put all `nk*` behavior behind one generic "NekoProject" schema. Rejected because timeline, canvas, audio, model, sketch, and puppet have different domain facts and migration cadence.

2. **Define a small codec contract for each durable format.**
   - Shape:
     ```ts
     interface ProjectFormatCodec<TDocument> {
       readonly formatId: 'nkv' | 'nkc' | 'nks' | 'nkp' | 'nkm' | 'nka' | string;
       readonly fileExtensions: readonly string[];
       readonly currentVersion: string;
       load(json: string, context: ProjectFormatLoadContext): ProjectFormatLoadResult<TDocument>;
       save(document: TDocument, context: ProjectFormatSaveContext): ProjectFormatSaveResult;
     }
     ```
   - Rationale: Existing `loadNkv/saveNkv`, `loadNkc/saveNkc`, and `loadNka/saveNka` already approximate this contract. The registry standardizes results, diagnostics, read-only future-version behavior, and migration metadata.
   - Alternative considered: make `ProjectFileStore` parse raw JSON and call validators separately. Rejected because codecs already own schema semantics and must remain the single format contract.

3. **Keep `ProjectFileStore` host-side and inject file operations.**
   - Responsibilities:
     - read/write bytes through injected file ops or VSCode `workspace.fs` adapter,
     - decode/encode UTF-8 JSON,
     - run codec load/save,
     - apply path policy before saving,
     - record diagnostics and migration metadata,
     - serialize writes per document,
     - support save, save-as, revert, backup, and readonly/future-version states.
   - Rationale: Extension Host has the authority to read/write files and mediate VSCode lifecycle. Injection keeps core behavior testable and avoids importing VSCode into L0.
   - Alternative considered: each custom editor provider keeps its own save implementation. Rejected because it repeats dirty-state, backup, and path handling bugs.

4. **Make portable path policy explicit and format-aware.**
   - `PortableSourcePathPolicy<TDocument>` discovers and rewrites source-bearing fields through domain-provided selectors/mutators or source descriptors:
     ```ts
     interface ProjectSourceDescriptor {
       readonly id: string;
       readonly role: 'media' | 'audio' | 'model' | 'puppet' | 'image' | 'document' | 'generated';
       readonly path: string;
       readonly fieldPath: readonly string[];
       readonly allowRemote?: boolean;
     }
     ```
   - Write policy:
     - remote URLs stay remote only when the field allows remote source identity,
     - project-local absolute paths contract to workspace-relative paths,
     - configured roots contract to `${VAR}/path`,
     - unresolved or unauthorized sources block save only when the caller requests strict mode; otherwise they save existing durable refs and return diagnostics,
     - uncontracted absolute paths are not silently written.
   - Read/runtime policy:
     - durable refs resolve through `PathResolver` and workspace media path context,
     - large media and seek-heavy reads go through Engine file access or stream descriptors,
     - Webview receives projected runtime handles separately from the saved document.
   - Alternative considered: call `PathResolver.contract()` on every string field. Rejected because not every string is a source, and cache/runtime fields must be diagnosed, not normalized.

5. **Route user-added sources through Add, Link, and Create Asset.**
   - `.nk*` files are lightweight project records. Large binary data belongs in the workspace/project folder, asset library, configured `${VAR}` root, or OSS-backed asset storage.
   - Webview request shape carries intent, document context, optional browser `File` metadata, byte handles, and any host-provided URI token, not a fabricated source path.
   - Host-side source handling uses three stable semantics:
     - `Add`: add an already durable source ref, `ResourceRef`, asset/entity ID, workspace-relative path, `${VAR}/path`, or allowed remote ref into a domain document.
     - `Link`: directly reference an existing durable file in the workspace/project folder, asset library, OSS, or configured `${VAR}` root without copying it.
     - `Create Asset`: materialize byte-only inputs into a durable file or asset object first, then return a stable ref that can be added to the document.
   - Source classification:
     - Workspace/project files, asset-library files, OSS refs, and configured `${VAR}` paths can be linked and added.
     - `Downloads`, `Desktop`, temp folders, and arbitrary unmanaged absolute paths are not auto-copied or silently imported. The editor must offer a recovery action such as move into workspace/asset library, configure a variable root, or keep the document dirty with a diagnostic.
     - Webview `File`/blob/bytes, paste screenshots, and AI/generated bytes must go through `Create Asset` before `Add`.
     - Cache, proxy, thumbnail, Webview URI, blob URL, stream ID, Engine token, and other runtime handles are rejected as source identity and are not promoted as durable sources.
   - Domain Add handlers store durable refs only. Parsing, metadata extraction, proxy generation, thumbnailing, subtitle parsing, PSD layer extraction, LUT parsing, model probing, and media playback are projections handled by ContentAccess, Engine file access, or cache services.
   - Rationale: This directly addresses drag-save failures where `clip.mp4` is saved without knowing where it came from, while preserving the record/data separation needed for Git-friendly project files and OSS-backed binary sync.
   - Alternative considered: let Webview build relative paths from dropped `File.name`, or auto-import every external local file. Rejected because browser `File` objects generally do not expose safe real local paths in VS Code Webviews, and silent copies hide ownership, sync, and storage decisions from users.

6. **Use diagnostics instead of silent fallback.**
   - Standard diagnostic codes include:
     - `invalid-json`
     - `invalid-format`
     - `unsupported-version`
     - `migration-failed`
     - `missing-source`
     - `unresolved-variable`
     - `unauthorized-root`
     - `non-portable-path`
     - `runtime-handle-persisted`
     - `cache-source-persisted`
     - `write-conflict`
     - `backup-failed`
   - Rationale: Editors need consistent user-visible states and test assertions, and data corruption is worse than an explicit save/recovery prompt.
   - Alternative considered: best-effort fallback to relative paths. Rejected because it can create broken refs such as `clip.mp4` that appear valid but cannot reload.

7. **Migrate in phases by risk and existing maturity.**
   - Phase 1: Introduce shared contracts, registry, path policy, and store tests.
   - Phase 2: Adapt `.nkv` because it has the active failure and already has codec/path helpers; keep old data recoverable through diagnostics and migration where possible.
   - Phase 3: Adapt `.nkp` and `.nkm` direct JSON providers because they currently own persistence inline.
   - Phase 4: Adapt `.nkc`, `.nka`, and `.nks` to the shared host lifecycle while preserving existing codecs/serializers.
   - Phase 5: Add guard tests or lint checks that prevent new package-local `nk*` JSON persistence from bypassing the store.

8. **Treat prelaunch cleanup as explicit, not accidental.**
   - Fields that persisted runtime/cache handles may be removed or rewritten if they are unreleased drafts and can be rebuilt or diagnosed.
   - Valuable local project facts are migrated or reported. They are not silently dropped.
   - Future-version files are read-only or fail closed depending on the codec's compatibility metadata.

## Risks / Trade-offs

- [Risk] A shared store becomes too generic and hard to use. -> Mitigation: keep format codecs domain-owned and require only narrow source descriptor/policy adapters per format.
- [Risk] Strict non-portable path rejection blocks users with external media. -> Mitigation: offer explicit recovery choices: move into workspace/project or asset library, configure a `${VAR}` root, create a durable asset for byte-only inputs, or keep the document dirty with diagnostic. Do not silently copy unmanaged local files.
- [Risk] Multi-root workspace contraction chooses the wrong root. -> Mitigation: carry `documentUri`, `owningWorkspaceRoot`, `workspaceRoots`, and `allowedRoots`; return `multi-root-ambiguity` diagnostics when candidates conflict.
- [Risk] Existing `.nkv` or `.nkp` files contain absolute paths that users rely on locally. -> Mitigation: migration can preserve them as unresolved diagnostics or prompt for root configuration, relink, or explicit move into managed storage; do not silently rewrite to a wrong relative path.
- [Risk] Atomic writes differ across local, remote, and virtual workspaces. -> Mitigation: define the contract as serialized writes with best-effort atomic temp/rename when supported; VSCode `workspace.fs` adapter handles remote-compatible operations.
- [Risk] Cache deletion reveals old project files that only saved cache paths. -> Mitigation: diagnose `cache-source-persisted` and require source relinking or explicit Create Asset from a valid byte source rather than treating cache as source.
- [Risk] Package migration is broad. -> Mitigation: implement shared contracts first, migrate one format at a time, and keep package-specific integration tests focused.

## Migration Plan

1. Add `project-file-io` contracts and diagnostics in `@neko/shared`, with no behavior change for existing editors.
2. Add a VSCode/Extension adapter that wraps `workspace.fs`, backup storage, URI/document context, and workspace roots.
3. Register existing `.nkv`, `.nkc`, and `.nka` codecs through the new codec registry; add adapter stubs for `.nks`, `.nkp`, and `.nkm`.
4. Implement portable source descriptors and path policy for `.nkv` media/audio/scene/puppet sources first.
5. Replace `neko-cut` ad hoc project session save/load paths with `ProjectFileStore`, preserving current command surfaces and Webview DTOs.
6. Add Add/Link/Create Asset message handling for cut drag/drop and external media add flows. A Webview-only `File.name`, unmanaged absolute path, runtime handle, or cache artifact must produce a recovery diagnostic, not a broken saved path.
7. Migrate `.nkp` and `.nkm` editor providers away from direct JSON persistence into the shared store.
8. Migrate `.nkc`, `.nka`, and `.nks` lifecycle entry points where they are host-persisted.
9. Add guard tests for runtime/cache handle persistence and direct package-local `nk*` save bypasses.
10. Update architecture docs only where implementation introduces new stable entry points or clarifies existing path/cache rules.

Rollback strategy:

- Shared contracts can remain unused if an adapter causes issues.
- Each domain migration should be revertible independently because codecs remain domain-owned and document DTOs are not merged.
- If a migrated store path fails, restore the package-specific adapter while keeping diagnostics tests to prevent data loss.

## Open Questions

- Should source-field descriptors live beside each codec in `@neko/shared/src/nk*/` or beside each domain Extension adapter when they depend on host behavior?
- Which UI affordance should be standard for non-portable path recovery: modal prompt, diagnostics panel, QuickPick, or editor inline banner?
- Should unresolved source diagnostics block save by default for all formats, or only when the source was newly added in the current session?
- Should `.nks`, `.nkp`, and `.nkm` receive new pure codecs before migration, or can thin compatibility codecs wrap their existing project document types first?
