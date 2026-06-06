# agent-storyboard-table-contract Specification

## Purpose
Define the shared semantic contract for Agent-generated storyboard tables, storyboard diagnostics, media references, and projection to creative surfaces.
## Requirements
### Requirement: Agent storyboard tables use a shared semantic contract
The system SHALL define `StoryboardTable` and related scene, shot, character, media ref, profile, extension, and diagnostic contracts in `@neko/shared`. The contract MUST represent Agent-generated storyboard tables as semantic shot plans rather than Webview-only display sections. The serialized payload MUST retain `schemaVersion` for compatibility checks.

#### Scenario: Valid semantic storyboard table is accepted
- **WHEN** Agent receives a `storyboard-table` composite block containing `schemaVersion: 1`, `kind: "storyboard-table"`, a title, scenes, and shots with stable-core fields
- **THEN** the system validates it as `StoryboardTable` and makes it available for rich rendering and downstream projection

#### Scenario: Semantic contract is shared across packages
- **WHEN** Canvas/Cut projectors consume an Agent-generated storyboard table
- **THEN** they depend on `@neko/shared` storyboard contracts rather than `@neko-agent/types` Webview display types

### Requirement: Stable core fields define projection-blocking validation
The system SHALL define formal required field constants for table, scene, and shot stable-core fields. The validator MUST use these constants as the single source of truth for `error` diagnostics caused by missing projection-blocking fields.

#### Scenario: Missing stable-core shot field blocks projection
- **WHEN** a shot lacks `visualDescription`, `duration`, `characterAction`, or `imageStrategy`
- **THEN** validation emits an `error` diagnostic and the system does not expose Send-to Canvas/Cut actions for that storyboard table

#### Scenario: Missing profile recommendation does not block projection
- **WHEN** a `script-breakdown` storyboard lacks `cameraAngle` but has all stable-core fields
- **THEN** validation emits a non-blocking `profileHint` or `suggestion` and the storyboard remains renderable and projectable

### Requirement: Storyboard validation reports graded diagnostics
The system SHALL report storyboard validation diagnostics with severity `error`, `warning`, `suggestion`, or `profileHint`. Only `error` diagnostics MUST block downstream projection and strategy execution.

#### Scenario: Unsafe media reference is an error
- **WHEN** a storyboard media ref contains inline base64, a blob URL, a localhost runtime URL, an absolute local path, or a fake unresolved tool result reference
- **THEN** validation emits an `error` diagnostic and the invalid ref is not used for projection

#### Scenario: Quality issue is warning only
- **WHEN** a shot is valid but has inconsistent optional camera metadata
- **THEN** validation emits a `warning` and still permits rich rendering and projection

### Requirement: Profiles and extensions preserve LLM flexibility
The system SHALL support built-in `StoryboardTableProfile` values for common workflows and SHALL allow JSON-serializable `neko.*` namespaced extensions for profile-specific semantics. Unknown valid extensions MUST NOT break stable-core projection.

#### Scenario: Manga profile carries namespaced extension data
- **WHEN** a `manga-to-video` storyboard shot includes `extensions["neko.mangaToVideo"]` with panel and motion metadata
- **THEN** the normalizer preserves the extension and projectors continue using stable-core fields

#### Scenario: Non-serializable extension is rejected
- **WHEN** an extension value cannot be represented as JSON-serializable data
- **THEN** validation emits an `error` diagnostic because the storyboard cannot be safely transported or persisted

### Requirement: Media references use layered stable refs
The system SHALL represent storyboard media through `StoryboardMediaRef` locators and role metadata. Media refs MUST NOT persist webview URIs, blob URLs, inline base64, runtime-only URLs, or absolute local paths.

#### Scenario: Tool result media ref is valid
- **WHEN** a media ref uses locator type `tool-result` with a `toolCallId` and `assetIndex`
- **THEN** Webview presentation can resolve the ref through tool results and host-projected render URIs without persisting those render URIs in the storyboard table

#### Scenario: Source and generated refs remain consistent
- **WHEN** a ref appears in `sourceMediaRefs`
- **THEN** its role is limited to source-compatible roles and validation rejects generated-only roles in that collection

### Requirement: Legacy media refs normalize into layered refs
The system SHALL support migration from legacy `mediaRefs` into `sourceMediaRefs` and `generatedMediaRefs` by using media ref roles when enough information is available. Normalization MUST retain display aggregation without treating legacy output as authoritative v1 authoring.

#### Scenario: Legacy media refs are split by role
- **WHEN** a storyboard table includes legacy `mediaRefs` but omits layered source/generated refs
- **THEN** the normalizer splits refs into source or generated collections according to role and preserves an aggregate display ref list

#### Scenario: Ambiguous legacy media refs produce diagnostics
- **WHEN** a legacy media ref cannot be safely categorized
- **THEN** the normalizer preserves renderable display behavior when possible and emits a warning or suggestion rather than silently changing semantics

### Requirement: Storyboard image strategy is interpreted by runtime
The system SHALL interpret shot-level `imageStrategy` values in runtime after validation. Strategy interpretation MUST produce explicit executable actions, blocked actions, reuse decisions, or diagnostics and MUST NOT rely on LLM text claims that media has already been generated.

#### Scenario: Reuse original does not call generation
- **WHEN** a shot uses `imageStrategy: "reuse-original"` and valid source media refs exist
- **THEN** runtime does not call image generation and renders or projects the source refs as the shot visual inputs

#### Scenario: Generate new routes through provider
- **WHEN** a shot uses `imageStrategy: "generate-new"` with a generation prompt and generation is allowed
- **THEN** runtime routes a generation request through available provider capability and records generated refs only after completion backfill

#### Scenario: Provider unavailable yields diagnostic
- **WHEN** a shot requires generation or transformation but no provider capability is available
- **THEN** runtime emits a missing-capability diagnostic, keeps the validated storyboard plan, and does not create fake generated refs

### Requirement: User override controls strategy execution
The system SHALL accept normalized user override input for strategy execution. Override policy MUST be applied before provider calls and MUST be traceable to chat instruction, Webview confirmation, or workspace setting.

#### Scenario: User denies generation
- **WHEN** user override has `generationPolicy: "deny"` and a shot requests `generate-new`
- **THEN** runtime blocks the generation action, emits a diagnostic, and keeps the shot plan unchanged

#### Scenario: Confirmation is required
- **WHEN** user override has `generationPolicy: "confirm"`
- **THEN** runtime does not execute generation or transform actions until a confirmation result is provided

### Requirement: Storyboard generated media backfills into stable refs
The system SHALL update storyboard semantic refs only after provider/tool completion. Backfill MUST use stable tool result refs or asset refs and MUST NOT insert webview URLs or fake paths.

#### Scenario: Completed generation backfills shot refs
- **WHEN** an image generation task completes for a shot
- **THEN** runtime records the generated output as `generatedMediaRefs` or equivalent storyboard-level patch using stable refs

#### Scenario: Failed generation keeps plan visible
- **WHEN** a generation task fails
- **THEN** runtime leaves the storyboard plan visible, records a failure diagnostic, and does not mark the shot as having generated media

### Requirement: Storyboard tables project to Canvas and Cut from validated semantics
The system SHALL project `StoryboardTable` to `CanvasStoryboardPayload` and `PluginTransferCutStoryboardPayload` using validated semantic scenes and shots. Projectors MUST preserve scene order, shot order, duration, shot text, prompt metadata, dialogue, voice-over, sound cues, and safe media references where supported.

#### Scenario: Canvas projection preserves shot semantics
- **WHEN** a valid storyboard table is sent to Canvas
- **THEN** Canvas receives a `CanvasStoryboardPayload` whose scenes and shot plans reflect the semantic table rather than inferred Webview row text

#### Scenario: Cut projection preserves media-backed shots
- **WHEN** a valid storyboard table with resolved image refs is sent to Cut
- **THEN** Cut receives a storyboard timeline payload with ordered image shots and relevant dialogue, voice-over, or sound cue metadata

### Requirement: Provider absence degrades without disabling Agent planning
The system SHALL allow Agent to generate, validate, and display storyboard plans even when Canvas, Cut, image generation, transform, audio, or model providers are unavailable. Missing providers MUST disable or hide executable actions and show diagnostics rather than failing the whole Agent response.

#### Scenario: Canvas unavailable keeps plan visible
- **WHEN** a valid storyboard table is rendered and the Canvas extension is unavailable
- **THEN** the Agent Webview displays the storyboard and a missing Canvas capability diagnostic without showing an executable Send-to Canvas action

#### Scenario: Image generation unavailable keeps plan visible
- **WHEN** a storyboard requires new images and no image provider is available
- **THEN** the storyboard remains visible with missing provider diagnostics and no generated media refs are fabricated
