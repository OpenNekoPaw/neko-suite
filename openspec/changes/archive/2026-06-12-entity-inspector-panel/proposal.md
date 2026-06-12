## Why

Hover Card gives lightweight entity context, but it is transient and cannot serve as a persistent reference while users work in Canvas, Agent, Sketch, Model, or Story. Dashboard already owns full entity management, but opening it for every lookup forces a heavy tab switch; a persistent Inspector and lightweight entity browser close that gap without creating another entity management Webview.

## What Changes

- Add a Dashboard-owned `neko.entityInspector` WebviewView that shows persistent, read-only entity detail with action buttons.
- Register `neko.entity.inspectEntity` so Canvas Hover Card, Quick Panel, Entity TreeView, AssetManager, command palette, and other tools can focus the Inspector for an entity ref.
- Reuse Entity Facade Quick Edit commands for Inspector actions; the Inspector MUST NOT implement independent entity writes or embedded entity-global edit forms.
- Add an optional `entityInspector.autoFollow` mode that can follow current creative context, disabled by default.
- Add a lightweight `neko.entityBrowser` TreeView in the existing `neko-asset-manager` ViewContainer; it lists project entities through command protocol and opens the Inspector on selection.
- Add asset-to-entity reverse lookup actions from AssetManager to the Inspector without adding direct cross-extension imports.

## Capabilities

### New Capabilities

- `entity-inspector-panel`: Defines the persistent Entity Inspector WebviewView, `inspectEntity` command, read-only action model, optional auto-follow behavior, Entity TreeView browser, and AssetManager reverse lookup integration.

### Modified Capabilities

None.

## Impact

- `packages/neko-dashboard`: registers the Inspector WebviewViewProvider, focuses/refreshes entity detail, and reuses Dashboard detail projections/components.
- `packages/neko-assets`: registers the Entity TreeView inside `neko-asset-manager` and asset reverse lookup menu actions through VSCode commands.
- `packages/neko-entity`: provides `listEntities`, `getEntity`, reverse lookup, and change-event facade commands consumed by Inspector and TreeView.
- `packages/neko-canvas`: Hover Card and Quick Panel add a detail action that invokes `neko.entity.inspectEntity`.
- `packages/neko-types`: may add serializable Inspector/TreeView DTOs and guards if existing Dashboard DTOs are not sufficient.
- Tests cover command routing, no cross-extension import coupling, read-only Inspector behavior, auto-follow debounce, TreeView grouping, and asset reverse lookup.
