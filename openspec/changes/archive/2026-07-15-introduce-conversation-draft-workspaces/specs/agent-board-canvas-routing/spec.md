## ADDED Requirements

### Requirement: Unspecified Agent work queries the Board Canvas directory

When a creator does not specify a Canvas target and no valid conversation/task binding exists, the system SHALL query the Canvas-owned index for `.nkc` documents under `neko/boards/` before creating a target. Agent MUST NOT scan or parse raw `.nkc` files.

#### Scenario: Conversation has a valid Board binding

- **WHEN** a creative task starts without an explicit target and the conversation has a valid bound `neko/boards/*.nkc` document
- **THEN** the resolver reuses that Canvas and does not query or mutate an unrelated active Canvas

#### Scenario: Conversation has no binding

- **WHEN** a creative task starts without an explicit target or valid binding
- **THEN** the resolver queries sanitized Canvas Board index summaries scoped to `neko/boards/`

### Requirement: Board Canvas reuse is deterministic

The system SHALL resolve targets in this order: explicit user target, valid conversation/task binding, exactly one compatible indexed Board Canvas with exact stable project/work/scope evidence, otherwise new Board Canvas creation. Filename or free-form semantic similarity alone MUST NOT select a mutation target.

#### Scenario: One exact compatible Board exists

- **WHEN** the index returns exactly one Board Canvas matching the required stable project/work/scope
- **THEN** the resolver binds and reuses that Canvas document/revision

#### Scenario: Several plausible Boards exist

- **WHEN** multiple Board summaries appear relevant but no unique exact binding exists
- **THEN** the system creates a new Board Canvas by default or asks the creator to select one before work starts and MUST NOT let the model choose silently

#### Scenario: No compatible Board exists

- **WHEN** the index returns no compatible Board Canvas
- **THEN** Canvas creates a new `.nkc` under `neko/boards/` through `CanvasProjectAuthoringService` and returns its stable identity/revision

### Requirement: Resolver never falls back to active or professional Canvas

An unspecified Agent request MUST NOT select a globally active, recently opened, cross-conversation, or professional-directory Canvas as an implicit write target.

#### Scenario: Professional Canvas is active

- **WHEN** the user has a professional-directory Canvas open while an unspecified Agent task starts
- **THEN** the resolver ignores it and reuses or creates only a valid `neko/boards/` Canvas

#### Scenario: Bound Canvas is stale or deleted

- **WHEN** a stored conversation binding references a stale, missing, deleted, or mismatched Canvas identity/revision
- **THEN** the system reports a diagnostic and re-enters Board resolution before starting new work rather than mutating an active Canvas

### Requirement: Async work freezes resolved Canvas identity

Before asynchronous work starts, the system SHALL freeze conversation, Canvas document, Canvas identity, revision, turn/task/run, and source identities. Completion MUST NOT re-resolve against current UI state.

#### Scenario: User switches Canvas during generation

- **WHEN** an image/audio/video task completes after the user opens another Canvas
- **THEN** the result targets only the Canvas bound at task creation

#### Scenario: Target revision conflicts at completion

- **WHEN** the target Canvas revision no longer permits the planned write
- **THEN** delivery fails visibly or creates an owning review/conflict result and MUST NOT overwrite or retarget silently

### Requirement: Conversation bindings do not own Canvas files

Conversation archive or deletion SHALL remove/archive the binding and runtime projection without deleting the bound `.nkc` or its referenced generated outputs.

#### Scenario: Conversation is archived

- **WHEN** a conversation bound to a Board Canvas is archived
- **THEN** the `.nkc` remains normal project content and can be explicitly reused by another conversation
