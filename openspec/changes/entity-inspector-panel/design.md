## Context

The ADR `docs/architecture/adr-storyboard-entity-canvas-projection-boundary.md` defines a three-depth entity viewing model: Hover Card for transient preview, Entity Inspector for persistent detail, and Dashboard for full management. It also keeps entity writes behind Entity Facade commands and rejects per-Webview editing implementations.

Current Dashboard already has entity list/detail framework and source aggregation. Current Assets already owns the `neko-asset-manager` ViewContainer. The missing piece is a persistent entity detail surface that tools can open without importing each other's modules, plus a lightweight activity-bar browser for project entities.

## Goals / Non-Goals

**Goals:**

- Provide a persistent, global Entity Inspector WebviewView for full entity preview.
- Let tools open the Inspector through `neko.entity.inspectEntity(entityRef, context?)`.
- Reuse Dashboard detail projections/components where practical.
- Keep Inspector actions as facade command triggers, not direct Webview writes.
- Add an Entity TreeView browser under `neko-asset-manager` using command protocol only.
- Let AssetManager show bound entities for a selected asset through reverse lookup.

**Non-Goals:**

- Do not replace Dashboard full entity management.
- Do not add a new `neko-entity-manager` activity-bar container.
- Do not move Inspector ownership into `neko-assets`.
- Do not implement Canvas Hover Card, Quick Panel, or Quick Edit command internals here.
- Do not introduce overlay as a dependency; overlay remains a future optional container.

## Decisions

### Decision 1: Dashboard owns the Inspector WebviewView

`neko-dashboard` registers `neko.entityInspector` and owns the WebviewViewProvider because Dashboard already owns rich entity detail rendering and management context. The Inspector is a side panel projection of Dashboard detail, not a separate management product.

Alternatives considered: registering Inspector in `neko-assets` or creating a new activity-bar container. Assets should not own rich entity detail or entity write orchestration, and a new container adds navigation weight for a surface that complements existing Dashboard and Assets views.

### Decision 2: `inspectEntity` is the integration point

Tools open or refresh the Inspector by invoking a command with a validated entity ref and optional context. The command focuses the Inspector, loads detail data through facade/source commands, and subscribes to entity change events for refresh.

This keeps Canvas, Assets, Agent, Sketch, Model, and Story independent of Dashboard internals.

### Decision 3: Inspector is read-only preview plus action triggers

The Inspector displays identity, appearance summary, bindings, thumbnails, requirements, candidate state, provenance, and status. Buttons such as rename, edit appearance, edit aliases, bind asset, and open Dashboard call Entity Facade Quick Edit or Dashboard commands.

The Inspector does not embed entity-global forms or mutate project fact files from Webview state. Complex edits remain Dashboard workflows.

### Decision 4: Entity TreeView belongs in `neko-asset-manager`

`neko-assets` registers a `neko.entityBrowser` TreeView in its existing resource browser container. It groups entities by kind/status and calls `neko.entity.listEntities`, `neko.entity.getEntity`, and `neko.entity.inspectEntity` through VSCode commands.

This fills the left-side browsing gap while keeping rich detail in the Dashboard-owned Inspector.

### Decision 5: Auto-follow is opt-in

`entityInspector.autoFollow` is disabled by default. When enabled, context sources can publish entity focus changes and the Inspector updates with debounce. Explicit `inspectEntity` calls always work regardless of auto-follow.

## Risks / Trade-offs

- **Risk: Inspector duplicates Dashboard UI logic.** -> Reuse Dashboard detail projection DTOs/components and keep Inspector scoped to preview plus command triggers.
- **Risk: Assets becomes coupled to entity internals.** -> Limit `neko.entityBrowser` to command DTOs and add tests or lint checks for no direct imports.
- **Risk: auto-follow causes flicker.** -> Disable by default, debounce updates, and ignore hover-only focus unless the setting is enabled.
- **Risk: Inspector actions drift from Quick Edit behavior.** -> Route all entity-global actions through Entity Facade commands and test command invocation rather than local mutation.
- **Risk: stale details after candidate confirmation or binding changes.** -> Subscribe to entity change events and refresh only affected refs.

## Migration Plan

1. Register the Inspector view contribution and command with an empty/placeholder state.
2. Connect Inspector data loading to existing Dashboard/entity facade detail projections.
3. Add read-only rendering and action buttons that invoke existing or proposed facade commands.
4. Register the Entity TreeView under `neko-asset-manager` and wire selection/context menus to commands.
5. Add Canvas Hover Card/Quick Panel detail entry points after Canvas entity routes exist.
6. Add optional auto-follow wiring behind a disabled-by-default setting.
