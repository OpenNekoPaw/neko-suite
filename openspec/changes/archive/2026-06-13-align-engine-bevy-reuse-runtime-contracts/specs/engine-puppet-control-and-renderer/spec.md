## ADDED Requirements

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
