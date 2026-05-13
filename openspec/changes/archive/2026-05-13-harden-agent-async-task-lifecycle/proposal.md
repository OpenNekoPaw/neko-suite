## Why

Agent media and background tasks can outlive the Chat Webview, but the current lifecycle does not fully protect running tasks during Extension Host shutdown, VSCode restart, Webview rebuild, or user stop. This creates user-visible result loss and real provider cost risk when an already submitted external task loses its recovery mapping and is submitted again.

## What Changes

- Add a durable agent async task lifecycle contract covering shutdown snapshot, runtime cancellation propagation, persisted provider recovery metadata, restart recovery, and task result replay.
- Introduce lifecycle metadata for agent-owned tasks, including conversation ownership, run mode, cost phase, interrupt policy, and recovery policy.
- Keep Agent session interruption separate from task lifecycle: foreground token-active work cancels with Stop, while external-wait and local-finalize work continues by default and remains visible/cancellable.
- Persist `ITaskRecoveryStorage` in the VSCode bootstrap path so submitted external provider tasks can resume polling the same provider task after restart.
- Add a shared task projection source for Chat task delivery and Dashboard task monitoring so Webview result replay and Dashboard snapshots do not drift.
- Add compose-only bridge services for task delivery and lifecycle coordination without moving domain policy into the Extension layer.
- Replace busy-wait completion waiting with event-driven waiters and add lifecycle regression coverage.

## Capabilities

### New Capabilities

- `agent-async-task-lifecycle`: Defines durable agent async task behavior across shutdown, restart, Webview rebuild, provider recovery, and session interruption.

### Modified Capabilities

- `agent-runtime-boundaries`: Clarify that lifecycle coordinators in the Extension layer are compose-only bridge services and must not own domain interruption policy.
- `dashboard-task-monitoring`: Require agent Chat delivery and Dashboard task monitoring to consume the same task projection source for consistent task state, actions, and outputs.

## Impact

- Affected packages: `packages/neko-agent/packages/agent`, `packages/neko-agent/packages/platform`, `packages/neko-agent/packages/extension`, and `packages/neko-types`.
- Affected modules: `task-manager.ts`, task storage/recovery storage, media task executor, Extension bootstrap/deactivate, Chat Webview provider wiring, dashboard work item source, and new task delivery/lifecycle coordinator services.
- Shared contract impact: adds or extends task lifecycle DTOs in the shared Layer 0 types; no VSCode or React types may leak into shared contracts.
- Public behavior impact: Webview close no longer loses terminal task results; VSCode restart can resume external provider polling when recovery metadata exists; user Stop does not cancel detached external-wait work by default.
- Test impact: adds unit tests for shutdown/abort/recovery/waiters and an end-to-end regression for submit → external-wait → restart → recovery → Webview replay → Dashboard visibility.
