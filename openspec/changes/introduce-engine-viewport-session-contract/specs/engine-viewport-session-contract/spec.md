## ADDED Requirements

### Requirement: Engine viewport session declares output authority

The system SHALL define an Engine viewport session contract that identifies `neko-engine` as the authoritative output runtime. Webview, canvas, WebCodecs, HTML media, and Electron renderer projections MUST NOT be accepted as authoritative professional output truth.

#### Scenario: Valid Engine-owned viewport session

- **WHEN** a host creates an Engine viewport session contract
- **THEN** the contract MUST identify `neko-engine` as the owner runtime
- **AND** the output target MUST be marked authoritative
- **AND** the session MUST include stable capabilities for output truth, control routing, color pipeline, and texture boundary status

#### Scenario: Web projection claims output authority

- **WHEN** a viewport session contract marks a Webview, canvas, WebCodecs, HTML media, or Electron renderer projection as authoritative output
- **THEN** validation MUST fail visibly
- **AND** the host MUST NOT register the session as a successful Workbench viewport contribution

### Requirement: Viewport controls are separate from output truth

The Engine viewport session contract SHALL model control surfaces separately from the authoritative output surface. Control surfaces MAY send viewport intents, but MUST NOT imply ownership of rendered output truth.

#### Scenario: Desktop exposes Webview controls

- **WHEN** Desktop exposes viewport buttons, inspector controls, or overlays in the Webview UI
- **THEN** those controls MUST be represented as control surfaces
- **AND** their host kind MUST be distinct from the Engine output target

### Requirement: Non-authoritative projections remain explicit

The Engine viewport session contract SHALL list non-authoritative projections explicitly, including the reason they are not output truth.

#### Scenario: Web projection is listed for preview

- **WHEN** a host lists `html-video`, `canvas`, `webcodecs`, or `electron-webcontents` as a projection
- **THEN** the projection MUST be marked non-authoritative
- **AND** it MUST include a reason such as codec limits, color-management limits, texture-copy limits, or Webview sandbox limits

### Requirement: Workbench viewport contribution is projected from the session

Workbench viewport session contributions SHALL be projected from the Engine viewport session contract rather than from host-local loose capability fields.

#### Scenario: Desktop registers viewport contribution

- **WHEN** Desktop assembles Workbench Core contributions
- **THEN** the viewport contribution MUST use the session id, label, capabilities, and non-authoritative projection ids from the Engine viewport session contract
- **AND** the contribution MUST keep `neko-engine` as the authoritative owner runtime
