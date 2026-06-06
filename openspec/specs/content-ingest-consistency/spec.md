# content-ingest-consistency Specification

## Purpose
Define host-owned durable content ingest boundaries for imported files, generated media, cache delegation, and export staging.
## Requirements
### Requirement: Durable content writes use an ingest boundary
The system SHALL create durable source references for imported files, registered existing sources, generated media, and staged export outputs through a host-owned content ingest/write boundary rather than by persisting private cache paths or runtime URLs.

#### Scenario: Imported file returns a stable source ref
- **WHEN** Canvas, Agent, Assets, or Dashboard imports an external image, document, model, audio, or video file into a project
- **THEN** the import request goes through the content ingest boundary with an explicit destination policy
- **THEN** the result contains a stable source ref or asset ref suitable for durable project data
- **THEN** the result does not use a `cachePath`, Webview URI, blob URL, object URL, or extension-private absolute path as source identity

#### Scenario: Existing source path is contracted before persistence
- **WHEN** a user registers an existing workspace, media-library, or variable-path source without copying it
- **THEN** the ingest boundary validates the source and contracts the path through the shared path resolver where possible
- **THEN** durable records store a workspace-relative path, `${VAR}/path`, or stable media-library ref instead of an arbitrary absolute path

### Requirement: Generated media is promoted before cross-surface use
The system SHALL promote generated media that is intended for Canvas, export, package, or long-lived Agent artifacts into a durable source scope before exposing it as a stable ref.

#### Scenario: Agent generated image sent to Canvas
- **WHEN** Agent generates an image and sends it to Canvas as a storyboard or node reference
- **THEN** Agent or the host first ingests the image as generated media with source metadata
- **THEN** Canvas receives a stable ref plus preview role metadata
- **THEN** Canvas does not receive an Agent private cache path as the durable image reference

#### Scenario: Scratch output is not packaged as source
- **WHEN** generated media remains in scratch or extension-private storage and has not been promoted
- **THEN** a package or final export request reports missing-source, non-portable, or unrecoverable
- **THEN** it does not silently include the scratch cache artifact as an original asset

### Requirement: Cache artifacts are delegated to the resource cache service
The system SHALL treat derived thumbnails, document page images, preview variants, decompressed preview entries, proxy artifacts, and bounded Agent media as cache artifacts managed by the resource cache service.

#### Scenario: Ingest request prewarms preview cache
- **WHEN** an imported or generated source requests preview prewarming
- **THEN** the ingest result may include cache prewarm hints or call the resource cache service
- **THEN** the durable source ref remains separate from any cache artifact path

#### Scenario: Cache artifact write is not a project source write
- **WHEN** a provider writes a thumbnail, preview image, decompressed page image, or proxy file
- **THEN** it writes through or registers with the resource cache service
- **THEN** it does not create a project source ref for the derived artifact unless the user explicitly promotes that artifact as new source content

### Requirement: Export staging is separate from cache and source identity
The system SHALL stage export and package outputs as operation outputs without treating those files as cache artifacts or source identity unless the user explicitly imports the output back into the project.

#### Scenario: Export output is not reused as source automatically
- **WHEN** a final export writes an output file
- **THEN** the output is recorded as an export artifact or staged output
- **THEN** project source refs are not rewritten to point at the exported file automatically

#### Scenario: Export output can be imported explicitly
- **WHEN** the user chooses to import an export result back into the project
- **THEN** that file is processed through the same ingest boundary as other external sources
- **THEN** the resulting durable source ref is independent from the previous export operation record
