## Context

Neko Suite now has three client targets: VSCode extension, TUI, and Electron Desktop. The current architecture already keeps Rust `neko-engine` authoritative for media/rendering and keeps feature packages as owners of Agent, creative editors, assets, market, skills, search, and content semantics. However, the desktop MVP still carries workbench/resource/editor contracts and scans several resource surfaces directly inside `packages/neko-desktop`.

This creates the same failure mode the project is trying to avoid: VSCode Webview, TUI, and Desktop can drift into different UI, resource, Agent, config, theme, logging, and plugin-extension behavior. The missing layer is a host-neutral Workbench Core and Plugin Host contract that all graphical hosts can consume and that TUI can project headlessly.

Neko needs VSCode-like extensibility because users and packages must be able to contribute UI surfaces, custom editors, commands, resource sources, and Agent tools. At the same time, Neko cannot make VSCode Webview or Code OSS the professional output truth because CSP, Webview resource projection, codec behavior, color pipeline, HDR/10-bit, and texture reuse are exactly the desktop motivation.

## Goals / Non-Goals

**Goals:**

- Define a host-neutral Workbench Core contract for contribution registration and layout/runtime projection.
- Define a Neko Plugin Host contract and manifest schema for user/package-contributed UI and capabilities.
- Keep VSCode extension, Desktop, and TUI as host adapters over shared contracts.
- Keep `@neko/ui` as React/DOM rendering primitives, not a runtime registry or host owner.
- Keep `@neko/host` as primitive host ports, not a plugin/domain registry.
- Keep feature packages as authoritative owners of their UI root/host adapters and domain providers.
- Make unregistered contributions, missing permissions, unsupported host capabilities, and invalid manifests fail visibly.
- Provide a safe VSCode-subset compatibility direction without committing to full VSCode API compatibility or a Code OSS fork.

**Non-Goals:**

- Do not fork Code OSS or embed VSCode workbench internals as the desktop runtime base.
- Do not implement the full Plugin Host runtime, marketplace install flow, or full user plugin sandbox in the first slice.
- Do not make TUI render graphical Workbench UI.
- Do not move Agent, Assets, Market, Search, Skills, Canvas, Cut, Audio, Model, Sketch, Preview, or Engine implementations into Workbench Core.
- Do not treat Electron WebContents, HTML video, WebCodecs, or canvas as the authoritative professional viewport output.
- Do not promise that existing VSCode extensions run unchanged in Neko Desktop.

## Decisions

### Decision: Build Neko Workbench Core instead of forking VSCode

Neko will reference VSCode's architectural patterns: commands, contributions, view containers, custom editors, menus, keybindings, activation events, extension host isolation, theme tokens, TreeView-like models, and Webview/custom UI boundaries. Neko will not use a Code OSS fork as the primary desktop architecture.

Alternative considered: fork Code OSS and patch CSP/media/color/texture limitations. Rejected because the maintenance surface is large, Code OSS differs from the Microsoft VSCode product, extension marketplace/product boundaries are complex, and many media/color/texture constraints follow from Webview/workbench architecture rather than a small patch.

Alternative considered: fully self-invent an unrelated editor framework. Rejected because VSCode's contribution model, command routing, context keys, keybindings, panels, and extension host isolation are already well-proven and match many Neko needs.

### Decision: Split Workbench Core from React UI

Workbench Core will be host-neutral TypeScript contracts and pure services. It can define descriptors, registries, activation metadata, context keys, command/menu/keybinding models, editor/view/resource/Agent/viewport contributions, validation, and diagnostics. It must not import React, DOM, VSCode, Electron, Node-only APIs, or feature package internals.

`@neko/ui/workbench` remains the React rendering layer for workbench shells and primitives. It consumes Workbench Core snapshots/projections and host adapters. Feature packages continue to expose package-owned `host-adapter` or root entries for their domain UI.

Alternative considered: put runtime registries into `@neko/ui/workbench`. Rejected because TUI and Extension Host need non-React access to the same contribution model, and Layer 0 contracts cannot depend on DOM/React.

### Decision: Define a Neko Plugin Host contract before full plugin execution

The first implementation slice will define the plugin manifest schema and extension API boundary before executing arbitrary user plugins. The manifest covers commands, menus, keybindings, views, custom editors, webviews, resource sources, Agent tools, skills, themes, icons, activation events, permissions, and trust.

The Plugin Host will distinguish:

- core/package contributions loaded from installed Neko packages;
- trusted user plugins;
- community/untrusted plugins requiring explicit permissions and trust policy;
- VSCode-subset compatibility manifests that can be mapped safely.

Alternative considered: allow user plugins to directly mount React into the main desktop DOM. Rejected because it breaks host stability, theme isolation, permission boundaries, and makes plugin UI able to corrupt the editor shell.

### Decision: Desktop is an AppHost adapter over Workbench Core

Electron Desktop owns windows, menus, dialogs, IPC/preload, local protocol projection, host filesystem adapter, and Engine process discovery/startup. It consumes Workbench Core and Plugin Host snapshots to render the workbench, but it does not own canonical workbench descriptors, resource providers, custom editor registries, or Agent surface semantics.

Desktop-local scanning and `.neko` parsing may remain temporarily as bootstrap adapters, but new canonical provider contracts must live in shared/domain packages. Desktop tests must prove canonical Workbench Core paths are hit once the new contracts exist.

### Decision: Resource Explorer becomes provider-backed

The Resource Explorer and management surfaces will be composed from `ResourceSourceProvider` contributions. Workspace files, Assets, Generations, Market/Packages, Skills, Search, and Entity-backed projections remain separate providers with different ownership and permissions.

The provider contract returns stable refs, metadata, thumbnail descriptors, actions, diagnostics, and short-lived render projections. It must not expose `.neko/.cache` internals, raw absolute cache paths, Webview URIs, Engine tokens, or plugin-private storage as durable identity.

### Decision: Plugin UI runs in controlled surfaces

Plugin-provided UI must be rendered only in approved surfaces: contributed views, custom editors, webview panels, side panels, Agent cards, or resource/action UI slots. Plugin UI receives host bridge capabilities through explicit permissions and runtime projection. It cannot import Electron, VSCode, Node, or mutate the main Workbench DOM directly.

Desktop may use isolated iframe/webview/sandboxed renderer roots. VSCode continues to use VSCode Webview sandboxing. TUI receives text/headless projections only.

### Decision: Fail-visible by default

Invalid manifest versions, unknown contribution kinds, duplicate ids, missing activation handlers, missing permissions, unsupported host capabilities, unregistered custom editors, unknown resource provider ids, unknown Agent tool ids, and unsafe UI requests must return typed diagnostics or throw in tests. They must not produce successful empty surfaces or silently fall back to desktop-local mock data.

## Five-Layer Analysis

Responsibility:

- Workbench Core owns contribution contracts, registries, context/keybinding/command descriptors, and host-neutral diagnostics.
- Plugin Host owns manifest validation, activation lifecycle, trust/permission negotiation, sandbox boundary, and extension API projection.
- Desktop owns Electron AppHost effects only.
- VSCode extensions own VSCode API integration, Webview projection, and Extension Host lifecycles.
- TUI owns terminal/headless projection of shared runtime state.
- Feature packages own domain UI roots, domain providers, commands, and Agent/Engine/content semantics.

Dependency:

- Workbench Core must stay Layer 0 or host-neutral Layer 0.5: no React, DOM, VSCode, Electron, Node-only APIs, or feature package internals.
- Plugin Host contract may depend on shared types and market/trust DTOs through public entries only; concrete execution adapters live in host packages.
- Desktop renderer may import React UI and package public host-adapter entries, but not Node/Electron main internals.
- Extension Host may import VSCode and shared contracts, but not React/Webview implementation.
- Feature packages integrate through public contribution providers, not by importing desktop internals.

Interface:

- Manifest schema is versioned and fail-closed for unknown versions.
- Contributions use stable ids, package/plugin provenance, required host capabilities, optional activation events, and typed permission declarations.
- Resource providers return stable refs and runtime projections separately.
- Editor contributions declare document selectors and render/runtime ownership separately.
- Plugin API surfaces are capability-scoped and injected; no global mutable API object with hidden privileges.

Extension:

- New domains add providers or UI by registering contributions instead of editing desktop switch statements.
- VSCode and Desktop can map the same contribution model into different host surfaces.
- TUI can list commands, resources, Agent tools, diagnostics, and validation summaries without rendering graphical UI.
- Future Tauri/native hosts implement the same host adapter contracts without changing plugin/domain packages.

Testing:

- Contract tests cover manifest parsing, duplicate ids, unsupported versions, required permissions, and fail-visible diagnostics.
- Boundary tests cover no forbidden imports in Workbench Core and Plugin Host contract layers.
- Desktop tests cover using Workbench Core snapshots and provider registries instead of desktop-only mock surfaces.
- Feature adapter tests cover package-owned host-adapter registration and locale/theme projection.
- Runtime Webview validation remains VSCode Extension Development Host plus `vscode-extension-debugger` when VSCode Webview behavior is touched.

Proportionality:

- A registry and manifest schema are justified because multiple graphical hosts and multiple feature packages need the same contribution semantics now.
- Full VSCode API compatibility is not justified now because Neko's primary needs are AIGC/resource/Agent/editor contributions and professional Engine viewport boundaries.
- Full untrusted plugin execution is not required for the first slice; schema, trust, permission, and host-neutral APIs must exist before safe execution.

Fail-visible behavior:

- Unknown schema versions, missing handlers, unsupported host capability, invalid contribution ids, duplicate contribution ids, unsafe resource refs, and unregistered providers fail directly with diagnostics.
- Plugin UI cannot silently degrade to the main DOM or raw local file access.
- Desktop bootstrap adapters must be tracked as temporary and must not mask canonical provider failures once replacements exist.

## Risks / Trade-offs

- [Risk] Workbench Core becomes a second VSCode clone. -> Mitigation: keep the scope to Neko contribution semantics and reject full VSCode API compatibility unless explicitly mapped.
- [Risk] Plugin Host contract becomes over-abstract before user plugin execution exists. -> Mitigation: first slice defines only manifest, descriptors, validation, and host adapter boundaries needed by current packages/Desktop.
- [Risk] Desktop keeps temporary scanners and resource parsers too long. -> Mitigation: add tasks and tests that move canonical providers to shared/domain owners and poison desktop-local mock paths.
- [Risk] Plugin UI sandbox limits may feel restrictive. -> Mitigation: offer rich approved surfaces and explicit permissions rather than direct DOM/Electron access.
- [Risk] Existing package host adapters are projection-only and not full VSCode Webview runtime roots. -> Mitigation: keep adapter runtime mode explicit and migrate package by package.

## Migration Plan

1. Add the OpenSpec specs and an ADR documenting the Workbench/Plugin Host route and rejected VSCode fork route.
2. Add a host-neutral Workbench Core package or shared entry with contribution contracts, descriptors, validators, and tests.
3. Add a Plugin Host contract package/entry with manifest schema, trust/permission DTOs, activation descriptors, and tests.
4. Add desktop adapter wiring that consumes a Workbench Core bootstrap snapshot while leaving current desktop scanners behind a temporary provider adapter.
5. Move workspace file tree and resource surfaces toward provider-backed shared/domain sources.
6. Add Agent surface contributions for right panel, main panel, and floating composer descriptors without moving Agent implementation into desktop.
7. Validate with focused typecheck/tests and record residual runtime risk before replacing more desktop-local UI paths.

Rollback: remove the new shared package/entries and restore desktop's current local snapshot composition. Since this is prelaunch and mostly additive contracts, no durable project data migration is expected in the first slice.

## Open Questions

- Should Workbench Core be a new `packages/neko-workbench-core` package or a public subpath of an existing shared package?
- Should Plugin Host contract live in the same package as Workbench Core or in a separate package owned with Market/Skills trust surfaces?
- Which VSCode manifest contribution points should be mapped in the first compatibility subset beyond commands, menus, keybindings, views, and custom editors?
- Which sandbox primitive should Desktop use first for third-party UI: Chromium iframe, Electron `<webview>`, isolated BrowserView/WebContentsView, or package-built React root with strict API injection?
