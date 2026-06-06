## ADDED Requirements

### Requirement: Audio Webview exposes AI-originated project edits
The system SHALL surface audio project operations whose `EditOperation.meta.source` is `ai` with timeline-visible feedback. Feedback MUST be presentation-only and MUST NOT reapply the operation.

#### Scenario: Agent edit highlights affected track
- **WHEN** Webview receives `project:sync` with an AI-originated operation that changes a track
- **THEN** it replaces project state and highlights the affected track or header without applying the operation again

#### Scenario: user operation is not shown as AI action
- **WHEN** Webview receives or dispatches an operation whose source is `user`
- **THEN** it does not display the AI action badge for that operation

### Requirement: AI operation feedback preserves undo semantics
The system SHALL preserve the existing undo/redo model when displaying AI feedback. If Webview records an AI operation for undo metadata after `project:sync`, undo MUST apply the inverted operation through the existing shared operation path.

#### Scenario: undo after AI edit uses operation history
- **WHEN** an AI edit is synced to Webview with its operation metadata and the user triggers undo
- **THEN** Webview applies the inverted operation through the existing undo path and synchronizes the change to Extension

#### Scenario: feedback expires independently of project state
- **WHEN** a transient AI highlight expires
- **THEN** no project data, undo stack entry, or Extension cache entry is modified
