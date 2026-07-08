## Why

Desktop currently declares Agent right panel, main panel, and floating composer contributions inside the desktop bootstrap adapter. Agent surfaces should be package-owned so VSCode, Desktop, and future hosts consume the same Agent workbench contract instead of duplicating Agent UI placement per host.

## What Changes

- Add an Agent-owned public workbench surface contribution entry.
- Export contextual right panel, main Agent Studio, and floating composer descriptors from the Agent webview package.
- Register Agent descriptors in Desktop through the Agent package entry instead of desktop-owned hard-coded descriptors.
- Preserve current Desktop rendering while moving contribution ownership to Agent.

## Capabilities

### New Capabilities

- `agent-workbench-surface-contributions`: Defines Agent-owned Workbench Core surface descriptors for contextual assistance, Agent Studio, and floating composer.

### Modified Capabilities

- None.

## Impact

- Affected packages:
  - `packages/neko-agent/packages/webview`: exports package-owned Agent workbench surface descriptors.
  - `packages/neko-desktop`: consumes Agent descriptors instead of owning them.
- Validation:
  - Agent webview tests for descriptor ownership/placement.
  - Desktop tests proving Agent surface owner is Agent package, not desktop bootstrap.
