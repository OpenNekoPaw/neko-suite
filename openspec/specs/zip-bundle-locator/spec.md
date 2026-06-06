# zip-bundle-locator Specification

## Purpose
Define safe archive-internal bundle entry locators, manifest-relative resolution, and archive metadata validation.
## Requirements
### Requirement: Bundle Entry Locator Contract
The system SHALL define a shared `BundleEntryLocator` contract for archive-internal entries with `bundlePath`, `entryPath`, and `fragmentRef` fields.

#### Scenario: Create locator from structured fields
- **WHEN** a caller creates a locator for bundle path `./sakura.zip` and entry path `textures/texture_00.png`
- **THEN** the locator contains `bundlePath: "./sakura.zip"`, `entryPath: "textures/texture_00.png"`, and `fragmentRef: "./sakura.zip#textures/texture_00.png"`

#### Scenario: Locator is not consumed as runtime path
- **WHEN** engine, Rust runtime, or Webview code needs archive entry content
- **THEN** it receives bytes, JSON, ImageBitmap, a file token, or another runtime-supported data channel rather than consuming `fragmentRef` as a file path

### Requirement: Safe Bundle Entry Paths
The system SHALL normalize bundle entry paths to strict relative POSIX paths and reject unsafe entries.

#### Scenario: Normalize separators
- **WHEN** a caller normalizes `textures\\texture_00.png`
- **THEN** the normalized entry path is `textures/texture_00.png`

#### Scenario: Reject unsafe path
- **WHEN** a caller normalizes an absolute path, a path containing `..`, or a path with empty segments
- **THEN** normalization fails with a typed invalid entry path result

### Requirement: Manifest Relative Resolution
The system SHALL resolve archive entry references relative to the manifest entry directory.

#### Scenario: Resolve nested manifest reference
- **WHEN** a manifest entry is `avatars/sakura/model3.json` and it references `textures/texture_00.png`
- **THEN** the resolved entry path is `avatars/sakura/textures/texture_00.png`

#### Scenario: Reject escaping reference
- **WHEN** a manifest entry references a path that escapes its normalized archive boundary
- **THEN** resolution fails before any entry bytes are read

### Requirement: Archive Metadata Validation
The system SHALL validate archive entry metadata before ZIP-backed bundle readers consume entries.

#### Scenario: Reject duplicate normalized entries
- **WHEN** archive metadata contains `textures/a.png` and `textures\\a.png`
- **THEN** validation fails because both entries normalize to `textures/a.png`

#### Scenario: Reject oversized archive
- **WHEN** an entry exceeds the per-entry limit or the archive exceeds the total uncompressed size limit
- **THEN** validation fails before the archive is consumed as a bundle
