## Context

`implement-webview-layout-unification` already moved several status and resize concerns toward shared infrastructure, but each creative editor Webview still owns its shell structure locally. Recent toolbar changes also showed a recurring ambiguity: a button can be placed by visual convenience instead of by responsibility, causing horizontal toolbar rows to reappear above the main creative surface.

The affected editors are all creative Workbench surfaces, but they do not all use the same domain layout:

- `neko-cut`: preview + timeline, with a right property inspector.
- `neko-model`: viewport + timeline dock, with common viewport commands in the left toolbar and a right dock.
- `neko-puppet`: viewport/canvas, with import/fit/onion commands in the left toolbar and a right inspector stack.
- `neko-audio`: waveform/timeline + transport surface, with analysis/spectrum commands in the left toolbar and a right side panel.
- `neko-canvas`: infinite canvas + creation/library panels + floating property panels.
- `neko-sketch`: drawing canvas + fixed drawing tools + layer/brush/property panels.

The proposal therefore standardizes shell responsibilities and slots, not domain-specific behavior.

## Goals / Non-Goals

**Goals:**

- Define a reusable creative Workbench shell contract for left toolbar, main panel, right panel, and VSCode StatusBar ownership.
- Prevent domain controls from drifting into package-specific horizontal top toolbars.
- Keep primary creative surfaces inside the main panel, preserve Cut timeline controls as part of the timeline component, and remove independent non-Cut horizontal command toolbars through responsibility-based placement.
- Let `@neko/ui` provide host-neutral shell primitives and slot helpers without importing package stores, VSCode APIs, or feature packages.
- Make package migrations independently revertible and testable.

**Non-Goals:**

- Do not redesign Agent, Dashboard, Market, Story, Tools, Preview, or other non-creative-Workbench Webviews.
- Do not force every editor into identical pixel geometry.
- Do not move high-frequency domain controls into VSCode native UI.
- Do not migrate all property panels, TreeViews, icons, or theme tokens beyond what this shell standardization touches.
- Do not replace existing engine, viewport, timeline, or media protocol ownership.

## Decisions

### D1: Shell contract owns slots; packages own domain adapters

The shared layer will define structural primitives such as `CreativeWorkbenchShell`, `CreativeLeftRail`, `MainPanelControlLayer`, and optional right/bottom panel slots. These components accept React nodes and typed metadata but do not know package stores or domain command semantics.

Alternative considered: a generic domain-aware toolbar registry. This was rejected because Cut timeline commands, Model viewport commands, Audio transport, and Sketch brush tools have different state models and command lifecycles.

### D2: Left toolbar supports common actions, established primary tools, and visibility toggles

The left toolbar has three permitted button classes:

- common/global actions and frequent workbench commands that are editor-wide or replace non-Cut horizontal command rows, such as save, import, document-level export, fit view, grid, reset camera, spectrum, and analysis commands;
- established primary tool selection where the editor's interaction model expects a left rail, such as Canvas navigation/node creation or Sketch drawing tools;
- visibility toggles for main-panel controls, right panels, overlays, or panel stacks.

Cut timeline editing controls stay in the main panel because they are part of the timeline component. Non-Cut horizontal command rows are not retained: Model/Puppet viewport commands and Audio analysis/spectrum commands move into the left toolbar, while transport controls, selected-object property controls, parameter editors, effects, recording, export, and inspector-local controls stay in the main panel or right panel according to their surface ownership.

Alternative considered: moving every ordinary horizontal-toolbar command directly into the left toolbar. This is accepted for non-Cut command rows where the commands are common workbench actions, but rejected for Cut timeline controls and right-panel-local settings because those controls belong to their timeline or inspector components.

### D3: Main panel owns the creative surface and its control affordances

The main panel is the owner of preview playback surfaces, timeline surfaces, Cut timeline controls, transport strips, viewport/waveform/canvas surfaces, brush overlays, canvas zoom/minimap, and other embedded domain controls. These controls may render as overlay clusters, timeline headers, transport strips, or contextual floating controls inside the main panel.

Package-specific horizontal toolbar rows above the main surface should be removed except for Cut timeline controls that are part of the timeline component. Their buttons are re-homed by responsibility: editor-wide actions, established primary tools, and non-Cut common command buttons live in the left toolbar; playback/transport controls, Cut timeline controls, canvas overlays, and other embedded controls remain inside the main panel; inspector-local controls remain in the right panel.

### D4: Right panel owns properties, inspectors, tree panels, and local sections

The right panel contains selected-object properties, outliners, layer stacks, node libraries where the package already uses a right-side creation panel, effect/record/export panels, and local tabs or section switches. Its controls are local to the panel and do not belong in the left toolbar.

Canvas may continue using right-anchored floating panels because its existing interaction model treats them as canvas overlays, but they must still satisfy the right-inspector responsibility.

### D5: Passive status belongs to VSCode native StatusBar

Passive editor status, such as selected node, object count, engine state, active layer, zoom, projection state, subsystem summary, export/proxy state, and current tool summary, should be projected to native StatusBar when it is useful outside the immediate creative surface.

Interactive controls, progress UIs that require rich interaction, and high-frequency creative controls stay in Webview.

### D6: Package coverage is explicit and staged

The first scope includes exactly these creative editor packages:

- `neko-cut`
- `neko-canvas`
- `neko-audio`
- `neko-puppet`
- `neko-model`
- `neko-sketch`

The implementation should migrate one package at a time after adding shared contracts and guardrail tests.

## Interface Sketch

```ts
export type CreativeWorkbenchMainKind =
  | 'preview-timeline'
  | 'viewport-timeline'
  | 'waveform-timeline'
  | 'canvas'
  | 'drawing-canvas';

export interface CreativeWorkbenchShellProps {
  readonly leftRail: React.ReactNode;
  readonly main: React.ReactNode;
  readonly rightPanel?: React.ReactNode;
  readonly bottomPanel?: React.ReactNode;
  readonly mainKind: CreativeWorkbenchMainKind;
}

export interface CreativeLeftRailAction {
  readonly id: string;
  readonly label: string;
  readonly icon: React.ReactNode;
  readonly kind: 'common-action' | 'visibility-toggle';
  readonly controls?: string;
  readonly active?: boolean;
  readonly disabled?: boolean;
  readonly onClick: () => void;
}

export interface MainPanelControlLayerProps {
  readonly id: string;
  readonly visible: boolean;
  readonly placement:
    | 'overlay-top-left'
    | 'overlay-top-right'
    | 'overlay-bottom-left'
    | 'timeline-header'
    | 'transport'
    | 'contextual';
  readonly children: React.ReactNode;
}
```

These names are illustrative. Final naming should match existing `@neko/ui` export conventions.

## Five-Layer Analysis

**Responsibilities:** shared shell owns layout structure and accessibility wiring; feature packages own domain controls, store bindings, i18n keys, and command dispatch. Cut owns timeline control placement inside the timeline component; non-Cut packages own left-rail adapters for commands moved out of horizontal rows.

**Dependencies:** `@neko/ui` can depend on React and UI primitives; it must not import VSCode APIs, Node APIs, or feature packages. Feature packages may import `@neko/ui`.

**Interfaces:** shell props are React-node slots plus small discriminated metadata. Button declarations use `kind` to enforce left-rail responsibility.

**Extension:** new creative editors can choose a `mainKind` and provide slots without changing shared shell internals. Package-specific panel shapes remain adapters.

**Tests:** shared tests verify slot rendering and boundary rules; package tests verify controls are placed in the correct slot and status information is not duplicated in Webview chrome.

## Risks / Trade-offs

- **Risk: over-abstracting package layouts** -> Mitigation: keep shared shell slot-based, not domain-aware.
- **Risk: Canvas/Sketch industry conventions conflict with strict left-rail rules** -> Mitigation: allow primary tool selection in the left rail as editor-wide tools, while keeping domain panels and contextual controls in main/right slots.
- **Risk: StatusBar overload** -> Mitigation: keep existing per-package item limits and active-editor visibility management; combine related passive status when needed.
- **Risk: migration churn across six packages** -> Mitigation: implement in waves with source/DOM tests per package and keep each package independently revertible.
- **Risk: hidden behavior changes from moving controls** -> Mitigation: preserve existing command callbacks and store ownership; only move structural placement unless a package-specific task explicitly changes behavior.

## Migration Plan

1. Add shared shell contracts and minimal primitives in `@neko/ui`.
2. Add guardrail tests for dependency boundaries and left/main/right/status responsibility.
3. Migrate packages in staged waves:
   - Wave 1: `neko-model`, `neko-puppet`, `neko-audio` because they currently expose the clearest horizontal-toolbar drift.
   - Wave 2: `neko-cut` to align naming and tests while preserving timeline-header controls.
   - Wave 3: `neko-canvas`, `neko-sketch` to adopt the shell contract without forcing their canvas/drawing conventions into fixed right-panel geometry.
4. Update ADR/package docs after each wave.
5. Run targeted package type checks, component tests, and source/DOM layout assertions.

Rollback is package-level: shared primitives should remain additive, and each package migration should avoid deleting the previous domain command implementation until placement tests pass.

## Open Questions

- Should `CreativeLeftRailAction.kind` be enforced only by tests, or should package adapters expose typed registries that make invalid placement harder?
- Should `neko-canvas` right NodeLibrary remain named as a right panel, or be renamed to a creation panel while staying in the right-inspector slot?
- Should the first implementation include a visual screenshot pass for all six packages, or only DOM/source assertions plus targeted manual checks?
