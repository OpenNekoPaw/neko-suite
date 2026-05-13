## Why

Neko Suite has many creative extensions and file formats, but no workspace-level home surface that answers what projects exist, what is running, and where the creator should resume work. A lightweight Dashboard is needed now to provide a table-centric control panel without coupling the suite to `neko-canvas` or any single editor.

## What Changes

- Add a new `neko-dashboard` VSCode extension package with a WebviewPanel-based dashboard.
- Provide a ProjectTable that scans workspace `.nk*` project files, displays sortable/filterable metadata, and navigates to the owning editor.
- Add Welcome Mode and Work Mode, with conservative startup behavior so the dashboard does not auto-open unless configured.
- Define a Layer 0 `DashboardTaskSource` contract in `@neko/shared` (`packages/neko-types`) for cross-extension task monitoring.
- Add a TaskTable and TaskAggregator that discover source-owned adapters through programmatic VSCode commands, validate returned sources, subscribe to task events, and delegate cancel/retry actions back to source extensions.
- Persist completed task activity to `.neko/dashboard-activity.json` with workspace-relative or variable-based output refs only.
- Add a compact runtime context surface for engine, agent, asset, provider, and future auth/cloud status using programmatic commands and explicit static/event-driven update rules.
- Add quality gates for project scanning, webview state, task contract validation, task event merging, persistence, and manual verification.

## Capabilities

### New Capabilities

- `dashboard-project-overview`: Defines workspace project discovery, table-centric project display, recent activity, Welcome/Work mode behavior, startup behavior, and navigation boundaries.
- `dashboard-task-monitoring`: Defines the shared task source contract, source discovery, task aggregation, TaskTable updates, cancel/retry delegation, output reveal, and completed task persistence.
- `dashboard-runtime-context`: Defines read-once runtime status summaries, quick actions, source status commands, and future account/cloud slots without making Dashboard own those domains.

### Modified Capabilities

None.

## Impact

- Adds `packages/neko-dashboard` with extension and webview subpackages.
- Adds shared dashboard task DTOs and validation helpers under `packages/neko-types/src/types/`.
- Adds programmatic command contracts for `neko.cut`, `neko.canvas`, `neko.agent`, `neko.engine`, `neko.assets`, and later `neko.auth`.
- Requires source extensions to own their `DashboardTaskSource` adapters instead of making Dashboard import source packages directly.
- Uses VSCode WebviewPanel and `postMessage` while preserving webview sandbox boundaries.
- Writes a small `.neko/dashboard-activity.json` activity index with no absolute local paths.
- Adds focused TypeScript tests for scanner behavior, reducer/table state, contract guards, task aggregation, action delegation, and activity persistence.
