## ADDED Requirements

### Requirement: Background conversations are user-visible creative threads
Background Agent conversations SHALL be visible and manageable as Agent conversations even when they are created from creative-package AI buttons.

#### Scenario: Package invocation creates a background conversation
- **WHEN** an external creative-package AI invocation creates a background Agent conversation
- **THEN** the conversation SHALL appear in the Agent conversation list with source package, document/source association, title, active/archived state, last activity, and active work summary
- **AND** it SHALL NOT automatically open an Agent tab unless the user explicitly chooses to view it

#### Scenario: User opens background conversation
- **WHEN** the user selects a background conversation from the Agent conversation list
- **THEN** the Agent Webview SHALL open or focus a tab for that conversation
- **AND** it SHALL render the persisted transcript, run/workItem state, observations, diagnostics, and available actions for that conversation

### Requirement: Multiple active conversations may share a document
The system SHALL allow multiple active Agent conversations to be associated with the same `nk*` document or source.

#### Scenario: User starts a new AI thread for the same document
- **WHEN** the user explicitly starts a new AI conversation or new scheme for a document that already has an active conversation
- **THEN** the system SHALL create another active conversation associated with the same document/source
- **AND** it SHALL NOT automatically archive or delete the existing active conversation

#### Scenario: Editor tab closes
- **WHEN** a VS Code editor tab for an associated `nk*` document closes
- **THEN** the associated Agent conversations SHALL remain in their current lifecycle state
- **AND** the system SHALL NOT archive them because of editor close or a TTL

### Requirement: Conversations support archive, restore, and delete
Agent conversation history SHALL distinguish archive from delete and SHALL support explicit restore.

#### Scenario: User archives a conversation
- **WHEN** the user archives an Agent conversation
- **THEN** the conversation SHALL be removed from default active reuse and marked archived
- **AND** its inspectable history SHALL remain available until the user deletes it or cleanup policy removes archived history

#### Scenario: User restores archived conversation
- **WHEN** the user restores an archived conversation
- **THEN** the conversation SHALL become active again
- **AND** future explicit routing to that conversation SHALL be allowed

#### Scenario: User deletes a conversation
- **WHEN** the user deletes an Agent conversation with no active runs
- **THEN** the system SHALL remove the conversation history record and conversation index entry
- **AND** it SHALL NOT delete promoted project facts, assets, resources, Project Memory entries, or user-saved references

#### Scenario: User deletes conversation with active work
- **WHEN** the user requests delete for a conversation with active runs, workItems, SubAgents, or provider tasks
- **THEN** the system SHALL reject the delete with a visible diagnostic or require an explicit stop-and-delete action
- **AND** it SHALL NOT leave active work writing into a deleted conversation

### Requirement: Runs and work items own background execution
Long-running creative AI execution SHALL be modeled as runs and work items inside a conversation rather than as additional user-visible conversations.

#### Scenario: Batch generation starts
- **WHEN** a creative-package invocation starts a batch generation or optimization operation
- **THEN** the system SHALL create one run in the routed conversation and one or more work items for the target set
- **AND** it SHALL NOT create one conversation per batch item

#### Scenario: Main Agent turn is running
- **WHEN** a main Agent turn is already running in a conversation
- **THEN** additional main Agent messages for that conversation SHALL be serialized or queued
- **AND** independent background workItems MAY continue running under their run identity

#### Scenario: Background worker is started
- **WHEN** a SubAgent, provider task, media task, or background coordinator worker is started for a run
- **THEN** it SHALL carry conversation id, run id, target refs, and parent work item identity
- **AND** its progress SHALL be observable in the parent conversation without requiring a new user-visible conversation

### Requirement: Target invalidation is handled at target or run granularity
Target changes during background execution SHALL not silently overwrite newer user edits.

#### Scenario: Target revision changes before apply
- **WHEN** a generated result is ready but the target document, node, field, layer, clip, or other target revision no longer matches the run snapshot
- **THEN** the owning package apply adapter SHALL return a stale or revision-conflict diagnostic
- **AND** it SHALL NOT silently overwrite the newer target state

#### Scenario: One batch target is deleted
- **WHEN** one target in a per-target batch run is deleted while the run is active
- **THEN** the system SHALL cancel or mark stale only the affected work item
- **AND** it SHALL NOT cancel unrelated targets in the same batch unless the run declared atomic behavior

#### Scenario: Atomic run target is invalidated
- **WHEN** a run declares atomic behavior and a required target becomes invalid
- **THEN** the system SHALL cancel or fail the whole run with a diagnostic
- **AND** it SHALL NOT apply a partial mutation as if the run succeeded

### Requirement: Generated results apply through owning package capabilities
Generated or optimized content SHALL be applied through the owning package's capability or apply adapter.

#### Scenario: Canvas result is ready
- **WHEN** an Agent run produces a result intended for a Canvas node, field, connection, block, gallery child, or candidate container
- **THEN** the system SHALL call a Canvas-owned apply capability with stable refs, output refs, revision preconditions, and idempotency identity
- **AND** Agent SHALL NOT directly mutate Canvas Webview component state or raw `.nkc` JSON

#### Scenario: Apply adapter rejects output
- **WHEN** an owning package apply adapter rejects a result because of missing target, stale ref, schema mismatch, invalid resource, missing approval, or unsupported operation
- **THEN** the rejection SHALL be recorded as a structured observation/diagnostic in the conversation
- **AND** the system SHALL NOT report the run as successfully written back

### Requirement: Background conversation history is not long-term memory
Background conversation journal/history SHALL be persisted for inspection and recovery, but SHALL NOT automatically become Project Memory or cross-conversation context.

#### Scenario: Background run completes
- **WHEN** a background run completes with generated outputs, diagnostics, and observations
- **THEN** those events SHALL be persisted in the owning conversation journal/history
- **AND** they SHALL NOT automatically write `.neko/memory.md`, entity facts, or other long-term memory stores

#### Scenario: Another conversation starts
- **WHEN** another Agent conversation is active
- **THEN** it SHALL NOT automatically read, recall, or inject transcript/journal content from the background conversation
- **AND** cross-conversation reuse SHALL require explicit Project Memory promotion, domain-owned facts/resources, or a user-saved textual reference

#### Scenario: Archived conversation exists
- **WHEN** a conversation is archived
- **THEN** it SHALL remain excluded from automatic recall and default routing
- **AND** it MAY be cleaned up according to user action or cleanup policy without deleting promoted facts, assets, resources, memory entries, or saved references
