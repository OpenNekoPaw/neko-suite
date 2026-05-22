## ADDED Requirements

### Requirement: Neko Live Uses ViewportShell For Compositor Visual Truth
neko-live SHALL use `ViewportShell` with a `LiveController` as the visual truth surface when an engine compositor stream descriptor is available.

#### Scenario: Compositor stream is available
- **WHEN** neko-live receives a valid engine compositor `RenderStreamDescriptor`
- **THEN** it displays decoded compositor frames through `ViewportShell` and does not mount persistent local R3F or puppet renderers as competing visual truth

#### Scenario: LiveController supplies controls
- **WHEN** `ViewportToolbar` renders for a live compositor scene
- **THEN** live scene preset, layer routing, tracking overlay, and output controls are supplied through `LiveController` toolbar descriptors or adjacent domain panels

### Requirement: Neko Live Fallback Is Isolated
Any remaining neko-live local R3F, puppet, or canvas preview SHALL be isolated behind a fallback flag and visibly marked as non-authoritative whenever compositor stream parity is unavailable.

#### Scenario: Compositor unavailable
- **WHEN** the compositor stream cannot start and local fallback rendering is enabled
- **THEN** the UI marks the fallback as non-authoritative and does not use it for output/export parity validation

#### Scenario: Fallback removal waits for parity
- **WHEN** compositor stream parity, output route diagnostics, and latency validation have not passed
- **THEN** persistent local renderer removal remains blocked

### Requirement: Live High-Frequency Traffic Avoids Extension Host
neko-live SHALL keep high-frequency compositor frames, decoded video frames, tracking updates, and shell-local navigation out of Extension Host `postMessage` traffic. Extension Host remains responsible for setup, permissions, resource URI conversion, lifecycle, and VSCode operations.

#### Scenario: Compositor frames bypass Extension Host
- **WHEN** a live compositor stream is active
- **THEN** encoded frames flow through the engine stream endpoint and Webview stream client rather than Extension Host `postMessage`

#### Scenario: Setup remains host-owned
- **WHEN** neko-live needs workspace resources, device permission, or VSCode UI operations
- **THEN** Extension Host brokers those low-frequency operations without becoming the frame or pointer-move transport
