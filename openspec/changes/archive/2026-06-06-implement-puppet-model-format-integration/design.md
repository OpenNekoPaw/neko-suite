## Context

The ADR `docs/architecture/adr-puppet-model-format-integration.md` defines a broad integration path for `neko-puppet` and `neko-model`. The immediate needs are practical: Live2D users commonly obtain ZIP bundles with `model3.json`, while current puppet loading handles bare `.moc3` only; `neko-model` has rich scene editing/runtime code but no Agent or Market integration; and neither package contributes searchable, reusable puppet/model asset dimensions to the project asset ecosystem.

The work crosses shared types, VSCode extension hosts, Webviews, engine actions, AssetLibrary, ProjectSearch, Market install targets, and Agent capability registration. It also overlaps the parallel `targeted-agent-plugin-transfer-and-query-apis` change, which owns generic Agent plugin-transfer routing, Canvas active-context query/apply contracts, and the shared tool-planning metadata fields. This change should consume those shared contracts for model/asset providers rather than duplicating Canvas transfer semantics. It must preserve existing layer rules:

- shared Layer 0 contracts cannot import VSCode, Node filesystem APIs, AdmZip, React, or domain package internals;
- Webviews cannot import `vscode` or Node APIs;
- domain packages own domain parsing and editing semantics;
- AssetLibrary owns asset lifecycle state, while ProjectSearch projects searchable views;
- Market remains decoupled from domain implementations and routes through shared install target contracts.

## Goals / Non-Goals

**Goals:**

- Make Live2D ZIP bundles first-class puppet inputs through a safe bundle-memory path.
- Keep bundle locators as metadata and resolve them to runtime-supported bytes/JSON/images before engine/Webview use.
- Expose 3D scene state and editing operations to Agent through `NekoModelAPI` and a model capability provider that uses shared `safetyKind`, `targetRequirements`, and `queryBeforeMutate` metadata.
- Add a host-owned import dispatcher that distinguishes workspace references, external imports, Live2D ZIP bundle-memory, and 3D glTF ZIP disk extraction.
- Project puppet/model model, motion, config, audio, and text dimensions through AssetLibrary/Search.
- Add Market install targets and media kinds for puppet/model assets and voice packs.
- Add project asset dependency manifests for git/team recovery of import and market assets.
- Define export and P2 voice/PSD roadmaps without blocking P0/P1 implementation.

**Non-Goals:**

- Do not implement a VSCode `zip://` FileSystemProvider in the runtime path.
- Do not make Webviews read ZIP files directly.
- Do not make `neko-search` own puppet/model parsing or asset facts.
- Do not make `neko-market` import domain package implementation code.
- Do not redefine Canvas Agent transfer/query APIs already owned by `targeted-agent-plugin-transfer-and-query-apis`.
- Do not remove legacy `.inp` read compatibility in this change.
- Do not implement ML lip-sync or PSD auto-rigging in the main implementation.

## Decisions

### Decision 1: Split locator, reader, runtime channel, and projection

`bundlePath#entryPath` is a logical locator for metadata. `Live2dBundleLoader` resolves locators to bytes/JSON. The runtime consumes bytes, ImageBitmap, engine file tokens, or concrete data APIs. AssetLibrary/Search stores/project locators but does not treat them as files.

Alternative considered: introduce `zip://` and use it everywhere. Rejected because engine actions and Webviews still require concrete runtime data and because virtual filesystem browsing is not a safe substitute for data loading.

### Decision 2: Live2D ZIPs use bundle-memory, 3D glTF ZIPs use disk extraction

Live2D `.moc3`, textures, motions, expressions, and physics can be read as bytes/JSON from ZIP memory and referenced from `.nkp`. 3D `.gltf` ZIP packages often require relative `.bin` and texture files on disk because glTF loaders resolve relative paths from a real file location.

Alternative considered: always extract ZIPs into `.neko/imports/`. Rejected for Live2D because it creates many small lifecycle-managed files where memory loading and locator metadata are sufficient.

### Decision 3: MOC3 external texture support is a P0 prerequisite

Current puppet commands load MOC3 geometry/parameters but do not provide a PNG byte upload path. `puppets:set_texture` changes node texture index and is not a texture upload API. The implementation must define either a Webview ImageBitmap path for Canvas rendering, an engine atlas upload path, or both, before Live2D bundles are considered complete.

Alternative considered: parse model3.json but ignore textures. Rejected because it would make imported Live2D models appear broken and create false P0 completion.

### Decision 4: Model Agent tools wrap extension-owned scene API

`NekoModelAPI` should be exported by `neko-model` and implemented over existing `ModelEditorProvider`, engine `SceneSnapshot`, and scene command paths. Agent tools call the API rather than reading Webview state directly.

Tool categories:

- `ModelSceneQuery`: read-only scene graph/material/animation query with `safetyKind: 'read-only-query'` and `isConcurrencySafe: true`.
- `ModelNodeManipulate`: editing operations for transform, visibility, and material parameters with explicit `targetRequirements` such as `nodeId`, `materialId`, and operation mode.
- `ModelAnimationControl`: animation list/play/stop/seek/blend controls; list/query operations are read-only, while playback state changes are non-destructive mutations gated by active-editor availability.

Mutation tools should include `queryBeforeMutate` guidance that points planners to `ModelSceneQuery` before changing transforms, visibility, materials, or animation state. This keeps model tools aligned with the query-first/evidence-second rule from `targeted-agent-plugin-transfer-and-query-apis` while leaving Canvas-specific target resolution to the Canvas change.

The model API can now rely on engine-side scene snapshot extensions when present:

- `SceneNodeSnapshot.bounds` and `SceneNodeSnapshot.worldBounds` provide stable framing, hit-test, and compact scene-query facts without requiring Webview store inspection.
- `SceneControlSocket.updateViewportCamera()` and the host HTTP `viewportCameraAck` path provide an engine-owned camera update channel for viewport/camera synchronization.
- API implementations must degrade gracefully when older engine snapshots do not include bounds or when viewport camera acknowledgement is unavailable.

Alternative considered: Agent sends raw postMessage commands to model Webview. Rejected because it bypasses extension ownership, testing boundaries, and host availability checks.

### Decision 4a: Canvas query/apply contracts stay in the targeted Agent transfer change

The broader Agent/Canvas work added active Canvas context queries, target-aware `applyAgentContent`, and generic `Tool` metadata fields. This ADR uses the generic metadata fields for model and asset providers, but it does not add Canvas transfer behavior to the puppet/model implementation scope.

Alternative considered: fold Canvas target-aware apply/query behavior into this ADR proposal because model assets may be sent to Canvas later. Rejected because it would blur domain ownership and duplicate the active `targeted-agent-plugin-transfer-and-query-apis` change.

### Decision 5: ImportDispatcher is a host implementation with shared contracts

`ImportHandler`, `ImportPlan`, and `ImportResult` types can live in shared code. The dispatcher implementation belongs in `neko-assets` or host-vscode integration because it needs VSCode workspace context, file dialogs, filesystem writes, AdmZip, and user interaction.

Alternative considered: put dispatcher implementation in `@neko/shared`. Rejected because it would break Layer 0 dependency rules.

### Decision 6: Search projection goes through AssetLibrary

Puppet/model packages write asset dimension metadata into AssetLibrary. The existing `asset-library` search partition projects those dimensions. Domain packages must not each register a separate `asset-library` adapter unless ProjectSearch first supports same-partition composite providers.

Alternative considered: register one ProjectSearchAdapter per package with the same partition. Rejected because current coordinator stores one adapter per partition and later registrations replace earlier ones.

### Decision 7: Asset dependency manifest describes external dependencies, not all assets

`neko/assets/manifest.json` records external import and market dependencies needed for recovery. Workspace assets committed to git can remain in AssetLibrary without manifest dependency records unless they need explicit recovery metadata.

Alternative considered: make manifest replace AssetLibrary. Rejected because AssetLibrary tracks actual project asset state, variants, files, status, and remaps; the manifest is a dependency declaration.

## Risks / Trade-offs

- [Risk] The change is too broad for one implementation pass. → Mitigation: tasks are phased; P0 focuses on contracts, model Agent API, texture channel, and Live2D bundle import before broader Market/export work.
- [Risk] Parallel Agent/Canvas work changes generic tool metadata while this proposal is implemented. → Mitigation: consume `safetyKind`, `targetRequirements`, and `queryBeforeMutate` from shared contracts and keep Canvas query/apply behavior in the targeted Agent transfer change.
- [Risk] Live2D bundle loading can appear complete before textures work. → Mitigation: specs require texture data routing and tests before bundle import is considered done.
- [Risk] AssetLibrary/Search ownership may blur with domain parsing. → Mitigation: domain packages extract metadata and write facts; Search only projects facts.
- [Risk] ZIP safety issues from third-party bundles. → Mitigation: locator/path validation, duplicate detection, zip-slip prevention, and size limits are mandatory.
- [Risk] Market/media kind expansion can collide with existing generic media routes. → Mitigation: kind-level install target registration must be explicit and duplicate ownership rejected.
- [Risk] Team recovery can produce stale references if source ZIP hashes change. → Mitigation: dependency manifest stores content hashes and recovery status must warn on mismatch.

## Migration Plan

1. Add shared contracts first: bundle locators, import handler types, model API types, asset dimensions, dependency manifest types, and references to the shared Agent tool-planning metadata.
2. Deprecate `.inp` creation/import entrypoints while keeping existing `.inp` open/load paths.
3. Implement model API and Agent capability provider independent of puppet ZIP work, using scene snapshot bounds/camera channels when available and reporting graceful fallback otherwise.
4. Add MOC3 external texture runtime channel.
5. Add Live2D ZIP parser/loader and `.nkp` bundle/bundleIndex support.
6. Add ImportDispatcher host implementation and route Live2D ZIP / 3D glTF ZIP flows.
7. Add AssetLibrary writes and Search projection for puppet/model dimensions.
8. Add Market install targets and dependency manifest recovery.
9. Add export commands and character-pack packaging.
10. Archive P2 voice/lip-sync and PSD bridge as design follow-ups when the main integration is stable.

Rollback strategy: each phase should be gated by additive fields and commands. If a phase fails, disable new commands/providers while preserving existing `.nkp`/`.nkm` source loading and existing puppet/model editor behavior.

## Open Questions

- Should MOC3 texture bytes initially route only to Webview Canvas, or should engine atlas upload be implemented first for export/composition parity?
- Should `neko/assets/manifest.json` live under `neko/assets/` as proposed, or align with existing `.neko` storage naming for project facts?
- Which package should own the concrete ImportDispatcher service: `neko-assets`, `neko-search` host integration, or a new neutral host package?
- Should model animation extraction to `.nkma` be implemented before or after character-pack export?
