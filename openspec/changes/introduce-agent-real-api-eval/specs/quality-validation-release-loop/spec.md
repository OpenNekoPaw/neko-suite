## ADDED Requirements

### Requirement: Agent eval evidence for real API scenario changes
Changes that affect AgentSession multi-turn behavior, Skill activation quality, provider/model routing, controller or judge prompt behavior, artifact-producing Agent workflows, or real API scenario acceptance SHALL record `neko eval` evidence or an explicit residual risk.

#### Scenario: Agent multi-turn behavior changes
- **WHEN** a change modifies AgentSession workflow, conversation history handling, turn execution, feedback prompt flow, Skill lifecycle behavior, provider/model selection, artifact-producing prompts, or model judge behavior
- **THEN** validation evidence MUST include a focused `neko eval` run, a narrower real API eval scenario that exercises the changed path, or a documented reason eval could not run
- **AND** the evidence MUST identify the manifest, command, output directory, selected provider/model identities, exit code, and residual risk

#### Scenario: Skill trigger quality changes
- **WHEN** a change modifies Skill metadata, Skill prompt content, Skill activation policy, Skill lifecycle projection, or Agent-owned Skill trigger behavior
- **THEN** validation evidence SHOULD include an eval scenario for command-triggered activation or natural-language-triggered activation as appropriate
- **AND** natural-language trigger evidence MUST distinguish Agent-initiated Skill activation from good output without activation

#### Scenario: Real API unavailable
- **WHEN** `neko eval` cannot run because credentials, provider availability, network, quota, model access, local workspace fixtures, controller model, or judge model are unavailable
- **THEN** delivery notes MUST record the attempted eval command or intended manifest, the blocking reason, and the residual risk
- **AND** mock-only, final-text-only, browser-only, jsdom-only, or regular TUI/UI smoke evidence MUST NOT be reported as satisfying eval evidence

#### Scenario: Default CI remains key-free
- **WHEN** default CI or the repository default test command runs
- **THEN** it MUST NOT require `neko eval`, real provider credentials, network access, or a real provider/model to pass
- **AND** parser, check, report, and import-boundary tests for eval MAY run without provider calls as pure logic validation
