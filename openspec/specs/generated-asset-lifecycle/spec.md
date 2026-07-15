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

The system SHALL store user-retained generated source assets through AssetLibrary/AssetStore ownership outside `.neko/.cache`. A successful promotion MUST create or idempotently return AssetLibrary identity and MUST NOT create a new Canvas-retained source under `neko/generated/<kind>/`.

#### Scenario: Generated result is saved from Canvas

- **WHEN** a user saves a generated image, video, audio, or storyboard candidate from a Canvas runtime Group
- **THEN** the system MUST promote or create a durable Asset first and Canvas MUST receive a stable Asset identity/source ref before writing a durable node

#### Scenario: Generated result is used for export or package

- **WHEN** a new generated output becomes an export input, package entry, entity binding, or project fact
- **THEN** the system MUST use its promoted Asset source and MUST reject `.neko/.cache`, runtime render, and new `neko/generated/<kind>/` output paths as the source identity

### Requirement: Generated asset references are path-transparent

The system SHALL present unpromoted generated candidates and Asset-registered items to Agent, Webview, Canvas, Storyboard, Search, and other feature packages through stable refs and Host projections rather than cache paths, render URIs, or implied Asset identity.

#### Scenario: Agent receives generated task completion

- **WHEN** a background media generation task completes before explicit Asset promotion
- **THEN** Agent backfill MUST contain a stable generated-output `ResourceRef` or runtime draft ref, MUST NOT expose `.neko/.cache/generated`, `.neko/.cache/resources`, system temp, or `neko/generated/<kind>/` as a new persisted result URL, and MUST NOT label the generated-output id as AssetLibrary identity

#### Scenario: Webview renders generated media

- **WHEN** Webview displays an unpromoted generated candidate or Asset-registered item
- **THEN** it MUST receive a current-session render URI or projection DTO and MUST NOT treat that runtime value as a portable source identity

#### Scenario: Board Canvas reloads saved generated content

- **WHEN** a Board Canvas is reopened after generated candidates were saved and authored
- **THEN** its media nodes MUST resolve through stable Asset identity/source refs or return a fail-visible unavailable diagnostic without using a stale render URI or unpromoted generated-output identity

### Requirement: Existing generated cache records fail closed for durable use

The system SHALL treat existing durable or Board-retained generated records that point at `.neko/.cache` as migration/recovery candidates, not valid durable outputs.

#### Scenario: Legacy generated cache path is loaded

- **WHEN** an existing conversation, Board Canvas, storyboard, Canvas node, search result, or generated index record claims durable retention but its path is under `.neko/.cache`
- **THEN** the system MUST return a diagnostic requiring recovery, retain, Asset registration, or migration and MUST NOT silently use the cache path as saved content

#### Scenario: Legacy generated cache file still exists

- **WHEN** the cache file for a legacy generated record still exists on disk
- **THEN** the system MAY offer a recovery, retain, or Asset registration action using Host services but MUST NOT treat file existence as proof of durable ownership

### Requirement: Legacy generated sources remain protected and explicitly importable

The system SHALL preserve existing valuable sources and Canvas references under `neko/generated/<kind>/` as readable legacy durable inputs while preventing new generated-retention producers from writing there. Importing a legacy source into AssetLibrary MUST be explicit, idempotent, and MUST NOT delete or silently move the legacy file.

#### Scenario: Existing Board references a legacy generated source

- **WHEN** a valid existing Canvas references an available file under `neko/generated/<kind>/`
- **THEN** Canvas MUST continue to resolve it as a legacy durable source and MAY offer Save/Import to Assets without rewriting the Canvas automatically

#### Scenario: New generation completes

- **WHEN** a new image, audio, video, or storyboard candidate completes after this change
- **THEN** no canonical retention producer may create its durable source under `neko/generated/<kind>/`

#### Scenario: Legacy generated source is missing

- **WHEN** an existing legacy Canvas reference points to a missing generated source
- **THEN** the system MUST show a relink/import/unavailable diagnostic and MUST NOT fall back to cache or filename similarity
