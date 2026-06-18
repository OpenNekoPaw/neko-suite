## Context

The current repository already moved the product boundary in the right direction:

- `docs/domains/character/architecture.md` says `.nkp profile: live2d | neko-puppet` is Character/Puppet truth and generic 2D Scene belongs to `.nkm profile: 2d`.
- `docs/domains/scene/architecture.md` says `.nkm profile: 2d | 3d | live` is Scene/Stage truth and `neko-model` owns 2D/3D Scene authoring.
- `docs/architecture/engine-runtime.md` already describes a shared shell with separate `runtime-scene` and `runtime-puppet` cores.
- `runtime-puppet/src/moc3` is explicitly a clean-room MOC3 implementation based on the OpenL2D spec and not derived from the Cubism SDK.

The gap is that runtime and frontend contracts do not yet force this split. A caller can still treat Puppet as a generic 2D editor, and the Live2D path can be misunderstood as "using the official Cubism SDK" when it is currently compatibility code. The change creates a runtime adapter boundary similar to Unity-style separation:

```text
.nkp / neko-puppet
  -> PuppetService
  -> runtime-puppet
  -> PuppetRuntimeAdapter registry
       - neko-puppet-native
       - live2d-moc3-compat
       - live2d-cubism (optional, feature-gated)

.nkm / neko-model
  -> SceneService
  -> runtime-scene
  -> Scene profile registry
       - 2d
       - 3d
       - live

.nkm actors
  -> stable refs to .nkp actors when a Scene needs a character
```

This design answers the three pre-change architecture questions:

1. It fits the existing architecture because Rust remains runtime authority, TS remains UI/orchestration, and `.nkp`/`.nkm` remain domain-owned project formats.
2. It lowers coupling by putting Cubism behind an adapter id and service interface, never behind public SDK object types or Webview-side SDK calls.
3. It is extensible and testable because adapters, profiles, diagnostics, project validators, and frontend routing can be exercised independently.

## Goals / Non-Goals

**Goals:**

- Define `PuppetService` and `SceneService` as separate engine-facing service boundaries with SDK-neutral DTOs.
- Add or clarify a `PuppetRuntimeAdapter` contract for native Neko Puppet, clean-room MOC3 compatibility, and future feature-gated Cubism SDK playback.
- Make adapter selection explicit in `.nkp` as stable ids/source refs/import settings, not as persisted SDK handles.
- Make `.nkm profile: 2d | 3d | live` routing explicit in `neko-model` and keep generic 2D+3D Scene authoring out of `neko-puppet`.
- Make the Puppet editor usable for `.nkp profile: live2d | neko-puppet` and cover visible right-panel inspector strings through package i18n.
- Provide diagnostics when Cubism support is unavailable, when wrong-domain Scene fields appear in `.nkp`, or when Scene profile routing is incomplete.

**Non-Goals:**

- Do not vendor, implement, or ship official Live2D Cubism SDK binaries in this change unless a later licensing/package task explicitly enables the optional adapter.
- Do not expose Cubism SDK classes, native handles, or SDK enum names through `engine-types`, `neko-client`, Proto, Webview messages, or durable `.nkp` files.
- Do not move Live2D/Puppet parameter, motion, expression, physics, or tracking truth into `.nkm` or `neko-model`.
- Do not move generic 2D Scene sprite/tilemap/light/camera/parallax/particle truth into `.nkp` or `neko-puppet`.
- Do not add a Webview-local Live2D runtime that bypasses Extension/Engine source registration, stream/session ownership, or Webview sandbox rules.

## Five-Layer Analysis

### Responsibility

- `runtime-puppet` owns Puppet runtime state, adapter registry, parameter/motion/expression/physics tick, tracking input application, puppet snapshot/delta, and puppet render extraction.
- `runtime-scene` owns Scene runtime state, profile registry, scene graph, actor placement, sprite/tilemap/mesh/camera/light/timeline state, viewport control, scene snapshot/delta, and scene render extraction.
- `engine-types`, Proto, and `neko-client` own cross-boundary envelopes, command DTOs, descriptors, diagnostics, and source refs. They do not own third-party SDK object models.
- `neko-puppet` owns `.nkp` document UX, Live2D/native Puppet inspector panels, parameter controls, expression/motion/physics/tracking UI, and right-panel i18n.
- `neko-model` owns `.nkm` document UX, 2D/3D/Live Scene profile routing, scene graph tools, viewport controls, and Scene inspector panels.

### Dependency

- Layer 0 contracts stay in `packages/neko-types`, `packages/neko-proto`, `packages/neko-client`, and Rust `engine-types`.
- Feature packages do not depend on each other directly. `.nkm` references `.nkp` through stable project/resource refs; `neko-model` does not import `neko-puppet` implementation.
- Webviews do not import Node.js, VSCode, native SDKs, or engine internals. They communicate with Extension Host through typed messages and with Engine through authorized `EngineClient` paths.
- The optional Cubism adapter depends inward on the SDK at the adapter crate/module boundary. Public contracts depend only on adapter ids, versions, source refs, capabilities, and diagnostics.

### Interface

- `PuppetRuntimeAdapter` is the narrow engine-side interface:
  - `load(sourceRef, importSettings)`
  - `setParameter(name, value)`
  - `loadMotion(ref)` / `playMotion(name, options)`
  - `loadExpression(ref)` / `setExpression(name)`
  - `setTrackingInput(name, value)`
  - `tick(delta)`
  - `snapshot()`
  - `extractRender()` or `renderFrame()` depending on renderer ownership
- `SceneRuntimeProfile` is the narrow engine-side profile interface:
  - `loadScene(sourceRef | projectData)`
  - `dispatchSceneCommand(command)`
  - `tick(delta)`
  - `snapshot()`
  - `extractRender()` or `renderFrame()`
  - `diagnostics()`
- `.nkp` public data stores `profile`, `runtimeAdapter`, source refs, import settings, parameters, motions, expressions, physics, and tracking mappings.
- `.nkm` public data stores `profile`, scene graph, scene resources, cameras/lights, actor refs, timeline/routing, and viewport/editor state.
- Diagnostics use stable machine-readable codes such as `cubism-adapter-unavailable`, `legacy-moc3-compatibility`, `wrong-domain-scene-fields`, and `scene-profile-unavailable`.

### Extension

- A later official Cubism adapter can be added by registering `live2d-cubism` with capability descriptors and feature gates, without changing `.nkp` schema shape or Webview editor state.
- A later Spine or other 2D SDK adapter can reuse the adapter registry if it maps to Puppet/Stage contracts without changing native Neko Puppet data.
- Additional Scene profiles or a future `runtime-stage` can be introduced behind Scene service/profile descriptors without changing `.nkm` ownership.
- UI mode expansion remains local: Puppet can add basic/pro modes for Live2D rigging, while Model can add richer 2D Scene tools without touching Puppet internals.

### Testing

- Contract tests verify SDK-neutral DTOs, adapter ids, project schema validation, and wrong-domain diagnostics.
- Rust tests verify adapter registry selection, feature-gated Cubism unavailable diagnostics, legacy MOC3 compatibility labeling, and service separation.
- Frontend tests verify `.nkp` routes to Puppet panels, `.nkm profile: 2d | 3d | live` routes to Model panels, and Puppet right inspector strings resolve through i18n.
- Boundary checks verify Webviews do not import `vscode`, Node APIs, or native SDK packages, and feature packages do not cross-import each other.
- VSCode Extension Development Host smoke with `vscode-extension-debugger` is required for Webview runtime acceptance when UI routing or inspector behavior changes.

## Decisions

### Decision 1: Use service and adapter boundaries, not runtime inheritance

`PuppetService` and `SceneService` should be sibling service facades over separate runtime cores. Shared shell concepts such as command envelopes, sessions, streams, diagnostics, and GPU budget remain common, but runtime world types stay separate.

Rejected alternative: create a single 2D/3D mega-runtime with scene and puppet modes. That would mix scene graph ownership, character parameter ownership, and third-party SDK lifecycle in one core and make `.nkp`/`.nkm` validation weaker.

### Decision 2: Cubism SDK is an optional adapter, not the public Puppet model

Public contracts name `live2d-cubism` only as an adapter id/capability. The actual SDK types remain inside a feature-gated adapter implementation.

Rejected alternative: put Cubism SDK concepts directly into `engine-types`, Proto, `neko-client`, or `.nkp`. That would make licensing/package choices leak into every caller and would make native Puppet or compatibility adapters second-class.

### Decision 3: Current MOC3 support is compatibility, not official Cubism SDK

The existing clean-room MOC3 path should be named and diagnosed as `live2d-moc3-compat` or equivalent. It can continue to load compatible data, but UI and docs must not claim that it is official Cubism SDK behavior.

Rejected alternative: keep labeling clean-room MOC3 as Live2D/Cubism runtime. That hides fidelity and licensing differences and makes bugs impossible to triage honestly.

### Decision 4: `.nkm` may reference `.nkp`; it must not copy Puppet truth

Scenes and live stages can place character actors using stable refs to `.nkp`, then drive exposed parameters through commands or routing. The Scene file owns placement and stage routing, not the character's parameter definitions, motions, expressions, or physics.

Rejected alternative: denormalize `.nkp` parameter and motion data into `.nkm` for convenience. That creates two sources of truth and makes actor updates brittle.

### Decision 5: Fix Puppet editor usability through domain-specific panels and i18n

The immediate UI repair is not to turn Puppet into a scene editor. The Puppet editor should expose Live2D/native Puppet import status, parameters, expressions, motions, physics, tracking, diagnostics, and mode controls with i18n-backed strings in the right panel.

Rejected alternative: add generic scene inspector sections to make the editor feel fuller. That would make the wrong domain more visible and delay the actual Puppet workflow.

## Risks / Trade-offs

- [Risk] Cubism SDK licensing or binary packaging blocks the optional adapter. -> Mitigation: keep `live2d-cubism` feature-gated and provide `cubism-adapter-unavailable` diagnostics; keep clean-room MOC3 compatibility available under its own label.
- [Risk] Existing fixtures or Webview messages assume Puppet is a Scene surface. -> Mitigation: treat this as prelaunch cleanup, update fixtures/contracts deliberately, and add wrong-domain diagnostics instead of long-lived shims.
- [Risk] Right-panel i18n coverage expands string churn across locales. -> Mitigation: audit visible Puppet inspector chrome, add keys in the owning package bundles, and test key resolution for supported locales.
- [Risk] `.nkm profile: 2d` UI may still be incomplete. -> Mitigation: route it to `neko-model` with explicit unavailable/degraded states; do not fall back into Puppet.
- [Risk] Adapter abstraction could be too wide if it mirrors SDK APIs. -> Mitigation: keep the port command-oriented and snapshot/render-extract oriented; add capability descriptors for optional behavior instead of widening the base interface.

## Migration Plan

1. Update public contracts first: adapter ids, Puppet/Scene runtime descriptors, `.nkp` and `.nkm` validation, and stable diagnostics.
2. Add engine service boundaries and registries: `PuppetRuntimeAdapter` registry under `runtime-puppet` and Scene profile descriptors under `runtime-scene`.
3. Rename/label existing MOC3 code as clean-room compatibility where user-visible or diagnostic surfaces can see it.
4. Route frontend editors by project format/profile: `.nkp` to `neko-puppet`, `.nkm profile: 2d | 3d | live` to `neko-model`.
5. Repair Puppet right inspector i18n and remove generic Scene affordances from Puppet UI.
6. Add contract, Rust, Webview, i18n, boundary, and VSCode runtime validation.

Rollback strategy: keep existing clean-room MOC3 loading path available behind the compatibility adapter. If new profile routing regresses, show explicit diagnostics or degraded states rather than routing `.nkm` Scene workflows back into Puppet or claiming Cubism support when the adapter is unavailable.

## Open Questions

- Should the adapter id for the current clean-room path be `live2d-moc3-compat`, `moc3-clean-room`, or another project-standard name?
- Should `live2d-cubism` be a separate Rust crate, a feature inside `runtime-puppet`, or a dynamically loaded plugin once licensing and distribution are decided?
- What is the minimum acceptance slice for "Puppet editor usable": import + parameter panel + expression/motion list + diagnostics, or does it also require physics/tracking panels in the first implementation?
