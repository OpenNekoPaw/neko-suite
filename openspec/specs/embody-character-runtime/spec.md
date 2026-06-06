# embody-character-runtime Specification

## Purpose
Define the isolated Embody Character feedback runtime where the user plays the character and Agent provides project-scoped knowledge feedback.
## Requirements
### Requirement: Embody Character uses an isolated feedback session
The system SHALL run `embody-character` as an isolated feedback session where the user embodies the selected character and the Agent provides project-scoped character knowledge feedback. The system MUST NOT implement Embody Character as an ordinary Agent conversation that only carries hidden context.

#### Scenario: Command starts isolated feedback session
- **WHEN** the Extension receives a valid `neko.agent.embodyCharacter` request
- **THEN** it creates an Embody Character session projection with `kind: 'embody-character'`, an active session id, selected character identity, project scope, and exit lifecycle

#### Scenario: Embody message uses dedicated route
- **WHEN** the user sends a message inside an active Embody Character tab
- **THEN** the Webview message router delegates the turn to the Embody Character controller instead of ordinary Agent message handling

#### Scenario: Ordinary creative chat remains separate
- **WHEN** the user exits an Embody Character session
- **THEN** the session is marked exited and subsequent ordinary Agent messages are routed through the normal Agent conversation pipeline only after the user leaves the isolated mode

### Requirement: Embody Character enforces read-only feedback capabilities
The Embody Character runtime SHALL enforce a read-only character feedback capability policy. The policy MUST block creative skills, skill activation tools, write tools, media-generation tools, task mutation, entity mutation, shell execution, and file-write capabilities.

#### Scenario: Creative skill activation is unavailable
- **WHEN** the user asks in Embody Character to record a diary, create content, generate an asset, or perform another authoring action
- **THEN** the runtime does not expose `ActivateSkill`, does not activate `creation-persona`, `execution-persona`, or `iteration-persona`, and does not dispatch a creative authoring tool call

#### Scenario: Project evidence is read-only
- **WHEN** the Embody Character responder needs role knowledge
- **THEN** the controller supplies assembled profile and evidence snapshots through read-only ports rather than giving the LLM general project or file mutation tools

#### Scenario: Mutation requests are refused or reframed
- **WHEN** the user requests a mutation such as writing a diary, changing a character fact, creating a task, or generating media
- **THEN** the Agent responds with mode-boundary feedback or role-consistency analysis and does not mutate project state

### Requirement: Embody Character responder never impersonates the character
The Embody Character responder SHALL answer as a project-aware feedback assistant. It MUST NOT speak as the selected character and MUST classify roleplay statements against project evidence and knowledge boundaries.

#### Scenario: User roleplay is evaluated
- **WHEN** the user writes a statement while embodying a character
- **THEN** the responder classifies relevant claims as confirmed, inferred, unknown, or out-of-scope based on the assembled character profile and evidence snapshot

#### Scenario: Agent does not play the character
- **WHEN** the user asks the Agent to answer in the character's voice inside Embody Character
- **THEN** the responder explains that this mode evaluates the user's embodiment and does not switch the Agent into character roleplay

### Requirement: Embody Character captures its own transcript
The Embody Character session SHALL keep its turn transcript separate from ordinary Agent history. The transcript MAY be saved as character-role evidence through an explicit save policy, but it MUST NOT be appended to ordinary Agent creative chat history as hidden system context.

#### Scenario: Feedback transcript is session-owned
- **WHEN** a user and Agent exchange turns in Embody Character
- **THEN** the session stores the user's roleplay messages and the Agent's feedback messages in the Embody Character transcript

#### Scenario: Ordinary Agent history is not polluted
- **WHEN** an Embody Character turn completes
- **THEN** ordinary Agent history does not receive the hidden role context payload or feedback prompt as a user-authored message
