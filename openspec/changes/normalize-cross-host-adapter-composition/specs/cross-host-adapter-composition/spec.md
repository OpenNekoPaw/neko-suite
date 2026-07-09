## ADDED Requirements

### Requirement: Canonical host adapter composition roots

The system SHALL define VSCode, Node/TUI, and Electron/Desktop as canonical host adapter composition roots, and feature packages MUST NOT implement separate full host stacks for each of those hosts.

#### Scenario: Feature package adds a host-neutral surface

- **WHEN** a feature package adds a new editor, view, panel, or runtime surface
- **THEN** the package MUST expose package-owned descriptors, props, runtime contracts, or capability providers
- **AND** the package MUST NOT add parallel VSCode, Node, and Electron UI implementations for the same surface

#### Scenario: Host root registers a package surface

- **WHEN** VSCode, TUI, or Desktop consumes a package-owned contribution
- **THEN** the host root MUST provide concrete host effects through its own adapter implementation
- **AND** the package-owned descriptor MUST remain the source of feature identity, selectors, labels, and host capability requirements

### Requirement: Host capabilities gate adapter registration

The system SHALL validate package-owned descriptors against the active host kind and declared host capabilities before registering or rendering them.

#### Scenario: Host lacks a required capability

- **WHEN** a package descriptor requires a host capability that the active host does not provide
- **THEN** registration MUST fail with a machine-readable diagnostic naming the missing capability
- **AND** the host MUST NOT silently render an empty placeholder as a successful adapter result

#### Scenario: Unsupported host attempts to register a descriptor

- **WHEN** a descriptor declares supported hosts and the active host kind is not included
- **THEN** the host MUST reject that descriptor with an unsupported-host diagnostic
- **AND** no package-local fallback adapter may override that decision

### Requirement: Host-specific APIs stay in host adapters

Production feature UI and domain runtime code SHALL keep concrete VSCode, Electron, and Node APIs out of host-neutral surfaces, except inside explicitly approved host adapter files or thin facades that delegate to a shared host adapter.

#### Scenario: Feature Webview needs host behavior

- **WHEN** a feature Webview needs to open a file, read a resource, send an Agent command, project a thumbnail, or invoke an Engine viewport action
- **THEN** it MUST use an injected host facade, package-owned host-neutral port, or typed message contract
- **AND** it MUST NOT directly import `vscode`, Electron IPC, Node filesystem modules, or unscoped global host shims

#### Scenario: Guardrail detects a new host-specific import

- **WHEN** production feature UI code introduces a direct concrete host API outside an approved adapter boundary
- **THEN** automated validation MUST fail with an actionable diagnostic naming the file and approved replacement boundary

### Requirement: Graphical hosts scope runtime channels

Graphical hosts that can run multiple package roots in one process SHALL scope Webview/runtime messages by runtime identity instead of relying on one global untyped channel.

#### Scenario: Desktop hosts multiple package roots

- **WHEN** Desktop runs Agent, Cut, Canvas, or another package runtime in the same Electron renderer process
- **THEN** host messages MUST be delivered only to the intended runtime channel
- **AND** unrelated package roots MUST NOT receive, ignore, or parse those messages as part of normal operation

#### Scenario: Runtime id is unknown

- **WHEN** a scoped host message references an unknown runtime id
- **THEN** the host MUST fail visibly with an unknown-runtime diagnostic
- **AND** it MUST NOT broadcast the message globally as a fallback

### Requirement: Existing host ports remain primitive

The system SHALL keep `@neko/host` focused on primitive local host ports and SHALL NOT move Agent, Workbench, Webview, feature UI, or plugin runtime behavior into that package.

#### Scenario: New host behavior is designed

- **WHEN** a new host behavior is required for Agent messages, Workbench surfaces, plugin UI, or feature rendering
- **THEN** the behavior MUST be modeled in Agent, Workbench, UI, or package-owned contracts
- **AND** `@neko/host` MAY receive only the primitive local capability needed to implement that behavior
