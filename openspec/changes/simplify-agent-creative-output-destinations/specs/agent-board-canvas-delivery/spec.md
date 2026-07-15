## MODIFIED Requirements

### Requirement: Typed creative results automatically author into the resolved Canvas
The Host SHALL forward declared creator-visible typed results to the Canvas-owned Workspace Board projector. With no explicit Canvas target, the projector SHALL author valid durable artifact references and generated-output references into `neko/boards/workspace.nkc`; it MUST NOT require AssetLibrary promotion or a runtime-only generated Group before a durable `.nkc` node can exist.

#### Scenario: Creator-useful Markdown artifact completes
- **WHEN** a task result explicitly declares a durable creator-useful Markdown/document artifact
- **THEN** the Host forwards its stable artifact/document reference to the Canvas projector
- **THEN** Canvas authors one ordinary document node in the Workspace Board Inbox without parsing conversational prose

#### Scenario: Media task completes
- **WHEN** an image, audio, or video task returns a valid creator-visible generated-output identity persisted by its owner
- **THEN** Canvas authors or idempotently finds an ordinary media node for that identity in the Workspace Board Inbox
- **THEN** AssetLibrary membership is not implied

### Requirement: Automatic delivery preserves user edits and layout
Workspace Board projection SHALL use revision-checked Canvas authoring and stable output/artifact provenance. Replay or metadata refresh MUST NOT silently overwrite user-edited text, move or resize user-arranged nodes, change user Group membership, remove connections, or delete creator content.

#### Scenario: User moved a projected node
- **WHEN** the same output completion is replayed after the creator moved its node
- **THEN** Canvas returns the existing projection or updates only owner-controlled non-spatial metadata
- **THEN** the creator's geometry and Group placement remain unchanged

#### Scenario: New output revision arrives
- **WHEN** a task produces a distinct revision that cannot safely update the existing projection
- **THEN** Canvas creates a distinguishable new candidate node or returns a conflict diagnostic
- **THEN** it does not overwrite the prior creator-edited node

### Requirement: Missing delivery target cannot return success through fallback
If the canonical or explicit Canvas target is missing, invalid, unauthorized, or revision-conflicting, the projector SHALL return an actionable projection diagnostic while the generated output or artifact remains recoverable through its owner. It MUST NOT report Board success through active/recent Canvas, another `neko/boards/*.nkc`, legacy Send-to-Canvas, runtime Group, raw JSON mutation, or Asset promotion.

#### Scenario: Workspace Board write fails
- **WHEN** generated output persistence succeeds but the canonical Workspace Board cannot be written
- **THEN** task output remains available under its generated-output identity
- **THEN** the UI/TUI reports that Board projection failed and does not claim the result was added to Canvas

## ADDED Requirements

### Requirement: Workspace Board projection is Canvas-owned and idempotent
Canvas SHALL own projection validation, target derivation, node planning, revision-checked apply, and diagnostics. Host adapters MAY map already-declared typed task results into the Canvas projection request, but Agent core, Skill content, and natural-language classifiers MUST NOT decide whether or where durable Canvas writes occur. Replay SHALL be idempotent by stable output/artifact identity and revision.

#### Scenario: Completion is replayed after restart
- **WHEN** the same terminal result is delivered more than once
- **THEN** Canvas returns the existing node identity or an explicit versioned projection
- **THEN** it does not create duplicate indistinguishable nodes or Groups

#### Scenario: Result kind is unknown
- **WHEN** a terminal result does not declare a Canvas-supported projection kind
- **THEN** Canvas rejects or ignores it with a typed diagnostic according to the projection contract
- **THEN** no generic node is inferred from prose, filenames, or tool names

## REMOVED Requirements

### Requirement: Delivery policy is runtime-owned and idempotent
**Reason**: Runtime-owned delivery and Skill-independent behavior are replaced by a narrower Canvas-owned projector over declared typed results.
**Migration**: Preserve idempotency keys, move projection policy to Canvas, and remove Agent delivery classifiers/work runtimes rather than keeping a compatibility dispatcher.
