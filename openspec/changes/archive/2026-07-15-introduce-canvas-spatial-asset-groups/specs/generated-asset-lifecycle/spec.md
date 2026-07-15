## MODIFIED Requirements

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

## ADDED Requirements

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

## REMOVED Requirements

### Requirement: Durable generated outputs use the canonical generated root

**Reason**: `neko/generated/<kind>/` is a second user-visible retention surface that can be mistaken for disposable output and deleted outside AssetLibrary lifecycle, while new Canvas retention now requires explicit AssetLibrary/AssetStore ownership.

**Migration**: Stop all new canonical producer writes to `neko/generated/<kind>/`. Keep existing files and references readable, offer explicit idempotent Asset import, and never delete, move, or rewrite valuable legacy data without creator confirmation and revision-checked migration.

#### Scenario: Existing generated result is referenced by Canvas

- **WHEN** a pre-change Canvas uses a valid source under `neko/generated/<kind>/`
- **THEN** the legacy source remains readable until the creator explicitly imports or migrates it
