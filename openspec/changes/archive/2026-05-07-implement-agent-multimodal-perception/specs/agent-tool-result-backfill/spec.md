## ADDED Requirements

### Requirement: Tool result backfill uses a shared payload contract
The system SHALL define a shared `ToolResultBackfillPayload` contract that identifies the original tool call and carries a timestamp, data patch, optional attachments, optional `perceptionCards`, merge policy, and diagnostics. The payload MUST be host-agnostic and MUST NOT contain webview URI, `file://` URI, inline base64 payload, or persisted absolute path values.

#### Scenario: Completed media task emits a host-agnostic backfill payload
- **WHEN** a background image generation task completes with an output asset
- **THEN** the emitted backfill payload references the original tool call id and carries stable asset references plus metadata without host-specific URI payloads

#### Scenario: Backfill payload includes perception cards
- **WHEN** perception completes for an output asset
- **THEN** the backfill payload contains `perceptionCards` as an array linked to the output asset id

### Requirement: Backfill merge preserves existing tool result fields by default
The system SHALL merge `dataPatch` into the existing tool result with shallow merge semantics. The merge MUST preserve existing keys unless the key appears in `mergePolicy.overwriteKeys`; conflicts outside the allowlist MUST preserve the existing value and record a diagnostic.

#### Scenario: Queued status is updated to completed
- **WHEN** an existing tool result contains `status: "queued"` and the backfill patch contains `status: "completed"` with `status` in `overwriteKeys`
- **THEN** the merged tool result contains `status: "completed"` and keeps unrelated existing fields

#### Scenario: Non-allowlisted conflict records diagnostic
- **WHEN** a backfill patch attempts to overwrite an existing non-allowlisted key
- **THEN** the existing value remains and a `ToolResultBackfillDiagnostic` records the conflict path, existing value, and incoming value

### Requirement: Attachments and perception cards merge deterministically
The system SHALL append and deduplicate attachments by a stable attachment identity. The system SHALL merge `perceptionCards` by `assetId`, `version`, and `cacheKey`, replacing cards with the same identity and appending cards with different identities.

#### Scenario: Duplicate attachment is not appended twice
- **WHEN** the same generated image attachment is delivered by two backfill payloads
- **THEN** the merged tool result contains one attachment for that generated image

#### Scenario: New perception card version replaces older matching card
- **WHEN** a backfill payload carries a perception card with the same `assetId`, `version`, and `cacheKey` as an existing card
- **THEN** the merged tool result stores the incoming card instead of the previous card for that identity

### Requirement: Backfill updates stream projection and persisted conversation state
The system SHALL apply a backfill payload to the active stream projection when the turn is still running and SHALL patch persisted session/history state when the original tool call has already been stored. The next LLM turn MUST read the patched tool result from session/history.

#### Scenario: Backfill arrives during active stream
- **WHEN** a backfill payload arrives before stream completion
- **THEN** `collectedToolCalls` and matching tool-call content blocks reflect the merged result

#### Scenario: Backfill arrives after stream completion
- **WHEN** a backfill payload arrives after the assistant message was persisted
- **THEN** `AgentSession`, Journal, or ConversationRecord stores the merged tool result and the next history build includes the backfilled data

### Requirement: Backfill coordinator owns side effects
The system SHALL centralize backfill side effects in a runtime `BackfillCoordinator`. Pure stream state helpers MUST only compute in-memory projection changes and MUST NOT write session state, write journals, or post Webview messages directly.

#### Scenario: Coordinator applies one payload to all delivery surfaces
- **WHEN** `BackfillCoordinator.apply()` receives a valid payload
- **THEN** it applies stream projection when available, patches persisted state, and emits the Webview update through adapter boundaries

#### Scenario: Missing tool call produces diagnostic
- **WHEN** a backfill payload references an unknown tool call id
- **THEN** the coordinator records a diagnostic and does not create an implicit successful tool result
