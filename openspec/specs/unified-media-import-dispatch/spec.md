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
