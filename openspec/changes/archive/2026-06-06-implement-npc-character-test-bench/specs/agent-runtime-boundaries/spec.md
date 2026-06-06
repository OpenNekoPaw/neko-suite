## ADDED Requirements

### Requirement: SubAgent tool policy is explicit
The system SHALL support an explicit SubAgent tool policy with `none`, `all`, and `allow-list` modes. The runtime MUST interpret `none` as an empty tool registry, `all` as the full available registry, and `allow-list` as a filter over registered tool names. New isolation-sensitive sessions MUST NOT rely on `allowedTools: []` to mean no tools.

#### Scenario: None policy creates empty registry
- **WHEN** a SubAgent or NPC session is created with `toolPolicy: { kind: 'none' }`
- **THEN** the Agent config passed to the executor contains zero tool definitions

#### Scenario: Allow-list filters tools
- **WHEN** a SubAgent is created with `toolPolicy: { kind: 'allow-list', tools: ['Read'] }`
- **THEN** the executor receives only the registered `Read` tool definition and no other tools

#### Scenario: All policy preserves unfiltered behavior
- **WHEN** a SubAgent is created with `toolPolicy: { kind: 'all' }`
- **THEN** the executor receives the unfiltered tool registry available to that runtime

### Requirement: NPC runtime sessions preserve Agent boundaries
The system SHALL keep NPC session orchestration in Extension host and host-agnostic Agent runtime boundaries. Webview MUST render NPC session projections only; Extension MUST manage VSCode command handling, project-root resolution, and test artifact file writes; runtime packages MUST NOT import VSCode, React, or Webview APIs to implement NPC prompt or evaluator projection.

#### Scenario: Webview renders NPC projection only
- **WHEN** the Agent Webview displays an NPC test tab
- **THEN** it consumes typed NPC session projection data and does not import `@neko/agent`, `@neko/platform`, or VSCode APIs

#### Scenario: Extension owns project file write
- **WHEN** an NPC transcript/evaluation artifact is saved
- **THEN** Extension host code resolves the current project root and writes `.neko/npc-tests/*.json` through host file APIs

#### Scenario: Runtime projector remains host-agnostic
- **WHEN** NPC prompt and evaluator projector modules are type-checked
- **THEN** they compile without VSCode, React, Webview, Story, Dashboard, or entity store implementation imports
