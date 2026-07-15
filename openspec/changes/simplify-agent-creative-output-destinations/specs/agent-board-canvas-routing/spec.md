## ADDED Requirements

### Requirement: Unspecified Agent work targets the canonical Workspace Board
When a creator-visible typed result has no explicit Canvas target, the system SHALL target exactly `neko/boards/workspace.nkc` under the Agent session's bound workspace root. Canvas SHALL create that file through `CanvasProjectAuthoringService` when it does not exist and MUST NOT create an alternatively named Board.

#### Scenario: Workspace Board already exists
- **WHEN** a creator-visible result completes without an explicit Canvas target
- **THEN** the system projects it to `neko/boards/workspace.nkc` in the session-bound workspace
- **THEN** it does not query other `.nkc` files

#### Scenario: Workspace Board does not exist
- **WHEN** the first projectable result completes in a valid workspace
- **THEN** Canvas creates `neko/boards/workspace.nkc` idempotently through canonical project authoring
- **THEN** it does not create a conversation-named, task-named, or scope-matched Board

### Requirement: Explicit Canvas targets remain ordinary document targets
The system SHALL accept another `.nkc` only when its stable document identity is explicitly supplied by the user, command, or invoking Canvas document context. Explicit targets MUST remain ordinary Canvas documents and MUST NOT create a Board profile or participate in future implicit routing.

#### Scenario: User names a professional Canvas
- **WHEN** a creator explicitly requests projection to a valid `.nkc` document
- **THEN** Canvas writes only that document through revision-checked authoring
- **THEN** later unspecified Agent results still target `neko/boards/workspace.nkc`

### Requirement: Workspace and Canvas target resolution fails visibly
Target resolution SHALL require one unambiguous workspace identity and a valid canonical or explicit `.nkc` URI. It MUST NOT fall back to active, recent, conversation-bound, scope-compatible, filename-similar, or uniquely indexed Canvas documents.

#### Scenario: Multi-root workspace identity is missing
- **WHEN** a projectable result does not identify one workspace root
- **THEN** resolution returns an actionable workspace diagnostic
- **THEN** no Canvas is mutated

#### Scenario: Canonical Workspace Board is invalid
- **WHEN** `neko/boards/workspace.nkc` exists with an unsupported schema/version or invalid content
- **THEN** Canvas returns a fail-visible diagnostic
- **THEN** it does not overwrite the file or create another Board as fallback

### Requirement: Async work freezes workspace and explicit document identity
Before asynchronous work starts, the system SHALL freeze the workspace identity and any explicit Canvas document identity carried by the invocation. Completion MAY read the latest canonical Workspace Board revision immediately before an append-only projection, but MUST NOT re-resolve a different workspace or Canvas from current UI state.

#### Scenario: User switches Canvas during generation
- **WHEN** a generation task completes after the user opens another Canvas
- **THEN** the result targets the frozen explicit Canvas or the canonical Workspace Board in the frozen workspace
- **THEN** the newly active Canvas is not mutated

#### Scenario: Explicit target conflicts at completion
- **WHEN** an explicit Canvas target no longer permits the planned revision-checked write
- **THEN** projection fails visibly and retains the generated result through its owning lifecycle
- **THEN** it does not retarget to the Workspace Board or another Canvas

## REMOVED Requirements

### Requirement: Unspecified Agent work queries the Board Canvas directory
**Reason**: The canonical Workspace Board removes the need for Board directory indexing and query-driven target selection.
**Migration**: New unspecified requests use `neko/boards/workspace.nkc`; existing `neko/boards/*.nkc` files remain ordinary Canvas documents and can be targeted explicitly.

### Requirement: Board Canvas reuse is deterministic
**Reason**: Determinism no longer comes from explicit target, conversation binding, scope matching, then creation; it comes from explicit target or one canonical workspace path.
**Migration**: Remove conversation/scope resolver inputs and map no-target requests directly to the canonical Workspace Board.

### Requirement: Resolver never falls back to active or professional Canvas
**Reason**: The multi-Board resolver is removed rather than retained with fallback guards.
**Migration**: Enforce the new canonical/explicit target requirements at the Canvas authoring boundary.

### Requirement: Async work freezes resolved Canvas identity
**Reason**: Async identity is redefined around frozen workspace/explicit target identity without a pre-task Board index resolution or conversation binding.
**Migration**: Carry workspace identity and optional explicit document URI in the typed invocation; use current canonical Board revision only at append time.

### Requirement: Conversation bindings do not own Canvas files
**Reason**: Conversation-to-Board bindings no longer exist in the canonical path.
**Migration**: Stop reading and writing binding state; preserve all referenced `.nkc` files and remove only obsolete Memento/index metadata.
