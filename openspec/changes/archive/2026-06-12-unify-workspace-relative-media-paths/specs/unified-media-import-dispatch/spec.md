## ADDED Requirements

### Requirement: Import planning emits portable durable refs
Media and asset import planning SHALL separate durable project references from runtime absolute paths and SHALL prefer workspace-root-relative references for files inside the owning workspace.

#### Scenario: Workspace source import keeps portable ref
- **WHEN** an imported media or asset source is inside the owning workspace
- **THEN** the import result exposes a durable project reference relative to that workspace root
- **AND** any absolute source path remains runtime metadata only.

#### Scenario: Copied import stores destination ref
- **WHEN** an external source is copied into `.neko/imports` or another approved project import directory
- **THEN** the durable reference points to the copied workspace-relative destination
- **AND** the original absolute source path is not required for reopen playback.

#### Scenario: External linked import uses configured variable
- **WHEN** an import links an external source instead of copying it
- **AND** the source is under a configured media-library variable
- **THEN** the durable reference uses `${VARIABLE}/...`
- **AND** the import flow reports a diagnostic if no portable variable or approved fallback is available.

### Requirement: Import handlers receive document/workspace context
Host-owned import dispatch SHALL provide source document path, owning workspace root, and open workspace roots to domain import handlers that need to create durable media references.

#### Scenario: Multi-root import chooses owning workspace
- **WHEN** a document in workspace root `/work/a` imports `/work/a/cases/clip.mp4`
- **AND** another workspace root is also open
- **THEN** import planning stores `cases/clip.mp4` relative to `/work/a`
- **AND** it does not use the first workspace root unless it is also the owning workspace.
