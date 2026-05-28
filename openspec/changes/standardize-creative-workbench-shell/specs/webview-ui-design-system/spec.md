## ADDED Requirements

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
