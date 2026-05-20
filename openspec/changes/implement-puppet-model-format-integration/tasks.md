## 1. Shared Contracts And Guards

- [x] 1.1 Add shared bundle locator, storage mode, import handler, asset dimension, project dependency manifest, and model API types without introducing VSCode/fs/AdmZip dependencies.
- [x] 1.2 Add ZIP entry path normalization, manifest-relative resolution, duplicate entry detection, and size-limit validation utilities with unit tests.
- [x] 1.3 Add `.nkp` bundle and bundleIndex type extensions while preserving legacy `puppet.src` compatibility.
- [x] 1.4 Add model API and Agent tool contract exports through the existing shared package entry points.
- [x] 1.5 Align model/asset provider contracts with the shared Agent tool metadata from `targeted-agent-plugin-transfer-and-query-apis` (`safetyKind`, `targetRequirements`, `queryBeforeMutate`) without redefining Canvas transfer/query contracts.

## 2. Puppet P0 Implementation

- [x] 2.1 Remove `.inp` from new puppet creation/import entrypoints while preserving existing `.inp` open/load compatibility.
- [x] 2.2 Finish MOC3 keyform source table parsing for art mesh, warp deformer, and rotation deformer data, with regression tests for real source-table indirection.
- [x] 2.3 Define and implement the MOC3 external texture data path for Live2D PNG textures in Webview Canvas and/or engine atlas integration.
- [x] 2.4 Implement Live2D `model3.json` manifest parsing with bundle locator generation and safe ZIP metadata validation.
- [x] 2.5 Implement `loadLive2dBundle` and `neko.puppet.importLive2dBundle` for zero-extraction Live2D ZIP import.
- [x] 2.6 Update puppet editor open flow so `.nkp.puppet.bundle` loads MOC3 bytes, textures, motions, expressions, and physics from ZIP memory before applying parameter overrides.
- [x] 2.7 Add Live2D bundle fixtures and tests for nested manifest paths, missing references, unsafe entries, duplicate entries, textures, motions, expressions, physics, and keyform-driven deformation.

## 3. Model Agent P0 Implementation

- [x] 3.1 Implement `NekoModelAPI` in `ModelEditorProvider` using existing engine scene snapshots, command paths, scene bounds (`bounds` / `worldBounds`), and viewport camera acknowledgement when available.
- [x] 3.2 Export `NekoModelAPI` from `neko-model` activation and handle no-active-editor cases with safe diagnostics.
- [x] 3.3 Add `agentCapabilityProvider.ts` for `ModelSceneQuery`, `ModelNodeManipulate`, and `ModelAnimationControl`.
- [x] 3.4 Register model capability provider with `neko-agent` when available and mark query/editing tools with correct `safetyKind`, `targetRequirements`, and `queryBeforeMutate` metadata.
- [x] 3.5 Add unit tests for model API behavior, scene bounds projection, viewport camera acknowledgement handling, unavailable-host diagnostics, and Agent tool execution using mocked model API state.

## 4. Unified Import Dispatch

- [x] 4.1 Implement host-owned ImportDispatcher service in the selected host/assets layer while keeping shared contracts implementation-free.
- [x] 4.2 Add import handlers for puppet `.moc3`/Live2D ZIP and model `.glb`/`.gltf`/`.vrm`.
- [x] 4.3 Add ZIP sniffing priority for market bundle manifests, Live2D `model3.json`, 3D glTF packages, bare `.moc3`, and ambiguous mixed packages.
- [x] 4.4 Add workspace-vs-external import planning for puppet to match model `useSource`/`copy` behavior.
- [x] 4.5 Add safe disk extraction for 3D glTF ZIPs under `.neko/imports/models/` with zip-slip protection and conflict handling.

## 5. AssetLibrary And Search Integration

- [x] 5.1 Extend AssetLibrary file metadata to record asset dimensions, media kinds, storage mode, bundle locator metadata, source origin, and source hash.
- [x] 5.2 Register Live2D bundle imports as bundle-memory model, motion, and config dimension records.
- [x] 5.3 Register model imports as disk/workspace model, motion, and config dimension records where metadata is available.
- [x] 5.4 Extend AssetLibrary ProjectSearch projection to include assetDimension, mediaKind, storageMode, and bundle locator metadata without opening ZIP files during query.
- [x] 5.5 Align the `neko-assets` Agent capability provider with asset list/get/import flows and shared tool metadata; keep asset lifecycle state owned by `NekoAssetsAPI`.
- [x] 5.6 Add tests proving puppet/model dimensions are searchable through the asset-library partition without same-partition adapter replacement and asset provider tools expose expected safety metadata.

## 6. Market And Dependency Recovery

- [x] 6.1 Add puppet model/config install targets and register them through the existing market API.
- [x] 6.2 Add model-3d/model-motion/model-config install targets and register them through the existing market API.
- [x] 6.3 Add voice-pack install target and shared media kind validation.
- [x] 6.4 Extend market manifest validation for puppet/model media kinds and character-pack/motion-pack bundle types.
- [x] 6.5 Implement project asset dependency manifest read/write service for import, market, and workspace source records.
- [x] 6.6 Add project-open or explicit validation flow that reports missing imports, missing market packages, and source hash mismatches.

## 7. Export And Packaged Assets

- [x] 7.1 Add puppet single-asset export commands for model, motion, and config outputs without mutating original ZIPs.
- [x] 7.2 Add model single-asset export commands for model motions and config outputs without mutating source `.glb`/`.gltf`/`.vrm`.
- [x] 7.3 Add `.nkentity` entity export format and command for character metadata plus bound asset references.
- [x] 7.4 Add character-pack export that builds bundle manifests and subpackages suitable for local share or Market upload.

## 8. P2 Design Follow-Ups

- [x] 8.1 Write detailed voice-pack and lip-sync design docs with `ILipSyncDriver`, target-specific face parameter timelines, and recovery/storage rules.
- [x] 8.2 Write detailed PSD-to-puppet bridge design docs with layer tree mapping, rig definition contract, and explicit non-goals for auto-rig quality.

## 9. Validation

- [x] 9.1 Run the smallest relevant TypeScript tests for shared contracts, puppet extension/webview, model extension, assets/search, Agent provider metadata, and market targets as each phase lands.
- [x] 9.2 Run architecture boundary checks to confirm shared code has no VSCode/fs/AdmZip imports and Webviews do not import VSCode/Node APIs.
- [x] 9.3 Validate engine-side MOC3 keyform parsing, scene bounds snapshot, and viewport camera scene-control tests when touching Rust engine code.
- [x] 9.4 Update user-facing Chinese documentation and any affected English architecture references after behavior changes land.
