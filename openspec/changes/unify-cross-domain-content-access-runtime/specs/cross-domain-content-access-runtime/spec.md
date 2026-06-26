## ADDED Requirements

### Requirement: Shared content access owns common rules

The system SHALL provide shared Host-side content access and ingest composition so path conversion, permissions, transparent cache, Webview projection, Engine source registration, diagnostics, and cache lifecycle are defined once and reused by creative domains.

#### Scenario: Domain requests a thumbnail preview

- **WHEN** Canvas, Cut, Preview, Agent, Assets, Model, or Sketch requests a thumbnail, page image, preview variant, proxy, or generated preview for display
- **THEN** the domain SHALL call shared content access or resource cache services with a stable source/ref, intent, target, variant, and caller
- **AND** the domain SHALL NOT choose cache directory layout, reverse-lookup cache paths, or project raw local paths itself

### Requirement: Domains implement providers and adapters only

Creative domains SHALL express domain semantics through providers, adapters, source refs, resource refs, and intent-specific request shaping. They MUST NOT implement package-local substitutes for shared path resolution, cache lifecycle, Webview projection, Engine source authorization, or content access diagnostics.

#### Scenario: Model provider resolves a GLB with sibling textures

- **WHEN** `neko-model` needs to preview or load a GLB/GLTF/VRM source and sibling textures
- **THEN** the model domain SHALL provide source/locator/provider semantics for model resources
- **AND** shared content access and Engine-backed services SHALL handle path resolution, authorization, binary access, projection, and diagnostics

### Requirement: Direct Engine client usage is limited to Engine-owned operations

Domains MAY use `@neko/neko-client` directly for Engine-owned operations such as playback streams, Range/seek media access, probe/decode, waveform, proxy generation, export/transcode, model/scene viewport streams, GPU rendering, device access, and heavy media computation. Source authorization and durable source identity MUST still be handled at the Host/content-access boundary.

#### Scenario: Cut plays a timeline media source

- **WHEN** `neko-cut` starts playback or frame extraction for a timeline media source
- **THEN** Extension Host SHALL authorize and resolve the source/ref before registering it with Engine
- **AND** Webview playback SHALL consume an authorized Engine stream or descriptor rather than raw filesystem paths or cache paths

### Requirement: Pure text and project facts do not use Engine or resource cache

Pure text, configuration, Markdown, JSON/TOML/YAML, and `nk*` project facts SHALL be read and written by `ProjectFileStore`, domain codecs, or Host text adapters. They MUST NOT be routed through Engine binary access or persisted as resource cache artifacts.

#### Scenario: Canvas saves an nkc project

- **WHEN** `neko-canvas` saves `.nkc` project facts such as nodes, layout, text, and stable source refs
- **THEN** the save SHALL use project file IO and the Canvas domain codec
- **AND** it SHALL NOT materialize the project facts through resource cache or Engine file access

### Requirement: Cache is limited to derived rebuildable artifacts

`ResourceCacheService` SHALL cache derived and rebuildable artifacts only, including thumbnails, document page images, preview variants, proxies, FOV crops, OCR/ASR/metadata sidecars, and generated previews. Source files, user-selected final export paths, official imported assets, and project facts MUST remain source/project facts rather than cache artifacts.

#### Scenario: Preview cache is deleted

- **WHEN** a cached thumbnail, proxy, document page image, or preview variant is deleted or garbage-collected
- **THEN** the source/project facts SHALL remain valid
- **AND** the artifact SHALL be rebuildable through the provider or reported as missing/unsupported with diagnostics

### Requirement: Webview projection is runtime-only

Webview URI projection SHALL be created only by shared local resource access or resource cache projection with explicit Webview context and authorized roots. Domains MUST NOT fall back to raw local paths, cache paths, `file:` URLs, or unverified source paths when projection fails.

#### Scenario: Projection fails for a resource

- **WHEN** a domain requests a Webview URI for a resource and projection fails
- **THEN** the caller SHALL receive a diagnostic or omitted render projection
- **AND** the system SHALL NOT set renderable URI fields to raw filesystem paths or managed cache paths

### Requirement: Cross-domain migration is path-level verified

Each migrated domain SHALL include tests or boundary checks proving it uses shared content access, shared cache providers, authorized Engine registration, or project-file IO according to content type. Tests MUST NOT pass solely by checking final UI output while package-local fallback paths remain active.

#### Scenario: Package-local cache fallback is poisoned

- **WHEN** a domain migration test covers a path formerly served by package-local cache/path/projection code
- **THEN** the test SHALL assert the shared service/provider path was called
- **AND** the legacy package-local fallback SHALL be poisoned, removed, or diagnosed so it cannot mask shared runtime failure
