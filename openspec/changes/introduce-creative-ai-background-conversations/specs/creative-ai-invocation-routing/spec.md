## ADDED Requirements

### Requirement: Agent-internal invocations use the selected Agent conversation
Agent-internal AI actions SHALL route to the Agent conversation selected in the Agent surface that emitted the action.

#### Scenario: Agent message action invokes AI
- **WHEN** a user activates an AI action from an Agent message, content block, or Agent panel control
- **THEN** the invocation SHALL use the currently selected Agent conversation
- **AND** it SHALL NOT route by recent document association

#### Scenario: Agent action lacks selected conversation
- **WHEN** an Agent-internal action is invoked without a selected conversation
- **THEN** the system SHALL fail with a visible routing diagnostic or create a conversation only through the Agent surface's normal new-chat path
- **AND** it SHALL NOT silently use a creative package background conversation

### Requirement: External creative-package invocations carry source and target refs
External creative-package AI button invocations SHALL carry a typed invocation envelope with explicit source and target information before they enter Agent routing.

#### Scenario: Creative package invokes generation
- **WHEN** Canvas, Sketch, Cut, Story, or another creative package invokes an AI generate, optimize, edit, retry, or batch action
- **THEN** the invocation SHALL include source package identity, document ref when applicable, source ref, target ref or candidate target ref, intent, mode, and available document/target revisions
- **AND** mutating writeback SHALL NOT depend on inferred UI selection or the Agent panel's selected conversation

#### Scenario: Mutating invocation lacks target
- **WHEN** an external creative-package invocation requests a mutating writeback without a target ref or candidate target ref
- **THEN** the system SHALL reject the invocation or request target resolution before provider, SubAgent, or package mutation work begins
- **AND** it SHALL NOT guess a target from active Webview state

### Requirement: External creative-package invocations route by recent association
External creative-package invocations SHALL route to the most recent active background Agent conversation associated with the invocation's document or source, creating one only when no suitable active association exists.

#### Scenario: Recent active association exists
- **WHEN** an external creative-package invocation has a document/source association with at least one active background conversation
- **THEN** the system SHALL route the invocation to the most recent suitable active conversation
- **AND** it SHALL record the routing reason as `recent-associated-conversation`

#### Scenario: No suitable association exists
- **WHEN** an external creative-package invocation has no suitable active background conversation
- **THEN** the system SHALL create a new active background conversation for the invocation
- **AND** it SHALL record the routing reason as `created-new-background-conversation`

#### Scenario: Associated conversation is archived or deleted
- **WHEN** the most recent associated conversation is archived, deleted, or unavailable
- **THEN** the system SHALL skip it and either choose another active associated conversation, create a new one, or ask the user to choose
- **AND** it SHALL NOT silently restore or revive the archived/deleted conversation

### Requirement: Routing domains remain isolated
Agent-selected conversation routing and creative-package recent-association routing SHALL remain separate domains.

#### Scenario: Package button runs while Agent panel has another chat selected
- **WHEN** a creative package AI button is invoked while the Agent panel has an unrelated conversation selected
- **THEN** the package invocation SHALL route by its document/source association
- **AND** it SHALL NOT use the Agent panel's selected conversation unless the user explicitly chooses that conversation

#### Scenario: Agent panel action runs while a document has recent background conversation
- **WHEN** an Agent panel action is invoked while a creative document has a recent background conversation
- **THEN** the Agent action SHALL use the selected Agent conversation
- **AND** it SHALL NOT use the recent document conversation unless the user explicitly changes the selected Agent conversation

### Requirement: Invocation routing is auditable and idempotent
Every routed creative AI invocation SHALL record enough metadata to reproduce routing and prevent duplicate run creation.

#### Scenario: Invocation is accepted
- **WHEN** a creative AI invocation is accepted for execution
- **THEN** the system SHALL record invocation source, selected conversation id, document/source association key, source ref, target ref, mode, intent, routing reason, and idempotency key input
- **AND** the run snapshot SHALL be linked to the routed conversation

#### Scenario: Duplicate invocation arrives
- **WHEN** the same external invocation idempotency key is received again for the same association and target
- **THEN** the system SHALL return the existing run or work item status
- **AND** it SHALL NOT append a duplicate user message, create a duplicate run, or trigger another provider/SubAgent call
