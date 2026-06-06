## ADDED Requirements

### Requirement: Live2D Bundle Import
The system SHALL import Live2D ZIP bundles containing `model3.json` without extracting bundle contents to disk.

#### Scenario: Import valid Live2D bundle
- **WHEN** a user imports a ZIP containing a valid `model3.json`, referenced `.moc3`, textures, motions, expressions, and physics files
- **THEN** the system creates or updates a `.nkp` project with `puppet.bundle` referencing the ZIP and `puppet.src` unset for the bundle-backed source

#### Scenario: Reject missing required bundle entries
- **WHEN** `model3.json` references a missing `.moc3` file or texture
- **THEN** import fails with diagnostics that identify the missing entry

### Requirement: Nkp Bundle Index
The system SHALL cache lightweight Live2D bundle metadata in `.nkp` as `bundleIndex`.

#### Scenario: Generate bundle index
- **WHEN** a Live2D bundle import succeeds
- **THEN** the `.nkp` stores motion groups, expression names, texture count, physics presence, and available parameter names when those values can be extracted

#### Scenario: Use bundle index for discovery
- **WHEN** ProjectSearch or AssetLibrary needs bundle metadata
- **THEN** it can use `bundleIndex` without reparsing ZIP bytes during every query

### Requirement: Live2D Runtime Data Loading
The system SHALL resolve Live2D bundle locators to runtime-supported data before loading or rendering the puppet.

#### Scenario: Load MOC3 bytes
- **WHEN** a bundle-backed `.nkp` opens
- **THEN** the loader reads the `.moc3` entry into bytes and sends those bytes through the supported puppet load path

#### Scenario: Load auxiliary JSON
- **WHEN** expressions, motions, or physics entries are present
- **THEN** the loader sends parsed or serialized auxiliary JSON through the supported puppet auxiliary path

### Requirement: MOC3 External Texture Rendering
The system SHALL provide a runtime data path for Live2D texture PNG bytes referenced by `model3.json`.

#### Scenario: Texture bytes become renderable
- **WHEN** a bundle-backed MOC3 mesh references texture index `0`
- **THEN** the corresponding PNG entry is decoded or uploaded through a supported Webview or engine texture channel before rendering

#### Scenario: Texture upload API is not confused with index binding
- **WHEN** a caller needs to upload PNG bytes
- **THEN** it does not use `puppets:set_texture` unless that API has been explicitly changed to accept image data

### Requirement: INP Entry Points Are Deprecated
The system SHALL remove `.inp` from new puppet creation and import entrypoints while preserving legacy `.inp` read compatibility.

#### Scenario: New import hides INP
- **WHEN** the user opens the puppet import file picker
- **THEN** `.moc3` and Live2D ZIP bundle flows are offered but `.inp` is not promoted as a new import target

#### Scenario: Existing INP remains readable
- **WHEN** a user opens an existing `.inp` puppet source
- **THEN** the legacy read path continues to load it during the compatibility period
