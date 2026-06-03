## ADDED Requirements

### Requirement: Agent Webview projects character dialogue as a distinct conversation kind
The Agent Webview SHALL project Character Dialogue sessions with a `character-dialogue` conversation kind. Webview MUST NOT use `npc-test` as the active conversation kind for new role workflow sessions.

#### Scenario: Character dialogue tab renders isolated session state
- **WHEN** the Extension sends a Character Dialogue session projection to the Webview
- **THEN** the Webview renders a `character-dialogue` tab with character identity, profile inspection, transcript messages, and exit controls

#### Scenario: Character dialogue hides authoring controls
- **WHEN** the active conversation kind is `character-dialogue`
- **THEN** the Webview hides ordinary model selector, execution mode selector, and media generation controls for that tab

### Requirement: Agent extension owns character role command dispatch
The Agent Extension SHALL register core commands for `neko.agent.characterDialogue` and `neko.agent.embodyCharacter`. The Extension MUST NOT register `neko.agent.testNpc`, `neko.agent.characterPerspective`, `neko.agent.validateCharacter`, or `neko.agent.improveCharacter` as public core commands after this migration.

#### Scenario: Character dialogue command launches isolated session
- **WHEN** the Extension receives a valid `neko.agent.characterDialogue` request
- **THEN** it focuses the Agent panel and delegates launch to the character dialogue controller

#### Scenario: Embody command starts isolated feedback session
- **WHEN** the Extension receives a valid `neko.agent.embodyCharacter` request
- **THEN** it focuses the Agent panel and delegates launch to an Embody Character controller/runtime path that does not impersonate the character and does not route through ordinary creative message handling

### Requirement: Skill automation composes primitive ports
The Agent runtime and Extension SHALL expose character role primitives through narrow ports that Skills can compose. Automated validation and improvement MUST NOT be implemented as Webview-owned session kinds or Dashboard-owned runtime workflows.

#### Scenario: Validation Skill uses primitive ports
- **WHEN** the character validation Skill runs
- **THEN** it can assemble a character profile, run no-tool headless dialogue probes, evaluate transcript evidence, and save project-scoped artifacts through Agent-owned primitive ports

#### Scenario: Improvement Skill uses suggestion ports
- **WHEN** the character improvement Skill runs
- **THEN** it can collect project evidence and produce suggestions that route through existing user-confirmed entity mutation ports

## REMOVED Requirements

### Requirement: Agent Webview projects npc-test as the roleplay conversation kind
**Reason**: `npc-test` is replaced by `character-dialogue` to align runtime projection with product terminology.
**Migration**: Rename Webview state, message routing, input-area conditions, tab tests, and controller projections from `npc-test` to `character-dialogue`.

### Requirement: Agent extension exposes NPC validation and improvement core commands
**Reason**: Validation and improvement move to Skill orchestration and must not remain public core commands.
**Migration**: Remove `neko.agent.validateCharacter` and `neko.agent.improveCharacter` command registration and route equivalent automation through Skills.

### Requirement: Agent extension exposes NPC perspective core command
**Reason**: The command is replaced by `neko.agent.embodyCharacter` with clarified actor relationship.
**Migration**: Rename command constants, registration, tests, and Dashboard delegation to `neko.agent.embodyCharacter`.
