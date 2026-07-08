## ADDED Requirements

### Requirement: Host-neutral workbench contributions

The system SHALL define host-neutral workbench contribution descriptors for commands, menus, keybindings, view containers, views, custom editors, resource sources, Agent surfaces, and viewport sessions without importing React, DOM, VSCode, Electron, Node-only APIs, or feature package internals.

#### Scenario: Shared contribution model is loaded by multiple hosts

- **WHEN** VSCode, Desktop, or TUI assembly requests available workbench contributions
- **THEN** the returned descriptors MUST be expressed as host-neutral data with stable ids, labels or i18n keys, contribution kind, owner package/plugin id, activation metadata, and required host capabilities
- **AND** the descriptors MUST NOT include host runtime handles such as VSCode objects, Electron objects, Node file handles, Webview URIs, Engine tokens, or React component instances

#### Scenario: Forbidden dependency is introduced

- **WHEN** Workbench Core imports React, DOM, VSCode, Electron, Node-only APIs, or feature package internals
- **THEN** boundary validation MUST fail before the package is accepted

### Requirement: Contribution registration fails visibly

The workbench contribution runtime SHALL validate contribution ids, kinds, ownership, activation events, and required capabilities. Invalid, duplicate, unsupported, or unregistered contributions MUST fail visibly with typed diagnostics or test-time errors.

#### Scenario: Duplicate contribution id

- **WHEN** two packages or plugins register the same contribution id in the same contribution namespace
- **THEN** registration MUST fail with a diagnostic that identifies the duplicated id and both owners

#### Scenario: Unsupported contribution kind

- **WHEN** a manifest or provider declares a contribution kind unknown to the current Workbench Core schema
- **THEN** registration MUST fail closed instead of dropping the contribution or returning an empty successful surface

### Requirement: Resource providers expose stable refs and runtime projections separately

Resource source contributions SHALL return stable resource identity separately from short-lived runtime projection data. Durable workbench data MUST use stable refs, workspace-relative paths, `${VAR}/path` refs, asset/entity ids, or domain-owned refs.

#### Scenario: Resource provider returns thumbnail projection

- **WHEN** a resource provider returns a node with a thumbnail or preview
- **THEN** the node MUST include a stable ref suitable for durable identity
- **AND** any URL, Webview URI, local protocol URL, Engine descriptor, or thumbnail URL MUST be marked as current-session projection data

#### Scenario: Provider leaks cache path as identity

- **WHEN** a resource provider uses `.neko/.cache`, an absolute cache path, a Webview URI, a blob URL, or an Engine token as durable identity
- **THEN** validation MUST reject the node or return a typed diagnostic

### Requirement: Editor contributions declare selector and runtime ownership

Custom editor contributions SHALL declare document selectors, editor kind, package/plugin owner, supported hosts, and runtime ownership separately from the host that renders them.

#### Scenario: Desktop opens a package-owned editor

- **WHEN** Desktop opens a document matched by a custom editor contribution
- **THEN** Desktop MUST resolve the editor through the contribution registry
- **AND** the owning package/plugin MUST supply the editor runtime or host-adapter entry
- **AND** Desktop MUST NOT use a desktop-local switch statement as the canonical editor registry

#### Scenario: No editor contribution matches

- **WHEN** a document does not match any registered custom editor contribution
- **THEN** the workbench MUST return a typed no-editor diagnostic or route to an explicitly registered fallback editor

### Requirement: Agent and viewport surfaces are first-class contributions

The workbench contribution runtime SHALL support Agent surfaces and Engine viewport descriptors as first-class contribution types. Agent surfaces and viewport sessions MUST remain projections over Agent runtime and `neko-engine` ownership.

#### Scenario: Agent right panel and main panel are contributed

- **WHEN** the Agent package registers a contextual right panel and a main Agent Studio surface
- **THEN** the workbench MUST place them using contribution descriptors rather than desktop-only component wiring

#### Scenario: Viewport session descriptor is rendered

- **WHEN** a creative editor requires a professional viewport
- **THEN** the workbench MUST consume an Engine-owned viewport descriptor
- **AND** host Webview, canvas, or HTML media projections MUST NOT be marked as authoritative professional output
