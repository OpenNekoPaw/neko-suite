## 1. Audit and Contract Baseline

- [x] 1.1 Audit current `.nkv`, `.nkc`, `.nks`, `.nkp`, `.nkm`, and `.nka` load/save entry points and record which ones already use pure codecs versus direct JSON persistence.
- [x] 1.2 Identify all source-bearing fields for the first migration set, including `.nkv` timeline media/audio/scene/puppet sources and `.nkp`/`.nkm` bundle or sibling-resource references.
- [x] 1.3 Define shared `ProjectFileDiagnostic`, diagnostic codes, severity, recoverability, and safe context payloads in `@neko/shared`.
- [x] 1.4 Define `ProjectFormatCodec<TDocument>`, codec registry, load/save result types, compatibility metadata, and migration metadata in `@neko/shared`.
- [x] 1.5 Define `ProjectFileStore<TDocument>` and host file operation ports without importing VSCode into Layer 0 contracts.

## 2. Shared Store and Codec Registry

- [x] 2.1 Implement the codec registry and register adapters for existing `.nkv`, `.nkc`, and `.nka` codecs.
- [x] 2.2 Add thin compatibility codec adapters for `.nks`, `.nkp`, and `.nkm` so they can enter the shared store before deeper schema cleanup.
- [x] 2.3 Implement shared project file load, save, save-as, revert, backup, readonly/future-version, and dirty-state result handling.
- [x] 2.4 Implement per-document serialized writes and best-effort atomic write behavior through injected file operations.
- [x] 2.5 Add tests for invalid JSON, invalid format, unsupported future version, migration metadata, save-as, revert, backup failure, and concurrent save serialization.

## 3. Portable Source Path Policy

- [x] 3.1 Define `ProjectSourceDescriptor` and `PortableSourcePathPolicy<TDocument>` contracts for source-bearing fields.
- [x] 3.2 Implement path contraction using workspace-relative first, configured `${VAR}/path` second, and diagnostics for uncontracted absolute local paths.
- [x] 3.3 Implement source resolution diagnostics for missing source, unresolved variable, unauthorized root, multi-root ambiguity, and remote-source eligibility.
- [x] 3.4 Implement runtime/cache handle detection for Webview URIs, blob URLs, Engine tokens, stream IDs, preview/range URLs, WebSocket URLs, cache paths, proxy paths, thumbnails, and legacy `cachePath`.
- [x] 3.5 Add tests for project folder moves, media-root variable moves, non-portable absolute paths, missing variables, unauthorized roots, cache deletion, and runtime/cache handle rejection.

## 4. Host Adapters and Ingest Flow

- [x] 4.1 Add a VSCode Extension Host adapter for project file operations, workspace roots, document URI context, backups, and safe URI/path conversion.
- [x] 4.2 Add host-mediated Add/Link/Create Asset DTOs for dragged, pasted, selected, generated, linked, and external sources.
- [x] 4.3 Wire Add/Link/Create Asset handling to existing `ContentIngestService`, `ContentAccessService`, `PathResolver`, asset storage, and Engine file-access registration where needed.
- [x] 4.4 Add diagnostics for Webview-only `File.name`, blob URL, Webview URI, or cache path inputs that do not carry durable source identity.
- [x] 4.5 Add Extension/Webview message contract tests for add-source intent, successful Add/Link/Create Asset, unresolved external source, and diagnostic projection.

## 5. NKV Migration and Drag-Save Fix

- [x] 5.1 Move `.nkv` project session load/save onto the shared project file store while preserving current command and Webview message surfaces.
- [x] 5.2 Add `.nkv` source descriptors for timeline media, audio, scene3d, puppet, and other source-bearing elements.
- [x] 5.3 Replace package-local `normalizePathsForSave` behavior with the shared portable path policy or a compatibility wrapper around it.
- [x] 5.4 Update drag/drop and add-media flows so Extension Host returns durable source refs before timeline elements are persisted.
- [x] 5.5 Add focused `.nkv` tests proving dragged workspace media saves and reloads, unmanaged external media does not save as `clip.mp4`, `${VAR}` media roots reload on a changed machine root, and cache deletion does not break source refs.

## 6. NKP and NKM Persistence Migration

- [x] 6.1 Replace `.nkp` editor provider direct `JSON.parse/stringify` and `workspace.fs.writeFile` persistence with the shared project file store.
- [x] 6.2 Add `.nkp` source descriptors for puppet bundles, textures, audio, or linked media that must remain portable.
- [x] 6.3 Replace `.nkm` model document direct persistence with the shared project file store.
- [x] 6.4 Add `.nkm` source descriptors for model files and sibling resources that require workspace-relative, `${VAR}`, or Engine file-access semantics.
- [x] 6.5 Add focused `.nkp` and `.nkm` tests for load/save/revert/backup, missing sources, non-portable absolute paths, and future-version diagnostics.

## 7. NKC, NKA, and NKS Lifecycle Alignment

- [x] 7.1 Align `.nkc` host persistence entry points with the shared store while keeping the existing `loadNkc/saveNkc` codec as the domain contract.
- [x] 7.2 Align `.nka` host persistence entry points with the shared store while preserving existing compatibility metadata and readonly future-version behavior.
- [x] 7.3 Add or adapt `.nks` codec/serializer entry points so host persistence no longer depends on Webview-only serialization behavior.
- [x] 7.4 Add source descriptors for `.nkc`, `.nka`, and `.nks` fields that reference files, resources, generated outputs, or assets.
- [x] 7.5 Add focused lifecycle tests for `.nkc`, `.nka`, and `.nks` load/save/migration diagnostics and runtime/cache handle rejection.

## 8. Guardrails, Docs, and Validation

- [x] 8.1 Add boundary or static tests that prevent new production `nk*` persistence paths from bypassing the shared store with direct package-local `JSON.parse/stringify` and file writes.
- [x] 8.2 Update architecture or package docs only where new stable project-file I/O entry points need to be documented.
- [x] 8.3 Run focused shared-package tests for project-file I/O, codec registry, diagnostics, and path policy.
- [x] 8.4 Run focused package tests/builds for migrated `neko-cut`, `neko-puppet`, `neko-model`, `neko-canvas`, `neko-audio`, and `neko-sketch` surfaces.
- [x] 8.5 Run dependency and boundary checks relevant to touched packages, including Webview-not-importing-VSCode and Extension-not-importing-React guards.
- [x] 8.6 Run `pnpm build:neko-cut` after the `.nkv` migration and broader `pnpm check` or `pnpm test` once multiple formats are migrated.
  - `pnpm build:neko-cut` passed. `pnpm check` was run and is blocked by existing knip findings outside this change: `AgentStateIndicator.tsx`, `@fission-ai/openspec`, unlisted `jsdom`, unlisted `tsc`, several Agent Webview unused exports, and stale knip configuration hints.
- [x] 8.7 Run `pnpm smoke:webview:runtime` or focused `vscode-extension-debugger` validation for Extension Webview save/add-link flows affected by the migration.
- [x] 8.8 Run `openspec validate unify-nk-project-file-io` and record any residual validation gaps before implementation is considered complete.
