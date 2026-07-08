## Why

Neko Suite needs a standalone desktop client because VSCode Webviews remain a constrained integration host for professional media output: CSP, Webview resource projection, browser codec behavior, 10-bit/HDR color, and GPU texture reuse should not define the product's authoritative preview path. The existing VSCode extension and TUI surfaces should remain supported, but the AIGC-native editor needs its own AppHost, resource workbench, and Engine-owned viewport boundary.

## What Changes

- Introduce an Electron-based `neko-desktop` MVP client package that provides a local desktop AppHost shell, typed preload bridge, and React workbench renderer.
- Refine the MVP renderer into a compatible professional workbench shell with activity bar, resource sidebar, editor/viewport area, and a right Agent/inspector panel rather than a standalone app-like page.
- Establish a native viewport boundary: professional video/media/scene output is owned by `neko-engine` viewport sessions, while Electron/Web UI panels only issue control commands and display projections.
- Introduce a thumbnail-capable Resource Explorer model with source abstractions for project files, assets, entities, generation outputs, market/packages, and skills.
- Keep Market, Packages, Skills, Assets, and Explorer as separate management surfaces that may share registry/thumbnail infrastructure without collapsing into one directory tree.
- Add cross-platform desktop launch and smoke-check scripts so the MVP can be built and started on macOS, Linux, and Windows without shell-specific command chaining.
- Support localized desktop workbench shell chrome through shared `@neko/shared` i18n primitives while leaving domain resource labels owned by their source adapters.
- Align desktop creative surfaces with owning package public host adapters so Canvas, Cut, Audio, Sketch, Model, and Preview packages remain the authoritative source for their UI rather than allowing desktop to develop parallel display implementations.
- Route desktop integration through shared UI, logging, error, i18n, Engine/client, content access, path, cache, and configuration contracts; desktop may compose these services but must not reimplement package-local variants.
- Preserve VSCode as an integration adapter and do not remove existing VSCode extension packages.
- Add an ADR documenting the desktop AppHost, Resource Explorer, and viewport boundary.

## Capabilities

### New Capabilities

- `desktop-client-host`: Electron AppHost, preload bridge, renderer shell, and host boundary for the standalone desktop client.
- `desktop-resource-workbench`: Resource Explorer source model, thumbnail projection, and separate management surfaces for assets, market/packages, and skills.
- `desktop-engine-viewport`: Engine-owned native viewport/session boundary for professional media and scene output controlled by Web UI commands.

### Modified Capabilities

- None.

## Impact

- New package: `packages/neko-desktop`.
- New ADR: `docs/architecture/adr-neko-desktop-apphost-resource-viewport-boundary.md`.
- New OpenSpec specs and tasks under `openspec/changes/introduce-neko-desktop-mvp-client/`.
- Root build, test, start, and smoke scripts may gain focused desktop commands.
- Renderer layout changes remain inside `packages/neko-desktop`; Agent capabilities are represented as host-neutral projection fixtures until the owning Agent package contributes a live provider.
- No project file format migration and no VSCode extension removal in this MVP.
