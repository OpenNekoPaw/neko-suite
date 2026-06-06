## ADDED Requirements

### Requirement: Agent slash catalog excludes cross-conversation NPC launch commands
The Agent Webview slash command catalog SHALL expose commands that operate within or intentionally annotate the current Agent conversation. It MUST NOT expose NPC roleplay launch commands that switch the user into a separate `npc-test` conversation as normal slash suggestions or help entries.

#### Scenario: Slash catalog hides NPC roleplay launch
- **WHEN** the Agent Webview receives built-in slash command metadata from Extension
- **THEN** commands such as `/as` that launch isolated NPC roleplay tests are omitted from the visible slash command catalog

#### Scenario: Plugin slash commands remain separate
- **WHEN** plugin slash commands are registered by external extensions
- **THEN** the filtering of built-in NPC roleplay launch commands does not remove unrelated plugin slash commands that operate in the current Agent conversation

#### Scenario: Manual hidden command does not mutate current chat
- **WHEN** Extension keeps a hidden compatibility parser for a cross-conversation NPC launch command
- **THEN** that parser delegates to an explicit command/controller and does not let Webview treat the command as an ordinary Agent turn result

### Requirement: Agent NPC validation workflows may use tools under ordinary Agent policy
The Agent runtime SHALL support NPC-related analysis and validation workflows as ordinary Agent work. These workflows MAY use project-read and analysis tools allowed by Agent policy, but MUST remain distinct from `npc-test` roleplay responders that use `toolPolicy: { kind: 'none' }`.

#### Scenario: Validation workflow reads project evidence
- **WHEN** an Agent NPC validation workflow needs script occurrences, entity facts, or relationship context
- **THEN** it may use the same project-scoped tools and capability ports available to ordinary Agent analysis

#### Scenario: Roleplay responder remains no-tool
- **WHEN** an `npc-test` roleplay responder is active at the same time as Agent supports validation workflows
- **THEN** the roleplay responder still receives an empty tool registry and cannot read or mutate project state at runtime

#### Scenario: Validation output is not direct mutation
- **WHEN** a validation workflow produces recommended changes to a character
- **THEN** Agent reports structured suggestions and requires an explicit apply action through the owning entity source before project facts change
