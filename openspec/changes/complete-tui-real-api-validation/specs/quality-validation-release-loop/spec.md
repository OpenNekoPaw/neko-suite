## ADDED Requirements

### Requirement: TUI real API validation evidence
Changes that affect TUI prompt behavior, real provider/model routing, non-interactive CLI execution, TUI content access, media library references, multimodal projection, long-running Agent turns, or provider error handling SHALL record TUI real API validation evidence or an explicit residual risk.

#### Scenario: TUI prompt or provider path changes
- **WHEN** a change modifies TUI prompt construction, selected provider/model routing, CLI run execution, real provider configuration, or model capability propagation
- **THEN** validation evidence MUST include a focused TUI real API suite run, a narrower real API case that exercises the changed path, or a documented reason the suite was not run
- **AND** the evidence MUST identify the provider/model, workDir, command or script, output report path, and residual risk

#### Scenario: TUI content access or media library path changes
- **WHEN** a change modifies TUI workspace file access, media library variables, document/image reading, or multimodal asset projection
- **THEN** validation evidence MUST include a TUI real API or smoke case that proves the canonical TUI content path was hit
- **AND** result-only success MUST NOT count unless the evidence shows the configured path, content runtime, or projection adapter participated

#### Scenario: Real API suite is not appropriate
- **WHEN** provider credentials, quota, network, cost, local media fixtures, or unsupported model capabilities prevent running the TUI real API suite
- **THEN** the change MUST record the skipped reason
- **AND** it MUST include the strongest available substitute evidence such as mock runner tests, CLI smoke, content access smoke, or manual interactive smoke
