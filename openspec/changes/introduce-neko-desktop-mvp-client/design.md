## Context

Neko Suite currently has VSCode Extension/Webview clients, an Agent TUI, shared host ports in `@neko/host`, and a Rust Engine that owns media, rendering, codecs, scene runtime, and high-cost computation. VSCode remains useful as an integrated development host, but its Webview CSP, resource projection, codec behavior, 10-bit/HDR limits, and texture lifecycle are not appropriate as the authoritative path for a professional AIGC editor.

The desktop client is introduced as a local product surface, not as a cloud IDE, daemon, or distributed service. The MVP should prove the architecture boundary: Electron hosts the workbench UI and local AppHost; `neko-engine` owns professional viewport output; domain packages own resource semantics.

## Goals / Non-Goals

**Goals:**

- Add an Electron-based `packages/neko-desktop` MVP package with main, preload, and renderer entry points.
- Provide cross-platform build, start, and non-GUI smoke-check commands for macOS, Linux, and Windows.
- Refine the renderer into a docked professional editor workbench that is structurally compatible with VSCode, Unity, and Unreal editor expectations: activity bar, primary sidebar, central editor/viewport tabs, and a right secondary side bar for Agent/inspector workflows.
- Surface Agent creative context in the workbench without importing Agent internals into desktop renderer.
- Localize desktop shell chrome through the shared i18n service while keeping resource and Agent projection labels owned by their source packages.
- Keep renderer code sandboxed behind a typed bridge; renderer code must not import Node, Electron main internals, VSCode, or Engine process handles.
- Define a Resource Explorer model that supports thumbnails, preview descriptors, badges, actions, and multiple source kinds.
- Keep Explorer, Assets, Market/Packages, Skills, Search, and Generations as separate workbench surfaces over shared resource primitives.
- Document the native viewport boundary: professional video, scene, 10-bit/HDR color, frame clock, and texture reuse belong to Engine-owned viewport sessions.
- Preserve VSCode extension and TUI surfaces as adapters over shared contracts.

**Non-Goals:**

- Do not replace or remove VSCode extensions.
- Do not implement full native viewport embedding in the MVP; expose the contract and placeholder surface only.
- Do not build a general remote app-server or public SDK.
- Do not turn `@neko/host` into a domain resource registry.
- Do not expose `.neko` cache/storage internals as project resources.
- Do not move Market, Skills, Assets, Entity, Search, or Engine implementations into `neko-desktop`.

## Decisions

### Decision: Electron is the MVP desktop shell

Use Electron for the MVP because the immediate need is a fast desktop workbench shell, Chromium-consistent React UI, preload isolation, and straightforward local process orchestration. Electron is an AppHost and UI shell only; it is not the professional media output authority.

Alternative considered: Tauri. Tauri aligns well with Rust and has strong permission primitives, but its platform WebView variability raises more MVP friction for a UI-heavy workbench. The design keeps the host contract portable so a later Tauri adapter can be added without changing domain runtimes.

Alternative considered: Continue relying on VSCode. Rejected because CSP, Webview resource projection, codec/color uncertainty, and texture reuse limits remain exactly the boundaries the desktop client is meant to escape.

### Decision: Engine-owned viewport is the output truth

Professional video/media/scene rendering SHALL be represented as Engine viewport sessions. The renderer may show a placeholder in MVP, issue commands, and display diagnostics, but it must not treat WebContents, HTML video, canvas, or WebCodecs output as the authoritative 10-bit/HDR/color path.

Alternative considered: Use Webview/WebContents canvas as the first real viewport. Rejected because it would establish the wrong acceptance path and make later native viewport work look like an optimization rather than the core boundary.

### Decision: Resource Explorer is a source registry, not a file tree

Desktop resources are modeled as source-owned nodes with `id`, `source`, `kind`, `ref`, thumbnail descriptor, preview descriptor, metadata, badges, and actions. The MVP ships sample/static sources to prove the contract; domain-backed sources will be added incrementally by their owning packages.

Alternative considered: Directly render the OS project directory tree. Rejected because Neko resources include assets, entities, generated outputs, skills, packages, market entries, scene/timeline refs, and Engine media descriptors that cannot be represented by paths alone.

### Decision: Market, Packages, Skills, and Assets have separate management surfaces

Explorer is the current project resource entry point. Assets, Market/Packages, Skills, Search, and Generations are separate workbench surfaces that may share resource node primitives, thumbnails, and actions. This avoids turning the left Explorer into an overloaded catch-all.

Alternative considered: Put all resource categories into a single Explorer hierarchy. Rejected because install/update/trust/enable flows for Market/Skills/Packages have different lifecycle, permissions, and diagnostics from project resource browsing.

### Decision: Desktop uses shared host and domain contracts first

The desktop package implements only the composition root and MVP UI contracts. Host primitives flow through `@neko/host`. Domain data and resource semantics remain in `neko-assets`, `neko-entity`, `neko-search`, `neko-market`, `neko-skills`, Agent runtime, and Engine client packages.

Alternative considered: Create a large desktop platform layer that wraps every domain immediately. Rejected as over-abstracted for MVP; each domain source should be promoted through explicit owner-backed adapters when needed.

### Decision: Owning packages are the UI authority across clients

Canvas, Cut, Audio, Sketch, Model, and Preview SHALL expose host-neutral adapter entries from their owning packages. Desktop consumes those public entries and passes host projections into them; it must not maintain a second Canvas/Cut/Audio/Sketch/Model/Preview display implementation under `packages/neko-desktop`.

The shared `@neko/ui/workbench` layer owns host-neutral workbench shells, adapter frames, activity bars, editor tabs, thumbnail strips, and intent contracts. Feature packages own their domain-specific tool rails, main surfaces, preview projections, diagnostics, and later their full runtime adapters. VSCode and Electron are host adapters over the same package-owned UI boundary.

Desktop passes the host locale as part of the host-adapter projection. Each owning package applies that locale to its own shared i18n service before resolving adapter chrome, so multi-client UI language stays aligned without making desktop translate domain-owned labels.

Alternative considered: Keep lightweight desktop-only projection components while reusing `@neko/ui` primitives. Rejected because it still creates per-platform display drift and weakens the owning package as the source of truth.

### Decision: Renderer follows a docked editor workbench layout

The desktop renderer uses a familiar editor shell: activity bar, resource sidebar, editor tab strip, central Engine viewport, and a right secondary side bar that can host Agent and inspector workflows. This keeps future VSCode adapter, Unity-like scene/inspector workflows, and Unreal-like content/console workflows compatible at the layout level without treating Agent as a detached bottom console.

Alternative considered: Keep the first MVP three-column dashboard. Rejected because it made the desktop feel like a separate app rather than an AIGC-native editor host and left Agent context detached from resource and viewport workflows.

## Five-Layer Analysis

Responsibility:

- `neko-desktop` owns Electron process lifecycle, preload bridge, renderer workbench shell, and desktop composition.
- `@neko/host` owns host primitive contracts only.
- `neko-engine` owns viewport output, texture lifecycle, frame timing, color pipeline, codec decode/encode, and export truth.
- Domain packages own resource sources, management actions, and project facts.
- Agent runtime owns live planning, tool execution, memory, and provider state; Desktop only shows projected Agent console items in MVP.

Dependency:

- Renderer depends on shared desktop bridge types and React UI only; it must not import Electron main, Node APIs, VSCode, or Engine internals.
- Main/preload may import Electron and Node, but must not import React.
- Domain resource sources are consumed through public contracts, not feature package internals.
- Creative editor surfaces are consumed through owning package `host-adapter` public entries; desktop renderer registers those entries but does not define domain UI.
- Engine interactions go through existing Engine client/host services or future viewport session contracts.
- Agent projection stays host-neutral and fixture-backed until an owning Agent adapter contributes live state.

Interface:

- Desktop bridge messages are typed, narrow, and fail-visible for unknown channels.
- Resource nodes carry stable refs and short-lived thumbnail/preview descriptors, not raw cache paths, Webview URIs, Engine tokens, or absolute temp paths.
- Viewport sessions expose intent and diagnostics in MVP; native surface handles stay out of renderer durable state.
- Agent console entries are projection DTOs, not persisted Agent runtime state.
- Desktop shell strings are localized through `@neko/shared` i18n bundles; domain resource names, Agent names, and diagnostics stay source-owned projection data until live adapters provide localized fields.
- Creative host adapters receive the host locale and localize their own package-owned chrome through their package i18n bundles.

Extension:

- Additional resource sources can register with the Resource Explorer contract without changing the shell.
- A Tauri host can implement equivalent host/bridge contracts later.
- Native viewport embedding can replace the MVP placeholder without changing control panels or resource sources.
- Agent provider integration can replace the MVP projection data without changing workbench zones.

Testing:

- Package unit tests cover Resource Explorer fixtures and bridge contract guards.
- Architecture tests assert renderer boundary rules.
- Source tests assert desktop uses shared workbench primitives and owning package host adapters instead of local duplicate workbench/domain UI implementations.
- Focused build verifies main/preload/renderer compilation.
- Cross-platform smoke checks verify the Electron entry, preload bundle, renderer HTML, package metadata, and Electron binary availability without launching a GUI window.
- Renderer tests and CDP smoke verify the workbench zones, right-side Agent panel, inspector tab, and viewport intent path.
- Native viewport, Engine smoke, and visual/performance validation remain follow-up tasks because MVP only defines the contract and placeholder surface.

## Risks / Trade-offs

- [Risk] Electron can tempt renderer code to use Node directly. -> Mitigation: enable context isolation/sandbox and add tests rejecting Electron/Node imports from renderer.
- [Risk] MVP viewport placeholder may be mistaken for production preview support. -> Mitigation: label viewport as contract placeholder and document Engine-owned viewport as the only professional output path.
- [Risk] Resource Explorer sample data may drift from domain semantics. -> Mitigation: keep MVP fixtures small and type-driven; domain-backed sources must come from owning packages in later tasks.
- [Risk] Desktop package may become a domain aggregator. -> Mitigation: ADR and tests state it is a composition root; domain implementations stay with owners.
- [Risk] `pnpm` or shell-specific scripts may work on one OS but fail on another. -> Mitigation: use Node launchers for build/start/smoke orchestration and avoid POSIX-only environment assignments or command separators in package scripts.
- [Risk] Agent console fixtures may be mistaken for a live Agent runtime. -> Mitigation: keep Agent state as explicit projection data and do not import Agent internals until the owning package provides a live adapter.

## Migration Plan

1. Add ADR and OpenSpec artifacts to establish the target boundary.
2. Add `packages/neko-desktop` with Electron main/preload/renderer entries, typed bridge, and MVP workbench.
3. Add resource model fixtures and tests.
4. Add package build/test scripts and root focused desktop commands.
5. Add a non-GUI desktop smoke script for cross-platform bundle verification.
6. Keep VSCode/TUI unchanged. Rollback is deleting the desktop package and root scripts; no persisted project data or public contract is migrated in MVP.

## Open Questions

- Which native viewport embedding path should be selected after MVP: child native window, Electron native addon surface binding, or a dedicated Engine-controlled overlay surface?
- Should thumbnail generation live first in AppHost or in an owning `@neko/resource` package once the second domain-backed source is implemented?
- Should Market and Skills share one install/trust manager UI shell or remain separate pages with shared primitives?
