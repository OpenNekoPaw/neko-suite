## ADDED Requirements

### Requirement: Engine file access receives source-intent inputs
The system SHALL register engine file tokens for export, package, verify, byte-range, and container-entry operations from source-intent resolution rather than cache projection outputs.

#### Scenario: Export engine token comes from source
- **WHEN** a final export registers a local media file with engine file access
- **THEN** the file path comes from source-intent content resolution
- **THEN** it is not a Webview URI, preview cache path, thumbnail path, or proxy path unless explicit draft/proxy mode is requested

#### Scenario: Container entry read uses original token
- **WHEN** a package operation requests an EPUB or CBZ entry through engine file access
- **THEN** the token references the original container file
- **THEN** the entry read returns bytes from that original container

### Requirement: Engine runtime tokens are not durable content refs
The system SHALL treat engine file tokens, stream identifiers, range URLs, and preview token URLs as runtime access handles that cannot be stored as durable source identity.

#### Scenario: Project save omits engine token
- **WHEN** a source read or preview operation registers an engine token
- **THEN** persisted project, Canvas, Agent, or package metadata stores the stable source ref instead of the token

#### Scenario: Offline operation cannot start from expired token alone
- **WHEN** a final export or package operation is resumed with only an expired engine token and no source ref
- **THEN** the operation reports missing-source
- **THEN** it does not infer the source from cache or token URL text
