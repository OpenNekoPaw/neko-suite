## ADDED Requirements

### Requirement: Desktop bridge carries Workbench Core snapshot

Desktop SHALL include a Workbench Core snapshot in `DesktopSnapshot`. The snapshot MUST include contribution descriptors, diagnostics, temporary bootstrap contribution ids, resource provider snapshots, and resource provider diagnostics needed by the renderer migration.

#### Scenario: Desktop snapshot is loaded

- **WHEN** renderer calls `getSnapshot`
- **THEN** the returned snapshot MUST include a `workbench` field
- **AND** the field MUST include Workbench Core contribution ids and temporary bootstrap provider ids

#### Scenario: Provider diagnostics exist

- **WHEN** workspace provider emits diagnostics such as truncation
- **THEN** Desktop MUST carry those diagnostics through the bridge snapshot

### Requirement: Renderer consumes Workbench Core projection visibly

The Desktop renderer SHALL consume the Workbench Core projection for status or diagnostic visibility while preserving existing UI behavior during migration.

#### Scenario: Temporary providers exist

- **WHEN** Workbench Core snapshot includes temporary bootstrap contribution ids
- **THEN** renderer status or diagnostic metadata MUST be able to display the count or state without reading desktop-local scanner internals
