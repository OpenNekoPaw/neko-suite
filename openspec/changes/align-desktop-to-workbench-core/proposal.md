## Why

Desktop now has a Workbench Core bootstrap adapter and a workspace resource provider adapter, but the bridge snapshot still exposes desktop-local surfaces as the primary runtime model. Desktop should carry a Workbench Core projection through the AppHost bridge so renderer logic can gradually consume canonical contribution/provider state.

## What Changes

- Add a Workbench Core snapshot projection to `DesktopSnapshot`.
- Build the Workbench Core snapshot in Electron main from workspace/resource provider and current desktop surfaces.
- Include resource provider diagnostics and temporary bootstrap provider ids in the desktop bridge snapshot.
- Let renderer consume the Workbench Core snapshot for status/diagnostic visibility while preserving existing UI behavior.
- Keep current `surfaces`, `resourceSurfaces`, and `workspaceTree` fields for compatibility during the migration.

## Capabilities

### New Capabilities

- `desktop-workbench-core-snapshot`: Defines Desktop bridge behavior for carrying Workbench Core contribution/provider snapshots, temporary provider markers, and diagnostics.

### Modified Capabilities

- None.

## Impact

- Affected packages:
  - `packages/neko-desktop`: shared bridge contract, main snapshot assembly, renderer status/diagnostic projection, tests.
  - `packages/neko-workbench-core`: consumed as the canonical workbench contribution/provider model.
- Validation:
  - Desktop contract tests and renderer layout tests.
  - Desktop typecheck/tests and OpenSpec validation.
