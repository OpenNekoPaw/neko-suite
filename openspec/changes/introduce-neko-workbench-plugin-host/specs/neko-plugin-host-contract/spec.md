## ADDED Requirements

### Requirement: Versioned Neko plugin manifest

The system SHALL define a versioned Neko plugin manifest schema that can declare commands, menus, keybindings, views, custom editors, webviews, resource sources, Agent tools, skills, themes, icons, activation events, permissions, trust, and supported hosts.

#### Scenario: Valid plugin manifest is loaded

- **WHEN** a plugin manifest declares a supported schema version, valid plugin id, contribution ids, activation events, permissions, and supported hosts
- **THEN** the Plugin Host MUST produce a typed plugin descriptor and contribution descriptors
- **AND** the descriptor MUST preserve plugin provenance for every contribution

#### Scenario: Unsupported manifest version

- **WHEN** a plugin manifest declares an unsupported schema version
- **THEN** the Plugin Host MUST fail closed with a typed diagnostic
- **AND** no contribution from that manifest MUST be registered

### Requirement: Plugin activation is explicit and capability-scoped

The Plugin Host SHALL activate plugins only through declared activation events and SHALL expose only the extension API capabilities granted by manifest permissions and host trust policy.

#### Scenario: Command activation

- **WHEN** a user invokes a command contributed by an inactive plugin
- **THEN** the Plugin Host MUST check the plugin activation event and permissions before activation
- **AND** the plugin MUST receive only the command, workspace, resource, Agent, Engine, or UI APIs granted to it

#### Scenario: Plugin requests undeclared capability

- **WHEN** plugin code requests an API capability not declared in its manifest or not allowed by trust policy
- **THEN** the Plugin Host MUST reject the request with a diagnostic instead of exposing the capability

### Requirement: Plugin UI is sandboxed in approved surfaces

Plugin-provided UI SHALL run only inside approved workbench surfaces such as contributed views, custom editors, webview panels, Agent cards, resource action UI slots, or other explicitly registered sandboxed roots. Plugin UI MUST NOT mutate the main Workbench DOM or import host APIs directly.

#### Scenario: Plugin contributes a custom view

- **WHEN** a plugin contributes a custom view
- **THEN** the host MUST render the view in a controlled surface with explicit bridge APIs, theme projection, i18n projection, and permission-limited host calls

#### Scenario: Plugin attempts direct DOM or host API access

- **WHEN** plugin UI attempts to access Electron, VSCode, Node, the main Workbench DOM, or unscoped global host APIs
- **THEN** the host MUST block the access or surface a typed diagnostic

### Requirement: Trust levels govern plugin execution

The Plugin Host SHALL classify plugins by trust level and SHALL require explicit approval or policy for untrusted, community, irreversible, file-writing, Engine-executing, Agent-tool, or external-network capabilities.

#### Scenario: Untrusted plugin contributes Agent tool

- **WHEN** an untrusted plugin contributes an Agent tool
- **THEN** the tool MUST NOT be injected into Agent context by default
- **AND** the Plugin Host MUST require explicit trust policy or user approval before the tool can execute

#### Scenario: Core plugin contributes trusted view

- **WHEN** a core Neko package contributes a trusted view
- **THEN** the Plugin Host MAY register the view without user approval
- **AND** provenance and permissions MUST still be recorded

### Requirement: VSCode compatibility is a safe subset

The system SHALL define VSCode compatibility as explicit mapping of safe contribution concepts, not full VSCode API compatibility. Unsupported VSCode contribution points or API calls MUST fail visibly.

#### Scenario: Compatible VSCode-like command contribution

- **WHEN** a VSCode-like manifest declares a command, menu, keybinding, view, or custom editor that maps to a supported Neko contribution
- **THEN** the compatibility adapter MUST translate it into a Neko contribution descriptor with provenance and host capability requirements

#### Scenario: Unsupported VSCode API call

- **WHEN** a plugin expects an unsupported VSCode API or contribution point
- **THEN** the compatibility adapter MUST return a typed unsupported diagnostic instead of silently pretending the API exists
