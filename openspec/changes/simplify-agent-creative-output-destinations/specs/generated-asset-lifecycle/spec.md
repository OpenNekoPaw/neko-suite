## MODIFIED Requirements

### Requirement: Generated outputs are classified before storage
The system SHALL classify every generated binary output as provider scratch, creator-visible generated output, promoted generated asset, or generated derivative before exposing it outside the owning provider. A creator-visible generated output SHALL be atomically persisted under `neko/generated/<kind>/` and indexed with stable identity, revision/digest, media metadata, and generation lineage before terminal success is emitted.

#### Scenario: Provider scratch remains private
- **WHEN** a provider creates temporary files, failed intermediates, or duplicate retries while fulfilling a generation request
- **THEN** the system MUST keep those files out of `neko/generated/`, Agent durable results, Canvas nodes, package manifests, and project facts

#### Scenario: Creator-visible generated output completes
- **WHEN** a provider result passes owning validation and is selected for creator-visible task completion
- **THEN** the generated-output owner atomically materializes it under the appropriate `neko/generated/<kind>/` directory
- **THEN** terminal result exposes stable generated-output identity without exposing an absolute Host path

#### Scenario: Completion is replayed
- **WHEN** the same output identity and revision is committed more than once
- **THEN** the owner returns the existing indexed output
- **THEN** it does not overwrite another revision or create duplicate indistinguishable files

### Requirement: Promoted generated assets are stored outside cache
The system SHALL keep user-retained generated outputs outside `.neko/.cache`. Explicit AssetLibrary promotion SHALL create or idempotently return an AssetEntity distinct from generated-output identity; it MUST NOT be required for generated output reload or durable Board projection and MUST NOT silently delete the source under `neko/generated/<kind>/`.

#### Scenario: Generated result is projected to Canvas
- **WHEN** a valid creator-visible generated output is added to the Workspace Board Inbox
- **THEN** Canvas may persist its stable generated-output reference without first creating an AssetEntity

#### Scenario: Generated result is added to AssetLibrary
- **WHEN** a creator explicitly promotes or imports a generated output
- **THEN** AssetLibrary returns its own stable Asset identity according to Asset storage policy
- **THEN** generated-output and Asset identities remain distinguishable

#### Scenario: Generated result becomes a project/export input
- **WHEN** an owning project or export capability requires retained source content
- **THEN** it accepts a valid generated-output or Asset-owned stable reference according to its source policy
- **THEN** it rejects provider scratch, cache render URI, Webview URI, and unmanaged temporary paths

### Requirement: Generated asset references are path-transparent
The system SHALL present generated outputs and Asset-registered items to Agent, Webview, Canvas, Storyboard, Search, and other feature packages through stable refs and Host projections rather than absolute Host paths, cache paths, render URIs, or implied Asset identity. Durable Canvas data MAY retain the canonical generated-output reference and a validated workspace-portable locator allowed by Canvas source policy.

#### Scenario: Agent receives generated task completion
- **WHEN** a background media generation task completes
- **THEN** Agent backfill contains a stable generated-output `ResourceRef` and does not label its id as AssetLibrary identity
- **THEN** it does not expose `.neko/.cache`, system temp, or an absolute workspace path

#### Scenario: Webview renders generated media
- **WHEN** Webview displays a generated output or Asset-registered item
- **THEN** it receives a current Host-projected render URI
- **THEN** that runtime URI is not persisted as source identity

#### Scenario: Workspace Board reloads generated content
- **WHEN** `workspace.nkc` is reopened with a valid generated-output reference
- **THEN** Canvas resolves it through generated-output content access or returns a fail-visible unavailable diagnostic
- **THEN** it does not require Asset promotion or filename-similarity lookup

## ADDED Requirements

### Requirement: Workspace generated sources remain protected and explicitly managed
The system SHALL preserve valid sources under `neko/generated/<kind>/` as creator-owned workspace outputs. New producers SHALL use the canonical generated-output owner and MUST NOT write unindexed files directly into that directory. Importing into AssetLibrary or deleting generated output SHALL be explicit, idempotent, and reference-aware.

#### Scenario: Existing generated source is indexed
- **WHEN** a valid existing source under `neko/generated/<kind>/` is adopted by the canonical generated-output owner
- **THEN** the owner creates or returns stable generated-output metadata without moving or deleting the source

#### Scenario: Generated source is missing
- **WHEN** an indexed generated-output reference points to a missing file
- **THEN** the system reports an unavailable/relink diagnostic
- **THEN** it does not fall back to cache, another same-named file, or AssetLibrary similarity

#### Scenario: Creator deletes referenced generated output
- **WHEN** a creator requests deletion of a generated output still referenced by Canvas or another project
- **THEN** the generated-output owner requires explicit reference-aware confirmation or refuses the deletion
- **THEN** Canvas deletion alone cannot remove the file

## REMOVED Requirements

### Requirement: Legacy generated sources remain protected and explicitly importable
**Reason**: `neko/generated/<kind>/` changes from a legacy read-only source location to the canonical creator-visible generated-output location.
**Migration**: Preserve existing files in place, adopt resolvable files through the generated-output owner, and use the new workspace generated-source requirement for all new writes.
