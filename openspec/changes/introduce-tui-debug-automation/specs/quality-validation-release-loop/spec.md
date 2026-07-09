## ADDED Requirements

### Requirement: Agent debug automation evidence

Changes that affect AgentSession multi-turn behavior, Skill activation quality, provider/model routing, controller or judge prompt behavior, artifact-producing Agent workflows, async task result observation, or real API scenario acceptance SHALL record TUI debug automation evidence or an explicit residual risk.

#### Scenario: Agent workflow validation is required

- **WHEN** a change affects AgentSession turns, feedback prompts, Skill activation, provider/model selection, generated artifacts, background task result observation, or real API Agent acceptance
- **THEN** validation evidence MUST include a focused external eval run against TUI debug automation, a narrower debug automation scenario that exercises the changed path, or a documented reason the run could not execute

#### Scenario: Debug automation cannot run

- **WHEN** debug automation cannot run because credentials, provider availability, network, quota, model access, local workspace fixtures, controller model, judge model, or the debug protocol is unavailable
- **THEN** the validation record MUST state the blocking condition and residual risk
- **AND** controller or judge API unavailability MUST be classified as infrastructure fail rather than case success

#### Scenario: Invalid acceptance substitutes

- **WHEN** validation evidence is recorded for Agent behavior acceptance
- **THEN** mock-only Agent behavior, direct Agent turn injection, final-text-only, browser-only, jsdom-only, ordinary TUI UI smoke, old `neko run`, old `neko eval`, old `real-api-suite`, or old headless runner results MUST NOT count as TUI debug automation evidence

#### Scenario: Protocol-only tests are recorded

- **WHEN** protocol parser, invalid request, stdio framing, or timeout classification tests are recorded
- **THEN** they MAY be recorded as debug protocol evidence without real API credentials
- **AND** they MUST NOT be described as Agent behavior acceptance

#### Scenario: Natural language Skill activation

- **WHEN** a natural-language Skill activation case is evaluated
- **THEN** missing Agent-owned Skill activation MUST be classified as case fail unless session facts prove the Skill activated and affected the result
