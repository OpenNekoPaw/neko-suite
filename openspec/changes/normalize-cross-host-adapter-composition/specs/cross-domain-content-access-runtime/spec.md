## ADDED Requirements

### Requirement: Content access composes with all canonical host adapters

Cross-domain content access SHALL compose with VSCode, Electron, and Node host adapters through host ports and shared content services instead of package-local resource access implementations.

#### Scenario: Desktop requests a media thumbnail

- **WHEN** Desktop Resource Explorer or a package editor requests a thumbnail for a workspace media resource
- **THEN** the Electron adapter MUST route the request through shared content access or resource cache services
- **AND** the domain package MUST NOT create a Desktop-only thumbnail cache or raw filesystem projection path

#### Scenario: VSCode requests a Webview projection

- **WHEN** VSCode projects a content resource into a Webview
- **THEN** the VSCode adapter MUST use Extension-owned resource authorization and shared content access semantics
- **AND** the durable source identity MUST remain separate from the Webview URI

#### Scenario: TUI loads content for Agent perception

- **WHEN** TUI loads document, image, audio, video, or project content for Agent perception
- **THEN** the Node adapter MUST use host ports and shared content access runtime
- **AND** it MUST return stable content/resource projections without relying on VSCode Webview URI behavior

### Requirement: Resource cache policy is host-neutral

Resource cache layout, manifests, quota, garbage collection, and derived artifact identity SHALL be shared across canonical host adapters unless a host-private cache scope is explicitly declared.

#### Scenario: Cache artifact is produced in one host

- **WHEN** VSCode, Electron, or TUI produces a thumbnail, proxy, document page image, metadata sidecar, or other derived rebuildable artifact for a workspace source
- **THEN** the artifact MUST be recorded according to the shared resource cache policy
- **AND** another host MUST be able to treat the artifact as shared workspace cache or explicitly classify it as host-private with diagnostics
