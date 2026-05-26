## MODIFIED Requirements

### Requirement: Shared resize primitives are exposed only from the Layer 2 component surface

The system SHALL provide shared Webview layout resize primitives from `@neko/ui/hooks` and `@neko/ui/primitives` as the canonical React UI surface, while allowing `@neko/shared/components` to keep compatibility re-exports during the migration and without exporting React-dependent APIs from the `@neko/shared` main entrypoint.

#### Scenario: Webview imports resize primitives from canonical UI entry

- **WHEN** a Webview package adds or modifies imports for `useResizable`, `usePersistedResize`, or `ResizeHandle`
- **THEN** the import resolves from `@neko/ui/hooks`, `@neko/ui/primitives`, or the curated `@neko/ui` entry

#### Scenario: Legacy Webview import remains during migration

- **WHEN** an untouched Webview package still imports `useResizable` or `ResizeHandle` from `@neko/shared/components`
- **THEN** the import remains valid through a compatibility re-export until the UI design system cutoff removes or exempts it

#### Scenario: Main shared entrypoint remains host-neutral

- **WHEN** a non-Webview consumer imports from `@neko/shared`
- **THEN** the resize primitives are not exported from the main entrypoint
