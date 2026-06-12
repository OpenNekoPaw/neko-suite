## ADDED Requirements

### Requirement: Narrative asset access uses explicit content intents
The system SHALL resolve narrative asset references through the host-owned content access boundary with explicit operation intents. Narrative Preview MUST request `interactive-preview` content; HTML5 export MUST request `final-export` content for export inputs; bundle/package operations MUST request `package` content.

#### Scenario: Interactive Preview requests projected resources
- **WHEN** Narrative Preview needs a background image, character portrait, audio clip, or video clip
- **THEN** it resolves the asset through `NarrativeAssetResolver` using the `interactive-preview` intent
- **THEN** the result may be a projected Webview URI or safe preview variant that remains runtime-only

#### Scenario: Export does not reuse Preview URI
- **WHEN** an interactive narrative is exported after assets were previewed in a Webview
- **THEN** the exporter resolves those assets again using `final-export` or `package` intent
- **THEN** it does not use a previously resolved Webview URI, object URL, blob URL, preview token, or engine runtime token as export source

### Requirement: Narrative relative paths are normalized before durable use
The system SHALL accept project-relative narrative asset shorthand from authoring metadata such as `characters.yaml`, but MUST normalize durable Canvas metadata and export/package manifests to `NarrativeAssetRef` values that are either `ResourceRef` records or explicit project-relative path refs. Absolute local paths MUST NOT become durable narrative asset identity.

#### Scenario: Characters YAML shorthand becomes asset ref
- **WHEN** `characters.yaml` declares a portrait path such as `assets/characters/hero/default.png`
- **THEN** the narrative asset layer treats it as a project-relative `NarrativeAssetRef`
- **THEN** Preview and export resolve it through content access rather than storing an absolute path or runtime URL

#### Scenario: Absolute path is reported as non-portable
- **WHEN** a narrative asset field contains an absolute local filesystem path as durable metadata
- **THEN** validation or content access returns a non-portable status with remediation
- **THEN** package and final export do not silently include the absolute path as durable project identity
