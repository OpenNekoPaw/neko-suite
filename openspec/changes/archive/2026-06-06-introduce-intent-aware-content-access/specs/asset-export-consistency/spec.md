## ADDED Requirements

### Requirement: Asset export and package flows use source intent
The system SHALL resolve asset export, package, bundle, dependency validation, and artifact hashing inputs through source-first content access intents.

#### Scenario: Character pack copies original asset file
- **WHEN** a character pack export includes a bound asset file with a generated thumbnail
- **THEN** the export reads the original asset file or package source
- **THEN** it does not copy the thumbnail or preview cache artifact as the asset file

#### Scenario: Dependency validation hashes original import source
- **WHEN** dependency validation verifies an imported asset source hash
- **THEN** it reads the original source recorded by the asset dependency manifest
- **THEN** it ignores resource cache variants and generated preview artifacts

### Requirement: Draft or proxy export is explicit
The system SHALL require an explicit draft or proxy quality mode before using proxy media, preview variants, or downsampled derived artifacts as export inputs.

#### Scenario: Default export excludes proxy
- **WHEN** a media asset has a ready video proxy and a final export starts without draft/proxy mode
- **THEN** the export reads the original media source
- **THEN** it does not use the proxy path

#### Scenario: Draft proxy export records quality mode
- **WHEN** a user explicitly chooses draft/proxy export
- **THEN** the export request records that quality mode
- **THEN** the output diagnostics identify that proxy or derived media was used intentionally

### Requirement: Legacy cache paths are not package sources
The system SHALL NOT treat legacy `cachePath` values as original package or export sources.

#### Scenario: Legacy-only image cannot package
- **WHEN** an asset, storyboard, or document image record contains only a legacy cache path and no source ref
- **THEN** package/export reports missing-source or unrecoverable
- **THEN** it does not include the cache file as an original asset
