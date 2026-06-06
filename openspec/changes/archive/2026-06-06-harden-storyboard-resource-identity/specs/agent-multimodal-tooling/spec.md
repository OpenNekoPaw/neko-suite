## ADDED Requirements

### Requirement: Multimodal image tool results separate stable refs and runtime handles
Agent multimodal image and document tools SHALL distinguish stable media references from runtime preview or read handles in their result payloads.

#### Scenario: ReadDocument returns document image metadata
- **WHEN** `ReadDocument` returns image metadata for a document page or archive entry
- **THEN** the result includes source, locator, and stable resource reference metadata when available
- **THEN** any local path is marked or treated as a runtime handle for preview or model input, not as durable Canvas identity

#### Scenario: ReadImage receives managed cache path
- **WHEN** `ReadImage` receives a local path that belongs to the managed resource cache
- **THEN** it restores the associated stable resource reference from the cache index when possible
- **THEN** subsequent storyboard transfer can use that reference instead of the path

### Requirement: Document image scratch cache is not cross-package identity
Agent SHALL NOT expose `document-image-cache` paths as the identity channel for project-bound document images sent to Canvas, Preview, package, or export flows.

#### Scenario: Project-bound document image is sent to Canvas
- **WHEN** a document image is used in a project-bound storyboard transfer
- **THEN** Agent ensures or records a project resource cache reference for the image
- **THEN** the transfer does not require another package to authorize Agent's scratch cache root

#### Scenario: No-workspace scratch image remains non-portable
- **WHEN** Agent reads a document image without a workspace and the image exists only in extension-private scratch
- **THEN** cross-package transfer reports non-portable or requires promotion/materialization into an approved scope
- **THEN** the scratch path is not treated as a durable source reference

### Requirement: Built-in storyboard skills require real media refs
Built-in storyboard and manga conversion skills SHALL instruct models to reference only real tool results or stable resource refs for source images and SHALL NOT instruct models to copy cache paths into Canvas-facing fields.

#### Scenario: Manga skill prepares StoryboardTableV1
- **WHEN** the manga storyboard skill produces a structured payload from tool-read pages
- **THEN** each image-backed shot uses `sourceMediaRefs` with a real tool-result locator
- **THEN** readable fields such as `sourcePage` remain aliases rather than identity
