## ADDED Requirements

### Requirement: Ordinary Models Complete The Basic Editing Loop
The Neko Model editor SHALL allow ordinary GLB, GLTF, and VRM assets to complete a baseline visual editing loop without requiring Headshot, AI provider, `.nkc`, semantic region, morph, or character contract support. The baseline loop MUST include Engine-stream display, camera navigation, object selection, Inspector visibility, Transform editing, basic LookDev switching, authored light creation, and background or environment editing where Engine capabilities are available.

#### Scenario: Ordinary GLB is editable
- **WHEN** the user opens a valid ordinary GLB fixture with at least one mesh node and material slot
- **THEN** the Webview presents the Engine stream as the visual truth
- **THEN** the user can select an object through Outliner or Engine-backed hit-test, inspect it, edit Transform, switch basic LookDev mode, and add an authored light when the Engine reports those baseline capabilities

#### Scenario: Higher-level character data is absent
- **WHEN** the ordinary GLB lacks character regions, morph compatibility, or skeleton metadata
- **THEN** Face Region, face morph, and semantic character controls are disabled with explicit asset-compatibility diagnostics
- **THEN** Object, Inspect, Transform, LookDev, light, and background controls remain available when their own prerequisites are met

### Requirement: Baseline Resolution Targets Are Explicit
The Neko Model editor SHALL target 1080p/60fps for the default Engine viewport stream. If the Engine, device, or host falls back to 720p or a lower frame rate, the fallback MUST be explicit in stream diagnostics or UI state and MUST NOT be reported as the 1080p target.

#### Scenario: Target stream is available
- **WHEN** the Engine starts a baseline model viewport stream at 1080p/60fps
- **THEN** the stream descriptor and Webview diagnostics identify the effective dimensions and frame target as matching the baseline target

#### Scenario: Host falls back to lower resolution
- **WHEN** the Engine or Webview host falls back to 720p because of device, performance, codec, or host constraints
- **THEN** the Webview shows the effective resolution and a fallback reason instead of silently presenting the viewport as 1080p

### Requirement: Disabled Controls Explain Their Reason
The Neko Model Webview SHALL expose a localized reason whenever a baseline or higher-level editing control is disabled or degraded. Reasons MUST be derived from scene-control status, Engine capability, runtime Engine diagnostics, current selection context, or asset compatibility.

#### Scenario: Engine is not ready
- **WHEN** scene-control is disconnected or not ready
- **THEN** controls requiring Engine state are disabled with an Engine or scene-control readiness reason

#### Scenario: Asset lacks character compatibility
- **WHEN** the user opens a Face or Bone editor for a selected ordinary mesh without morph or skeleton compatibility
- **THEN** the control is disabled or marked unavailable with a localized asset-compatibility reason

#### Scenario: Capability is missing
- **WHEN** the Engine does not advertise authored light support
- **THEN** the Light tool is disabled with a capability reason rather than appearing broken

### Requirement: Object And Inspect Workflows Degrade Gracefully
Object and Inspect workflows SHALL NOT require semantic `typedPicking` or `.nkc` `characterRegions`. They MUST remain available through Outliner selection, selected node snapshots, material snapshots, or Engine-backed node/material hit-test fallback when those data paths exist.

#### Scenario: Typed picking is unavailable
- **WHEN** `typedPicking` is false but the scene snapshot contains ordinary nodes
- **THEN** Object and Inspect workflows remain available through Outliner and selected-node Inspector paths

#### Scenario: Engine hit-test unavailable
- **WHEN** Engine cannot perform viewport node hit-test for the current asset or viewport
- **THEN** the Webview does not parse mesh locally
- **THEN** it keeps Outliner selection and Inspector editing available as the baseline fallback

### Requirement: Runtime Diagnostics Override Static Capabilities
The Webview SHALL treat static capability discovery as the initial availability hint, but MUST reconcile availability from Engine acknowledgements, rejections, query results, stream descriptors, frame metadata, and structured diagnostics.

#### Scenario: Advertised command fails
- **WHEN** a control is enabled by capability discovery but Engine rejects the command at runtime
- **THEN** the Webview shows the Engine diagnostic, rolls back pending local state, and may mark that control degraded

#### Scenario: Conservative capability succeeds
- **WHEN** a runtime command or query succeeds for a capability that was previously missing or unknown
- **THEN** the Webview may refresh capability state or clear the local degraded state for that control without treating the original static capability as permanently authoritative

### Requirement: Baseline Tests Use Repository-owned Fixtures
Automated baseline tests SHALL use a repository-owned or generated redistributable GLB fixture. Tests MUST NOT require `../neko-test/test.glb`, although that file MAY be used for local manual debugging.

#### Scenario: CI runs baseline smoke
- **WHEN** CI runs model baseline smoke tests
- **THEN** the tests load a fixture available from the repository or generated test setup
- **THEN** the fixture includes at least one mesh node, one material slot, non-empty bounds, and stable identifiers suitable for selection and Inspector assertions

#### Scenario: External fixture is absent
- **WHEN** `../neko-test/test.glb` is not present
- **THEN** automated tests still pass or skip only manual-debug-specific checks
