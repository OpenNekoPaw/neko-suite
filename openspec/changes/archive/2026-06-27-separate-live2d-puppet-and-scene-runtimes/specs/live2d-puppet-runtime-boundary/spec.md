## ADDED Requirements

### Requirement: Puppet runtime owns NKP character execution

The system SHALL execute `.nkp profile: live2d` and `.nkp profile: neko-puppet` documents through the Puppet runtime boundary, not through the generic Scene runtime boundary.

#### Scenario: Open a Live2D NKP document
- **WHEN** a user opens an `.nkp` document with `profile: live2d`
- **THEN** the system MUST route runtime execution to the Puppet service
- **AND** the editor surface MUST be owned by `neko-puppet`
- **AND** the document MUST expose character parameters, expressions, motions, physics, tracking mappings, diagnostics, and puppet preview state as Puppet domain behavior

#### Scenario: Open a native Neko Puppet document
- **WHEN** a user opens an `.nkp` document with `profile: neko-puppet`
- **THEN** the system MUST route runtime execution to the Puppet service
- **AND** native mesh, bone, BlendShape, parameter, motion, expression, and tracking behavior MUST remain Puppet domain behavior

### Requirement: Puppet runtime adapters are SDK-neutral at public boundaries

The system SHALL select Puppet runtime implementations through stable adapter ids, capability descriptors, source refs, and import settings. Public DTOs, Proto contracts, `neko-client` types, Webview messages, and durable `.nkp` project files MUST NOT expose Cubism SDK object types, native handles, or SDK-owned lifecycle objects.

#### Scenario: Persist Live2D adapter selection
- **WHEN** a `.nkp profile: live2d` document is saved
- **THEN** the document MAY persist a Puppet runtime adapter id and version such as `live2d-moc3-compat` or `live2d-cubism`
- **AND** it MUST persist stable source refs or import settings needed to recreate the runtime
- **AND** it MUST NOT persist Cubism SDK native handles, Webview URLs, engine session ids, range URLs, stream ids, or cache-only paths as durable identity

#### Scenario: Send a Puppet runtime command
- **WHEN** `neko-puppet`, `neko-client`, or an Agent capability sends a Puppet runtime command
- **THEN** the command MUST use SDK-neutral names for parameters, motions, expressions, tracking inputs, source refs, adapter ids, and diagnostics
- **AND** the command MUST NOT require callers to construct or understand Cubism SDK objects

### Requirement: Official Cubism SDK support is feature-gated

The system SHALL treat official Live2D Cubism SDK support as an optional adapter capability. If the Cubism adapter is not compiled, installed, licensed, or enabled, callers MUST receive a stable diagnostic instead of silently falling back while claiming Cubism SDK behavior.

#### Scenario: Cubism adapter is unavailable
- **WHEN** a `.nkp` document requests the `live2d-cubism` adapter and the adapter is unavailable
- **THEN** the system MUST report a machine-readable diagnostic such as `cubism-adapter-unavailable`
- **AND** the diagnostic MUST include safe context for why the adapter cannot run
- **AND** the system MUST NOT report that the official Cubism SDK is active

#### Scenario: Cubism adapter is available
- **WHEN** a `.nkp` document requests the `live2d-cubism` adapter and the adapter is available
- **THEN** the system MUST route Puppet runtime execution through that adapter
- **AND** public snapshots, deltas, stream descriptors, and diagnostics MUST remain SDK-neutral

### Requirement: Clean-room MOC3 support is labeled as compatibility

The system SHALL label the existing clean-room MOC3 runtime path as compatibility or import support, not as official Live2D Cubism SDK behavior.

#### Scenario: Load through clean-room MOC3 path
- **WHEN** the system loads a Live2D-style source through the current clean-room MOC3 implementation
- **THEN** runtime descriptors or diagnostics exposed to UI, Agent, tests, or logs MUST identify the adapter as compatibility behavior
- **AND** user-visible or developer-facing text MUST NOT imply that the official Cubism SDK is being used

#### Scenario: Compare Cubism and compatibility paths
- **WHEN** both a Cubism adapter and a clean-room MOC3 compatibility adapter are present
- **THEN** each adapter MUST expose a distinct adapter id and capability descriptor
- **AND** callers MUST be able to distinguish fidelity, availability, and diagnostic differences without inspecting implementation modules

### Requirement: Puppet editor inspector is Puppet-specific and internationalized

The `neko-puppet` editor SHALL expose Puppet/Live2D-specific inspector panels and all visible right-panel editor chrome MUST resolve through the owning package i18n bundles.

#### Scenario: Render Puppet right inspector
- **WHEN** a user opens the Puppet editor right inspector for an `.nkp` document
- **THEN** visible section titles, actions, status labels, empty states, validation messages, and diagnostics owned by the editor MUST resolve through i18n keys
- **AND** raw untranslated keys, hard-coded English-only labels, or generic Scene labels MUST NOT appear as normal UI chrome

#### Scenario: Generic Scene tools are absent from Puppet inspector
- **WHEN** a user edits an `.nkp` document in `neko-puppet`
- **THEN** the editor MUST NOT present tilemap, scene camera, scene light, parallax, particle, actor staging, or generic scene graph creation as primary Puppet inspector tools
- **AND** Puppet panels MUST focus on import status, parameters, expressions, motions, physics, tracking, native rig controls, preview state, and diagnostics

### Requirement: Wrong-domain NKP scene data fails clearly

The system SHALL reject or diagnose unreleased `.nkp` drafts that contain generic Scene authoring truth instead of silently treating that data as Puppet character state.

#### Scenario: Open NKP draft with scene graph fields
- **WHEN** a user opens an `.nkp` draft containing generic Scene fields such as tilemaps, scene cameras, scene lights, parallax layers, particles, actor staging, or scene switching
- **THEN** the system MUST report a machine-readable wrong-domain diagnostic
- **AND** the diagnostic MUST say that generic 2D/3D Scene authoring belongs to `.nkm` and `neko-model`
- **AND** saving the `.nkp` document MUST NOT silently discard those fields without an explicit migration, rebuild, or rejection path
