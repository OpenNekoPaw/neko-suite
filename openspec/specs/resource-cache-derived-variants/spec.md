# resource-cache-derived-variants Specification

## Purpose
TBD - created by archiving change separate-generated-assets-from-resource-cache. Update Purpose after archive.
## Requirements
### Requirement: ResourceCache stores only rebuildable derived variants
The system SHALL use ResourceCache only for artifacts that can be rebuilt from a stable source ref, locator, provider, and variant request.

#### Scenario: Document page image is cached
- **WHEN** a document page image is requested from a document source and locator
- **THEN** ResourceCache MAY store the materialized page image as a rebuildable variant and MUST keep the source document ref and locator as the durable identity

#### Scenario: Generated source asset is requested
- **WHEN** a generated source asset itself is requested for durable use
- **THEN** ResourceCache MUST NOT be the owner of that source asset and MUST route durable use through a generated asset or asset store identity

### Requirement: Generated derivatives may be cached
The system SHALL allow ResourceCache to store derivatives of a promoted generated source asset, including thumbnails, previews, proxies, and metadata, while keeping the promoted generated source outside cache.

#### Scenario: Thumbnail for generated asset
- **WHEN** Webview or Canvas requests a thumbnail for a promoted generated asset
- **THEN** ResourceCache MAY materialize a thumbnail variant keyed by the promoted source ref and thumbnail parameters

#### Scenario: Cache is cleared after generated asset promotion
- **WHEN** `.neko/.cache` is deleted after a generated asset has been promoted
- **THEN** the promoted generated source asset MUST remain available and generated derivatives MUST be rebuilt from the promoted source when requested

### Requirement: Cache metadata is a weak internal index
The system SHALL treat JSON manifests or SQLite cache tables as internal weak indexes that accelerate lookup, GC, lifecycle state, and diagnostics but never replace source identity.

#### Scenario: Cache metadata points to missing file
- **WHEN** ResourceCache metadata points to a missing materialized file
- **THEN** the system MUST mark or delete the stale entry and, when the request allows materialization, rebuild from the source ref and variant rather than exposing the stale path

#### Scenario: Cache metadata is unavailable
- **WHEN** the cache manifest or SQLite store is missing, corrupt, or stale
- **THEN** the system MUST treat it as a cache miss and MUST NOT surface manifest paths or cache paths to Agent, Webview, Canvas, Storyboard, or package payloads

### Requirement: Durable flows reject cache paths
The system SHALL reject cache paths for durable ingest, generated promotion, cross-domain transfer, package, and final export flows.

#### Scenario: Durable ingest returns cache output
- **WHEN** a create-asset, generated-output, import-source, register-existing-source, add, or link ingest result returns an output path under `.neko/.cache`
- **THEN** validation MUST report an error unless the mode is explicitly `cache-artifact`

#### Scenario: Draft proxy export is explicit
- **WHEN** an export intentionally uses a proxy or other derived media variant
- **THEN** the request MUST declare the draft/proxy quality mode and the result MUST record that a derived artifact was used
