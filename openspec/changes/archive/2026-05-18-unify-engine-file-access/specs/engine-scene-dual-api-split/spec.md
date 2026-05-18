## ADDED Requirements

### Requirement: Scene Source Reference Loading
The engine SHALL support loading scene/model sources from engine-resolved file references while preserving existing path-based scene load behavior during migration.

#### Scenario: Load model from token source
- **WHEN** a client calls scene load with a registered file token
- **THEN** the engine resolves the token and loads the model from the canonical local file path

#### Scenario: Legacy model source path
- **WHEN** an existing client calls scene load with a legacy source path
- **THEN** the engine preserves the existing load behavior

### Requirement: Engine-Managed Model Resource URLs
The engine SHALL provide token-scoped resource URLs or manifests for model resources that Webview renderers need to fetch directly.

#### Scenario: Webview needs glTF resource
- **WHEN** a Webview renderer needs an external model resource such as a texture or buffer
- **THEN** it receives an engine-managed URL or manifest entry instead of relying on an untracked local absolute path

#### Scenario: Model resource outside allowed root
- **WHEN** a model references an external resource outside the registered source's allowed boundary
- **THEN** the engine rejects or omits that resource from the manifest
