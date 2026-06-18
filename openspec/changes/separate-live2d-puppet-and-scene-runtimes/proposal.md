## Why

Puppet and Scene are now documented as separate authoring domains, but `neko-engine` and the editor contracts still need a stronger runtime boundary: Puppet should mean Live2D/Cubism-compatible or native character runtime, while Model should mean 2D/3D Scene runtime. This is needed now because the Puppet editor is still unusable in practice, its right inspector lacks i18n coverage, and the current MOC3 path is a clean-room compatibility implementation rather than an official Live2D Cubism SDK integration.

## What Changes

- Split `neko-engine` runtime responsibilities into explicit service boundaries:
  - `runtime-puppet` owns `.nkp` character runtime state, Live2D-compatible playback, native Neko Puppet, parameters, expressions, motions, physics, tracking inputs, and puppet render extraction.
  - `runtime-scene` owns `.nkm profile: 2d | 3d | live` Scene state, scene graph, sprite/tilemap/mesh/camera/light/actor orchestration, viewport control, and Scene render extraction.
- Introduce a public Puppet runtime adapter contract so Live2D/Cubism, native Neko Puppet, and legacy clean-room MOC3 compatibility are selected by adapter id rather than leaking SDK-specific types through public contracts.
- Treat official Cubism SDK support as an optional, feature-gated adapter path. The existing clean-room MOC3 implementation MUST be labeled as compatibility/import support, not as the official Live2D Cubism SDK runtime.
- Align frontend entry points:
  - `neko-puppet` owns `.nkp profile: live2d | neko-puppet` editors and must present Puppet/Live2D-specific panels with complete i18n coverage for visible inspector chrome.
  - `neko-model` owns `.nkm profile: 2d | 3d | live` editors and all generic 2D+3D Scene workflows.
- Update durable project contracts and diagnostics so `.nkp` stores adapter selection, stable source refs, parameters, motions, expressions, physics, and tracking mappings, while `.nkm` stores Scene profiles and may reference `.nkp` actors without copying Puppet truth.
- **BREAKING** for unreleased internal drafts: any public DTO, project draft, fixture, or Webview message that models generic Scene data inside Puppet contracts may be revised or rejected with diagnostics. Valuable local project data must fail clearly or be rebuilt/reimported; it must not be silently discarded.

## Capabilities

### New Capabilities

- `live2d-puppet-runtime-boundary`: Defines `.nkp` Puppet runtime ownership, Live2D/Cubism adapter isolation, legacy MOC3 compatibility labeling, and Puppet editor/i18n expectations.
- `scene-runtime-profile-boundary`: Defines `.nkm` Scene runtime ownership for 2D/3D/Live profiles, `neko-model` frontend routing, and actor references to `.nkp` without duplicating Puppet truth.

### Modified Capabilities

- None.

## Impact

- Affected packages:
  - `packages/neko-engine`: add or clarify Puppet and Scene runtime service/adapter boundaries, feature-gated Live2D/Cubism adapter selection, diagnostics, and tests.
  - `packages/neko-engine/packages/engine-types`: keep public Puppet/Scene DTOs SDK-neutral; add adapter/profile fields only as stable ids and source refs.
  - `packages/neko-proto` and `packages/neko-client`: update only if runtime commands or stream/session contracts need new adapter/profile fields.
  - `packages/neko-puppet`: route `.nkp` through Puppet runtime contracts, make the editor usable for Live2D/Puppet flows, and complete right-panel i18n for visible editor chrome.
  - `packages/neko-model`: route `.nkm profile: 2d | 3d | live` through Scene runtime contracts and keep 2D Scene authoring out of Puppet.
  - `packages/neko-types`: update project format validators, i18n keys, and shared SDK-neutral DTOs where needed.
- Affected docs:
  - `docs/architecture/engine-runtime.md`, `docs/architecture/package-boundaries.md`, `docs/domains/character/*`, `docs/domains/scene/*`, and package READMEs for `neko-engine`, `neko-puppet`, and `neko-model`.
- Compatibility and rollback:
  - Existing `.nkp profile: live2d` files should continue through the clean-room MOC3 compatibility adapter unless they opt into a Cubism adapter.
  - If the Cubism adapter is unavailable, the system must report a feature/dependency diagnostic rather than pretending the clean-room path is Cubism SDK behavior.
  - If `.nkm profile: 2d` routing is incomplete, `neko-model` should show an explicit unavailable/degraded state; generic 2D Scene authoring must not fall back into `neko-puppet`.
