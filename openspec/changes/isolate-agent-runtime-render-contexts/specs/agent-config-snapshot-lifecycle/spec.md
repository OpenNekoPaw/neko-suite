## ADDED Requirements

### Requirement: Runtime configuration is scoped by defaults, conversation, and turn
Agent configuration SHALL distinguish global file/account defaults, mutable per-conversation future-turn configuration, and immutable per-turn configuration snapshots. Runtime selector updates MUST target an explicit conversation and MUST NOT mutate global user-maintained configuration.

#### Scenario: New conversation receives defaults
- **WHEN** a new conversation runtime is created or an existing conversation without saved runtime selection is reopened
- **THEN** its conversation configuration MUST be initialized from the current validated defaults
- **AND** later changes to another conversation MUST NOT change it

#### Scenario: Turn freezes configuration
- **WHEN** a conversation starts a turn
- **THEN** provider, model, reasoning, generation, media, and execution settings required by that turn MUST be captured in an immutable turn snapshot
- **AND** all model and child-run work for the turn MUST use that snapshot unless an explicit child override is part of the scoped run contract

### Requirement: Configuration changes do not use cross-conversation locks
A running Agent or Task in one conversation MUST NOT prevent another conversation from updating its future-turn configuration. The system MUST NOT use global running-Agent or active-Task checks to authorize a conversation-scoped selector update.

#### Scenario: Change Tab B while Tab A runs
- **WHEN** conversation A has an active Agent turn or Task and the user changes provider/model settings in Tab B
- **THEN** B's conversation configuration update MUST succeed or fail only for a B-specific validation reason
- **AND** A's active turn snapshot MUST remain unchanged

#### Scenario: Change same conversation during a turn
- **WHEN** conversation A is running and the user changes a non-structural future-turn setting in A
- **THEN** the update MUST apply to A's next turn configuration
- **AND** the active turn MUST continue using its frozen snapshot
