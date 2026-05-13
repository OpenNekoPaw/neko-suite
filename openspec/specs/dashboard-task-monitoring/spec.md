# dashboard-task-monitoring Specification

## Purpose
TBD - created by archiving change add-neko-dashboard-control-panel. Update Purpose after archive.
## Requirements
### Requirement: Shared dashboard task contract
The system SHALL define dashboard task monitoring DTOs and structural interfaces in `@neko/shared` as Layer 0 zero-dependency contracts. The contract MUST include task identity, source identity, status, optional progress in the inclusive `0..100` range, action declarations, output refs, task events, `DashboardTaskSource`, and `DashboardDisposableLike`.

#### Scenario: Valid source accepted
- **WHEN** a source command returns an object with `contractVersion: 1`, a stable `source`, `getSnapshot`, `onDidChangeTask`, and valid task DTOs
- **THEN** the Dashboard accepts the source and subscribes to its task events

#### Scenario: Invalid progress rejected
- **WHEN** a task DTO contains `progress` below `0`, above `100`, or a non-number value
- **THEN** the Dashboard rejects or drops that task DTO instead of rendering invalid progress

#### Scenario: VSCode types do not leak into shared contract
- **WHEN** source extensions implement `DashboardTaskSource`
- **THEN** the shared interface uses `DashboardDisposableLike` and does not require importing `vscode` types from `@neko/shared`

### Requirement: Output refs avoid absolute paths
The system SHALL forbid absolute local file paths in dashboard task output refs. Local output refs MUST be workspace-relative paths or `${VAR}/path` placeholders and MUST be resolved by Extension Host code when revealed.

#### Scenario: Workspace-relative output ref
- **WHEN** a completed task includes a local workspace output
- **THEN** the task stores that output as a workspace-relative or variable-based ref

#### Scenario: Absolute local output rejected
- **WHEN** a source returns an absolute local file path in `outputs`
- **THEN** the Dashboard validation rejects or strips that output before it reaches webview state or persistence

### Requirement: Pull-first task source discovery
The Dashboard SHALL discover task sources by calling known programmatic `getDashboardTaskSource` commands on open and refresh. Missing commands, thrown errors, and invalid return values MUST degrade gracefully without breaking the Dashboard panel.

#### Scenario: Source extension missing
- **WHEN** `neko.cut.getDashboardTaskSource` is not registered
- **THEN** the Dashboard treats `neko-cut` tasks as unavailable or empty and continues loading other sources

#### Scenario: Source command throws
- **WHEN** a source command throws during discovery
- **THEN** the Dashboard logs the failure and continues with other valid sources

#### Scenario: Duplicate source registration
- **WHEN** a source is discovered again with the same `source` id
- **THEN** the Dashboard disposes the previous subscription and replaces it with the latest valid source

### Requirement: Source-owned adapters
Source extensions SHALL own their `DashboardTaskSource` adapters and expose them through programmatic commands. The `neko-dashboard` package MUST NOT directly import source extension packages to map source-specific tasks.

#### Scenario: Agent adapter wraps work items
- **WHEN** `neko-agent` exposes a dashboard task source
- **THEN** it maps `AgentWorkItem` state to `DashboardTask` rows inside the agent extension boundary

#### Scenario: Dashboard consumes only shared contract
- **WHEN** Dashboard subscribes to cut, canvas, agent, or engine task sources
- **THEN** Dashboard interacts through `@neko/shared` DTOs and VSCode commands rather than direct package imports

### Requirement: Event-driven task table updates
The Dashboard SHALL keep TaskTable state current through `DashboardTaskEvent` updates from valid sources. Task rows MUST be keyed by `${source}:${sourceTaskId}` and event handling MUST be idempotent.

#### Scenario: Task added
- **WHEN** a valid source emits an `added` event for a new `sourceTaskId`
- **THEN** TaskTable displays a row with dashboard `taskId` equal to `${source}:${sourceTaskId}`

#### Scenario: Task updated
- **WHEN** a valid source emits an `updated` event for an existing task
- **THEN** TaskTable updates the existing row without duplicating it

#### Scenario: Task removed
- **WHEN** a valid source emits a `removed` event for an existing task
- **THEN** TaskTable removes that row or marks it inactive according to Dashboard state rules

### Requirement: Task action delegation
The Dashboard SHALL delegate cancel and retry actions to the owning source through `DashboardTaskRef`. The Webview MUST send only dashboard task ids, and Extension Host code MUST resolve them to `{ source, sourceTaskId }` before invoking source actions.

#### Scenario: Cancel running task
- **WHEN** the user clicks Cancel on a task whose `actions` include `cancel`
- **THEN** the Extension Host resolves the dashboard id to `DashboardTaskRef` and calls the owning source `cancel`

#### Scenario: Retry failed task
- **WHEN** the user clicks Retry on a task whose `actions` include `retry`
- **THEN** the Extension Host resolves the dashboard id to `DashboardTaskRef` and calls the owning source `retry`

#### Scenario: Source action fails
- **WHEN** a source rejects a cancel or retry operation
- **THEN** the Dashboard surfaces the failure without corrupting TaskTable state

### Requirement: Completed task activity persistence
The Dashboard SHALL persist terminal task summaries to `.neko/dashboard-activity.json` and cap the index at 50 entries with FIFO eviction. The persisted index MUST survive missing or corrupt files without blocking Dashboard load.

#### Scenario: Completed task persisted
- **WHEN** a task reaches `done` or `error`
- **THEN** the Dashboard appends a lightweight summary with task id, title, source, status, outputs, and completed time

#### Scenario: Activity cap enforced
- **WHEN** the activity index grows beyond 50 entries
- **THEN** the Dashboard evicts the oldest entries until only 50 remain

#### Scenario: Corrupt activity file recovered
- **WHEN** `.neko/dashboard-activity.json` contains invalid JSON
- **THEN** the Dashboard ignores or recreates the index and continues loading
