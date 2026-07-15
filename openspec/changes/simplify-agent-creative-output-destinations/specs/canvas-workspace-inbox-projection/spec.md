## ADDED Requirements

### Requirement: Workspace Board contains a durable ordinary Inbox projection
Canvas SHALL represent projected creator-visible outputs with ordinary persisted `.nkc` Group and child nodes in `neko/boards/workspace.nkc`. The Inbox MUST NOT depend on Webview runtime state, cache render URIs, generated-draft node types, or an open Canvas editor.

#### Scenario: Several generated candidates complete
- **WHEN** one task returns several valid creator-visible generated outputs
- **THEN** Canvas persists one ordinary provenance-bound Group with ordinary child nodes in the Inbox
- **THEN** reopening `workspace.nkc` reconstructs the Group from `.nkc` and resolves media through stable generated-output references

#### Scenario: Projection occurs from TUI
- **WHEN** TUI has a valid workspace and Canvas headless authoring capability
- **THEN** it can persist the same Inbox projection without opening or emulating a Webview

### Requirement: Inbox placement is deterministic and user-owned after creation
The projector SHALL choose a deterministic available placement for new Inbox content and persist stable provenance. After creation, creator geometry, Group membership, connections, labels, annotations, and manual ordering MUST be treated as Canvas-owned user edits.

#### Scenario: Creator rearranges Inbox candidates
- **WHEN** the creator moves, resizes, reconnects, annotates, or regroups projected nodes
- **THEN** later result replay preserves those edits
- **THEN** automatic layout does not run again for the existing nodes

### Requirement: Generated-output and AssetLibrary identity remain distinct
An Inbox node MAY durably reference a valid generated-output identity without an AssetEntity. Save/Add to Assets SHALL remain an explicit Asset-owned operation that returns a separate stable Asset identity, and Canvas MUST NOT label generated-output identity as AssetLibrary membership.

#### Scenario: Generated result is visible before Asset promotion
- **WHEN** a generated output has been persisted and projected but not added to AssetLibrary
- **THEN** the Inbox node reloads through generated-output content access
- **THEN** Asset lookup for its generated-output id remains fail-visible

#### Scenario: Creator adds a projected output to Assets
- **WHEN** AssetLibrary successfully imports or promotes the generated source
- **THEN** Canvas may record or rebind the returned Asset identity through revision-checked authoring
- **THEN** failure to update Canvas does not invalidate the AssetEntity or delete the generated source

### Requirement: Canvas deletion does not delete referenced content
Deleting an Inbox node or Group SHALL remove only Canvas spatial organization and references. Generated-output files and AssetLibrary entities MUST remain owned by their respective deletion and reference policies.

#### Scenario: Creator removes an Inbox Group
- **WHEN** the creator deletes a projected Group from `workspace.nkc`
- **THEN** its generated files and AssetLibrary entities remain available
- **THEN** no content file is deleted without a separate explicit owner action

### Requirement: Workspace Board is not rebuilt from directory order
Canvas SHALL load spatial facts from `.nkc`. Generated-output index or content access MAY resolve referenced media and support explicit repair, but MUST NOT regenerate node coordinates, Groups, connections, annotations, or ordering solely from the `neko/generated/` directory tree.

#### Scenario: Workspace Board file is missing
- **WHEN** generated files exist but `workspace.nkc` was deleted
- **THEN** Canvas may create a new empty canonical Workspace Board for future projections
- **THEN** it does not claim to have reconstructed the deleted spatial layout from filenames or directory order

### Requirement: Projection failure is recoverable without hidden fallback
If output persistence succeeds but Inbox projection fails, the system SHALL retain the output and return a projection-specific diagnostic. Retrying the same projection request MUST be idempotent and MUST NOT require natural-language reclassification or Asset promotion.

#### Scenario: Board revision conflicts
- **WHEN** Canvas cannot apply an Inbox mutation because the expected revision conflicts
- **THEN** the generated output remains available
- **THEN** a retry against a valid revision uses the same provenance identity and cannot duplicate the node
