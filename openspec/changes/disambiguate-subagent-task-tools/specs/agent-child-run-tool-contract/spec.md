## ADDED Requirements

### Requirement: Model-facing child-run tools use ownership-specific identities
The Agent runtime SHALL expose SubAgent creation and result collection through `subagent` and `subagent_output`, SHALL use `subagent_id` as the result lookup parameter, and SHALL return `subAgentId` as the created SubAgent identity. It MUST NOT expose the removed `task`, `task_output`, or `task_id` SubAgent contracts.

#### Scenario: Background SubAgent result collection
- **WHEN** the model launches a background SubAgent through `subagent`
- **THEN** the result contains `subAgentId` and the model can pass that value as `subagent_id` to `subagent_output`

#### Scenario: Legacy SubAgent contract is unavailable
- **WHEN** a tool catalog is assembled for an Agent session
- **THEN** it does not contain `task` or `task_output` as SubAgent tools and `subagent_output` does not accept `task_id`

### Requirement: SubAgent lookup rejects Task identities
The SubAgent output path SHALL validate that the supplied identifier belongs to the SubAgent namespace before querying `SubAgentManager`. A Task identifier MUST fail visibly and MUST NOT be routed to either the SubAgent registry or the Task registry as a fallback.

#### Scenario: Media Task ID is passed to SubAgent output
- **WHEN** `subagent_output` receives a media or workflow Task identifier such as `task_...`
- **THEN** it returns a diagnostic identifying the expected SubAgent ID and does not query `SubAgentManager`

#### Scenario: Unknown valid-shape SubAgent ID
- **WHEN** `subagent_output` receives a `subagent-...` identifier that is not registered in the owning scope
- **THEN** it returns `SubAgent not found` without querying any Task registry

### Requirement: Asynchronous Task results remain observation-owned
Media generation tools SHALL identify their returned value as a Task `taskId`, SHALL state that it is not a SubAgent identifier, and SHALL direct the Agent to wait for the Host Task observation or continuation path. The Agent MUST NOT use SubAgent output tools to poll media Task results.

#### Scenario: Image generation is queued
- **WHEN** `GenerateImage` successfully submits asynchronous work
- **THEN** it returns a `taskId` with `childKind: 'task'` and its contract directs the model to await Host result delivery without calling `subagent_output`

#### Scenario: Media Task completes
- **WHEN** the Host receives terminal media Task output
- **THEN** it delivers stable result references through the existing Task observation/continuation path without involving `SubAgentManager`

### Requirement: Child-run routing has real Agent evidence
Changes to model-facing SubAgent or Task routing SHALL include focused real Agent evaluation evidence for both the canonical SubAgent path and the forbidden media-Task-to-SubAgent path when the configured provider is available.

#### Scenario: Provider-backed routing validation
- **WHEN** the focused evaluation runs with a configured chat and media provider
- **THEN** evidence proves background SubAgent collection uses `subagent` and `subagent_output`, while image generation does not call either SubAgent result tool and resumes from Task observation

#### Scenario: Provider-backed validation is unavailable
- **WHEN** credentials, model access, media provider access, or required fixtures are unavailable
- **THEN** deterministic validation still runs and the exact blocked real behavior case remains recorded as residual risk
