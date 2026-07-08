## Context

The previous changes introduced `@neko/workbench-core`, a desktop workbench bootstrap adapter, and a workspace resource provider adapter. The renderer still primarily consumes desktop-local arrays (`surfaces`, `resourceSurfaces`, `workspaceTree`). This change threads the Workbench Core snapshot through the bridge as the canonical migration path without removing compatibility fields.

## Goals / Non-Goals

**Goals:**

- Add Workbench Core contribution snapshot and resource provider snapshots to `DesktopSnapshot`.
- Assemble the snapshot in Electron main through the new adapters.
- Show diagnostics/temporary provider state in renderer status metadata.
- Keep current UI layout and behavior stable.

**Non-Goals:**

- Do not replace the entire renderer with contribution-driven rendering in one step.
- Do not remove legacy desktop fields yet.
- Do not implement plugin UI execution.

## Decisions

### Decision: Add Workbench Core projection alongside existing fields

Desktop will add a `workbench` field to its bridge snapshot. Existing fields remain until renderer zones are migrated contribution by contribution.

Alternative considered: replace all renderer inputs immediately. Rejected because resource surfaces and editor selection still depend on current desktop-specific DTOs.

### Decision: Diagnostics are visible but non-blocking

Provider diagnostics and temporary provider ids are exposed in snapshot and status text. Invalid provider snapshots still fail visibly during main assembly; warnings such as truncation remain visible.

## Risks / Trade-offs

- [Risk] Two models exist temporarily. -> Mitigation: Workbench snapshot is canonical migration path and tests assert it is present.
- [Risk] Renderer only lightly consumes the new snapshot. -> Mitigation: follow-up tasks migrate activity/view/editor rendering to contributions.

## Migration Plan

1. Extend desktop bridge contract with Workbench snapshot DTO.
2. Assemble Workbench snapshot in main from workspace provider and bootstrap adapter.
3. Render status/diagnostics from Workbench snapshot.
4. Add tests and run focused validation.
