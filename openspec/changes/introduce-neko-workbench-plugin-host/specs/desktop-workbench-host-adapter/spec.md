## ADDED Requirements

### Requirement: Desktop consumes Workbench Core as a host adapter

Desktop SHALL consume Workbench Core contribution snapshots and Plugin Host descriptors as an Electron AppHost adapter. Desktop MUST NOT be the canonical owner of workbench contribution contracts, resource source semantics, custom editor registry, Agent surface semantics, or plugin manifest schema.

#### Scenario: Desktop starts with workspace

- **WHEN** Desktop starts with a workspace root
- **THEN** Desktop MUST assemble host ports, load Workbench Core contribution snapshots, and render the workbench from those snapshots
- **AND** Electron-specific behavior MUST stay in main/preload/AppHost adapters

#### Scenario: Desktop needs a new view

- **WHEN** a new package needs to add a view to Desktop
- **THEN** the package MUST register a workbench contribution or plugin contribution
- **AND** Desktop MUST NOT require a desktop-only hard-coded view implementation as the canonical path

### Requirement: Desktop resource surfaces are provider-backed

Desktop resource, explorer, assets, generation, market, skills, and search surfaces SHALL be composed from Workbench ResourceSourceProvider contributions. Temporary desktop bootstrap scanners MUST be isolated as host adapters and MUST NOT expose `.neko/.cache` internals as durable identity.

#### Scenario: Resource source provider is registered

- **WHEN** a package registers a resource source provider for assets, skills, market entries, search results, generated assets, or workspace files
- **THEN** Desktop MUST display nodes from that provider through the shared workbench/resource contract
- **AND** provider diagnostics MUST be visible in the UI or test snapshot

#### Scenario: Temporary desktop scanner remains

- **WHEN** Desktop still uses a bootstrap scanner for workspace files or `.neko` resources
- **THEN** the scanner MUST be wrapped behind a ResourceSourceProvider-compatible adapter
- **AND** tests MUST distinguish that temporary adapter from the canonical provider registry

### Requirement: Desktop plugin UI uses sandboxed host bridge

Desktop SHALL render plugin UI through an explicit sandboxed UI host with a typed bridge. Plugin UI MUST NOT receive Node integration, Electron main objects, unrestricted filesystem access, or direct Engine handles.

#### Scenario: Plugin view renders in Desktop

- **WHEN** Desktop renders a plugin-contributed view
- **THEN** the view MUST receive only the granted bridge capabilities, theme/i18n projection, and resource projection descriptors
- **AND** Desktop MUST keep `contextIsolation` and renderer sandbox expectations for plugin UI

#### Scenario: Plugin requests local file

- **WHEN** plugin UI requests local file content
- **THEN** Desktop MUST route the request through Plugin Host permissions and host filesystem/content-access policies
- **AND** the plugin MUST NOT receive raw unrestricted filesystem access

### Requirement: Desktop preserves Engine viewport authority

Desktop SHALL represent professional media, scene, HDR/10-bit, color, texture reuse, and export preview truth through Engine-owned viewport/session descriptors. WebContents, Webview, HTML media, canvas, or WebCodecs projections MUST be marked non-authoritative.

#### Scenario: Creative editor requests professional output

- **WHEN** a creative editor requests a professional viewport
- **THEN** Desktop MUST route the request to an Engine-owned viewport/session descriptor or report an explicit unavailable diagnostic

#### Scenario: Web projection is displayed

- **WHEN** Desktop displays a Webview, HTML media, canvas, or WebCodecs projection
- **THEN** the projection MUST NOT be recorded as authoritative professional output truth
