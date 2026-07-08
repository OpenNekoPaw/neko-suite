## Why

Neko Desktop is currently proving the standalone AppHost direction, but workbench layout, resource surfaces, file tree scanning, Agent panels, and editor adapter wiring are still too desktop-local. Neko also needs VSCode-like extension capabilities so users and packages can contribute UI surfaces without forking VSCode or creating host-specific UI implementations.

This change introduces a host-neutral Workbench Core and Plugin Host contract so VSCode, Desktop, and TUI can share contribution/runtime semantics while keeping professional rendering, Agent workflows, resources, and feature UI owned by their canonical packages.

## What Changes

- Introduce a Workbench contribution runtime contract for activity entries, view containers, editor contributions, resource sources, commands, menus, keybindings, Agent surfaces, and viewport descriptors.
- Introduce a Neko Plugin Host contract and manifest schema for user/package-contributed commands, views, custom editors, webviews, resource sources, Agent tools, skills, themes, icons, activation events, and permissions.
- Define the desktop client as an Electron host adapter over Workbench Core, not as the owner of workbench/resource/editor semantics.
- Define a VSCode compatibility strategy: Neko may map a safe subset of VSCode-like contribution concepts, but the desktop product does not fork Code OSS as its primary architecture.
- Move future file tree/resource surface ownership toward shared host/domain providers instead of desktop-specific scanners and `.neko` parsers.
- Keep feature package UI authoritative through public host adapters or root components; Desktop and VSCode supply host bridges/runtime projections.
- Keep TUI as a headless consumer of runtime/config/resource/Agent projections, not a graphical workbench renderer.
- **BREAKING**: New desktop workbench and plugin contribution paths will fail visibly when a contribution, provider, permission, or host adapter is unregistered instead of falling back to desktop-local mock or empty successful surfaces.

## Capabilities

### New Capabilities

- `workbench-contribution-runtime`: Defines host-neutral workbench contribution registration, activation, layout zones, editor/view/resource/Agent/viewport descriptors, and fail-visible contribution behavior.
- `neko-plugin-host-contract`: Defines the Neko plugin manifest, plugin activation lifecycle, permissions/trust model, extension API boundary, sandboxed UI contribution rules, and VSCode-subset compatibility policy.
- `desktop-workbench-host-adapter`: Defines how Electron Desktop consumes Workbench Core and Plugin Host contracts while keeping window/IPC/filesystem/protocol/Engine startup as host-only responsibilities.

### Modified Capabilities

- None.

## Impact

- Affected packages:
  - `packages/neko-desktop`: becomes a Workbench/AppHost adapter and stops accumulating canonical workbench/resource/plugin contracts.
  - `packages/neko-ui`: remains React/DOM UI primitives and workbench rendering components, consuming host-neutral models rather than owning runtime semantics.
  - New or expanded shared package: `packages/neko-workbench-core` or equivalent shared client runtime package.
  - `packages/neko-host`: continues to expose host primitive ports; it does not become a domain/plugin registry.
  - `packages/neko-agent`, `neko-assets`, `neko-market`, `neko-skills`, `neko-search`, and creative feature packages: contribute surfaces/providers through public registries rather than desktop internals.
- Affected APIs:
  - New manifest schema for Neko plugins.
  - New host-neutral Workbench contribution DTOs and registries.
  - New Plugin Host activation and permission contracts.
  - Desktop bridge may be narrowed to AppHost-specific effects after workbench/runtime state moves out.
- Affected validation:
  - Contract tests for workbench contribution registration and failure behavior.
  - Manifest schema tests and permission/trust tests for plugins.
  - Desktop tests proving canonical Workbench Core paths are used instead of desktop-local mock surfaces.
  - Boundary tests proving shared core packages do not import VSCode, Electron, Node-only APIs, React, or feature package internals.
