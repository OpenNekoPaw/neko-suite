# agent-fallback-legacy-governance Specification

## Purpose
TBD - created by archiving change govern-agent-fallback-legacy-debt. Update Purpose after archive.
## Requirements
### Requirement: Legacy media bridge provenance
Agent media generation through the AI SDK layer SHALL expose whether a resolved provider was native or came from the legacy media adapter bridge.

#### Scenario: Legacy bridge provider is resolved
- **WHEN** a provider type is not supported by a native AI SDK provider and a legacy media adapter is used
- **THEN** the resolved provider and task output metadata MUST identify the source as `legacy-bridge`

#### Scenario: Native provider is resolved
- **WHEN** a provider type is supported by the native AI SDK provider path
- **THEN** the resolved provider metadata MUST identify the source as `native`

### Requirement: Permission auto mode fails visible without traits
Agent permission auto mode SHALL NOT allow tool execution by default when tool traits metadata is unavailable.

#### Scenario: Traits registry is missing in auto mode
- **WHEN** a tool call reaches permission matching in auto mode and no traits registry is available
- **THEN** the permission decision MUST be `ask` or stricter and MUST include a reason that traits metadata is unavailable

#### Scenario: Explicit allow rule exists
- **WHEN** a tool call matches an explicit allow rule before auto-mode traits evaluation
- **THEN** the permission decision MUST remain `allow`

### Requirement: Agent runtime preconditions are not fallback success
Agent runtime flows SHALL report unmet setup preconditions using a dedicated status instead of `fallback`.

#### Scenario: No provider is configured
- **WHEN** an Agent turn cannot start because no provider is configured
- **THEN** the runtime result MUST use the dedicated precondition status and MUST include the existing reason for user repair guidance

#### Scenario: Execution throws after start
- **WHEN** an Agent turn starts and then throws an execution error
- **THEN** the runtime result MUST use the existing execution failure status, not the precondition status

### Requirement: Degraded AI-derived results carry provenance
Summarization and asset classification results produced without the intended LLM path SHALL carry structured provenance or degraded metadata.

#### Scenario: Summarization falls back to local truncation
- **WHEN** LLM summarization is unavailable or all attempts fail and the system creates a local summary
- **THEN** the summarization result MUST indicate it came from the fallback/degraded path

#### Scenario: Asset classification uses rule fallback
- **WHEN** LLM classification fails and a rule classifier is used
- **THEN** the classification result MUST indicate it came from the fallback/degraded path

### Requirement: Typed API replaces Canvas command fallback
Canvas asset entity lookup SHALL use the typed Neko Assets API instead of falling back to the older command proxy.

#### Scenario: Typed assets API is unavailable
- **WHEN** Canvas cannot obtain the typed Neko Assets API
- **THEN** Canvas MUST fail visibly with an unavailable diagnostic/error instead of calling the legacy command fallback
