## MODIFIED Requirements

### Requirement: Agent storyboard tables use a shared semantic contract
The system SHALL define `StoryboardTable` and related scene, shot, character, media ref, profile, extension, and diagnostic contracts in `@neko/shared`. The contract MUST represent Agent-generated storyboard tables as semantic shot plans rather than Webview-only display sections. The serialized payload MUST retain `schemaVersion` for compatibility checks.

#### Scenario: Valid semantic storyboard table is accepted
- **WHEN** Agent receives a `storyboard-table` composite block containing `schemaVersion: 1`, `kind: "storyboard-table"`, a title, scenes, and shots with stable-core fields
- **THEN** the system validates it as `StoryboardTable` and makes it available for rich rendering and downstream projection

#### Scenario: Semantic contract is shared across packages
- **WHEN** Canvas/Cut projectors consume an Agent-generated storyboard table
- **THEN** they depend on `@neko/shared` storyboard contracts rather than `@neko-agent/types` Webview display types

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

### Requirement: Storyboard tables project to Canvas and Cut from validated semantics
The system SHALL project `StoryboardTable` to `CanvasStoryboardPayload` and `PluginTransferCutStoryboardPayload` using validated semantic scenes and shots. Projectors MUST preserve scene order, shot order, duration, shot text, prompt metadata, dialogue, voice-over, sound cues, and safe media references where supported.

#### Scenario: Canvas projection preserves shot semantics
- **WHEN** a valid storyboard table is sent to Canvas
- **THEN** Canvas receives a `CanvasStoryboardPayload` whose scenes and shot plans reflect the semantic table rather than inferred Webview row text

#### Scenario: Cut projection preserves media-backed shots
- **WHEN** a valid storyboard table with resolved image refs is sent to Cut
- **THEN** Cut receives a storyboard timeline payload with ordered image shots and relevant dialogue, voice-over, or sound cue metadata
