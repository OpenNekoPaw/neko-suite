## ADDED Requirements

### Requirement: Suite uses production TUI configuration
The TUI real API validation suite SHALL resolve providers, models, credentials, and workspace defaults through the same production configuration chain used by `neko run`: user `~/.neko/config.toml`, workspace `.neko/config.toml`, environment credentials, and explicit CLI provider/model overrides. The suite MUST NOT require a test-specific API config file as the default path.

#### Scenario: Suite runs with user TOML config
- **WHEN** a developer runs the suite without a test-specific config path
- **THEN** the suite MUST load the selected provider and model through the production TUI config loader
- **AND** the recorded result MUST identify the selected provider and model
- **AND** any API key, token, auth header, or secret-bearing value MUST be redacted from persisted artifacts

#### Scenario: Explicit model override is supplied
- **WHEN** a suite case or command supplies a provider/model override
- **THEN** the suite MUST apply the override through the same validation path as `neko run --provider ... --model ...`
- **AND** invalid provider or model selections MUST fail visibly before the case is marked successful

### Requirement: Suite captures raw and structured artifacts
The TUI real API validation suite SHALL write a timestamped output directory containing raw stdout, raw stderr, structured result JSON, manifest metadata, and a Markdown report for each run.

#### Scenario: Case completes successfully
- **WHEN** a real API case completes
- **THEN** the suite MUST persist the case prompt, selected provider/model, workDir, exit code, duration, stdout path, stderr path, structured result path, and deterministic verdict
- **AND** the suite MUST preserve the raw assistant output for human inspection

#### Scenario: Case fails or times out
- **WHEN** a case exits unsuccessfully, times out, or receives a provider/configuration error
- **THEN** the suite MUST persist the same raw and structured artifacts as a successful case
- **AND** the suite MUST classify the failure without marking the case successful due to partial output

### Requirement: Suite evaluates deterministic pass/fail before AI summary
The TUI real API validation suite SHALL evaluate each case with deterministic checks before producing any AI-assisted summary. AI summary text MUST NOT be the source of truth for pass/fail.

#### Scenario: Rule-based checks pass
- **WHEN** a case satisfies its configured checks such as expected exit code, required output evidence, expected diagnostic, tool usage evidence, or timeout behavior
- **THEN** the case verdict MUST be `pass`
- **AND** the report MUST list the checks that passed

#### Scenario: AI summary disagrees with deterministic verdict
- **WHEN** the AI-assisted summary describes a failed case as acceptable or a passed case as unacceptable
- **THEN** the deterministic verdict MUST remain unchanged
- **AND** the report MAY include the AI observation as a reviewer note

### Requirement: Suite covers TUI prompt, content, model, long-running, and error paths
The default TUI real API suite SHALL include cases that exercise baseline prompt behavior, workspace file access, media library references, document/image perception, model capability differences, long-running turns, timeout handling, and visible error handling.

#### Scenario: Media library EPUB image case runs
- **WHEN** a case references a configured media library path such as `${A}/...epub`
- **THEN** the suite MUST execute through the TUI content access path
- **AND** the case MUST fail visibly if the media library variable, document entry, image payload projection, or selected model capability is unavailable

#### Scenario: Text-only model is used for a vision case
- **WHEN** a case that requires image understanding runs against a model that does not declare vision capability
- **THEN** the case MUST produce a visible capability diagnostic
- **AND** the suite MUST NOT silently switch to a different model

#### Scenario: Long-running case exceeds timeout
- **WHEN** a long-running case exceeds its configured timeout
- **THEN** the suite MUST mark the case failed or timed out
- **AND** the report MUST include the timeout value and any partial output captured before cancellation

### Requirement: Suite distinguishes interactive TUI coverage from run-mode coverage
The TUI real API validation suite SHALL identify that `neko run` validates non-interactive Agent execution and MUST NOT claim to validate terminal input, autocomplete rendering, focus handling, or interactive queue controls unless a PTY or manual interactive artifact is attached.

#### Scenario: Report generated without PTY evidence
- **WHEN** the suite report is generated from `neko run` cases only
- **THEN** the report MUST state that interactive TUI behavior was not covered
- **AND** it MUST list interactive validation as residual risk or a separate smoke requirement
