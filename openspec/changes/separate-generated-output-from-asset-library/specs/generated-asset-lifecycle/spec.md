## MODIFIED Requirements

### Requirement: Generated asset references are path-transparent

The system SHALL present generated outputs to Agent, Webview, Canvas, Storyboard, Search, and other feature packages through stable resource refs and host projections rather than cache paths or implied AssetLibrary identity.

#### Scenario: Agent receives generated task completion

- **WHEN** a background media generation task completes before explicit AssetLibrary promotion
- **THEN** Agent backfill MUST contain a stable generated-output `ResourceRef` or runtime draft ref, MUST NOT expose `.neko/.cache/generated`, `.neko/.cache/resources`, or system temp paths as persisted result URLs, and MUST NOT label the generated-output id as an AssetLibrary asset id

#### Scenario: Webview renders generated media

- **WHEN** Webview displays a generated output or generated draft
- **THEN** it MUST receive a current-session render URI or projection DTO and MUST NOT treat that URI or generated-output id as a portable AssetLibrary identity

#### Scenario: Agent follows up on a generated image

- **WHEN** an Agent follow-up needs to inspect an unpromoted generated image
- **THEN** the system MUST provide the generated image `ResourceRef` for content access and MUST NOT route the generated-output id through AssetLibrary lookup

#### Scenario: Extension resolves a pathless generated image

- **WHEN** `ReadImage` or perception receives a generated lifecycle `ResourceRef` without a host path in the Extension Development Host
- **THEN** Extension content access MUST resolve the generated-output id through the existing workspace `GeneratedAssetIndex`, materialize it through ResourceCache, and MUST NOT require path metadata in the Agent-visible ref

## ADDED Requirements

### Requirement: AssetLibrary membership is explicit

The system SHALL treat generated-output records and AssetLibrary entities as separate identities until an explicit promotion or add-to-library operation succeeds.

#### Scenario: Generated output is not automatically listed as an asset

- **WHEN** media generation creates a generated-output file and generated-output index record
- **THEN** `ListAssets` MUST NOT include that output and `GetAsset` with the generated-output id MUST fail visibly

#### Scenario: Explicit promotion creates AssetLibrary identity

- **WHEN** the user or Agent explicitly promotes or adds a generated output to the AssetLibrary and the operation succeeds
- **THEN** the system MUST return an AssetLibrary entity id that `ListAssets` and `GetAsset` can resolve independently of the generated-output id

#### Scenario: Asset task result declares library identity

- **WHEN** a task result references an existing AssetLibrary entity
- **THEN** the producer MUST declare the identity through a typed `asset` result ref, `assetId`, or `assetIds` rather than relying on a generic presentation collection name
