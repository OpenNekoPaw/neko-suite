# engine-preview-routing-foundation Specification

## Purpose
TBD - created by archiving change implement-engine-preview-routing-foundation. Update Purpose after archive.
## Requirements
### Requirement: CPU Preview Analysis Ownership
The engine SHALL locate no-GPU preview analysis logic in `runtime-media`.

#### Scenario: Projection analysis
- **WHEN** an image asset is registered for preview
- **THEN** GPANO detection and projection inference are performed through runtime-media logic

#### Scenario: Variant generation
- **WHEN** a thumbnail or proxy image variant is requested
- **THEN** CPU resize, HDR detection, and sidecar metadata logic are owned by runtime-media

### Requirement: Preview Provider Registry
The engine SHALL expose a provider registry for preview generation orchestration.

#### Scenario: Image provider request
- **WHEN** a preview request targets a supported image file
- **THEN** the registry routes it to an image provider that delegates CPU analysis to runtime-media

#### Scenario: Document provider request
- **WHEN** a preview request targets a supported document file
- **THEN** the registry routes it to a document provider or returns an unsupported preview error

### Requirement: Preview JSON Commands Use ActionRouter
The engine SHALL route preview JSON commands through the ActionRouter `previews` controller group.

#### Scenario: Asset registration through dispatch
- **WHEN** TS calls the preview asset registration API
- **THEN** `EngineClient` dispatches a `previews:register-asset` action instead of a direct preview HTTP JSON route

### Requirement: File Transport Routes Remain HTTP
The engine SHALL keep binary preview file serving as direct HTTP transport routes backed by the shared engine file access registry.

#### Scenario: Range file request
- **WHEN** a client requests `GET /v1/preview/file/:token`
- **THEN** host-http serves the file with Range support through the shared file access registry and does not route the binary response through ActionRouter

#### Scenario: General file route alias
- **WHEN** a client requests the equivalent general file access URL for the same token
- **THEN** host-http serves the same bytes and range metadata as the preview compatibility route

#### Scenario: EPUB entry request
- **WHEN** a client requests `GET /v1/preview/epub/:token/*path`
- **THEN** host-http serves the container entry through the shared file access registry

