# engine-puppet-control-and-renderer Specification

## Purpose
TBD - created by archiving change implement-engine-puppet-control-and-renderer. Update Purpose after archive.
## Requirements
### Requirement: Puppet Command Envelope
The engine SHALL accept puppet editing commands through a sequence- and revision-aware command envelope.

#### Scenario: Ordered command is applied
- **WHEN** a puppet WebSocket command arrives with the expected sequence and revision
- **THEN** the service applies the command and returns an applied acknowledgement

#### Scenario: Out-of-order command is rejected
- **WHEN** a puppet command arrives with an unexpected sequence number
- **THEN** the service rejects it with an ordering error

#### Scenario: Revision conflict is rejected
- **WHEN** a puppet command references a stale base revision
- **THEN** the service rejects it with a revision conflict response

### Requirement: REST Compatibility Alias
The engine SHALL keep existing puppet REST commands available as compatibility aliases during migration.

#### Scenario: REST alias is used
- **WHEN** a client calls an existing puppet REST command
- **THEN** the route translates it into the same command handling path as the WebSocket protocol

### Requirement: Engine-Side Puppet Renderer
The engine SHALL provide a GPU puppet renderer that consumes deformed meshes and texture atlases and exposes output that can be submitted to sinks or adapted into GPU composition layers.

#### Scenario: Puppet frame rendered
- **WHEN** puppet deformation data and textures are available
- **THEN** `PuppetRenderer` produces a GPU frame output compatible with `VideoOutput::GpuFrame`

#### Scenario: Puppet output can become composition layer
- **WHEN** export needs to composite a visible Puppet timeline element with other visual layers
- **THEN** the puppet render output can be adapted to a `GpuLayer` without CPU readback when supported by the platform handle

#### Scenario: Canvas2D remains debug only
- **WHEN** engine GPU rendering is available
- **THEN** Canvas2D is not used as a production rendering fallback for export or composition

### Requirement: Puppet GPU Budget Integration
Puppet GPU rendering SHALL acquire GPU budget permits before render work.

#### Scenario: Puppet render under pressure
- **WHEN** PuppetRenderer runs while interactive GPU pressure is high
- **THEN** it follows the configured budget priority behavior instead of switching to CPU rendering

#### Scenario: Export render reports budget pressure
- **WHEN** Puppet rendering is requested by GPU export while the GPU budget is queued or paused
- **THEN** the export path receives an explicit retry/busy error rather than blocking indefinitely

### Requirement: Puppet Source Reference Loading
The engine SHALL support loading puppet sources from engine-resolved file references without requiring Extension or Webview code to forward `.moc3` bytes as base64.

#### Scenario: Load puppet from token source
- **WHEN** a client calls the puppet load-source action with a registered file token
- **THEN** the engine resolves the token and loads the `.moc3` data inside the engine process

#### Scenario: Legacy byte load remains compatible
- **WHEN** an existing client calls the legacy puppet byte-load action during migration
- **THEN** the engine continues to accept the request until the compatibility path is removed by a later change

#### Scenario: Webview does not receive puppet binary
- **WHEN** a puppet file is opened after source-reference loading is available
- **THEN** the Extension sends engine connection/source metadata rather than base64 puppet binary data to the Webview

### Requirement: Puppet Service Uses A Computation Boundary
PuppetService SHALL centralize Bevy world access through a computation boundary equivalent to the scene service `creative<R>()` / `data<R>()` closure pattern.

#### Scenario: Puppet data query locks centrally
- **WHEN** PuppetService reads snapshots, parameters, or deformed meshes
- **THEN** the read path uses the centralized world access helper
- **THEN** lock poisoning maps to the existing service error category consistently

#### Scenario: Puppet mutation locks centrally
- **WHEN** PuppetService applies commands, ticks animation, or updates parameters
- **THEN** the mutation path uses the centralized world access helper
- **THEN** command ordering and revision checks remain compatible

#### Scenario: Public puppet service behavior is preserved
- **WHEN** existing callers use `IPuppetService`
- **THEN** method names, return types, and compatibility command behavior remain stable unless a later spec explicitly changes them

### Requirement: Puppet Viewport Bone Drag Closes Through Native Commands
Puppet viewport bone dragging SHALL use pointer move/up state, local prediction overlays, revision-aware native puppet commands, and ack/error reconciliation.

#### Scenario: Bone drag starts from selected bone
- **WHEN** the user begins dragging a selected puppet bone handle in the viewport
- **THEN** the puppet scene controller records drag state with bone id, start position, viewport id, and base native revision

#### Scenario: Bone drag sends native command
- **WHEN** the user moves or commits a puppet bone drag
- **THEN** the controller sends a native puppet command with sequence, base revision, transaction id, and transform payload rather than only moving a local overlay

#### Scenario: Bone drag rejection rolls back prediction
- **WHEN** the native puppet command is rejected because of stale revision or invalid bone id
- **THEN** the prediction overlay is rolled back and the puppet store requests or applies an authoritative snapshot

### Requirement: Puppet Bone Hit Testing Aligns With Viewport Metadata
Puppet bone selection SHALL use coordinate data compatible with the active viewport frame metadata and native puppet snapshot.

#### Scenario: Local bone hit uses view transform
- **WHEN** the puppet controller performs local bone hit testing
- **THEN** it transforms pointer and bone coordinates consistently with the active `ViewportFrameMeta.viewTransform`

#### Scenario: Stale snapshot cannot select authoritatively
- **WHEN** the puppet snapshot revision is older than the active frame or command revision
- **THEN** bone selection is marked stale or refreshed before being treated as authoritative

### Requirement: Puppet BlendShape And Driver Controls Use Ack-backed State
Puppet BlendShape, driver, onion-skin, and vertex edit controls SHALL update authoritative UI state through native command acknowledgements or snapshot refreshes.

#### Scenario: BlendShape slider waits for command result
- **WHEN** the user changes a native BlendShape slider
- **THEN** Webview sends a revision-aware native command and reconciles the displayed value with ack/error or authoritative snapshot state

#### Scenario: Driver command is not local-only
- **WHEN** the user changes a ControlDriver or tracking input value
- **THEN** the value is not considered committed until the native command path applies or rejects it

### Requirement: Puppet Preview Stream Does Not Replace Control Authority
Puppet preview video or delta streams SHALL not be treated as proof that editing commands succeeded without matching command acknowledgement or authoritative snapshot state.

#### Scenario: Preview changes without ack
- **WHEN** puppet preview frames or deltas continue after a native command is sent
- **THEN** the UI does not mark the command committed unless the command ack or authoritative state update is received

#### Scenario: Control failure is visible while preview continues
- **WHEN** puppet control rejects commands but the preview stream remains connected
- **THEN** Webview displays a control degraded or command error state

### Requirement: Puppet Commands Align With ViewportProtocol
Puppet editing commands that originate from ViewportShell SHALL use ViewportProtocol scene command envelopes.

#### Scenario: Drag bone uses scene command
- **WHEN** a puppet controller sends a bone drag command
- **THEN** the command uses `domain: "scene"`, a `scene:puppet:*` action, sequence, correlation id, source, and base revision

#### Scenario: Puppet command ack updates prediction
- **WHEN** engine applies or rejects a puppet scene command
- **THEN** it returns a protocol event that allows the puppet controller to commit or roll back overlay prediction

### Requirement: Puppet Frames Provide Overlay Metadata
Puppet render frames SHALL provide metadata sufficient to align skeleton, mesh, and vertex overlays with the displayed video frame.

#### Scenario: Bone overlay aligns
- **WHEN** a puppet frame is displayed with bone overlay enabled
- **THEN** the overlay uses frame metadata transform data to draw bone handles within the configured pixel tolerance

### Requirement: Native Puppet Runtime Components
The puppet runtime SHALL provide ECS components and systems for native `Bone2D`, `Skeleton2D`, `SkinWeights2D`, `BlendShapeSet`, `BlendShapeWeights`, `ExpressionPresets`, `ControlDriverSet`, IK constraints, and spring bones.

#### Scenario: Native components instantiate from project data
- **WHEN** a `.nkp` v2 native puppet is loaded
- **THEN** runtime-puppet instantiates the corresponding ECS components without requiring MOC3 parameter bindings

#### Scenario: Runtime components do not depend on GPU
- **WHEN** runtime-puppet evaluates native puppet systems in unit tests
- **THEN** the systems run without importing wgpu or renderer crates

### Requirement: CPU Native Deformation Path
The puppet runtime SHALL compute native puppet deformed vertices on CPU as `ControlDriver -> BlendShape -> Skinning` and expose them through the existing deformed-vertices renderer input path.

#### Scenario: CPU path renders native puppet
- **WHEN** a native puppet has mesh vertices, BlendShape weights, and bone transforms
- **THEN** runtime-puppet computes `DeformedVertices` that the existing SpriteBatch renderer can consume

#### Scenario: CPU math is unit tested
- **WHEN** a synthetic mesh fixture is evaluated by the CPU native path
- **THEN** computed vertices match expected BlendShape and skinning results within configured tolerance

### Requirement: GPU Native Deformation Path
The puppet renderer SHALL support an optional GPU BlendShape+Skinning path fed by render-extract data while preserving CPU fallback.

#### Scenario: GPU path matches CPU fixture
- **WHEN** a synthetic native puppet mesh is rendered through the GPU path
- **THEN** its transformed vertices match the CPU reference within configured tolerance

#### Scenario: CPU fallback remains available
- **WHEN** GPU native deformation is unavailable or disabled
- **THEN** puppet rendering continues through CPU-computed deformed vertices

### Requirement: Native Puppet Commands
The puppet control service SHALL accept native puppet commands for bones, BlendShapes, expressions, ControlDrivers, and animations through sequence- and revision-aware envelopes.

#### Scenario: Set BlendShape command applies
- **WHEN** a command sets a valid native BlendShape weight with current base revision
- **THEN** the puppet service applies the weight and returns an acknowledgement with the new revision

#### Scenario: Stale native command is rejected
- **WHEN** a native puppet command references a stale base revision that conflicts with newer edits
- **THEN** the service rejects the command and leaves authoritative runtime state unchanged

### Requirement: MOC3 Conversion Runtime Support
The puppet runtime SHALL expose conversion APIs that reuse MOC3 parsed data to produce native puppet project data.

#### Scenario: Conversion output is loadable
- **WHEN** a MOC3 bundle is converted to native puppet data
- **THEN** the resulting `.nkp` v2 data can be loaded by native runtime components without using MOC3 parameter evaluation as the primary runtime path

#### Scenario: Legacy fallback remains available
- **WHEN** conversion diagnostics indicate unsupported MOC3 behavior
- **THEN** the native project can retain source metadata or fallback references that allow legacy read-only playback during migration

### Requirement: MOC3 Keyform Source Parsing
The puppet runtime SHALL resolve MOC3 keyform indirection tables used by warp deformers, rotation deformers, and art meshes before evaluating Live2D deformation.

#### Scenario: Art mesh keyform positions use source table
- **WHEN** an art mesh references keyform position sources
- **THEN** the parser reads XY values through the keyform position source table rather than assuming flat contiguous vertex positions

#### Scenario: Warp and rotation keyforms use their specific sources
- **WHEN** warp or rotation deformers reference keyform sources
- **THEN** warp deformers resolve control-point positions through warp position sources and rotation deformers resolve angles through rotation angle sources

### Requirement: MOC3 External Texture Data Path
The engine and puppet editor SHALL provide a runtime data path for texture PNG bytes referenced by Live2D `model3.json`.

#### Scenario: Texture bytes are available for render
- **WHEN** a MOC3 mesh references a texture index from a Live2D bundle
- **THEN** the corresponding texture PNG bytes are decoded or uploaded through a supported renderer data path before the mesh is rendered

#### Scenario: Texture index command is not upload
- **WHEN** a client needs to upload or decode Live2D PNG image bytes
- **THEN** it does not treat the existing `puppets:set_texture` texture-index command as an image upload API

### Requirement: Bundle Auxiliary Data Loading
The puppet runtime SHALL load Live2D bundle auxiliary JSON for expressions, motions, and physics through a supported puppet auxiliary path.

#### Scenario: Load auxiliary JSON from bundle
- **WHEN** a Live2D bundle contains expression, motion, or physics entries
- **THEN** the puppet runtime receives those entries as validated JSON content rather than as unresolved bundle locator strings

### Requirement: Native puppet CPU deformation supports deterministic parallel evaluation
The puppet runtime SHALL support a `bevy_tasks`-backed parallel CPU evaluation path for native puppet BlendShape application and 2D skinning while preserving the existing deterministic serial fallback. The evaluated order MUST remain `ControlDriver -> pre-skin BlendShape -> Skinning`, with optional explicitly marked post-skin corrective BlendShapes.

#### Scenario: Parallel deformation matches serial fallback
- **WHEN** a native puppet mesh is evaluated through the parallel CPU deformation path and the serial CPU fallback
- **THEN** final deformed vertices match within the configured tolerance
- **THEN** the renderer-facing `DeformedVertices` output remains compatible with the existing CPU native deformation path

#### Scenario: Runtime-puppet remains GPU-free
- **WHEN** runtime-puppet evaluates parallel CPU BlendShape or skinning systems in unit tests
- **THEN** the systems may depend on `bevy_tasks` but do not import `wgpu`, engine-gpu, scene renderer, puppet renderer, or host crates
- **THEN** GPU deformation remains owned by renderer extract and `engine-gpu` integration paths

#### Scenario: Serial fallback can be forced
- **WHEN** tests, diagnostics, unsupported targets, or configuration force serial deformation
- **THEN** runtime-puppet evaluates the same mesh through the serial path
- **THEN** command behavior, snapshot data, and renderer input shape remain equivalent to the parallel path within tolerance

### Requirement: Parallel deformation numeric stability is bounded
The puppet runtime SHALL define and test numeric tolerance for serial and parallel CPU deformation parity. Extreme fixtures MUST cover many BlendShapes, large deltas, and unusual weight distributions so floating-point accumulation drift is explicit.

#### Scenario: Many-shapes fixture stays within tolerance
- **WHEN** a synthetic puppet fixture contains more than twenty active BlendShapes, large vertex deltas, and extreme weights
- **THEN** parallel and serial deformation outputs match within the configured tolerance
- **THEN** the test records whether standard f32 accumulation is sufficient or whether compensated accumulation is required

#### Scenario: Tolerance failure reports actionable diagnostics
- **WHEN** parallel deformation exceeds the configured tolerance against the serial reference
- **THEN** validation output includes mesh id, vertex id or range, active shape count, maximum error, and the deformation stage that exceeded tolerance
- **THEN** the test does not silently accept the result by widening tolerance without a documented numeric decision

### Requirement: Parallel deformation is benchmarked before enabling by default
The puppet runtime SHALL include benchmark or performance evidence before enabling the parallel CPU deformation path by default for production workloads. Benchmarks MUST cover small, medium, and large vertex counts and compare overhead against the serial fallback.

#### Scenario: Parallel path is beneficial at scale
- **WHEN** benchmark fixtures run for 1k, 10k, and 50k vertex meshes
- **THEN** the results show the vertex or mesh-count threshold where parallel evaluation becomes beneficial
- **THEN** default runtime selection can avoid using the parallel path for small workloads where scheduling overhead dominates

#### Scenario: Benchmark preserves authoring behavior
- **WHEN** parallel deformation is enabled for an interactive authoring fixture
- **THEN** command acknowledgement, runtime revision updates, and frame metadata remain compatible with the existing puppet control and preview contracts
- **THEN** performance instrumentation does not change project data or command semantics

