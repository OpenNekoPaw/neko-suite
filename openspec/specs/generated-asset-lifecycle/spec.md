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

The system SHALL present generated candidates, Board-retained outputs, and Asset-registered items to Agent, Webview, Canvas, Storyboard, Search, and other feature packages through stable refs and host projections rather than cache paths.

#### Scenario: Agent receives generated task completion

- **WHEN** a background media generation task completes
- **THEN** Agent backfill MUST contain stable generated-output/resource refs or runtime draft refs and MUST NOT expose `.neko/.cache/generated`, `.neko/.cache/resources`, or system temp paths as persisted result URLs

#### Scenario: Webview renders generated media

- **WHEN** Webview displays a generated candidate, Board-retained output, or Asset-registered item
- **THEN** it MUST receive a current-session render URI or projection DTO and MUST NOT treat that URI as a portable source identity

#### Scenario: Board Canvas reloads retained output

- **WHEN** a Board Canvas is reopened after application restart
- **THEN** its generated media reference MUST resolve through the owning generated-output projection or return a fail-visible unavailable diagnostic without using a stale render URI

### Requirement: Existing generated cache records fail closed for durable use

The system SHALL treat existing durable or Board-retained generated records that point at `.neko/.cache` as migration/recovery candidates, not valid durable outputs.

#### Scenario: Legacy generated cache path is loaded

- **WHEN** an existing conversation, Board Canvas, storyboard, Canvas node, search result, or generated index record claims durable retention but its path is under `.neko/.cache`
- **THEN** the system MUST return a diagnostic requiring recovery, retain, Asset registration, or migration and MUST NOT silently use the cache path as saved content

#### Scenario: Legacy generated cache file still exists

- **WHEN** the cache file for a legacy generated record still exists on disk
- **THEN** the system MAY offer a recovery, retain, or Asset registration action using Host services but MUST NOT treat file existence as proof of durable ownership

### Requirement: Durable generated outputs use the canonical generated root

The system SHALL store Board-Canvas-retained generated outputs under the existing `neko/generated/<kind>/` root and MUST NOT introduce a root-level `generated/`, `.neko/generated/`, or Board-local generated media store. Asset Library membership and professional-project usage SHALL remain independent explicit relationships over stable sources.

#### Scenario: Generated result is written to Canvas

- **WHEN** a retained image, video, audio, or storyboard result is referenced by any Canvas
- **THEN** Canvas MUST receive a stable generated-output ref, AssetRef, ResourceRef, workspace-relative path, or `${VAR}/path`

#### Scenario: Generated result is used for export or package

- **WHEN** a generated output becomes an export input, package entry, entity binding, asset-library item, or project fact
- **THEN** the system MUST use a durable generated source and MUST reject `.neko/.cache` paths as the source identity

#### Scenario: Professional project uses generated source without cataloging it

- **WHEN** Canvas, Cut, Audio, or another owning professional domain accepts a stable source from `neko/generated/<kind>/`
- **THEN** the professional document records that usage without requiring or implying Asset Library membership

#### Scenario: Generated source is registered in Asset Library

- **WHEN** the user explicitly adds a generated source to Asset Library
- **THEN** the Asset owner creates a curated catalog record and MUST NOT imply that the asset is currently used by a professional document or move/copy bytes unless its explicit ingest policy requires it

#### Scenario: Board retention is removed

- **WHEN** the last Canvas/project reference to a retained output that is not Asset-registered is removed
- **THEN** the system MUST keep or delete the source only according to explicit retention/reference-aware cleanup policy and MUST NOT silently delete valuable user data
