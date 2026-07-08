## 1. Architecture Artifacts

- [x] 1.1 Save the desktop AppHost/resource/viewport ADR and link it from the architecture index.
- [x] 1.2 Create OpenSpec proposal, design, and capability specs for the desktop MVP.

## 2. Desktop Package Scaffold

- [x] 2.1 Add `packages/neko-desktop` package metadata, TypeScript configs, Vite config, and focused build/test scripts.
- [x] 2.2 Add Electron main and preload entry points with context isolation, sandboxed renderer expectations, and typed desktop bridge exposure.
- [x] 2.3 Add React renderer entry point and MVP workbench layout.

## 3. Desktop Contracts And Resource Workbench

- [x] 3.1 Define desktop bridge, workbench surface, resource node, thumbnail, and viewport summary contracts.
- [x] 3.2 Provide MVP resource fixture data for Explorer, Assets, Generations, Market, Skills, and Search surfaces.
- [x] 3.3 Render resource thumbnails, badges, metadata, and management surface separation in the MVP workbench.

## 4. Viewport Boundary

- [x] 4.1 Add an Engine-owned viewport placeholder panel that presents diagnostics instead of claiming WebContents output truth.
- [x] 4.2 Route renderer actions through typed bridge intents rather than direct media/Engine mutation.

## 5. Validation

- [x] 5.1 Add tests for resource fixtures, desktop snapshot contract, and renderer boundary rules.
- [x] 5.2 Add root desktop build/test scripts and run focused validation.
- [x] 5.3 Run OpenSpec validation/status and record residual risk for native viewport follow-up.

## 6. Cross-platform Runtime

- [x] 6.1 Add platform-neutral desktop build/start/smoke launchers that avoid shell-specific command chaining.
- [x] 6.2 Add package and root scripts for cross-platform desktop start and non-GUI smoke validation.
- [x] 6.3 Validate desktop typecheck, tests, build, smoke, and OpenSpec after the runtime launch update.

## 7. Workbench Integration

- [x] 7.1 Refine the renderer from a three-column app page into a docked editor workbench shell with activity bar, resource sidebar, viewport/editor region, and right Agent/inspector panel.
- [x] 7.2 Add Agent creative context projection to the workbench without importing Agent package internals into desktop renderer.
- [x] 7.3 Update tests and runtime smoke expectations for workbench zones, Agent panel, inspector, and viewport intent path.
- [x] 7.4 Re-run desktop typecheck, tests, build, smoke, CDP validation, and OpenSpec validation.
- [x] 7.5 Add localized desktop shell chrome through shared i18n while preserving source-owned resource and Agent projection labels.

## 8. Package-Owned Creative Adapter Alignment

- [x] 8.1 Add reusable editor workbench shell, activity bar, tabs, panel header, resource card, thumbnail strip, host adapter contract, and host adapter frame to `@neko/ui/workbench`.
- [x] 8.2 Move Canvas, Cut, Audio, Sketch, Model, and Preview creative host adapter surfaces into their owning packages as public `host-adapter` entries.
- [x] 8.3 Refactor `neko-desktop` to register owning package host adapters and remove local duplicate Canvas/Cut/Audio/Sketch/Model/Preview surface implementations.
- [x] 8.4 Update tests to assert shared workbench usage, package-owned host-adapter imports, and absence of duplicate desktop workbench/domain UI clones.
- [x] 8.5 Re-run desktop typecheck, desktop tests, desktop build, desktop smoke, and shared UI tests after package-owned adapter alignment.
- [x] 8.6 Propagate the desktop host locale into package-owned creative host adapters and keep adapter chrome localized by the owning package i18n bundles.

## Residual Risk

- Native Engine viewport embedding is not implemented in this MVP; the renderer only displays the contract placeholder and sends typed intents.
- Resource surfaces are contract fixtures; domain-backed source adapters for assets, market, skills, search, generated outputs, transparent cache, content access, config, path resolution, logging, errors, and live Engine/neko-client sessions remain follow-up work owned by their packages/shared services.
- Agent console state is fixture-backed projection data; live Agent runtime integration remains owned by the Agent packages.
- Creative host adapters are now package-owned public entries with host locale projection, but several still expose host-neutral projection surfaces rather than their complete VSCode Webview runtime because full runtime initialization still depends on VSCode messaging and package-specific Engine/session bootstrap.
- Plain `pnpm test:desktop` / `pnpm build:desktop` may still trigger repository-wide `verify-deps-before-run=install` and fail on existing pending build approvals unrelated to `neko-desktop`; focused validation was run with `pnpm_config_verify_deps_before_run=false` after approving Electron specifically.
