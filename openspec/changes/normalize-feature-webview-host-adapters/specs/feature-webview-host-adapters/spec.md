## ADDED Requirements

### Requirement: Feature packages own Webview host adapter descriptors

Feature Webview packages SHALL expose host-neutral adapter descriptors through public package entries when their UI is consumed by a host workbench. Hosts MUST consume these descriptors instead of owning feature UI semantics in host-local switch statements.

#### Scenario: Desktop registers a package-owned feature adapter

- **WHEN** Desktop assembles feature Webview adapters for Workbench Core custom editor registration
- **THEN** the adapter descriptor MUST identify the owning feature package
- **AND** Desktop MUST NOT mark that package-owned feature adapter as `neko-desktop-bootstrap`

#### Scenario: Host imports adapter descriptors

- **WHEN** a host imports a feature Webview adapter descriptor entry
- **THEN** the descriptor MUST be pure serializable data
- **AND** it MUST NOT include React elements, VSCode objects, Electron objects, Node file handles, Webview URIs, blob URLs, Engine tokens, or live runtime handles

### Requirement: Feature Webview adapter descriptors declare host requirements

Feature Webview adapter descriptors SHALL declare stable id, owner, surface kind, runtime entry id, supported hosts, required host capabilities, and editor selectors when applicable. Hosts MUST validate those requirements before registering a contribution.

#### Scenario: Host supports adapter requirements

- **WHEN** a host registers an adapter whose supported hosts and required capabilities match the current host
- **THEN** the adapter MAY be projected into a Workbench custom editor, view, or Webview contribution with the same package owner

#### Scenario: Host does not support adapter requirements

- **WHEN** a host registers an adapter with an unsupported host kind or missing required host capability
- **THEN** registration MUST return a typed diagnostic
- **AND** the host MUST NOT create a successful empty or desktop-owned fallback contribution for that adapter

### Requirement: Adapter registry fails visibly

The feature Webview adapter registry SHALL fail visibly for duplicate ids, invalid descriptor shapes, missing runtime entry ids, and unknown adapter references.

#### Scenario: Duplicate adapter id

- **WHEN** two descriptors register the same feature Webview adapter id
- **THEN** the registry MUST return a diagnostic that identifies the duplicate id and the conflicting owners

#### Scenario: Unknown adapter reference

- **WHEN** Desktop or another host resolves a custom editor or surface through an adapter id that was not registered
- **THEN** the host MUST return a typed diagnostic or throw in tests
- **AND** it MUST NOT silently route to a host-local placeholder UI

### Requirement: Temporary host bootstrap mappings remain visible

Hosts MAY keep temporary bootstrap mappings for unmigrated features during prelaunch migration, but those mappings MUST be explicitly marked as temporary and MUST NOT claim ownership of package-owned adapters.

#### Scenario: Unmigrated feature still uses bootstrap mapping

- **WHEN** Desktop exposes a Webview or custom editor mapping that has not yet moved to a package-owned descriptor
- **THEN** the contribution MUST identify the Desktop bootstrap owner
- **AND** the mapping MUST be distinguishable from package-owned adapters in tests and diagnostics
