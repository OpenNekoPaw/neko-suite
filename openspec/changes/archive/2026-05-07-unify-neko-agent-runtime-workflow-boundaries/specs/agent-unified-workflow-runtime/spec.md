## ADDED Requirements

### Requirement: Workflow runtime provides a single orchestration envelope
The system SHALL define a host-agnostic `AgentWorkflowDefinition`, `AgentWorkflowRun`, `AgentWorkflowNode`, and transition model that can represent IDC Draft/Plan/Apply stages, prompt-chain nodes, tool-chain nodes, subagent nodes, media task nodes, approval gates, evaluator nodes, and artifact projection nodes.

#### Scenario: IDC run is represented as workflow nodes
- **WHEN** PlanMode starts a full IDC creation flow
- **THEN** runtime represents Draft, Plan, and Apply as workflow nodes within one `AgentWorkflowRun`

#### Scenario: Prompt-chain skill becomes workflow nodes
- **WHEN** an active skill contributes a prompt-chain workflow fragment
- **THEN** runtime normalizes that fragment into workflow nodes without Webview or Extension planning logic

### Requirement: Plan mode switches runtime workflow profile
The system SHALL treat plan mode as a runtime mode signal that selects a complete IDC workflow profile. Webview MAY request plan mode changes through typed messages or slash commands, but runtime MUST decide the active workflow stage, required artifacts, approval gates, and prompt/schema profile.

#### Scenario: Plan mode activates full IDC
- **WHEN** a user enables plan mode and sends a new creative request
- **THEN** runtime starts or resumes a workflow that includes Draft, Plan, and Apply behavior instead of only toggling UI state

#### Scenario: Auto mode can enter any IDC stage
- **WHEN** AutoMode detects an existing draft, plan, task, workflow command, atomic operation, multi-step task, or vague creative intent
- **THEN** runtime selects the appropriate IDC entry stage according to deterministic and LLM-assisted rules

### Requirement: Workflow nodes project to tasks and work items
The system SHALL project workflow node state to existing conversation-scoped task/work-item surfaces. Every projected task, media task, and subagent event MUST include `conversationId` and workflow/run/node identity when available.

#### Scenario: Async media task links to workflow node
- **WHEN** a workflow node starts an asynchronous media generation task
- **THEN** Webview receives conversation-scoped task/media progress linked to the originating workflow node

#### Scenario: Subagent event links to parent node
- **WHEN** a workflow node spawns a subagent
- **THEN** subagent events are projected with conversation, run, node, parent message, and parent tool-call identity where available

### Requirement: Subagent and multi-agent orchestration use runtime coordinator
The system SHALL coordinate subagents and future multi-agent behavior through runtime services, not Extension routes. Runtime MUST enforce budget, depth, cancellation, event projection, parent-child linkage, and result merge policy.

#### Scenario: Subagent spawn is runtime-owned
- **WHEN** a workflow node requests a reviewer or worker subagent
- **THEN** runtime creates and tracks the subagent through a coordinator and Extension only forwards projected events to Webview

#### Scenario: Cancellation propagates through workflow
- **WHEN** a workflow run is cancelled
- **THEN** runtime cancels active tool calls, async tasks, and subagents associated with that run

### Requirement: Workflow runtime preserves compatibility with existing pipeline
The system SHALL allow existing pipeline flows to run through a compatibility adapter while the unified workflow runtime is introduced. The adapter MUST preserve existing behavior but expose run/node/task projections through the new workflow contract.

#### Scenario: Existing media pipeline runs as workflow adapter
- **WHEN** an existing media pipeline is executed during migration
- **THEN** it emits workflow-compatible node and task projections without requiring Webview-specific pipeline code

### Requirement: Workflow runs are observable and resumable within a conversation
The system SHALL persist or reconstruct enough workflow run metadata to resume active IDC/workflow state per conversation after Webview refresh or chat history hydration.

#### Scenario: Webview refresh restores workflow projection
- **WHEN** Webview reloads while a workflow run has active tasks
- **THEN** runtime or Extension replays the conversation-scoped workflow/task/subagent projection so UI state is restored
