## Why

The 2D / 3D unified-engine foundation has partially landed before this
OpenSpec change was finalized. A code review found that three originally
planned foundation items are already implemented: transform propagation uses a
shared algorithm core, PuppetService already has a computation boundary, and
Scene3D + Puppet GPU co-rendering is wired through collect → render →
`GpuLayer` → composite.

The remaining foundation work should therefore focus on the real gaps:
animation wrapper duplication and engine tool domain registration. Keeping the
proposal scoped to those gaps prevents reworking completed runtime/export
paths and keeps the change aligned with the "shared shell, separate cores"
architecture.

## What Changes

- Reduce scene/puppet animation blend wrapper duplication by moving the
  repeated time-unit and serde adapter pattern onto shared `engine-types`
  contracts while preserving runtime public type names.
- Preserve runtime-specific semantics:
  - puppet APIs keep millisecond helpers and `elapsed_ms` serde fields,
  - scene APIs keep second helpers and `elapsed` serde fields,
  - `SceneAnimationPlaybackState` remains scene-only and is not merged.
- Audit and mark the following as already complete, with guardrails/tests kept
  as regression coverage:
  - shared transform propagation algorithm core,
  - PuppetService computation boundary,
  - Scene3D + Puppet GPU co-rendering.
- Complete the minimal domain metadata foundation by annotating engine agent
  tools with normalized domain metadata and registering scene/puppet tools
  through the `AgentCapabilityProvider` surface.
- Keep full DomainRouter policy, Rust `ActionRequest` domain hints,
  `ArtifactSnapshot`, FeedbackBus, and ControlDecision for follow-up changes.

## Capabilities

### New Capabilities

- `engine-domain-routing-foundation`: Defines serializable domain metadata for
  tool projection and requires engine scene/puppet tools to be registered with
  normalized domains.

### Modified Capabilities

- `runtime-animation-common-contracts`: Moves shared blend/crossfade wrapper
  adapter behavior into `engine-types` while preserving scene and puppet public
  compatibility names.
- `runtime-transform-propagation-core`: Records that the shared algorithm core
  already exists and keeps runtime-specific Bevy shells as the boundary.
- `engine-puppet-control-and-renderer`: Records that PuppetService computation
  boundary and puppet render-output-to-layer support already exist.
- `engine-2d3d-co-rendering`: Records current mixed Scene3D + Puppet GPU export
  behavior as regression-protected foundation.
- `engine-export-preview-orchestration-boundaries`: Keeps guardrails that prevent
  export orchestration from re-coupling to concrete scene/puppet services.

## Impact

- Rust engine packages:
  - `packages/neko-engine/packages/engine-types`
  - `packages/neko-engine/packages/runtime-scene`
  - `packages/neko-engine/packages/runtime-puppet`
  - focused regression checks in `packages/neko-engine/packages/engine-kernel`
- Agent/tool contract surfaces:
  - `packages/neko-types` domain metadata and Tool projection types
  - `packages/neko-agent` tool registry projection tests
  - `packages/neko-engine/packages/extension` engine capability provider tools
- Documentation and OpenSpec:
  - `docs/architecture/adr-2d3d-unified-engine-analysis.md`
  - this change's design, specs, tasks, and follow-up notes
