# agent-board-canvas-delivery Specification

## Purpose

TBD - created by archiving change introduce-conversation-draft-workspaces. Update Purpose after archive.

## Requirements

### Requirement: Typed creative results automatically author into the resolved Canvas

The Agent delivery boundary SHALL automatically author creator-useful Markdown documents, selected already-durable file/reference inputs, and other valid durable creator-output projections into the resolved Board Canvas through existing public Canvas authoring capabilities. Completed generated binary media that has not been promoted to AssetLibrary/AssetStore MUST instead create or update a runtime generated-draft Group bound to the resolved Board and MUST NOT become a durable `.nkc` node.

#### Scenario: Storyboard planning completes

- **WHEN** Agent produces a Storyboard plan as a creator-useful Markdown artifact without explicit structured authoring intent
- **THEN** it is authored as normal Markdown/document content in the resolved Board Canvas without Send to Canvas

#### Scenario: Media task completes

- **WHEN** an image, audio, or video task completes with valid unpromoted generated-output identity
- **THEN** Canvas receives a runtime review Group projection for the frozen Board target and MUST NOT author a durable media node until explicit Asset promotion succeeds

#### Scenario: Promoted media is accepted for Board authoring

- **WHEN** explicit Save to Assets returns stable Asset identities for selected generated candidates
- **THEN** the delivery boundary MAY author ordinary Asset-backed nodes and their manual Group into the frozen Board target through revision-checked Canvas authoring

### Requirement: Internal execution output is excluded

Ordinary conversational prose, hidden reasoning, raw tool logs/parameters, provider/parser scratch, unselected search hits, duplicate retry intermediates, runtime/cache handles, and failures without reviewable content MUST NOT become Canvas nodes through automatic delivery.

#### Scenario: Agent answers a normal question

- **WHEN** a turn returns only ordinary conversational prose
- **THEN** no Canvas authoring operation is invoked

#### Scenario: Provider emits temporary retries

- **WHEN** generation creates scratch or duplicate intermediate files
- **THEN** only the classified retained result may be delivered to Canvas

### Requirement: Delivery policy is runtime-owned and idempotent

Typed artifact/result contracts and runtime policy SHALL determine delivery and MUST NOT depend on Skill content asking the model whether or where to save. Replay SHALL be idempotent by stable artifact/output/task identity.

#### Scenario: Completion is replayed after restart

- **WHEN** the same task completion is observed more than once
- **THEN** Canvas contains one canonical projection or an explicitly versioned candidate group rather than duplicate indistinguishable nodes

#### Scenario: Result kind is unknown

- **WHEN** a task reports an unknown or invalid result contract
- **THEN** delivery fails visibly and MUST NOT coerce it into a generic Canvas node

### Requirement: Automatic delivery preserves user edits and layout

Agent SHALL write through revision-checked Canvas authoring, use a task placement region where available, and MUST NOT silently overwrite user-edited Markdown, move user-arranged nodes, or delete creator content.

#### Scenario: User edited generated Markdown

- **WHEN** Agent attempts to replace a Markdown node whose expected revision no longer matches
- **THEN** the update fails visibly or creates a reviewable alternative without overwriting the creator's text

### Requirement: Missing delivery target cannot return success through fallback

If the frozen Board Canvas target is missing, stale, deleted, unauthorized, or revision-conflicting, delivery SHALL return an actionable diagnostic and retain the result through its owning lifecycle. It MUST NOT report success through active Canvas, professional Canvas, legacy Send-to-Canvas, raw `.nkc`, or structured fallback paths.

#### Scenario: Board is deleted during a task

- **WHEN** the target `.nkc` is deleted before task completion
- **THEN** the result remains recoverable through its owning result lifecycle and no other Canvas is mutated
