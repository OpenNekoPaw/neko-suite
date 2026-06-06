# webview-ui-design-system Specification

## Purpose
Define the canonical Webview React UI surface, dependency boundaries, creative control contracts, and migration guardrails for converging Neko Suite Webview packages on `@neko/ui`.
## Requirements
### Requirement: Canonical Webview React UI package

The system SHALL expose Webview React UI components from `@neko/ui` as the canonical UI entry while keeping `@neko/shared` focused on L0 DTOs, protocols, theme utilities, i18n, errors, and non-React helpers.

#### Scenario: New Webview UI imports shared components

- **WHEN** a Webview package adds or modifies React UI after this change starts
- **THEN** the package imports shared React components from `@neko/ui`, `@neko/ui/primitives`, `@neko/ui/creative`, `@neko/ui/viewport`, `@neko/ui/icons`, or `@neko/ui/hooks`

#### Scenario: Shared main entry stays React-free

- **WHEN** a non-Webview consumer imports from the main `@neko/shared` entry
- **THEN** React-dependent UI components are not exported from that main entry

### Requirement: Webview UI dependency boundaries

The system SHALL prevent `@neko/ui` from importing VSCode APIs, calling `acquireVsCodeApi()`, importing Node-only APIs, or importing feature packages such as Cut, Model, Puppet, Sketch, Canvas, Agent, Market, Dashboard, Tools, Preview, Audio, Live, or Story.

#### Scenario: Boundary test scans @neko/ui

- **WHEN** the `@neko/ui` boundary test runs
- **THEN** it fails if any `@neko/ui` source imports `vscode`, calls `acquireVsCodeApi()`, imports Node-only modules, or imports a feature package

#### Scenario: Feature package uses adapter

- **WHEN** Cut, Model, Puppet, Sketch, or Canvas needs to connect a domain store to a shared component
- **THEN** the mapping code lives inside the owning feature package and passes DTOs, values, callbacks, or render overrides into `@neko/ui`

### Requirement: Public UI subpaths

The system SHALL provide stable public subpaths for viewport UI, primitives, creative components, icons, hooks, and UI test utilities.

#### Scenario: Consumer imports a primitive

- **WHEN** a Webview package imports `Button`, `Select`, `Slider`, or `Tooltip`
- **THEN** the import resolves from `@neko/ui/primitives` or the curated `@neko/ui` entry

#### Scenario: Consumer imports a creative component

- **WHEN** a Webview package imports `PropertyPanel`, `TreeView`, `NumberInput`, or `ColorPicker`
- **THEN** the import resolves from `@neko/ui/creative` or the curated `@neko/ui` entry

### Requirement: Radix-backed primitive migration

The system SHALL implement behavior-heavy primitives with local source components and selective Radix primitives rather than adopting a full runtime UI framework.

#### Scenario: Primitive uses controlled styling

- **WHEN** Tooltip, Popover, Select, Slider, Dialog, ContextMenu, Tabs, Collapsible, ScrollArea, or ToggleGroup is implemented
- **THEN** the component source lives in `@neko/ui`, uses Neko/VSCode theme variables, and does not depend on Ant Design, Material UI, Mantine, or an equivalent runtime UI kit

#### Scenario: Primitive supports expected interaction states

- **WHEN** Button, IconButton, Select, Slider, Dialog, Tabs, or Tooltip renders
- **THEN** it supports disabled state, focus-visible styling, keyboard interaction where applicable, and accessible labels or roles

### Requirement: Bundle delta guardrail

The system SHALL record gzip bundle delta for each Radix or shadcn-source primitive migration and treat 20KB gzipped per primitive as the default review threshold.

#### Scenario: Primitive bundle delta is within budget

- **WHEN** a migration PR adds a Radix-backed primitive and the affected Webview gzip bundle delta is at or below 20KB for that primitive
- **THEN** the PR records the delta and may proceed without a bundle exception

#### Scenario: Primitive bundle delta exceeds budget

- **WHEN** a migration PR adds a Radix-backed primitive and the affected Webview gzip bundle delta exceeds 20KB for that primitive
- **THEN** the PR documents the reason and evaluates lazy import, adapter split, or retaining the local implementation before acceptance

### Requirement: Theme token convergence during migration

The system SHALL require new primitives, creative components, and touched adapters to consume `--neko-*` or VSCode theme variables and SHALL NOT introduce new package-specific token prefixes.

#### Scenario: New primitive styles are added

- **WHEN** a new `@neko/ui` primitive or creative component adds CSS or Tailwind token usage
- **THEN** the styles consume `--neko-*` or VSCode theme variables rather than introducing prefixes such as `--nk-*`, `--sketch-*`, `--model-*`, or `--tools-*`

#### Scenario: Package adapter keeps temporary local aliases

- **WHEN** a package adapter still needs compatibility with an existing local token
- **THEN** the adapter records the mapping to a shared `--neko-*` token or a local adapter-only alias as part of the migration diff

### Requirement: Icon convergence during migration

The system SHALL require new or migrated control icons to come from `@neko/ui/icons` or a documented codicon mapping.

#### Scenario: Control icon is missing

- **WHEN** a migrated component needs an icon that is not already available
- **THEN** the icon is added to `@neko/ui/icons` or mapped to an existing codicon before the feature package uses it

#### Scenario: Business package adds control UI

- **WHEN** a business package adds or migrates a control with an icon
- **THEN** it does not add a new inline SVG or Unicode glyph directly inside the business package component

#### Scenario: Export and package controls use shared icons

- **WHEN** a creative package adds Export or Package toolbar controls
- **THEN** the controls use icons from `@neko/ui/icons` or a documented codicon mapping rather than adding new inline SVG icons

### Requirement: Property definition contract

The system SHALL model creative property controls as per-kind discriminated union types and require exhaustive adapter mapping.

#### Scenario: Adapter maps known property kinds

- **WHEN** an adapter maps `number`, `slider`, `text`, `color`, `boolean`, or `select` property definitions
- **THEN** the adapter handles each kind with type-safe access to only the fields required by that kind

#### Scenario: New property kind is added

- **WHEN** a new `PropertyDefinition.kind` is introduced
- **THEN** adapter tests or type checks fail until every required adapter handles the new kind or explicitly records a supported fallback

### Requirement: Property preview and commit events

The system SHALL separate live preview changes from committed changes for creative property controls.

#### Scenario: Slider emits live preview

- **WHEN** a user drags a slider or number scrubber
- **THEN** the component emits `onPreviewChange` for intermediate values without requiring the package to write undo history

#### Scenario: Input emits commit

- **WHEN** a user releases the pointer, blurs the input, presses Enter, or confirms a selection
- **THEN** the component emits `onCommit` so the owning package can update its undo history and durable domain state

### Requirement: PropertyPanel adapter proof point

The system SHALL use Cut Inspector/Form migration as the first proof point for the PropertyPanel contract and SHALL run a contract review gate before Model or Puppet adopts the contract.

#### Scenario: Cut adapter completes

- **WHEN** the Cut Inspector/Form adapter migration is complete
- **THEN** the review verifies grouping, preview/commit, undo, keyframe state, token mapping, tests, and rollback behavior before Phase 3.2 starts

#### Scenario: Contract gap is found

- **WHEN** the Cut review finds that `PropertyDefinition` or `PropertyPanel` cannot represent required NLE behavior
- **THEN** the contract and Cut adapter are adjusted before Model or Puppet migration proceeds

### Requirement: Creative controls

The system SHALL provide shared creative controls for NumberInput, NumberSlider, ColorPicker, ColorSwatch, PropertyPanel, PropertyGroup, PropertyRow, Keyframe controls, TreeView, AssetBrowser, and MediaTransportControls.

#### Scenario: Number control preserves bounded values

- **WHEN** NumberInput or NumberSlider receives min, max, step, unit, disabled, or keyframe metadata
- **THEN** it renders the control with bounded value behavior and forwards preview/commit events without owning domain state

#### Scenario: Color control preserves color state

- **WHEN** ColorPicker or ColorSwatch receives a color property with optional alpha
- **THEN** it renders the color value and emits preview/commit events without performing package-specific color pipeline computation

### Requirement: TreeView contract and virtualization

The system SHALL provide a TreeView that owns UI behavior for accessibility, expansion, selection, multi-select, rename affordances, and drag UI while leaving domain node meaning to adapters.

#### Scenario: Small tree renders directly

- **WHEN** TreeView renders fewer than 200 visible items
- **THEN** it may render direct DOM while preserving keyboard navigation, focus behavior, selected state, expanded state, visible state, and locked state

#### Scenario: Large tree uses virtualization

- **WHEN** TreeView renders 200 or more visible items
- **THEN** it uses virtualization or an equivalent windowing strategy and preserves keyboard navigation, focus behavior, and selection state

#### Scenario: Large package migration is tested

- **WHEN** Model, Sketch, or Puppet migrates SceneTree, LayerPanel, or node tree behavior to shared TreeView
- **THEN** tests cover at least 500 visible items with rendering, keyboard navigation, and selection assertions

### Requirement: Package adapter migration order

The system SHALL migrate Webview packages in staged adapter waves and SHALL keep each package migration independently revertible.

#### Scenario: First wave migrates creative editors

- **WHEN** Phase 3 begins
- **THEN** Cut migrates Inspector/Form first, Puppet and Model migrate Parameter/Transform/Tree after the Cut review gate, and Sketch and Canvas migrate panel/list/toolbar controls after that

#### Scenario: Later wave migrates remaining packages

- **WHEN** the first creative adapter wave is complete
- **THEN** Audio, Preview, Tools, Dashboard, Market, and Story migrate their primitives, controls, cards, tables, tabs, dialogs, and media controls in later waves

### Requirement: Agent redesign is out of scope

The system SHALL NOT change Agent Header/Input information architecture, conversation tabs, selectors, account flows, slash commands, mentions, or media model controls as part of this UI design system migration.

#### Scenario: Agent consumes a primitive

- **WHEN** Agent uses a shared primitive in this change
- **THEN** the change is limited to low-risk primitive appearance or a11y behavior and does not alter conversation Header/Input layout or selector state flow

#### Scenario: Agent redesign is requested

- **WHEN** work requires changing Agent Header/Input structure, model/session selectors, generation controls, account chrome, or slash/mention menus
- **THEN** the work is deferred to a separate Agent redesign proposal

### Requirement: Legacy shared component cutoff

The system SHALL freeze new React UI imports from `@neko/shared/components` after Phase 3.3 except for documented legacy exemptions and compatibility re-exports.

#### Scenario: New UI after cutoff

- **WHEN** a Webview UI file is added or modified after Phase 3.3
- **THEN** it imports shared React UI from `@neko/ui` rather than adding a new `@neko/shared/components` React UI import

#### Scenario: Legacy import remains

- **WHEN** a legacy `@neko/shared/components` React UI import remains after Phase 3.3
- **THEN** it is either removed in cleanup or recorded in the migration exemption list with owner, package, reason, and removal target

### Requirement: Verification coverage

The system SHALL add targeted tests and checks for boundaries, primitives, creative contracts, adapters, tokens, icons, bundle deltas, TreeView scale, and legacy import cutoff.

#### Scenario: UI system checks run

- **WHEN** the UI design system verification suite runs
- **THEN** it covers dependency boundaries, Webview no-`vscode` import rules, primitive a11y/keyboard behavior, creative preview/commit behavior, exhaustive property mapping, token/icon rules, and package adapter behavior

#### Scenario: Migration evidence is recorded

- **WHEN** a package adapter migration completes
- **THEN** the migration records tests or DOM/source assertions proving behavior parity and notes the bundle delta for affected Webview bundles

### Requirement: Shared keyboard focus primitives

The system SHALL expose shared Webview keyboard focus helpers and dispatcher primitives from `@neko/ui` without importing VSCode APIs or feature packages.

#### Scenario: Webview imports keyboard helper

- **WHEN** a Webview package needs editable target detection, IME guard logic, keyboard boundary ownership, or shortcut dispatch
- **THEN** it imports the shared helper or primitive from `@neko/ui` or an approved `@neko/ui` subpath

#### Scenario: Boundary test scans keyboard helpers

- **WHEN** the `@neko/ui` boundary test runs
- **THEN** keyboard helpers and primitives fail the test if they import `vscode`, call `acquireVsCodeApi()`, import Node-only APIs, or import a feature package

### Requirement: KeyboardBoundary component

The system SHALL provide a shared `KeyboardBoundary` mechanism that lets UI controls and editor regions declare their keyboard scope and ownership priority.

#### Scenario: Text input boundary renders

- **WHEN** a shared or package-owned text-editing control renders with keyboard boundary metadata
- **THEN** the boundary declares text input ownership so outer editor shortcuts do not consume its keys

#### Scenario: Modal boundary renders

- **WHEN** Dialog, Popover, ContextMenu, Select dropdown, or an equivalent menu surface is open
- **THEN** the boundary declares modal or menu ownership so Escape, Enter, and arrow keys are resolved locally before editor fallback shortcuts

### Requirement: Shared dispatcher validates shortcut tables

The system SHALL validate shortcut tables for duplicate structured key specs within the same owner and scope.

#### Scenario: Duplicate owner shortcut

- **WHEN** a package registers two shortcuts with the same owner, scope, and structured key spec
- **THEN** the shared dispatcher reports a duplicate shortcut diagnostic in development or test mode

#### Scenario: Same key in nested scopes

- **WHEN** the same structured key spec is registered by nested boundaries with different scopes
- **THEN** the shared dispatcher resolves the shortcut by boundary containment and scope priority rather than registration order

### Requirement: Creative left rail export and package controls

The system SHALL render creative editor Export and Package entry points as icon buttons using shared toolbar primitives or the shared `CreativeLeftRail` action contract. These controls SHALL use stable action attributes:

- Export: `data-creative-left-rail-action="open-export"`
- Package: `data-creative-left-rail-action="open-package"`

#### Scenario: Export control is added

- **WHEN** a creative package adds an Export toolbar action
- **THEN** it renders through `@neko/ui/primitives` or `@neko/ui/workbench` and exposes `data-creative-left-rail-action="open-export"`

#### Scenario: Package control is added

- **WHEN** a creative package adds a Package toolbar action
- **THEN** it renders through `@neko/ui/primitives` or `@neko/ui/workbench` and exposes `data-creative-left-rail-action="open-package"`

### Requirement: Creative Workbench shell primitives
The system SHALL expose creative Workbench shell primitives or contracts from `@neko/ui` while keeping package-specific domain behavior in feature package adapters.

#### Scenario: Shared shell primitive is imported
- **WHEN** a covered creative Webview imports a shared shell, left rail, main panel control layer, or right panel shell primitive
- **THEN** the import resolves from `@neko/ui`, `@neko/ui/primitives`, or another documented `@neko/ui` public subpath

#### Scenario: Shared shell remains host-neutral
- **WHEN** the `@neko/ui` boundary test scans creative Workbench shell primitives
- **THEN** it fails if they import VSCode APIs, call `acquireVsCodeApi()`, import Node-only modules, or import feature packages such as Cut, Canvas, Audio, Puppet, Model, or Sketch

#### Scenario: Feature package binds domain behavior
- **WHEN** a feature package uses a shared shell primitive for creative Workbench layout
- **THEN** command dispatch, store selection, engine messages, i18n keys, and domain-specific disabled/active state remain in the feature package adapter or component

### Requirement: Shell slot accessibility
The system SHALL provide accessible slot and control patterns for left toolbar visibility toggles, main-panel control regions, right panels, and passive status ownership.

#### Scenario: Left rail toggle controls a main panel region
- **WHEN** a shared left rail action represents a visibility toggle
- **THEN** it supports accessible label text and forwards `aria-controls`, expanded state, and pressed or active state to the rendered control

#### Scenario: Main panel control layer is hidden
- **WHEN** a main-panel control layer is hidden through a left rail toggle
- **THEN** the controlled region is not focusable through normal keyboard navigation while hidden

#### Scenario: Right panel is collapsed
- **WHEN** a shared shell omits or collapses its right panel slot
- **THEN** the main panel can occupy the reclaimed space without requiring package domain code to recompute layout manually

