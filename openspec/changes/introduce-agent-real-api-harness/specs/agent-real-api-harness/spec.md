## ADDED Requirements

### Requirement: Real API config files are explicit

The Agent test harness SHALL support only `mock.toml` and `config.toml` file-backed harness configuration before constructing Platform, Agent, TUI, or GUI dependencies. The harness MUST NOT automatically fall back from `config.toml` to `mock.toml`, to another config file, or from one configured provider/model to another provider/model when the selected real config fails.

#### Scenario: Default tests use mock profile

- **WHEN** the repository default test command runs
- **THEN** Agent tests MUST use mock or deterministic provider dependencies
- **AND** the command MUST NOT require real provider credentials or network access

#### Scenario: Real config fails without config.toml

- **WHEN** a real harness command runs without a readable `config.toml`
- **THEN** the command MUST fail visibly with a configuration diagnostic
- **AND** it MUST NOT run mock or another provider as a fallback

#### Scenario: Unsupported config file names fail

- **WHEN** a harness command points at a file other than `mock.toml` for mock mode or `config.toml` for real mode
- **THEN** the command MUST fail visibly before provider invocation

### Requirement: Test config path is injectable

The real API harness SHALL support loading provider/model configuration from an explicit `config.toml` file path without modifying the user's default config. The normal runtime default SHALL remain the user config path when no explicit test config path is provided.

#### Scenario: Harness uses explicit config file

- **WHEN** a real API harness run provides a `config.toml` file path
- **THEN** Platform configuration MUST be loaded from that file
- **AND** the evidence for the run MUST record the selected mode and config path

#### Scenario: Runtime default remains unchanged

- **WHEN** normal Agent runtime code creates a file-backed user config manager without a test config path
- **THEN** it MUST continue reading the standard user config location

#### Scenario: Repository fixture contains no secrets

- **WHEN** `mock.toml` or `config.toml` examples are committed to the repository
- **THEN** they MUST be templates or redacted examples
- **AND** they MUST NOT contain real provider credentials

### Requirement: Agent development validates real API surfaces locally

Agent development changes that affect provider/model selection, AI SDK message projection, prompt or Skill behavior, tool schemas, AgentSession workflow, validator or recovery policy, or TUI/GUI projection of live Agent events SHALL include a local real API validation attempt using an explicit user-owned `config.toml`. Default CI and the repository default test command SHALL remain mock-only and MUST NOT require real provider credentials, network access, or a user config file.

#### Scenario: Agent behavior change records real API evidence

- **WHEN** a change modifies Agent provider/model routing, prompt behavior, Skill guidance, tool schemas, AgentSession workflow, validator/recovery behavior, or live TUI/GUI Agent event projection
- **THEN** the developer validation evidence MUST include the relevant `test:agent:real:*` command with `NEKO_AGENT_TEST_CONFIG` pointing at `config.toml`
- **AND** the evidence MUST record the selected provider/model identity or the explicit failure diagnostic from that real lane

#### Scenario: Local machine cannot run real API lane

- **WHEN** a required real API lane cannot run because `config.toml`, credentials, provider/network availability, or VS Code debugger setup is unavailable
- **THEN** delivery notes MUST record the attempted command, the reason it could not run, and the residual risk
- **AND** mock-only, browser-only, jsdom-only, or final-text-only evidence MUST NOT be reported as satisfying the real API or VS Code runtime requirement

#### Scenario: CI remains key-free

- **WHEN** default CI or the repository default test command runs
- **THEN** it MUST use mock or deterministic provider dependencies for Agent tests
- **AND** it MUST NOT require `NEKO_AGENT_TEST_CONFIG`, real credentials, network access, or a real provider/model to pass

### Requirement: Platform real API smoke is separately validated

The real API harness SHALL provide a Platform smoke lane that validates real provider configuration and API connectivity independently from Agent workflow behavior.

#### Scenario: Chat provider smoke succeeds

- **WHEN** the Platform real API smoke runs with a valid selected chat provider and model
- **THEN** it MUST call the real service chat path
- **AND** it MUST verify a non-empty model response or typed provider result

#### Scenario: Streaming provider smoke succeeds

- **WHEN** the Platform real API smoke runs with a valid selected streaming chat provider and model
- **THEN** it MUST call the real service streaming path
- **AND** it MUST verify streamed content or streamed structured chunks are received

#### Scenario: Invalid provider selection fails visibly

- **WHEN** the Platform real API smoke selects a missing, disabled, unconfigured, or mismatched provider/model
- **THEN** it MUST fail before or during provider invocation with a visible diagnostic
- **AND** it MUST NOT use another configured provider or model

### Requirement: Agent real workflow harness validates autonomous behavior

The Agent real workflow harness SHALL drive the host-agnostic Agent runtime with a real provider service and safe harness tools, then assert structured runtime evidence instead of relying only on final assistant text.

#### Scenario: Real model calls required safe tool

- **WHEN** the Agent real workflow harness asks the model to complete a task requiring a registered safe test tool
- **THEN** the recorded Agent events MUST include the expected tool call
- **AND** the tool result MUST be observed by the Agent before final completion or a visible failure

#### Scenario: Validator diagnostic is repaired

- **WHEN** the Agent real workflow harness provides a task where the first artifact or tool result violates a validator expectation
- **THEN** the recorded evidence MUST include a validator diagnostic
- **AND** the run MUST either record a successful repair or fail with an explicit recovery/escalation diagnostic

#### Scenario: IDC workflow evidence is recorded

- **WHEN** the Agent real workflow harness runs an IDC creation case
- **THEN** the evidence MUST identify the relevant Draft, Plan, or Apply activity expectations through Agent runtime metadata, events, artifacts, or diagnostics
- **AND** Observe/Evaluate/Review activity MUST NOT be represented as a new IDC stage

#### Scenario: Error and interruption are not reported as success

- **WHEN** a real Agent workflow emits an error event, times out, is cancelled, or fails recovery
- **THEN** the harness result MUST be failed or explicitly interrupted
- **AND** it MUST NOT return a default successful result solely because the event stream ended

### Requirement: Safe tools bound real Agent tests

Real Agent workflow tests SHALL use a controlled harness tool registry by default. Safe harness tools MUST be scoped to the test workspace and MUST NOT mutate arbitrary user project files or invoke high-cost external side effects unless a specific test and approval path enables them.

#### Scenario: Test write tool is workspace scoped

- **WHEN** a real Agent workflow test registers a file-writing harness tool
- **THEN** that tool MUST only write inside the test work directory
- **AND** attempts to write outside the allowed directory MUST fail visibly

#### Scenario: Failing tool is observable

- **WHEN** a real Agent workflow test registers an intentionally failing harness tool
- **THEN** the recorded Agent events MUST include the tool failure
- **AND** the harness MUST assert retry, repair, escalation, or final failure behavior explicitly

### Requirement: TUI real harness validates terminal projection

The real API harness SHALL provide a TUI validation lane for the supported `cli-tui` surface. The deprecated CLI SHALL NOT be treated as a validation surface.

#### Scenario: TUI projects real stream

- **WHEN** the TUI real harness submits a prompt through the supported TUI session path
- **THEN** the TUI state or terminal projection MUST show streamed assistant output from the real Agent run
- **AND** the underlying run evidence MUST record the selected profile and provider/model identity

#### Scenario: TUI projects tool and error events

- **WHEN** the TUI real harness receives tool call, tool result, error, timeout, cancellation, or recovery events
- **THEN** the TUI state or terminal projection MUST expose those states visibly
- **AND** an error, timeout, or cancellation MUST NOT be converted into a successful run result

#### Scenario: Deprecated CLI is not expanded

- **WHEN** real harness scripts are added
- **THEN** they MUST target `cli-tui` for terminal validation
- **AND** stale deprecated CLI script or include references that would misdirect the harness MUST be removed or converted to diagnostics

### Requirement: GUI real harness uses VS Code runtime

The GUI real API harness SHALL validate the Agent GUI through VS Code Extension Development Host and a VS Code debugger Skill or equivalent VS Code runtime smoke. Browser-only, jsdom-only, Chrome-only, Playwright-only, or Vite localhost validation MUST NOT count as GUI real runtime acceptance evidence.

#### Scenario: GUI real harness observes Webview

- **WHEN** the GUI real harness runs
- **THEN** it MUST connect to a VS Code Extension Development Host or equivalent debugger target
- **AND** it MUST verify a visible Agent Webview target before accepting GUI runtime evidence

#### Scenario: GUI projects real Agent stream

- **WHEN** a real Agent run streams text, tool calls, task progress, media progress, error, cancellation, or recovery events to the GUI
- **THEN** the Webview projection MUST visibly represent those events through typed messages, timeline rows, task cards, media cards, or diagnostics

#### Scenario: Browser smoke is insufficient

- **WHEN** only a regular browser, jsdom, Chrome, Playwright, or Vite localhost run validates the GUI
- **THEN** that evidence MUST NOT satisfy the GUI real runtime requirement
- **AND** the residual risk MUST be recorded if VS Code runtime smoke cannot be run

### Requirement: Optional evaluators consume harness evidence

External evaluation tools such as promptfoo or DeepEval MAY be integrated only as optional evaluator layers that consume recorded harness evidence. They MUST NOT replace internal assertions for provider selection, Agent events, tool calls, validator diagnostics, artifacts, task/media progress, or TUI/GUI projection.

#### Scenario: DeepEval evaluates recorded run

- **WHEN** a DeepEval integration evaluates an Agent real workflow run
- **THEN** it MUST consume recorded transcript or structured harness evidence
- **AND** the run MUST still pass the internal harness assertions before evaluator score is treated as quality evidence

#### Scenario: Promptfoo runs prompt regression

- **WHEN** a promptfoo integration runs prompt regression cases
- **THEN** it MUST be reported as prompt/evaluator evidence
- **AND** it MUST NOT replace the Agent real workflow harness requirement for autonomous flow validation
