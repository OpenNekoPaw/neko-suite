## ADDED Requirements

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
