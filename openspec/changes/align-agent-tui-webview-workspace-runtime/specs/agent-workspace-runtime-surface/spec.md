## ADDED Requirements

### Requirement: Webview and TUI share one effective workspace runtime surface

Neko Agent SHALL expose one workspace-scoped runtime surface contract that both Webview and TUI consume for session assembly, effective config, model selection, MCP, Skills, commands, context settings, task records, and project cache policy.

#### Scenario: New Webview and TUI sessions use the same workspace policy
- **WHEN** a Webview session and a TUI session are opened for the same workspace
- **THEN** both sessions MUST receive effective runtime inputs from the same workspace runtime surface contract
- **AND** they MUST NOT independently compute provider, model, scalar parameter, Skill catalog, command catalog, task scope, or cache policy from package-local readers

#### Scenario: Runtime surface reports blocking diagnostics
- **WHEN** the shared runtime surface cannot resolve required config, workspace root, Skill source, command effect, content-access runtime, or task scope
- **THEN** it MUST return a typed diagnostic or throw in tests
- **AND** neither Webview nor TUI MUST recover success by falling back to stale state, hard-coded defaults, empty catalogs, or a legacy interactive path

### Requirement: Interactive Agent sessions use canonical runtime assembly

Interactive Webview and TUI sessions SHALL be created through the canonical Agent runtime session assembly path. Host adapters MAY provide presentation stores, event sinks, confirmation UI, and host capabilities, but they MUST NOT fork core session assembly.

#### Scenario: TUI session starts
- **WHEN** the user starts the TUI interactive surface
- **THEN** TUI MUST create its Agent session through the canonical runtime assembly path
- **AND** core tools, AGENTS overlays, project memory, context settings, Skill lifecycle projection, task projection, and capability prompt fragments MUST be injected by that shared path

#### Scenario: Webview session starts
- **WHEN** the user starts or reopens a Webview Agent conversation
- **THEN** Extension/Webview MUST create or update the Agent session through the same canonical runtime assembly path
- **AND** Webview-specific messages and URI projections MUST remain Extension adapter effects rather than becoming runtime contract fields

### Requirement: Interactive conversations use workspace-scoped canonical ids

TUI and Webview conversations SHALL use canonical workspace-scoped conversation ids derived from the workspace root. TUI resume requests SHALL reject non-canonical ids, including old `cli-*` ids, instead of loading compatibility records.

#### Scenario: New TUI conversation is created
- **WHEN** TUI creates a new conversation in a workspace
- **THEN** the conversation id MUST use the canonical workspace-scoped conversation id format
- **AND** it MUST NOT use a TUI-only `cli-*` id format for the new record

#### Scenario: Existing CLI conversation id is requested
- **WHEN** TUI receives a resume request for an old `cli-*` id
- **THEN** it MUST return a fail-visible diagnostic requiring a canonical workspace-scoped conversation id
- **AND** it MUST NOT load, migrate, rewrite, or delete the old record as part of TUI resume

### Requirement: Workspace task records are separated from host-private leases

Agent async work SHALL distinguish workspace-visible task records from host-private runtime leases. Workspace-visible records MAY be observed by both Webview and TUI. Host-private leases such as VS Code terminal handles, process handles, recovery tokens, and no-workspace resources MUST remain owned by the host that created them.

#### Scenario: Workspace-visible task is created
- **WHEN** an Agent workflow creates a long-running task whose status should be visible for the workspace
- **THEN** the task record MUST be written to the classified workspace-visible task store
- **AND** Webview and TUI MUST be able to project the record without requiring host-private handles from the other surface

#### Scenario: Host-private lease is encountered from another surface
- **WHEN** TUI sees a task record whose active lease is owned by the Extension host
- **THEN** TUI MUST display or return a host-private lease diagnostic for controls that require that live handle
- **AND** it MUST NOT claim it can resume, cancel, or attach to the VS Code handle unless a typed cross-host control contract exists

### Requirement: Host-specific capabilities are explicit surface effects

Capabilities, commands, projections, and resources that exist only in Webview or only in TUI SHALL be declared as explicit surface effects. They MUST NOT be hidden inside shared runtime results as if they were available to every host.

#### Scenario: VS Code-only capability is discovered
- **WHEN** Extension discovers a VS Code-only Agent capability provider
- **THEN** the shared runtime surface MUST mark it as Extension/Webview scoped
- **AND** TUI MUST receive either no provider or an unavailable diagnostic rather than a callable phantom capability

#### Scenario: TUI-only command is registered
- **WHEN** TUI registers a terminal-only command effect
- **THEN** the command catalog MUST identify it as TUI scoped
- **AND** Webview MUST NOT expose the command as a successful action unless an Extension effect is also registered
