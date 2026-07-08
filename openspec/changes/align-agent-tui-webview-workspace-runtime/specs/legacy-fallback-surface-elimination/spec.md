## ADDED Requirements

### Requirement: Readline interactive CLI path is not a default success path

After TUI becomes the canonical terminal interactive surface, readline-based Agent interactive session handling SHALL NOT remain a default successful path for startup, resume, initial prompt dispatch, Skill activation, or slash command handling.

#### Scenario: Resume flag starts TUI session
- **WHEN** the user runs the terminal Agent entrypoint with `--resume` or the `resume` command
- **THEN** the entrypoint MUST start the canonical TUI session path with the requested conversation
- **AND** it MUST NOT route to the old readline `runInteractive` loop

#### Scenario: Legacy interactive API is invoked
- **WHEN** production code attempts to invoke the old readline interactive API after migration
- **THEN** the API MUST be removed from public exports or return a fail-closed diagnostic that names the TUI replacement
- **AND** it MUST NOT create a successful Agent session through the legacy loop

#### Scenario: Legacy path is poisoned in tests
- **WHEN** focused TUI startup and resume tests poison the readline interactive path to throw
- **THEN** default interactive startup and resume MUST still pass through the canonical TUI path
- **AND** the poisoned path MUST NOT be invoked

### Requirement: Headless runner paths are separated from interactive TUI ownership

Headless automation commands MAY remain available for single-shot runs, experiments, completions, and real API validation, but they SHALL be classified separately from interactive session ownership.

#### Scenario: Single-shot run executes
- **WHEN** the user runs a headless `run` command
- **THEN** the command MAY use a headless runner
- **AND** it MUST not create or mutate interactive TUI stores as if it owned the visible session

#### Scenario: Real API suite executes
- **WHEN** the real API validation suite runs
- **THEN** it MAY use headless execution and report artifacts
- **AND** it MUST document which runtime assembly path is being validated so success cannot be mistaken for interactive TUI resume coverage
