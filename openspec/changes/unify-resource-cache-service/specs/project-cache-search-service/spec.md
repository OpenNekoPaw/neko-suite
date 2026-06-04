## ADDED Requirements

### Requirement: Search Results Reference Cache-Backed Visuals Through Resource Refs
The system SHALL expose cache-backed thumbnails, document previews, generated asset previews, and media preview visuals in search results through stable resource references or host-projected display URIs rather than package-local cache file paths.

#### Scenario: Search result includes resource ref for thumbnail
- **WHEN** a project search provider returns a media, document, generated asset, or asset-library item with a cache-backed thumbnail
- **THEN** the returned search item includes a stable resource reference or host-projected thumbnail field without exposing package-local cache schema details

#### Scenario: Webview receives projected visual
- **WHEN** a Webview renders a project search result that has a cache-backed visual
- **THEN** the owning Extension Host resolves or projects the visual through the resource cache service before sending display data to the Webview

#### Scenario: Missing thumbnail reports status
- **WHEN** a search result visual resource is missing from cache
- **THEN** the search or host projection layer reports missing, stale, or materializing status instead of returning an unrelated local path

### Requirement: Search Consumers Do Not Read Resource Cache Files Directly
Search consumers SHALL use the project search service, resource cache service, or host-mediated projections to access cache-backed visuals and SHALL NOT read `.neko/.cache/resources/` manifests or package-local cache files directly.

#### Scenario: Agent mention result uses host adapter
- **WHEN** Agent mention completion displays a thumbnail or document preview for a search result
- **THEN** Agent uses a host adapter to obtain a projected resource visual rather than reading resource cache manifest files or thumbnail directories itself

#### Scenario: Dashboard search result avoids cache schema dependency
- **WHEN** Dashboard or another Webview displays global project search results
- **THEN** it receives search DTOs and host-projected visuals without importing resource cache manifest schemas or local filesystem paths as its data source

#### Scenario: Cache implementation can change
- **WHEN** the resource cache implementation moves from JSON manifest to SQLite cache index
- **THEN** project search consumers continue to work because they depend on shared resource refs and host APIs rather than cache file schemas
