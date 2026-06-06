## ADDED Requirements

### Requirement: Live Viewport Consumes Compositor Stream
neko-live SHALL consume an engine compositor stream through ViewportShell for scene display once compositor support is available.

#### Scenario: Live displays composited stream
- **WHEN** Engine provides a compositor stream descriptor for a live scene
- **THEN** neko-live displays that stream through ViewportShell rather than rendering persistent puppet/model scene layers locally

#### Scenario: Live controls compositor layers
- **WHEN** the user changes live scene presets or layer routing
- **THEN** LiveController sends compositor scene commands and does not mutate local renderer-only state as the authority

### Requirement: Live Local Rendering Is Non-Authoritative
Any remaining neko-live local R3F or preview renderer SHALL be marked fallback/development-only once ViewportShell compositor display is available.

#### Scenario: Compositor unavailable fallback
- **WHEN** the engine compositor is unavailable and live fallback rendering is enabled
- **THEN** the UI marks the fallback as non-authoritative and excludes it from output/export parity claims
