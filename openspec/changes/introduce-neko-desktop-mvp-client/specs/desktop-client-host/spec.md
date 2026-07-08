## ADDED Requirements

### Requirement: Electron desktop host composition
The system SHALL provide a standalone Electron MVP package that separates main, preload, and renderer responsibilities.

#### Scenario: Focused desktop build
- **WHEN** the desktop package build command is run
- **THEN** the Electron main, preload, and renderer entry points compile without requiring VSCode extension activation

#### Scenario: Cross-platform desktop launch path
- **WHEN** the desktop package is built on macOS, Linux, or Windows
- **THEN** the start command resolves the Electron entry point, preload bundle, and renderer HTML through platform-neutral Node path handling

#### Scenario: Non-GUI desktop smoke check
- **WHEN** the desktop smoke command is run in CI or a headless shell
- **THEN** it verifies the built bundle, Electron dependency, package entry metadata, and renderer asset references without opening a GUI window

#### Scenario: Desktop package remains a composition root
- **WHEN** desktop source files are inspected
- **THEN** renderer code does not import VSCode, Node built-ins, Electron main APIs, or Engine internals

### Requirement: Compatible editor workbench shell
The system SHALL present the desktop renderer as a docked professional editor workbench rather than an isolated dashboard-style app.

#### Scenario: Professional editor zones
- **WHEN** the desktop renderer loads
- **THEN** it exposes an activity bar, resource sidebar, central editor/viewport region, and right Agent/inspector panel

#### Scenario: Agent creative context projection
- **WHEN** a project resource is selected in the desktop renderer
- **THEN** the right Agent panel and inspector tab present creative context without importing Agent runtime internals into the renderer

#### Scenario: Layout compatibility
- **WHEN** future VSCode, Unity-like, or Unreal-like workflows are added
- **THEN** they can map to existing workbench zones rather than requiring an incompatible new page shell

### Requirement: Package-owned creative UI authority
The system SHALL consume Canvas, Cut, Audio, Sketch, Model, and Preview creative surfaces through owning package public host-adapter entries rather than implementing duplicate domain UI inside desktop.

#### Scenario: Desktop registers package adapters
- **WHEN** the desktop renderer maps a workspace file to a creative editor surface
- **THEN** it imports the matching `host-adapter` entry from the owning package and passes a host-neutral document/runtime projection to that adapter

#### Scenario: No desktop-local domain surface clone
- **WHEN** desktop renderer source is inspected
- **THEN** it does not define Canvas, Cut, Audio, Sketch, Model, or Preview workbench display components locally

#### Scenario: Shared cross-client workbench primitives
- **WHEN** desktop, VSCode Webviews, or future clients render editor shell chrome
- **THEN** they use shared workbench primitives and package-owned domain adapters so platform hosts do not drift into separate UI products

### Requirement: Typed desktop bridge
The system SHALL expose desktop host capabilities to the renderer through a typed preload bridge instead of direct Node or Electron access.

#### Scenario: Renderer reads desktop snapshot
- **WHEN** the renderer requests the desktop snapshot
- **THEN** it receives host identity, workspace summary, resource surfaces, and viewport summary through the bridge contract

#### Scenario: Unknown bridge channel
- **WHEN** a renderer or test attempts to use an unknown bridge channel
- **THEN** the host rejects it with a visible error rather than returning default success

### Requirement: Desktop shell internationalization
The system SHALL localize fixed desktop workbench shell text through shared i18n primitives instead of hardcoding all chrome strings in renderer components.

#### Scenario: Host locale projected to renderer
- **WHEN** the desktop renderer receives the desktop snapshot
- **THEN** it can resolve the host locale and update workbench shell text through `@neko/shared` i18n

#### Scenario: Domain projection labels remain source-owned
- **WHEN** resource nodes, Agent names, or diagnostic strings are displayed
- **THEN** the desktop shell preserves source-provided projection labels instead of translating domain-owned facts locally

#### Scenario: Package host adapter locale projection
- **WHEN** the desktop renderer invokes a package-owned creative host adapter
- **THEN** it passes the host locale through the shared host-adapter projection so the owning package resolves its own localized chrome

### Requirement: VSCode surface preservation
The system SHALL keep VSCode extension packages as supported adapters while introducing desktop as a separate client surface.

#### Scenario: Desktop MVP added
- **WHEN** desktop files are added
- **THEN** existing VSCode package manifests and activation paths remain present and are not replaced by desktop code
