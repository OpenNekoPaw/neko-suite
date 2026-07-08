## Context

`packages/neko-desktop/src/main/workspace-scan.ts` currently owns file classification, editor adapter mapping, thumbnails, SCM decoration, tree shape, and skip rules. `desktop-resource-surfaces.ts` also parses project-specific `.neko` resources. This was acceptable for MVP, but it conflicts with the new Workbench Core/Plugin Host direction: desktop should be an adapter over provider contracts, not the owner of resource semantics.

This change extracts the provider boundary first, without replacing every domain provider in one step. The immediate target is workspace explorer/file tree, because it is the most visible desktop resource surface and has reusable rules: file kind classification, media detection, portable refs, thumbnail projection, and `.neko/.cache` exclusion.

## Goals / Non-Goals

**Goals:**

- Add host-neutral resource provider DTOs and validation to `@neko/workbench-core`.
- Share workspace file kind classification and media detection with desktop.
- Wrap desktop's current scanner behind a provider-compatible adapter.
- Make temporary/bootstrap provider status explicit in test snapshots.
- Preserve desktop runtime behavior and existing UI shape.

**Non-Goals:**

- Do not rewrite Assets, Market, Skills, Search, Generations, or Entity providers in this slice.
- Do not remove desktop's current tree UI or resource surface UI.
- Do not add plugin execution or user plugin resource providers.
- Do not add Engine thumbnail generation; media thumbnails remain projection descriptors.

## Decisions

### Decision: Provider contracts live in Workbench Core

Resource provider contracts belong beside contribution descriptors because views, explorers, plugin resource sources, and workbench surfaces all need the same source/provider/snapshot vocabulary. The contract remains host-neutral and does not import Node, VSCode, Electron, React, or feature packages.

Alternative considered: place provider contracts in `@neko/host`. Rejected because host ports express filesystem/path/secrets/access primitives, not workbench/domain resource semantics.

### Decision: Desktop scanner becomes a bootstrap adapter

The current desktop scanner remains operational but is wrapped by a provider-compatible module that returns provider metadata and tree data. It is explicitly marked `bootstrap-temporary` so tests and later migration work can distinguish it from canonical domain providers.

Alternative considered: rewrite all resource surfaces in one change. Rejected because domain ownership differs across Assets, Market, Skills, Search, Generations, Entity, and workspace files; the provider contract must land before broad migration.

### Decision: Stable refs and runtime projections remain separate

Provider snapshots use portable stable refs for identity and separate runtime projection fields for thumbnails/previews. Cache paths, Webview URIs, blob URLs, Engine tokens, and absolute paths are rejected as stable identity.

## Five-Layer Analysis

Responsibility:

- Workbench Core owns provider DTOs, classification helpers, portable identity validation, and provider diagnostics.
- Desktop owns Node filesystem walking and Electron resource URL projection as host adapter behavior.
- Domain packages will later own Assets/Skills/Market/Search/Generations providers.

Dependency:

- Workbench Core remains host-neutral and feature-neutral.
- Desktop may import Workbench Core and Node APIs in main-side adapters.
- Renderer continues to consume the existing desktop snapshot until `align-desktop-to-workbench-core`.

Interface:

- Provider snapshots expose provider metadata, tree nodes, diagnostics, and temporary/bootstrap marker.
- Workspace tree nodes carry `stableRef` and optional runtime thumbnail/preview projection.
- File kind classification is shared by string helper functions.

Extension:

- Additional domain providers can implement the same `WorkbenchResourceSourceProvider` contract.
- Plugin providers can later reuse the same snapshot validation.

Testing:

- Unit tests cover classification, media kind detection, ref validation, and provider validation in Workbench Core.
- Desktop tests cover provider adapter output and temporary bootstrap marker.

Proportionality:

- This adds a small provider contract now because multiple hosts and upcoming plugin/domain providers need it; it does not add remote service/provider infrastructure.

Fail-visible behavior:

- Invalid provider ids, unsafe stable refs, `.neko/.cache` identities, Webview URI identities, Engine token identities, and missing tree refs fail with typed errors.

## Risks / Trade-offs

- [Risk] Desktop scanner remains a temporary provider longer than intended. -> Mitigation: provider snapshot exposes `bootstrap-temporary` and follow-up tasks migrate domain providers.
- [Risk] Classification in Workbench Core becomes too domain-heavy. -> Mitigation: only shared file kind/media detection lives here; domain-specific resource semantics stay with owning packages.
- [Risk] Existing desktop snapshot duplicates provider tree shape. -> Mitigation: keep compatibility in this slice; `align-desktop-to-workbench-core` will remove more duplication.

## Migration Plan

1. Add Workbench Core resource provider DTOs/helpers/tests.
2. Replace desktop-local file classification with shared helper mapping.
3. Add desktop workspace resource provider adapter around current scanner.
4. Add desktop tests proving bootstrap provider output.
5. Validate Workbench Core and Desktop typecheck/tests.
