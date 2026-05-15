## ADDED Requirements

### Requirement: Session collaborator failure paths are covered by focused tests
The system SHALL provide focused tests for session collaborator failure paths
that are observable through public collaborator methods. Tests MUST cover
restore failures, persistence disposal warnings, background artifact sync
failures, task projection failures, feedback guidance persistence failures, and
prompt facade boundary cases without constructing a full `AgentSession`.

#### Scenario: Persistence dispose failure is warned
- **WHEN** `SessionPersistence` replaces or disposes a runtime state store whose
  async `dispose()` rejects
- **THEN** focused tests verify that the collaborator reports a warning and
  continues cleanup without throwing synchronously

#### Scenario: Artifact restore and write failures are tested
- **WHEN** `SessionArtifactFacade` restore rejects or an artifact write rejects
- **THEN** focused tests verify that restore failures are warned, write failures
  propagate to the caller, and the facade remains usable for later operations

#### Scenario: Background artifact queues swallow and warn
- **WHEN** observed artifact sync or IDC task projection work rejects inside a
  queued background operation
- **THEN** focused tests verify that the queue emits a warning, `flush()` still
  resolves, and later queued operations can still run

#### Scenario: Feedback guidance persistence failure is explicit
- **WHEN** `FeedbackRuntimeBridge` receives control-plane guidance but the stage
  transition persistence callback rejects
- **THEN** focused tests verify whether `captureCycle()` rejects or logs the
  failure according to the current collaborator contract

#### Scenario: Prompt facade boundary cases are tested independently
- **WHEN** `PromptRuntimeFacade` syncs prompts with no executor, no system
  history message, or empty composed sections
- **THEN** focused tests verify history behavior, executor cache updates, and
  debug summaries without relying on feedback bridge tests
