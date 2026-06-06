# project-asset-dependency-manifest Specification

## Purpose
Define Git-trackable project asset dependency manifests for imported and marketplace assets needed to recover a project.
## Requirements
### Requirement: Project Asset Dependency Manifest
The system SHALL provide a Git-trackable asset dependency manifest that records external imported and market asset sources needed to recover a project.

#### Scenario: Record Live2D bundle dependency
- **WHEN** a Live2D ZIP is imported in bundle-memory mode
- **THEN** the manifest records source type `import`, original ZIP path, content hash, storage mode `bundle-memory`, media kind, and dimension metadata

#### Scenario: Record 3D disk import dependency
- **WHEN** a 3D glTF ZIP is extracted into `.neko/imports/models/`
- **THEN** the manifest records source type `import`, original ZIP path, content hash, storage mode `disk`, import destination, media kind, and file list metadata

#### Scenario: Record market dependency
- **WHEN** a puppet/model/voice package is installed from Market and used by a project
- **THEN** the manifest records source type `market`, package id, version or content identity, and media kind

### Requirement: Dependency Recovery Check
The system SHALL check asset dependency manifest entries on project open or explicit validation.

#### Scenario: Bundle-memory source exists
- **WHEN** a bundle-memory dependency source ZIP exists and its hash matches
- **THEN** the dependency is considered recoverable without disk extraction

#### Scenario: Disk import missing
- **WHEN** a disk import destination is missing
- **THEN** the system prompts for the original ZIP or reports recovery instructions based on manifest metadata

#### Scenario: Market package missing
- **WHEN** a market dependency is not installed locally
- **THEN** the system reports the missing package id and can route the user to install it

#### Scenario: Source hash mismatch
- **WHEN** an original import source exists but its content hash differs from the manifest
- **THEN** the system reports that the source changed and requires reimport or explicit acceptance before updating metadata

### Requirement: Manifest Complements AssetLibrary
The system SHALL treat the dependency manifest as a dependency declaration and AssetLibrary as the current project asset state.

#### Scenario: Workspace asset does not need external dependency
- **WHEN** an asset file is stored inside the workspace and committed to the project
- **THEN** it can remain represented in AssetLibrary without requiring an external dependency manifest entry

#### Scenario: AssetLibrary remains authoritative for current state
- **WHEN** an asset variant is remapped or marked missing
- **THEN** AssetLibrary records the current status while the dependency manifest records how the external source can be recovered
