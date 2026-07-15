# canvas-generated-draft-groups Specification

## Purpose

Define the runtime review and explicit Asset promotion lifecycle for generated media before it becomes durable Board content.

## Requirements

### Requirement: Generated candidates appear as one runtime review Group

Canvas SHALL project reviewable candidates from one generation task/run into one named runtime spatial Group bound to the frozen Board target. The runtime Group and candidates MUST remain outside persisted `.nkc` data until Asset promotion succeeds.

#### Scenario: Media generation completes with several candidates

- **WHEN** one task completes with multiple image, audio, or video candidates
- **THEN** Canvas MUST show them in one runtime Group with a stable task-derived identity, candidate count, and initial arrangement without writing runtime references into `.nkc`

#### Scenario: Creator rearranges runtime candidates

- **WHEN** the creator moves candidates within the runtime Group
- **THEN** Canvas MUST retain the review layout for that projection and MUST NOT continuously re-run automatic arrangement

### Requirement: Runtime candidates expose unsaved lifecycle state

Every runtime generated candidate SHALL expose whether it is unsaved, promoting, saved to assets, added to Board, unavailable, or failed. Active review candidates MUST remain pinned through their owning runtime lifecycle, and discard or cleanup MUST be explicit and visible.

#### Scenario: Creator closes a Board with unsaved candidates

- **WHEN** a runtime Group still contains unsaved candidates and the creator closes or discards the review surface
- **THEN** Canvas MUST warn that the candidates are not durable and require an explicit discard or keep-reviewing decision

#### Scenario: Runtime bytes are no longer available

- **WHEN** a runtime projection is reconstructed but its unpromoted source has legitimately been reclaimed
- **THEN** Canvas MUST show an unavailable diagnostic and MUST NOT display a blank successful node or resolve by filename/path guessing

### Requirement: Save to Assets is the promotion boundary

Canvas SHALL allow the creator to save one selected candidate or an explicit candidate set/whole Group through the AssetLibrary/AssetStore promotion facade. Promotion MUST validate candidate identity, revision/digest, provenance, requested metadata, and idempotency before returning stable Asset identities.

#### Scenario: Creator saves one candidate

- **WHEN** the creator invokes Save to Assets for one valid unsaved candidate
- **THEN** AssetLibrary/AssetStore MUST create or idempotently return its durable Asset identity and Canvas MUST mark that candidate saved without creating a new `neko/generated/<kind>/` source

#### Scenario: Creator saves the whole Group

- **WHEN** the creator invokes Save all to Assets
- **THEN** the Host MUST return a per-candidate promotion result and MUST NOT claim all candidates succeeded when any candidate failed

#### Scenario: Agent retains an accepted result

- **WHEN** the creator explicitly accepts an Agent recommendation to retain selected generated candidates
- **THEN** Agent MAY request the same promotion contract but MUST NOT infer Asset retention solely from task completion

### Requirement: Durable Board authoring uses promoted Asset identity

After promotion succeeds, Canvas Extension SHALL author ordinary Asset-backed child nodes and an ordinary manual Group into the frozen Board target through revision-checked Canvas authoring. Runtime projections MUST be removed only after both promotion and Canvas apply are acknowledged.

#### Scenario: Promotion and Board apply succeed

- **WHEN** selected candidates receive stable Asset identities and the frozen Board revision accepts the mutation
- **THEN** Canvas MUST persist one ordinary Group with ordinary Asset-backed children and remove the corresponding runtime projections

#### Scenario: Asset save succeeds but Board apply conflicts

- **WHEN** promotion succeeds but the frozen Board target is stale, missing, or revision-conflicting
- **THEN** the Asset MUST remain safely registered, the runtime Group MUST show saved-to-assets but not added-to-board state, and retry MUST require an explicit valid target without active-Canvas fallback

### Requirement: Promotion and retry are idempotent and fail visible

Single and batch promotion SHALL use stable candidate and request identities. Partial success MUST preserve successful Asset records, keep failed candidates reviewable, and provide item-level diagnostics; retry MUST NOT duplicate AssetEntities or Canvas nodes.

#### Scenario: Batch promotion partially fails

- **WHEN** two candidates save successfully and one candidate fails validation or storage
- **THEN** the two Asset identities MUST remain valid, the failed candidate MUST remain unsaved with its diagnostic, and retry MUST address only unresolved work

#### Scenario: Completion or promotion result is replayed

- **WHEN** the same task completion, promotion request, or Canvas apply acknowledgement is observed again
- **THEN** the system MUST return the existing identities/state or a visible conflict and MUST NOT create duplicate indistinguishable Groups, nodes, or assets

### Requirement: Canvas deletion does not delete Asset Library content

Canvas node and Group deletion SHALL remove only Canvas organization and references. Asset file/entity deletion MUST remain owned by AssetLibrary reference and confirmation policy.

#### Scenario: Creator deletes a saved Group from Canvas

- **WHEN** an ordinary Asset-backed Group is removed from a Board
- **THEN** its AssetLibrary entities and files MUST remain intact unless the creator separately performs an Asset-owned deletion flow
