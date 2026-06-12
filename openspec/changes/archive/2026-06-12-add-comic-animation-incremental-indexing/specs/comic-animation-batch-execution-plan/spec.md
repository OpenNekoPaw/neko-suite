## ADDED Requirements

### Requirement: Batch execution plan is a reviewable approval envelope
The system SHALL define `BatchExecutionPlan` as a shared reviewable execution-planning envelope. The plan MUST include schema version, plan id, source artifact refs, target domain, items, approval policy, execution policy, optional cost estimate, status, and diagnostics. It MUST NOT be consumed directly by provider implementations.

#### Scenario: Shot image prep batch is reviewable
- **WHEN** Agent prepares multiple approved shot image prep plans for execution
- **THEN** it can produce a `BatchExecutionPlan` whose items point to the relevant `ShotImagePrepPlan` ids
- **THEN** Canvas or Agent Webview can render the plan for approval before provider execution

#### Scenario: Provider receives adapted request
- **WHEN** a batch execution plan is approved
- **THEN** runtime adapts each runnable item into provider-specific capability requests
- **THEN** providers do not receive or mutate the `BatchExecutionPlan` directly

### Requirement: Batch execution domains are extensible
The system SHALL provide built-in target domains for `asset-indexing`, `shot-image-prep`, `video-generation`, and `voice-generation`, and SHALL allow future domains through capability namespace strings without creating a new batch protocol.

#### Scenario: Built-in asset indexing batch is represented
- **WHEN** local OCR and panel detection are scheduled for multiple page ranges
- **THEN** the batch plan can use target domain `asset-indexing`
- **THEN** each item uses capability ids such as `perception.ocr` or `perception.panel-detection`

#### Scenario: Future domain uses namespace string
- **WHEN** a future music, SFX, subtitle, or quality review batch is introduced
- **THEN** it can use an appropriate capability namespace target domain
- **THEN** the batch envelope, approval policy, and execution policy remain reusable

### Requirement: Batch items carry provider and device diagnostics
The system SHALL represent provider availability, device tier mismatch, cost unknown, low-confidence output, and transient provider failure through batch item diagnostics and status. The runtime MUST NOT fabricate successful outputs when capability providers are unavailable.

#### Scenario: Provider unavailable skips item
- **WHEN** a batch item requires a provider that is not available
- **THEN** the item is marked skipped or the plan remains needs-approval
- **THEN** the item includes a `provider-unavailable` diagnostic

#### Scenario: Device tier mismatch blocks automatic execution
- **WHEN** a local capability requires a higher device tier than the current environment supports
- **THEN** the item includes a device requirement diagnostic
- **THEN** the system may suggest local queueing, plugin installation, or cloud fallback without silently switching provider

#### Scenario: Unknown cost requires approval
- **WHEN** a batch item or plan has unknown estimated cost for an expensive provider
- **THEN** the approval policy requires explicit approval
- **THEN** the runtime does not execute the item silently

### Requirement: Batch execution policy controls concurrency, retry, failure, and cancellation
The system SHALL enforce batch execution policy for max concurrency, retry policy, failure policy, budget limits, and cancellation. Retry MUST apply only to configured transient failures and MUST NOT retry schema, unsafe ref, missing mask, or validation errors.

#### Scenario: Concurrency limit is enforced
- **WHEN** a batch plan sets max concurrency to 2
- **THEN** runtime runs no more than two provider requests from that plan at once

#### Scenario: Transient failure is retried
- **WHEN** a provider returns a timeout, rate-limit, or transient error included in retry policy
- **THEN** runtime retries up to the configured max attempts
- **THEN** the final execution summary records the resulting succeeded, failed, skipped, or cancelled state

#### Scenario: User cancellation preserves completed outputs
- **WHEN** a user cancels a running batch
- **THEN** completed item outputs and evidence remain persisted
- **THEN** queued or unstarted items return to a recoverable planned or approved state

### Requirement: Batch results are reported through execution summaries
The system SHALL report batch execution results through `ArtifactExecutionSummary` or an equivalent shared execution summary contract. The summary MUST include succeeded, failed, skipped, cancelled, unavailable, and partial counts when applicable.

#### Scenario: Partial batch result is recoverable
- **WHEN** some batch items succeed and others fail
- **THEN** successful outputs remain referenced
- **THEN** failed items retain diagnostics and can be retried without discarding successful results

#### Scenario: Webview rebuild restores batch status
- **WHEN** the Agent Webview or Canvas panel reloads after a batch executes
- **THEN** it can recover batch status from persisted plan and execution summary records
- **THEN** it does not rely on transient Webview memory as the source of truth
