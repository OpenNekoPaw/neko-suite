## ADDED Requirements

### Requirement: Host ports are primitive contracts only

The system SHALL define Host Adapter ports as local host primitive contracts for environment, workspace, filesystem, paths, secrets, external opening, diagnostics, and access policy. The Host Adapter contract package MUST NOT define domain capabilities, Agent tools, Webview messages, Engine operations, cache manifests, document readers, asset library APIs, entity queries, or search index APIs.

#### Scenario: Host contract package remains implementation-free

- **WHEN** production source under the Host Adapter contract package is checked
- **THEN** it SHALL NOT import `vscode`, Node filesystem/process/path modules, React, Webview code, Agent runtime code, Engine client code, or domain implementation packages
- **AND** automated boundary tests SHALL fail if those concrete host or domain imports are introduced

#### Scenario: Domain consumes host ports through its own runtime

- **WHEN** a domain needs workspace files, path variables, storage roots, secrets, or diagnostics
- **THEN** it SHALL consume the relevant Host Adapter ports through that domain's runtime or provider
- **AND** the Host Adapter package SHALL NOT become the owner of that domain's data model or behavior

### Requirement: Host workspace exposes roots without owning `.neko` semantics

The system SHALL expose workspace root, user storage root, storage layout, path variables, and workspace trust through Host Adapter ports. The internal meaning of `workspace/.neko` files and directories MUST remain owned by the relevant domain runtime.

#### Scenario: Client locates workspace data root

- **WHEN** TUI, VSCode, or a standalone client starts with a workspace
- **THEN** the Host Workspace port SHALL expose enough information for the client composition root to locate the workspace storage layout
- **AND** individual domains SHALL interpret their own `.neko`, cache, index, memory, asset, or entity data through their owning runtime

#### Scenario: Host contract does not expose cache internals

- **WHEN** a caller imports Host Adapter contracts
- **THEN** the contracts SHALL NOT expose resource cache manifest schemas, search index layouts, entity store file layouts, or document-reader materialization paths as host primitives

### Requirement: Host access policy separates Agent from client storage mutation

The system SHALL provide an access policy contract that distinguishes client, domain-runtime, Agent, and test actors. Client and domain-runtime actors MAY access workspace domain data through owning runtimes, but Agent tools MUST NOT directly perceive, enumerate, read, or mutate `.neko` internals.

#### Scenario: Agent direct `.neko` access is denied

- **WHEN** an Agent generic file tool asks to read, write, delete, or list a path under `workspace/.neko`
- **THEN** the host access policy SHALL deny the operation with a fail-visible diagnostic
- **AND** the tool SHALL NOT recover success through a direct filesystem call or cache manifest lookup

#### Scenario: Client commits domain mutation through owning runtime

- **WHEN** the TUI process accepts a domain-owned mutation such as updating memory, rebuilding search index data, or saving asset metadata
- **THEN** the client or domain-runtime actor MAY write the relevant `.neko` data through the owning runtime
- **AND** the Agent SHALL receive only the resulting sanitized projection or diagnostic

### Requirement: Host implementations live at composition roots

VSCode, TUI, Electron, Tauri/Rust native, and test hosts SHALL implement Host Adapter ports at their composition roots or in explicitly scoped host implementation packages. Domain packages and Agent runtime MUST NOT import those concrete implementations directly.

#### Scenario: VSCode host implementation uses VSCode API

- **WHEN** the VSCode Extension Host implements host ports
- **THEN** VSCode API usage SHALL remain inside Extension Host adapter or service modules
- **AND** shared contracts and Webview packages SHALL NOT import that implementation

#### Scenario: TUI host implementation uses Node API

- **WHEN** the TUI implements host ports
- **THEN** Node API usage SHALL remain inside the TUI host adapter or a future reusable Node host implementation package
- **AND** Agent runtime, Webview code, and domain core contracts SHALL depend only on the host port interfaces

