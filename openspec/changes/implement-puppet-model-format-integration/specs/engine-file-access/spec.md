## ADDED Requirements

### Requirement: Bundle Locators Are Not Engine File Paths
The engine file access contract SHALL treat bundle locators as metadata references that must be resolved before engine actions consume data.

#### Scenario: Engine action receives bytes not fragment
- **WHEN** a Live2D bundle-backed `.moc3` entry is loaded
- **THEN** the engine action receives bytes, base64, or a registered file token rather than a `bundlePath#entryPath` fragment string

#### Scenario: Fragment path is rejected as local path
- **WHEN** a caller attempts to register or load `bundlePath#entryPath` as a normal local file path
- **THEN** the file access layer rejects it or requires explicit bundle resolution first

### Requirement: Container Entry Reads Can Support Bundle Resolution
When used by bundle readers, the engine file access contract SHALL resolve archive entries through registered container tokens rather than fake local file paths.

#### Scenario: Registered ZIP entry read
- **WHEN** a ZIP file is registered as an allowed container source and a safe entry path is requested
- **THEN** file access returns bounded entry bytes without exposing the entry as a fake local file path
