## MODIFIED Requirements

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

## ADDED Requirements

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
