## ADDED Requirements

### Requirement: Debug automation command

The CLI SHALL expose an explicit dev-only `neko debug automation --stdio` command that starts a local developer automation protocol for complete TUI Agent sessions.

#### Scenario: Start automation protocol

- **WHEN** a developer starts `neko debug automation --stdio`
- **THEN** the command MUST start a local stdio automation protocol
- **AND** CLI help MUST identify the command group as local developer automation
- **AND** it MUST NOT start `neko run`, `neko eval`, `real-api-suite`, or any replacement command that owns eval manifests, judges, or reports inside `cli-tui`

#### Scenario: Old validation commands are absent

- **WHEN** the CLI command surface is inspected
- **THEN** `run`, `eval`, and `real-api-suite` MUST NOT be registered as successful commands
- **AND** unknown command runtime classification MUST fail visibly instead of routing to a legacy headless path

### Requirement: TUI runtime path preservation

Debug automation sessions SHALL execute through the complete TUI App/session owner used by interactive TUI sessions, with only input and output adapters replaced for automation.

#### Scenario: Create debug session

- **WHEN** an automation client creates a session
- **THEN** the session MUST use the TUI App/session owner and TUI runtime assembly for configuration, journal/history, input queue processing, context settings, authorized read roots, Skill lifecycle, task observation, media delivery, and conversation storage
- **AND** it MUST NOT create a separate eval-only or run-only Agent session assembly

#### Scenario: Input and output adapters are replaceable

- **WHEN** debug automation runs without interactive terminal input
- **THEN** it MAY replace TUI input and output adapters for scripted control
- **AND** it MUST NOT replace the TUI App/session owner or bypass TUI runtime assembly

#### Scenario: Resume debug session

- **WHEN** an automation client resumes a saved session
- **THEN** the session MUST use canonical TUI conversation identifiers and the same conversation storage semantics as interactive TUI resume
- **AND** non-canonical legacy identifiers MUST fail visibly

### Requirement: Automation protocol operations

The automation protocol SHALL support typed operations for `session.create`, `session.resume`, `message.submit`, `session.waitForIdle`, `session.facts`, and `session.dispose`.

#### Scenario: Sequential turns

- **WHEN** an automation client submits multiple messages to the same session
- **THEN** each message MUST enter the TUI input queue and execute in order against the same Agent session history and runtime state
- **AND** the client MUST be able to wait for idle between turns before deciding the next input

#### Scenario: Direct Agent turn injection is rejected

- **WHEN** a debug implementation attempts to submit a message by calling an Agent turn runner directly
- **THEN** the implementation MUST fail tests for bypassing the TUI input queue
- **AND** it MUST NOT count as debug automation acceptance

#### Scenario: Invalid protocol request

- **WHEN** the automation protocol receives an unknown method, unknown schema version, malformed payload, missing session id, disposed session id, or invalid timeout
- **THEN** it MUST return a typed protocol error
- **AND** it MUST NOT no-op, return success, or silently create a fallback session

### Requirement: Idle and background task observation

Debug automation SHALL expose split idle state for Agent turn completion, background tasks, media delivery, and tracked task result observation.

#### Scenario: Wait for async media task

- **WHEN** a turn creates a tracked background media or task result observation
- **THEN** `session.waitForIdle` MUST wait until `turnIdle`, `backgroundTasksIdle`, `mediaDeliveryIdle`, and `taskResultObservationIdle` are all idle or have a typed terminal state
- **AND** timeout results MUST include enough diagnostic facts for an external eval script to classify infrastructure fail versus case fail

#### Scenario: Assistant text finishes before background work

- **WHEN** assistant text streaming completes before media delivery or task result observation completes
- **THEN** `session.waitForIdle` MUST NOT report the session as fully idle until the remaining tracked idle states are idle, failed, cancelled, or timed out

### Requirement: Session facts

Debug automation SHALL expose machine-readable session facts for validation without requiring terminal output parsing.

#### Scenario: Read validation facts

- **WHEN** an automation client calls `session.facts`
- **THEN** the response MUST include the session id, conversation id, selected target model identity, turn summaries, assistant outputs, Skill activation records, task summaries, task result observations, artifact summaries, runtime errors, and split idle state available to the TUI runtime
- **AND** the client MUST be able to request full conversation history for the session
- **AND** secrets such as API keys MUST be redacted

### Requirement: Canvas workflow validation facts

Debug automation SHALL expose Agent-observable Canvas workflow facts sufficient for v1 external eval checks.

#### Scenario: Canvas JSON workflow is evaluated

- **WHEN** an Agent workflow sends content to Canvas
- **THEN** `session.facts` MUST expose the Agent-sent Canvas message or artifact reference available to the TUI runtime
- **AND** an external eval script MUST be able to verify that a Canvas JSON file was created and contains expected content
- **AND** debug automation MUST NOT read Canvas Webview in-memory state as a substitute for Canvas-owned debug facts

### Requirement: External eval boundary

Eval orchestration SHALL remain outside `cli-tui` and interact with Agent behavior only through debug automation and real provider APIs.

#### Scenario: Eval script drives debug automation

- **WHEN** an external eval script runs a manifest, controller feedback loop, judge review, existence check, format check, or report
- **THEN** it MUST call debug automation for target Agent turns and session facts
- **AND** it MUST NOT import Agent, Canvas, media, Skill, EPUB, provider, or TUI internal business modules as substitutes for user-facing behavior

#### Scenario: Real API only acceptance

- **WHEN** an external eval script performs Agent behavior acceptance
- **THEN** target, controller, and judge model calls MUST use real configured APIs
- **AND** mock providers or eval-only fake business tools MUST NOT count as acceptance evidence

#### Scenario: Key-free protocol tests

- **WHEN** protocol parser, invalid request, stdio framing, or timeout classification tests run
- **THEN** those tests MAY run without real provider credentials
- **AND** they MUST NOT claim to validate Agent behavior acceptance
