## 1. Contract And Format Boundaries

- [x] 1.1 Audit `engine-types`, `neko-types`, `neko-proto`, and `neko-client` Puppet/Scene DTOs for Cubism SDK leakage, scene/puppet naming ambiguity, runtime handles, and profile/adapter gaps.
- [x] 1.2 Define SDK-neutral Puppet adapter ids and descriptors for `neko-puppet-native`, `live2d-moc3-compat`, and optional `live2d-cubism`.
- [x] 1.3 Update `.nkp` project validation to persist only profile, adapter id/version, stable source refs, import settings, parameters, motions, expressions, physics, and tracking mappings.
- [x] 1.4 Add wrong-domain `.nkp` diagnostics for generic Scene fields such as tilemaps, scene cameras, lights, parallax, particles, actor staging, or scene switching.
- [x] 1.5 Update `.nkm` project validation or profile descriptors so `profile: 2d | 3d | live` is routed as Scene truth and unknown profiles fail closed.
- [x] 1.6 Add contract tests covering SDK-neutral adapter persistence, Cubism-handle rejection, `.nkp` wrong-domain diagnostics, `.nkm` profile diagnostics, and `.nkm` actor refs to `.nkp`.

## 2. Engine Puppet Runtime Boundary

- [x] 2.1 Introduce or clarify the `PuppetService` facade and `PuppetRuntimeAdapter` port in `runtime-puppet` or the nearest existing engine service boundary.
- [x] 2.2 Register the native Neko Puppet path behind a `neko-puppet-native` adapter descriptor.
- [x] 2.3 Register the existing clean-room MOC3 path behind a `live2d-moc3-compat` adapter descriptor and expose compatibility labeling in runtime descriptors or diagnostics.
- [x] 2.4 Add a feature-gated `live2d-cubism` adapter descriptor or unavailable stub that returns `cubism-adapter-unavailable` without vendoring Cubism SDK binaries.
- [x] 2.5 Ensure Puppet commands, snapshots, deltas, stream descriptors, and diagnostics remain SDK-neutral and never expose SDK handles or Webview/runtime session ids as durable identity.
- [x] 2.6 Add Rust tests for adapter selection, unavailable Cubism diagnostics, MOC3 compatibility labeling, and SDK-neutral public outputs.

## 3. Engine Scene Runtime Boundary

- [x] 3.1 Introduce or clarify the `SceneService` facade and Scene profile descriptors for `2d`, `3d`, and `live` in `runtime-scene` or the nearest existing engine service boundary.
- [x] 3.2 Ensure `.nkm profile: 2d` routes to Scene runtime/profile diagnostics even when first-slice 2D panels are degraded or unavailable.
- [x] 3.3 Ensure `.nkm profile: 3d` and `profile: live` continue to route through Scene-owned runtime behavior and do not become Puppet runtime inputs.
- [x] 3.4 Add Scene/Puppet shared-shell descriptors that identify the owning runtime domain while reusing sessions, streams, diagnostics, and GPU budget where appropriate.
- [x] 3.5 Add Rust or contract tests proving Scene commands remain Scene commands, Puppet commands remain Puppet commands, and renderer extraction does not merge runtime world types.

## 4. Frontend Routing And Editor Usability

- [x] 4.1 Audit `neko-puppet` and `neko-model` custom editor registration, create/open commands, Webview boot payloads, and Agent capabilities for `.nkp` versus `.nkm` routing.
- [x] 4.2 Update `neko-puppet` so `.nkp profile: live2d | neko-puppet` opens to a usable Puppet editor first slice: import/source status, parameter controls, expression/motion visibility, preview state, and diagnostics.
- [x] 4.3 Remove, hide, or rename Puppet Webview affordances that present tilemap, scene camera, scene light, parallax, particle, actor staging, or generic scene graph creation as Puppet tools.
- [x] 4.4 Update `neko-model` so `.nkm profile: 2d | 3d | live` routes through Model-owned Scene editor paths with explicit degraded/unavailable states for incomplete 2D Scene capabilities.
- [x] 4.5 Update cross-domain actor placement flows so `.nkm` stores stable `.nkp` refs and uses runtime commands or routing for live parameter driving without copying Puppet truth.
- [x] 4.6 Add Webview/unit tests for `.nkp` Puppet routing, `.nkm` Model routing, absence of generic Scene tools in Puppet, and degraded-state messaging for incomplete 2D Scene support.

## 5. Puppet Inspector Internationalization

- [x] 5.1 Audit the `neko-puppet` right inspector and adjacent panels for hard-coded visible strings, raw translation keys, generic Scene labels, status text, empty states, actions, and diagnostics.
- [x] 5.2 Add missing English and Chinese keys to the owning Puppet i18n bundles, including `packages/neko-puppet/l10n/bundle.l10n.json` and `bundle.l10n.zh-cn.json` where Extension-facing strings are involved.
- [x] 5.3 Update Webview i18n usage so right-panel chrome resolves through the existing Puppet Webview i18n context instead of local string literals.
- [x] 5.4 Add tests or fixture checks that render the right inspector in supported locales and fail on unresolved keys or generic Scene labels.

## 6. Documentation And Capability Metadata

- [x] 6.1 Update `docs/architecture/engine-runtime.md` to describe `live2d-moc3-compat` as clean-room compatibility and `live2d-cubism` as optional feature-gated SDK adapter.
- [x] 6.2 Update `docs/architecture/package-boundaries.md`, `docs/domains/character/*`, and `docs/domains/scene/*` if implementation names differ from the current documented boundary.
- [x] 6.3 Update `packages/neko-engine/README.md`, `packages/neko-puppet/README.md`, and `packages/neko-model/README.md` so runtime and editor responsibilities match the implemented contracts.
- [x] 6.4 Update Agent or marketplace capability metadata so generic 2D/3D Scene creation targets `neko-model`, while Live2D/Puppet character actions target `neko-puppet`.

## 7. Validation

- [x] 7.1 Run focused TypeScript contract tests for `packages/neko-types`, `neko-client`, and any Proto projections touched by the change.
- [x] 7.2 Run focused Rust tests for `runtime-puppet`, `runtime-scene`, `engine-types`, and host-api service paths touched by the change.
- [x] 7.3 Run `pnpm --filter @neko-puppet/webview test` and `pnpm --filter @neko-model/webview test` for routing, inspector, and Webview behavior.
- [x] 7.4 Run dependency and architecture boundary checks, including checks that Webviews do not import `vscode`, Node APIs, native SDK modules, or sibling feature implementations.
- [x] 7.5 For Webview visual or interaction changes, run `pnpm smoke:webview:runtime` or an equivalent Extension Development Host validation with the `vscode-extension-debugger` Skill.
- [x] 7.6 Run broader `pnpm check`, `pnpm test`, `pnpm build`, or record explicit residual risk for any validation that cannot be run in this session.
