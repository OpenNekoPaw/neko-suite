## ADDED Requirements

### Requirement: Host-neutral resource provider snapshots

The system SHALL define host-neutral resource provider snapshots for workspace explorer and resource surfaces. Provider snapshots MUST include provider id, surface id, provider kind, owner id, nodes, diagnostics, and temporary/bootstrap status without host runtime handles.

#### Scenario: Provider snapshot is created

- **WHEN** a workspace or domain provider returns resource nodes
- **THEN** each node MUST include a stable ref and MAY include current-session runtime projections
- **AND** provider metadata MUST identify the provider owner and provider kind

#### Scenario: Provider snapshot has unsafe identity

- **WHEN** a provider node uses `.neko/.cache`, an absolute path, a Webview URI, a blob URL, or an Engine token as stable identity
- **THEN** validation MUST fail visibly with a typed diagnostic or thrown validation error

### Requirement: Workspace file classification is shared

The system SHALL provide shared workspace file kind classification and media kind detection for host adapters. Classification MUST remain pure string/data logic and MUST NOT depend on Node, VSCode, Electron, React, DOM, or feature package internals.

#### Scenario: Desktop classifies media and project files

- **WHEN** Desktop scans workspace files
- **THEN** it MUST use the shared classification helper for Neko project files, images, video, audio, model files, puppet files, story/doc/config files, archives, and unknown files

#### Scenario: Shared helper imports host APIs

- **WHEN** the classification helper imports Node, VSCode, Electron, React, DOM, or feature package internals
- **THEN** boundary validation MUST fail

### Requirement: Runtime projections are separate from durable refs

Resource provider snapshots SHALL keep durable stable refs separate from current-session runtime projections such as thumbnail URLs, local protocol URLs, Webview URIs, and Engine descriptors.

#### Scenario: Image thumbnail projection is present

- **WHEN** a workspace image node includes a thumbnail URL
- **THEN** the node MUST still include a portable stable ref
- **AND** the thumbnail URL MUST be represented as current-session projection data
