# agent-content-access-residual-cleanup Specification

## Purpose
TBD - created by archiving change clean-agent-content-access-residuals. Update Purpose after archive.
## Requirements
### Requirement: Agent contracts hide cache and runtime identity

Agent, Agent-types, Platform, Webview presenter stable payloads, Canvas transfer payloads, Storyboard transfer payloads, composite artifacts, and TUI success output SHALL NOT expose cache paths, scratch paths, Webview URIs, blob/object URLs, Engine tokens, or local generated-output paths as durable identity.

#### Scenario: New result contains only stable resource identity

- **WHEN** an Agent media task, document tool, image tool, work item, or transfer payload completes successfully
- **THEN** the durable result SHALL use stable refs, source refs, generated asset refs, asset/entity IDs, user-selected saved output paths, or host-neutral render descriptors
- **AND** the durable result SHALL NOT require `cachePath`, `.neko/.cache`, `runtimePath`, `localPaths`, `webviewUri`, blob URL, object URL, scratch path, or Engine token

### Requirement: Legacy fields are migration-only diagnostics

Legacy fields that expose cache or runtime implementation details SHALL be accepted only by explicit migration, rejection, or diagnostic paths. New successful requests MUST fail closed or sanitize those fields before downstream handoff.

#### Scenario: Legacy cache field is provided to a new path

- **WHEN** a new Agent, Canvas, Storyboard, Webview presenter, composite, or TUI path receives `cachePath`, `runtimePath`, `cacheResourceRef`, `imagePaths`, `imageInfo.path`, `webviewUri`, blob URL, object URL, scratch path, or Engine token as resource identity
- **THEN** the path SHALL return a diagnostic, strip the field, or reject the request
- **AND** it SHALL NOT recover a successful result by reverse-looking up cache paths or by projecting raw local paths

### Requirement: Platform file document and media directories remain orchestration-only

`packages/neko-agent/packages/platform/src/files`, `document`, and `media` SHALL contain Agent platform domain contracts, DTOs, plans, parsing policy, request shaping, provider-independent task policy, and stable metadata only. They MUST NOT own binary/media source IO, resource cache layout, Webview URI projection, or Agent-visible local path identity.

#### Scenario: Platform media produces a delivery result

- **WHEN** Platform media code builds a task result or delivery plan
- **THEN** the result SHALL expose generated asset refs, resource refs, host-neutral render descriptors, stable metadata, and diagnostics
- **AND** any physical path used for persistence, indexing, projection, reveal, or open side effects SHALL remain Host-internal

### Requirement: Webview named runtime APIs are not canonical Agent runtime contracts

Agent runtime APIs SHALL use host-neutral event, turn, stream, task, and projection names. Webview message schemas SHALL be assembled by Extension/Webview adapter code, and any remaining Webview-named compatibility export MUST be tracked with replacement and removal criteria.

#### Scenario: Runtime stream is consumed by Webview

- **WHEN** Extension needs to send an Agent runtime stream update to a Webview
- **THEN** Extension SHALL adapt host-neutral runtime output into a Webview `postMessage` payload at the bridge boundary
- **AND** host-agnostic Agent runtime modules SHALL NOT require Webview-specific DTOs as their canonical output

### Requirement: Residual cleanup is path-level verified

Tests and boundary checks SHALL prove canonical content access, stable refs, host-neutral DTOs, and adapter-layer projection are used by default. Result-only tests MUST NOT pass through legacy fallback behavior.

#### Scenario: Legacy path is poisoned in tests

- **WHEN** a test covers a migrated Agent content, generated asset, projection, or transfer path
- **THEN** the test SHALL poison or spy on legacy cache/runtime/local path behavior where practical
- **AND** it SHALL assert that the canonical content-access, cache, Engine, stable ref, or adapter-layer projection path was used
