## ADDED Requirements

### Requirement: The old Desktop product is completely removed
After Home/shared replacement gates pass, the repository SHALL delete `packages/neko-desktop`, its root commands, CI/release ownership, dependencies, fixtures, functional scenarios, and generated product artifacts.

#### Scenario: Desktop source removal is reviewed
- **WHEN** a Desktop module or scenario is deleted
- **THEN** the migration inventory MUST identify its Home/shared replacement or explicit retirement
- **AND** unclassified or still-consumed code MUST block deletion

#### Scenario: Desktop is invoked after removal
- **WHEN** a caller invokes an old Desktop build, start, test, editor, open-file, or edit-save entry
- **THEN** the entry MUST be absent or fail with a retired-entry diagnostic
- **AND** it MUST NOT forward to Home or VSCode

### Requirement: Professional editor prototype behavior is not preserved as a product
The Desktop CodeMirror editor, editor tabs, VSCode-like workbench, desktop-owned creative-editor composition, and native product spike code SHALL NOT remain buildable in this change.

#### Scenario: Future native application work begins
- **WHEN** a native Desktop or Studio product is reconsidered
- **THEN** it MUST begin under a separate accepted OpenSpec change
- **AND** it MUST compose then-current public Engine/domain contracts rather than depend on the removed shell

### Requirement: Valuable local data is not deleted with source code
Removing Desktop source SHALL NOT delete project files, conversations, settings, credentials, trust state, installed packages, or generated artifacts.

#### Scenario: Source cleanup runs
- **WHEN** Desktop repository files and rebuildable outputs are removed
- **THEN** durable user-data locations MUST remain untouched
- **AND** any supported Home reuse or migration path MUST retain its focused tests

### Requirement: Functional ownership is resolved before deletion
Every Desktop functional scenario SHALL map to a Home scenario, a shared contract test, or an explicit retired behavior before deletion.

#### Scenario: Quality checks run after deletion
- **WHEN** legacy-debt, unused-code, and application-boundary checks run
- **THEN** Desktop package references, CodeMirror/editor-shell dependencies, stale scenarios, successful aliases, and buildable Studio entries MUST fail the checks
