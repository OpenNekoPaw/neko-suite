## Why

`neko-puppet` and `neko-model` are central character-authoring surfaces, but they are not integrated end-to-end with bundle import, Agent operation, marketplace distribution, project search, or asset dependency recovery. This blocks common Live2D workflows such as importing Booth/nizima ZIP bundles and leaves 3D scenes invisible to Agent tooling despite existing scene editing/runtime capabilities.

## What Changes

- Deprecate INP entrypoints while keeping legacy `.inp` read compatibility.
- Add a shared ZIP bundle locator contract for archive-internal references (`bundlePath#entryPath`) and use it as the foundation for Live2D bundle metadata.
- Add Live2D `model3.json` bundle import for `.zip` packages:
  - zero disk extraction for Live2D bundles,
  - `.nkp.puppet.bundle` references,
  - `bundleIndex` metadata for motions, expressions, physics, parameters, and textures,
  - safe ZIP entry validation.
- Define and implement the MOC3 external texture data path needed by Live2D bundles.
- Add `NekoModelAPI` and a `neko-model` `AgentCapabilityProvider` for scene query, node/material manipulation, and animation control.
- Consume the Agent tool planning metadata introduced by `targeted-agent-plugin-transfer-and-query-apis`:
  - model query tools use `safetyKind: 'read-only-query'`,
  - model mutation tools declare `targetRequirements`,
  - model mutation tools declare `queryBeforeMutate` guidance instead of using ad-hoc read/edit metadata.
- Use engine scene snapshot improvements (`bounds` / `worldBounds`) and viewport camera acknowledgement paths as part of the model scene API baseline where available.
- Add a host-owned import dispatcher contract and implementation for external imports, workspace drag/open flows, and ZIP content sniffing:
  - Live2D ZIP uses bundle-memory storage,
  - 3D glTF ZIP uses controlled disk extraction under `.neko/imports/models/`,
  - shared types stay in Layer 0 while VSCode/fs/AdmZip implementation stays in host/asset layers.
- Register puppet/model assets through AssetLibrary metadata and project search projection instead of duplicate `asset-library` adapters.
- Add market install targets for puppet/model model, motion, config, and voice-pack media kinds.
- Add project asset dependency manifest support for imported and market assets so teams can recover missing global or gitignored assets.
- Add single-asset export and character-pack export planning for puppet/model assets.
- Add P2 design-only follow-ups for voice-pack/lip-sync and PSD-to-puppet bridge.
- No `zip://` FileSystemProvider is added in the implementation path; any future archive browser is a non-runtime enhancement.

## Capabilities

### New Capabilities

- `zip-bundle-locator`: Defines archive-internal locator semantics, path validation, manifest-relative resolution, and safe metadata validation.
- `puppet-live2d-bundle-import`: Defines Live2D ZIP/model3.json import, `.nkp` bundle references, bundle index generation, and MOC3 external texture handling.
- `model-agent-scene-control`: Defines the `NekoModelAPI` and Agent tools for querying and editing 3D scene state.
- `unified-media-import-dispatch`: Defines host-owned import routing for workspace files, external files, and ZIP packages across puppet/model and future media domains.
- `character-asset-dimension-registry`: Defines puppet/model model, motion, config, audio, and text dimensions in AssetLibrary/Search metadata.
- `project-asset-dependency-manifest`: Defines Git-tracked external asset dependency declarations for import, market, and workspace asset sources.
- `puppet-model-asset-export`: Defines single-asset and character-pack export behavior for puppet/model assets.
- `voice-pack-lipsync-roadmap`: Captures design-only contracts for voice-pack and audio-to-face-parameter timelines.
- `psd-to-puppet-roadmap`: Captures design-only contracts for PSD layer tree to puppet rig conversion.

### Modified Capabilities

- `engine-puppet-control-and-renderer`: Add MOC3 external texture bundle data handling and clarify `set_texture` is not an upload API.
- `agent-capability-injection`: Add model scene tools as a domain capability provider with `safetyKind`, `targetRequirements`, `queryBeforeMutate`, and host availability constraints.
- `project-cache-search-service`: Add asset dimension and bundle-memory metadata projection through the asset-library partition without duplicate same-partition adapter registration.
- `market-install-target-contributions`: Add media kind-level install target contributions for puppet/model/voice asset kinds.
- `market-manifest-contract`: Add or clarify media kinds and bundle types for puppet/model character packs, motion packs, config packs, and voice packs.
- `engine-file-access`: Clarify that bundle locators are not engine file paths and must be resolved to bytes/file tokens before engine actions consume them.
- `asset-export-consistency`: Add puppet/model single-asset export and character-pack export expectations.

## Impact

- Affected packages include `packages/neko-types`, `packages/neko-puppet`, `packages/neko-model`, `packages/neko-assets`, `packages/neko-search`, `packages/neko-market`, `packages/neko-agent`, `packages/neko-client`, and `packages/neko-engine`.
- New shared TypeScript contracts are needed for bundle locators, import handlers, model API, asset dimensions, dependency manifest records, and export records.
- The parallel `targeted-agent-plugin-transfer-and-query-apis` change owns Canvas transfer/query routing and generic Agent tool planning metadata. This change should reference those contracts and avoid redefining Canvas target-aware apply/query behavior.
- `neko-puppet` must add Live2D ZIP parsing, `.nkp` schema extension, bundle index generation, texture data routing, and legacy INP entrypoint removal.
- `neko-model` must expose a stable API over existing scene/engine/webview control surfaces, including scene bounds/camera data where available, and register Agent tools with the shared safety/target metadata.
- `neko-assets` becomes the lifecycle source of truth for imported/market/workspace asset references.
- `neko-search` projects puppet/model asset dimensions from AssetLibrary rather than owning domain scanning.
- `neko-market` receives new domain install target registrations but remains decoupled from domain implementations.
- Tests must cover ZIP path safety, Live2D bundle fixtures, MOC3 texture routing, model Agent tools, import planning, AssetLibrary/Search projections, Market target validation, and dependency manifest recovery.
