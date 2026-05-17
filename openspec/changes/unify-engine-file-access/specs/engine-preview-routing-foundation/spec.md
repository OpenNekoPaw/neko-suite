## MODIFIED Requirements

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
