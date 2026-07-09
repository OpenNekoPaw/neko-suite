## ADDED Requirements

### Requirement: Project file IO uses host adapter file operations

Project file load, save, backup, revert, and resource-link operations SHALL route through host-authorized file operations for VSCode, Electron, and Node hosts rather than package-local direct filesystem or Webview-only assumptions.

#### Scenario: Webview editor requests a project save

- **WHEN** a package Webview editor requests saving an `nk*` project document
- **THEN** the request MUST flow through the host adapter or project file store boundary
- **AND** the Webview MUST NOT write the project file directly through Node, Electron, browser `File`, or raw local path APIs

#### Scenario: Desktop saves a project file

- **WHEN** Desktop saves a project file from a package-owned editor surface
- **THEN** the Electron adapter MUST authorize and perform the file operation through shared project file IO contracts
- **AND** the package editor MUST not maintain a Desktop-only save path with divergent path contraction or diagnostics

#### Scenario: TUI writes a project or artifact file

- **WHEN** TUI/headless Agent behavior writes a project output or artifact file
- **THEN** the Node adapter MUST perform the operation through host ports and shared file/content policy
- **AND** the durable file identity MUST follow the same portability and diagnostic rules as graphical hosts

### Requirement: Runtime handles remain outside project documents across hosts

All hosts SHALL keep Webview URIs, Electron runtime URLs, Engine stream tokens, cache artifact paths, and Node temporary paths out of durable project documents.

#### Scenario: Host projects a resource for preview

- **WHEN** VSCode, Electron, or Node projects a resource for preview, thumbnail, playback, or Agent perception
- **THEN** the projected handle MUST remain runtime-only
- **AND** save behavior MUST persist only durable source refs, workspace-relative paths, configured variable paths, asset/entity ids, or other approved project identities
