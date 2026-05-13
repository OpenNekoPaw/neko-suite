## Context

Neko Suite is a VSCode-based creative workspace with separate editors and file formats for video, canvas, sketch, audio, model, puppet, agent, assets, preview, and related workflows. Users currently have to remember paths and manually open `.nk*` files to resume work or check async export/generation progress.

The Dashboard is a new workspace-level control panel, not another editor. It must respect VSCode webview constraints, keep Webview code isolated from Node and VSCode APIs, and use `@neko/shared` (`packages/neko-types`) for cross-package contracts. The key architecture constraint is that Dashboard may aggregate state across extensions, but it must not own domain data or directly depend on source extension packages.

## Goals / Non-Goals

**Goals:**

- Add a lightweight `neko-dashboard` package with Extension Host and React Webview subpackages.
- Provide a table-first project overview for `.nk*` files with recent activity and safe navigation.
- Define a stable shared task monitoring contract in `@neko/shared` before building cross-extension adapters.
- Aggregate active tasks through source-owned `DashboardTaskSource` adapters exposed by programmatic VSCode commands.
- Persist a small completed-task activity index without absolute local paths.
- Provide read-once runtime context summaries and quick actions without polling stable environment state.
- Preserve webview sandboxing, dependency direction, and source-extension ownership boundaries.

**Non-Goals:**

- Dashboard will not reuse `neko-canvas` node, connection, drag, layout, or history infrastructure.
- Dashboard will not edit creative project contents or execute exports/generation itself.
- Dashboard will not display AI conversation history, timeline internals, asset metadata details, git history, or configuration forms.
- P0 will not include a card gallery, marketplace recommendations, account/cloud quota, or full SCM-aware history.
- Running tasks do not survive VSCode restart; only terminal task summaries are persisted by Dashboard.

## Decisions

### Decision 1: Build a dedicated WebviewPanel package

`packages/neko-dashboard` will contain `packages/extension` and `packages/webview` subpackages. The Extension Host owns scanning, command execution, task aggregation, file-system access, and path resolution. The Webview owns table rendering and local UI state through `useState`/`useReducer`.

Alternatives considered:

- Extend `neko-canvas`: rejected because canvas is a semantic orchestration editor with file-bound custom editor behavior and unrelated node/connection infrastructure.
- Activity Bar WebviewView as primary surface: rejected because the available width is too narrow for the required tables. A later Explorer TreeView companion can be added separately.
- Bottom Panel tab: rejected because Dashboard is an overview surface, while the panel is already used for terminal/output/chat style workflows.

### Decision 2: Keep Dashboard read-mostly and command-boundary based

Dashboard will not import source packages such as `neko-cut`, `neko-agent`, `neko-canvas`, or `neko-engine`. It will call programmatic VSCode commands and handle missing commands gracefully.

Source extensions own their adapters:

- `neko.cut.getDashboardTaskSource`
- `neko.canvas.getDashboardTaskSource`
- `neko.agent.getDashboardTaskSource`
- `neko.engine.getDashboardTaskSource`

Dashboard owns only aggregation, validation, and presentation.

### Decision 3: Define the shared task contract first

`@neko/shared/types/dashboard-task.ts` will define Layer 0 DTOs and structural interfaces:

- `DashboardTaskStatus`
- `DashboardTaskAction`
- `DashboardTaskOutputRef`
- `DashboardTaskRef`
- `DashboardTask`
- `DashboardTaskEvent`
- `DashboardTaskSource`
- `DashboardDisposableLike`

The contract will include `contractVersion: 1`, source-local identity, dashboard aggregation identity, optional progress in the `0..100` range, action lists, and output refs that forbid absolute local paths. Dashboard will treat command returns as `unknown` and accept only structurally valid sources.

### Decision 4: Use pull-first source discovery

TaskAggregator will iterate a known MVP source command list when the Dashboard opens or refreshes. Push registration through `neko.dashboard.registerTaskSource` can update an already-open panel but is not the source of truth.

This avoids activation-order bugs where a source extension activates before Dashboard. Long-term, the known source list can evolve into a contribution-point or manifest-based discovery mechanism without changing the task contract.

### Decision 5: Separate static context from dynamic task progress

Runtime context such as engine readiness, agent session count, asset count, provider readiness, and future auth state is read once on Dashboard open and refreshed manually. Active task progress is event-driven and pushed from source adapters.

This avoids over-polling stable environment state while preventing TaskTable from becoming a stale snapshot.

### Decision 6: Persist terminal task summaries only

Dashboard will store completed task summaries in `.neko/dashboard-activity.json`, capped at 50 entries with FIFO eviction. The file contains lightweight fields such as task id, title, source, status, outputs, and completed time. Local outputs must be workspace-relative or `${VAR}/path` refs and resolved by Extension Host code through the existing path system when revealed.

Running tasks remain in memory because their source tasks generally do not survive restart either.

## Risks / Trade-offs

- Cross-extension command contracts drift → Mitigation: define the DTOs and validation helpers in `@neko/shared`; add contract tests before adapters.
- Source command missing or broken → Mitigation: treat missing/invalid sources as empty unavailable sources, log through shared logger, and keep Dashboard usable.
- Dashboard accidentally becomes a domain owner → Mitigation: enforce command-boundary dependencies and keep creative editing, task execution, settings, and detailed logs in source extensions.
- Workspace scanning can be expensive → Mitigation: use VSCode workspace file APIs with exclude patterns for `node_modules`, `.git`, and `.neko/.cache`; update via file watcher after initial scan.
- Webview message payloads can be unsafe → Mitigation: validate all webview-originating paths and task ids in Extension Host before executing commands.
- Completed activity file can become corrupt → Mitigation: recover by ignoring corrupt content, recreating the file, and never blocking the Dashboard panel.
- Auto-show can annoy users → Mitigation: keep `neko.dashboard.showOnStartup` default `false` and require workspace evidence before opening automatically.

## Migration Plan

1. Add shared task DTOs and validation helpers in `packages/neko-types`.
2. Scaffold `packages/neko-dashboard` and wire the `neko.dashboard.show` command.
3. Implement P0 project scanning, recent activity, Welcome/Work mode, and navigation.
4. Implement TaskTable state and TaskAggregator with fake-source tests.
5. Add the first source adapter in `neko-cut`, then validate the contract with `neko-agent` and `neko-canvas`.
6. Add completed task persistence and output reveal resolution.
7. Add ContextStrip, QuickActions, and programmatic status/summary command consumption.

Rollback is simple for P0/P1: disable the contributed `neko.dashboard.show` command and remove the dashboard package from suite activation. Source adapters are optional command providers and can remain harmless if Dashboard is disabled.

## Open Questions

- Should long-term source discovery be a VSCode contribution point, a shared registry command, or package manifest metadata?
- Which editor command should be canonical for each project type when multiple extensions can open the same file?
- Should completed task activity include remote URL outputs, generated asset ids, or only local workspace refs in P1?
- Should the Explorer TreeView companion live in `neko-dashboard` or in the suite shell package?
