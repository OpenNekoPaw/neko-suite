## ADDED Requirements

### Requirement: Dashboard exposes NPC operation actions for character entities
Dashboard SHALL expose character-scoped NPC operation actions for eligible character entity rows or details. The action surface MUST include `test-npc`, `character-perspective`, `validate-character`, and `improve-character` when the owning source and Agent integration can handle those operations.

#### Scenario: Character detail shows NPC operations
- **WHEN** Dashboard renders the detail view for a confirmed character entity
- **THEN** the available action list includes localized labels for NPC test, character perspective, character validation, and character improvement operations

#### Scenario: Character row may expose compact NPC actions
- **WHEN** Dashboard renders a character row in the entity table
- **THEN** it may expose a compact subset of NPC actions and MUST make the full set available from the detail view

#### Scenario: Non-character entity omits NPC operations
- **WHEN** Dashboard renders a scene, location, object, asset-only row, or other non-character entity
- **THEN** the row and detail action lists omit character-scoped NPC operations or mark them disabled with a source-provided reason

### Requirement: Dashboard delegates NPC operations through shared action contracts
Dashboard SHALL delegate NPC operation requests through `DashboardCreativeEntityActionRequest` and source or host command handling. Dashboard Webview MUST NOT import Agent internals, assemble NPC prompts, read project files directly, or mutate entity facts for these operations.

#### Scenario: NPC test delegates to Agent command
- **WHEN** the user selects `test-npc` for a valid character entity
- **THEN** Dashboard or the owning source invokes the Agent-owned NPC test launch path with an `NpcTestBenchLaunchRequest`

#### Scenario: Perspective delegates with entity scope
- **WHEN** the user selects `character-perspective` for a valid character entity
- **THEN** Dashboard sends an action request containing the entity ref and optional source-owned scope refs to the owning source or host adapter

#### Scenario: Validation delegates without direct mutation
- **WHEN** the user selects `validate-character` or `improve-character`
- **THEN** Dashboard delegates the request and waits for an Agent/source result instead of writing entity metadata, relationships, or profile suggestions directly

### Requirement: Dashboard presents NPC operation availability explicitly
Dashboard SHALL show NPC operation disabled states and failure reasons in a user-visible way when actions cannot run. Disabled reasons MUST come from the owning source, host capability detection, or Agent command availability checks.

#### Scenario: Agent integration unavailable
- **WHEN** the Agent NPC command or validation workflow command is unavailable
- **THEN** Dashboard disables the affected NPC operation and shows a localized reason rather than sending a request that will fail silently

#### Scenario: Candidate provides source-owned character ref
- **WHEN** a script-derived character candidate can provide a source-owned character ref
- **THEN** Dashboard may enable NPC roleplay testing and suggestion-only Agent analysis workflows without requiring candidate confirmation first

#### Scenario: Candidate lacks usable character ref
- **WHEN** a candidate cannot provide a usable character ref or the requested operation would mutate entity facts
- **THEN** Dashboard disables that operation with a localized reason and may offer confirmation before write-back actions

#### Scenario: Action failure refreshes state
- **WHEN** an NPC operation request fails in the owning source or Agent host adapter
- **THEN** Dashboard reports the failure reason and refreshes affected entity rows or details without mutating project facts
