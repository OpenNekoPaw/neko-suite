# canvas-basic-element-catalog Specification

## Purpose

TBD - created by archiving change introduce-conversation-draft-workspaces. Update Purpose after archive.

## Requirements

### Requirement: Basic right dock shows foundational elements only

Canvas Basic mode SHALL compose the right-dock creation catalog from existing foundational entries for file/reference, text/Markdown document, script document presentation, image, audio, video, and neutral group/frame/layout elements.

#### Scenario: Creator opens a Board Canvas

- **WHEN** Canvas opens `neko/boards/example.nkc` through Board context
- **THEN** the right dock defaults to Basic and shows the foundational creation entries

### Requirement: Basic catalog excludes specialized and system entries

Canvas Basic mode MUST NOT display creation entries for specialized Storyboard/creative tables, Scene/Shot/Gallery production nodes, timeline/track/clip/playback workflow nodes, professional subsystem nodes, Agent, Tool, Skill, Model, Provider, or executable workflow elements.

#### Scenario: Basic catalog is inspected

- **WHEN** the right dock is in Basic mode
- **THEN** no specialized Storyboard table or professional/system creation entry is present

#### Scenario: Storyboard Markdown exists

- **WHEN** a Board Canvas contains a Markdown Storyboard document
- **THEN** Basic mode renders it as normal document content and does not expose a specialized Storyboard-table creation entry

### Requirement: Basic mode does not change `.nkc` semantics

Basic mode SHALL remain a UI/catalog and default-authoring projection. It MUST NOT add a persisted profile, change `.nkc` schema validation, remove existing node types, or reject a valid Canvas because it already contains professional nodes.

#### Scenario: Existing professional node is present

- **WHEN** a valid `.nkc` containing an existing professional node is opened with Basic mode selected
- **THEN** Canvas retains and renders the node through its existing renderer while keeping its creation entry out of the Basic catalog

#### Scenario: Creator selects Professional mode

- **WHEN** the creator explicitly switches the right dock to Professional mode
- **THEN** existing professional subsystem entries are composed through the current catalog mechanism without modifying the file schema

### Requirement: Basic catalog reuses existing descriptors and UI foundations

The system SHALL compose Basic mode from existing Canvas node/subsystem descriptors and shared UI primitives. It MUST NOT maintain duplicate hard-coded node definitions or a parallel component registry.

#### Scenario: Foundational descriptor changes

- **WHEN** an owning foundational node descriptor is updated
- **THEN** Basic catalog consumes the owning descriptor rather than a copied definition
