## ADDED Requirements

### Requirement: NPC roleplay test launches primarily from Dashboard
The system SHALL treat Dashboard character entity actions as the primary user-facing launch surface for isolated NPC roleplay tests. The Agent-owned `neko.agent.testNpc` command remains the cross-panel launch contract and MUST create a separate `npc-test` conversation with runtime tools disabled.

#### Scenario: Dashboard launches roleplay test
- **WHEN** the user selects `test-npc` for a valid character in Dashboard
- **THEN** the system invokes the Agent-owned NPC launch command, focuses the Agent panel, and opens an isolated `npc-test` conversation for that character

#### Scenario: Roleplay test is not a media mode
- **WHEN** an NPC roleplay test is active
- **THEN** the conversation is represented by `ConversationKind: 'npc-test'` and MUST NOT add or switch to a media `SessionMode`

#### Scenario: Roleplay test has no creative tools
- **WHEN** the NPC roleplay conversation responds to user messages
- **THEN** the runtime uses `toolPolicy: { kind: 'none' }` and receives no project-read, file-write, media-generation, timeline-editing, shell, or other creative authoring tools

### Requirement: Slash `/as` is hidden compatibility only
The Agent Webview SHALL NOT expose `/as` as a normal slash command, autocomplete item, mention-filter prompt, or help entry. If typed `/as` compatibility remains during migration, it MUST route to the same Agent-owned NPC launch path and MUST NOT alter the current Agent conversation into a roleplay persona.

#### Scenario: Slash catalog omits as command
- **WHEN** the Agent Webview requests or renders slash command suggestions
- **THEN** `/as` is absent from the visible catalog, autocomplete menu, and slash help content

#### Scenario: Manual compatibility route stays isolated
- **WHEN** a user manually types `/as @小橘` while compatibility parsing is enabled
- **THEN** the extension starts a separate `npc-test` conversation through the NPC test controller and keeps the main Agent conversation history separate

#### Scenario: Removed compatibility gives clear guidance
- **WHEN** a user manually types `/as @小橘` after compatibility parsing has been removed or disabled
- **THEN** the system reports that NPC testing should be launched from the Dashboard character panel and MUST NOT partially switch role state

### Requirement: NPC roleplay remains separate from Agent validation workflows
The system SHALL distinguish no-tool NPC roleplay tests from tool-enabled Agent NPC analysis and validation workflows. Reports produced by validation workflows MUST NOT be stored as live roleplay transcript unless the user explicitly saves them as project validation evidence.

#### Scenario: Perspective action does not open roleplay
- **WHEN** the user selects `character-perspective`
- **THEN** the system runs an Agent analysis workflow rather than opening an `npc-test` roleplay conversation

#### Scenario: Validation action does not grant tools to roleplay
- **WHEN** the user selects `validate-character` and the workflow reads project context
- **THEN** the tools are used by the ordinary Agent validation workflow and not by an active NPC roleplay responder

#### Scenario: Test transcript remains scoped
- **WHEN** a user chats inside an `npc-test` roleplay conversation
- **THEN** the transcript remains separate from main Agent history and follows the project-scoped save policy for NPC test artifacts
