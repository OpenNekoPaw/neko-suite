# generated-asset-lifecycle Specification

## Purpose
TBD - created by archiving change separate-generated-assets-from-resource-cache. Update Purpose after archive.
## Requirements
### Requirement: Generated outputs are classified before storage
The system SHALL classify every generated binary output as provider scratch, unsaved generated draft, promoted generated asset, or generated derivative before exposing it outside the owning provider.

#### Scenario: Provider scratch remains private
- **WHEN** a provider creates temporary files while fulfilling a generation request
- **THEN** the system MUST keep those files out of Agent durable results, Webview transfer payloads, Canvas nodes, package manifests, and project facts

#### Scenario: User-visible generated draft is not durable
- **WHEN** a generation result is displayed in the current Agent, Canvas, Preview, or task UI before the user saves or promotes it
- **THEN** the system MUST expose it as a runtime/session projection with a stable draft reference and MUST NOT record a cache path as durable identity

### Requirement: Promoted generated assets are stored outside cache
The system SHALL store user-retained generated source assets in AssetStore, workspace/media-library files, or a generated asset store outside `.neko/.cache`.

#### Scenario: Generated result is sent to Canvas
- **WHEN** a user sends a generated image, video, audio, or storyboard result to Canvas
- **THEN** the system MUST promote or create a durable generated asset first and Canvas MUST receive a stable generated asset ref, AssetRef, ResourceRef, workspace-relative path, or `${VAR}/path`

#### Scenario: Generated result is used for export or package
- **WHEN** a generated output becomes an export input, package entry, entity binding, asset-library item, or project fact
- **THEN** the system MUST use a promoted generated asset source and MUST reject `.neko/.cache` paths as the source identity

### Requirement: Generated asset references are path-transparent
The system SHALL present generated assets to Agent, Webview, Canvas, Storyboard, Search, and other feature packages through stable refs and host projections rather than cache paths.

#### Scenario: Agent receives generated task completion
- **WHEN** a background media generation task completes
- **THEN** Agent backfill MUST contain stable generated asset refs or runtime draft refs and MUST NOT expose `.neko/.cache/generated`, `.neko/.cache/resources`, or system temp paths as persisted result URLs

#### Scenario: Webview renders generated media
- **WHEN** Webview displays a generated asset or generated draft
- **THEN** it MUST receive a current-session render URI or projection DTO and MUST NOT treat that URI as a portable source identity

### Requirement: Existing generated cache records fail closed for durable use
The system SHALL treat existing promoted generated records that point at `.neko/.cache` as migration candidates, not valid durable assets.

#### Scenario: Legacy generated cache path is loaded
- **WHEN** an existing conversation, storyboard, Canvas node, search result, or generated index record contains a generated asset marked promoted but its path is under `.neko/.cache`
- **THEN** the system MUST return a diagnostic requiring Promote/Create Asset or migration and MUST NOT silently use the cache path as a saved asset

#### Scenario: Legacy generated cache file still exists
- **WHEN** the cache file for a legacy generated record still exists on disk
- **THEN** the system MAY offer a migration or promote action using Host services but MUST NOT treat file existence as proof of durable ownership
