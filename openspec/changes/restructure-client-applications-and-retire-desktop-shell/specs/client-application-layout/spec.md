## ADDED Requirements

### Requirement: Current products have canonical application build roots
Neko Suite SHALL define `apps/neko-home`, `apps/neko-tui`, and `apps/neko-vscode` as the only current product executable, package, and release roots.

#### Scenario: A supported product is built
- **WHEN** Home, TUI, or Neko for VSCode is built or packaged
- **THEN** the command MUST resolve to its corresponding `apps/*` root
- **AND** no package-local product entry may return success

#### Scenario: Studio is discovered
- **WHEN** repository tooling enumerates current products
- **THEN** it MUST NOT discover a buildable Desktop or Studio product

### Requirement: Applications build public package capabilities
Applications SHALL compose documented public package entries. Reusable packages MUST NOT import applications, and applications MUST NOT import package source or internal implementation paths.

#### Scenario: TUI is bundled
- **WHEN** `apps/neko-tui` builds its executable
- **THEN** it MUST bundle the Agent-owned public terminal application entry
- **AND** Agent runtime, CLI command semantics, Ink UI, and debug protocol MUST remain package-owned

#### Scenario: VSCode product is packaged
- **WHEN** `apps/neko-vscode` produces a VSIX
- **THEN** it MUST package the product Extension Pack identity and member list
- **AND** domain Extensions and Custom Editors MUST remain in their owning packages

### Requirement: Product builds remain independently addressable
Each application SHALL expose focused build, test, package, and applicable release tasks in the monorepo.

#### Scenario: One application changes
- **WHEN** CI selects one app and its dependency closure
- **THEN** it MUST run that application's gates without packaging an unrelated product

#### Scenario: A shared runtime changes
- **WHEN** a public package entry consumed by an app changes
- **THEN** producer and affected app consumer gates MUST run in the same revision

### Requirement: Legacy product entries are one-way retired
After an app-root replacement passes its required gates, its package-local executable, manifest, build, start, package, and release entries SHALL be removed or fail closed.

#### Scenario: A legacy entry is invoked
- **WHEN** a caller invokes a retired Desktop, Agent-package TUI, or package-local Neko Suite product entry
- **THEN** it MUST be absent or return an explicit retired-entry diagnostic
- **AND** it MUST NOT forward to the app root or another fallback
