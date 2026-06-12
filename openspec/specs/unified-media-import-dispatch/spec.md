# unified-media-import-dispatch Specification

## Purpose
Define shared media import contracts and host-owned dispatch for domain import handlers, ZIP bundles, and imported asset dimensions.
## Requirements
### Requirement: Shared Import Contracts
The system SHALL define shared `ImportHandler`, `ImportPlan`, `ImportResult`, and imported asset dimension contracts without depending on VSCode, Node filesystem APIs, or concrete ZIP libraries.

#### Scenario: Domain handler declares support
- **WHEN** a domain package implements an import handler
- **THEN** it declares supported extensions, validates inputs, plans source/copy behavior, and returns imported asset metadata through shared contracts

#### Scenario: Shared code remains host-independent
- **WHEN** shared import contracts are imported in Webview-independent tests
- **THEN** they do not load VSCode, Node `fs`, AdmZip, or domain extension implementations

### Requirement: Host-Owned Import Dispatcher
The system SHALL implement import dispatch in a host layer that can access workspace folders, user file dialogs, filesystem writes, ZIP sniffing, and extension commands.

#### Scenario: Workspace file uses source reference
- **WHEN** a supported asset file is already inside the active workspace or document directory
- **THEN** the import plan uses the source path without copying the file

#### Scenario: External file is copied into project imports
- **WHEN** a supported asset file is outside readable project roots
- **THEN** the import plan copies it into the appropriate `.neko/imports/{kind}/` directory before writing the project reference

### Requirement: ZIP Import Dispatch
The system SHALL sniff ZIP package contents and route the package to the correct import path.

#### Scenario: Live2D ZIP route
- **WHEN** a ZIP contains `model3.json`
- **THEN** import dispatch routes it to the Live2D bundle-memory loader without extracting bundle contents to disk

#### Scenario: 3D glTF ZIP route
- **WHEN** a ZIP contains `.gltf` with external `.bin` or texture references
- **THEN** import dispatch extracts it into `.neko/imports/models/` using zip-slip-safe extraction

#### Scenario: Market bundle route
- **WHEN** a ZIP contains a market `manifest.json` with bundle metadata
- **THEN** import dispatch routes it to Market install orchestration rather than treating it as a raw media import

#### Scenario: Ambiguous ZIP route
- **WHEN** a ZIP contains multiple supported domain roots and no deterministic priority applies
- **THEN** import dispatch asks the user or fails with an ambiguity diagnostic rather than guessing silently

### Requirement: Import planning emits portable durable refs
Media and asset import planning SHALL separate durable project references from runtime absolute paths and SHALL prefer workspace-root-relative references for files inside the owning workspace.

#### Scenario: Workspace source import keeps portable ref
- **WHEN** an imported media or asset source is inside the owning workspace
- **THEN** the import result exposes a durable project reference relative to that workspace root
- **AND** any absolute source path remains runtime metadata only.

#### Scenario: Copied import stores destination ref
- **WHEN** an external source is copied into `.neko/imports` or another approved project import directory
- **THEN** the durable reference points to the copied workspace-relative destination
- **AND** the original absolute source path is not required for reopen playback.

#### Scenario: External linked import uses configured variable
- **WHEN** an import links an external source instead of copying it
- **AND** the source is under a configured media-library variable
- **THEN** the durable reference uses `${VARIABLE}/...`
- **AND** the import flow reports a diagnostic if no portable variable or approved fallback is available.

### Requirement: Import handlers receive document/workspace context
Host-owned import dispatch SHALL provide source document path, owning workspace root, and open workspace roots to domain import handlers that need to create durable media references.

#### Scenario: Multi-root import chooses owning workspace
- **WHEN** a document in workspace root `/work/a` imports `/work/a/cases/clip.mp4`
- **AND** another workspace root is also open
- **THEN** import planning stores `cases/clip.mp4` relative to `/work/a`
- **AND** it does not use the first workspace root unless it is also the owning workspace.

