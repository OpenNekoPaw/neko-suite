## ADDED Requirements

### Requirement: Puppet Source Reference Loading
The engine SHALL support loading puppet sources from engine-resolved file references without requiring Extension or Webview code to forward `.inp` bytes as base64.

#### Scenario: Load puppet from token source
- **WHEN** a client calls the puppet load-source action with a registered file token
- **THEN** the engine resolves the token and loads the `.inp` data inside the engine process

#### Scenario: Legacy byte load remains compatible
- **WHEN** an existing client calls the legacy puppet byte-load action during migration
- **THEN** the engine continues to accept the request until the compatibility path is removed by a later change

#### Scenario: Webview does not receive puppet binary
- **WHEN** a puppet file is opened after source-reference loading is available
- **THEN** the Extension sends engine connection/source metadata rather than base64 puppet binary data to the Webview
