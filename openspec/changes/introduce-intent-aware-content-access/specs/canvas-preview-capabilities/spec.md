## ADDED Requirements

### Requirement: Canvas preview resolution uses preview intent
The system SHALL resolve Canvas node, card, storyboard, and media preview visuals through an intent-aware preview request rather than durable cache paths or package/export source paths.

#### Scenario: Shot reference preview uses resource ref
- **WHEN** a Shot node has a reference image resource reference
- **THEN** Canvas requests `interactive-preview` content for the relevant preview role
- **THEN** the runtime preview uses a projected URI or safe inline URL without persisting the resolved runtime path

#### Scenario: Missing preview resource does not reuse previous thumbnail
- **WHEN** a Canvas preview request cannot resolve or materialize the requested resource
- **THEN** Canvas displays an explicit unavailable state
- **THEN** it does not reuse the previous sequential thumbnail or another shot's cached image

### Requirement: Canvas preview data remains separate from offline source data
The system SHALL keep Canvas preview descriptors and runtime preview URLs separate from source references used by export, package, and verification operations.

#### Scenario: Canvas save omits cache path
- **WHEN** a Canvas file is saved after a preview has resolved through the resource cache
- **THEN** the saved node data contains stable refs and selected state
- **THEN** it does not contain `cachePath`, Webview URI, object URL, blob URL, preview token, or runtime reference image path as durable data

#### Scenario: Canvas export asks for source intent
- **WHEN** a Canvas-driven export or package operation needs a node's media content
- **THEN** it requests `final-export` or `package` content from the host
- **THEN** it does not reuse the card preview URI or thumbnail path as export input
