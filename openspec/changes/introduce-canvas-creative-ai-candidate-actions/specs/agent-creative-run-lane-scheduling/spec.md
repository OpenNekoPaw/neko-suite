## ADDED Requirements

### Requirement: Agent executes Canvas creative actions as runs and workItems

Agent SHALL execute accepted Canvas creative AI invocations through creative runs and workItems.

#### Scenario: Single Canvas action accepted
- **WHEN** Agent accepts a Canvas creative AI invocation with valid target refs, candidate refs, revision, idempotency, and creative parameters
- **THEN** Agent MUST create or reuse a creative run and at least one workItem for the action
- **AND** it MUST return run and workItem snapshots to the caller

#### Scenario: Duplicate invocation
- **WHEN** Agent receives the same idempotency key for the same document, target, candidate target, and action
- **THEN** Agent MUST return the existing run or workItem state
- **AND** it MUST NOT start a duplicate provider call

### Requirement: Agent projects visible background creative sessions

Agent SHALL project Canvas creative runs into visible background Agent creative sessions for inspection and continuation.

#### Scenario: Background session projection created
- **WHEN** a Canvas creative run starts
- **THEN** Agent MUST make the run visible in an Agent creative session or equivalent conversation-list projection
- **AND** the projection MUST include source document, action summary, run status, workItem status, diagnostics, and available actions

#### Scenario: User opens projected session
- **WHEN** the user opens the background creative session from the Agent conversation list
- **THEN** Agent MUST show persisted run/workItem observations, candidate refs, diagnostics, judge results, and retry or continue actions
- **AND** the session MUST NOT become the authoritative writeback state for Canvas facts

### Requirement: Run and workItem remain execution authority

Agent SHALL treat run/workItem state as the authority for execution, concurrency, idempotency, progress, cancellation, retry, and writeback orchestration.

#### Scenario: Conversation projection is unavailable
- **WHEN** the Agent conversation projection is temporarily unavailable but the run has valid document, target, revision, capability, and idempotency data
- **THEN** Agent MAY continue or recover the run from run/workItem state
- **AND** it MUST report projection diagnostics separately from execution diagnostics

#### Scenario: Run status changes
- **WHEN** a workItem completes, fails, is cancelled, or is marked stale
- **THEN** Agent MUST update the run/workItem snapshot
- **AND** any Agent session or Canvas UI projection MUST consume that snapshot rather than maintaining a separate execution state

### Requirement: Agent enforces media lane concurrency limits

Agent SHALL limit active creative work independently by media or work category.

#### Scenario: Image lane is full
- **WHEN** the number of active image workItems reaches the configured image lane limit
- **THEN** additional image workItems MUST remain queued
- **AND** Agent MUST expose queued status in run/workItem snapshots

#### Scenario: Video lane is full
- **WHEN** the number of active video workItems reaches the configured video lane limit
- **THEN** additional video workItems MUST remain queued without blocking unrelated image, audio, or text lanes
- **AND** Agent MUST expose queued status in run/workItem snapshots

#### Scenario: Audio and text lanes are independent
- **WHEN** audio workItems or prompt/judge text workItems are active
- **THEN** Agent MUST apply the relevant audio or text lane limit
- **AND** it MUST NOT count those workItems against unrelated image or video lane limits

### Requirement: Agent owns individual workItem progress

Agent SHALL provide progress, status, diagnostics, cancellation, retry, and result refs for each creative workItem.

#### Scenario: Provider reports progress
- **WHEN** a provider, tool, external processor, or judge reports work progress
- **THEN** Agent MUST update the corresponding workItem snapshot
- **AND** Canvas MUST be able to consume the update without parsing provider-specific payloads

#### Scenario: WorkItem fails
- **WHEN** an image, audio, video, prompt optimization, or judge workItem fails
- **THEN** Agent MUST mark that workItem failed with diagnostics
- **AND** it MUST NOT report the run as mutating-writeback successful for that failed target

### Requirement: Agent resolves non-creative runtime parameters

Agent SHALL resolve non-creative runtime parameters from Agent configuration, model catalogs, capability catalogs, and execution policy.

#### Scenario: Canvas passes creative requirements
- **WHEN** Canvas passes action id, prompt refs, target refs, reference media, duration, aspect ratio, style hints, and model capability requirements
- **THEN** Agent MUST resolve provider/profile/runtime settings from Agent-owned configuration
- **AND** Canvas MUST NOT pass provider runtime handles or raw provider SDK parameters

#### Scenario: Required model capability is unavailable
- **WHEN** no configured model/provider supports the required creative capability
- **THEN** Agent MUST fail before provider execution with diagnostics
- **AND** it MUST NOT silently fall back to a different model, mock provider, or first available provider

### Requirement: Judge workItems gate automatic promotion

Agent SHALL model judge evaluation as a workItem when a candidate requires automated quality approval.

#### Scenario: Judge pass
- **WHEN** the judge workItem determines that a candidate satisfies the action quality criteria
- **THEN** Agent MAY request candidate promotion only if the action allows judge-based promotion
- **AND** Canvas MUST still re-check target revision before mutating writeback

#### Scenario: Judge API fails
- **WHEN** the judge model, controller, or required API is unavailable
- **THEN** Agent MUST mark the judge workItem failed with infrastructure diagnostics
- **AND** it MUST NOT promote the candidate automatically

### Requirement: Agent applies results through owning package adapters

Agent SHALL apply Canvas candidates and promotions through Canvas-owned apply capabilities.

#### Scenario: Candidate media result ready
- **WHEN** an Agent workItem produces an image, audio, or video output for Canvas
- **THEN** Agent MUST pass stable ResourceRef or artifact refs to the Canvas apply adapter
- **AND** it MUST NOT mutate Canvas Webview state or send a durable `dataUrl`

#### Scenario: Canvas apply rejects stale target
- **WHEN** Canvas apply reports stale target, missing target, deleted target, schema mismatch, invalid resource, or judge rejection
- **THEN** Agent MUST record the diagnostic in the run/workItem observation
- **AND** it MUST NOT report the workItem as successfully promoted
