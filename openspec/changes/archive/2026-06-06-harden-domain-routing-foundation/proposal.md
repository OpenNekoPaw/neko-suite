## Why

The 2D/3D unified-engine foundation established serializable domain metadata
and initial scene/puppet engine tools. Re-review found three small hardening
gaps before a full DomainRouter policy is built:

- `DomainRouter.route()` returns `undefined` for every failure mode, which hides
  whether the intent lacked a domain, the capability filter excluded all
  candidates, or no candidate matched the requested domain.
- Service-port identities such as `scene-render` and `puppet-render` are
  repeated as strings across provider and operation-tool code.
- `declare_animation_blend_wrappers!` is intentionally narrow but does not leave
  an explicit extension note for future animation wrapper shapes.

## What Changes

- Replace ambiguous `DomainRouter.route()` failures with a serializable
  `DomainRouteResult` union carrying stable failure reasons.
- Add shared domain service-port constants and a registry in `domain-routing.ts`,
  then update operation-tool metadata and engine provider domain metadata to use
  the registry instead of duplicated string literals.
- Add focused tests for successful routing, each known failure reason, registry
  constants, and existing operation/engine provider projections.
- Add a local TODO note beside `declare_animation_blend_wrappers!` documenting
  that future non-layer/state/crossfade wrapper shapes should extend the shared
  adapter deliberately.

## Impact

- `packages/neko-types/src/types/domain-routing.ts`
- `packages/neko-types/src/types/operation-tool-adapter.ts`
- `packages/neko-types/src/types/__tests__/*`
- `packages/neko-engine/packages/extension/src/agentCapabilityProvider.ts`
- `packages/neko-engine/packages/extension/src/agentCapabilityProvider.test.ts`
- `packages/neko-engine/packages/engine-types/src/animation.rs`

The change remains additive at the metadata layer. It does not implement full
Agent-side routing policy, Rust `ActionRequest` domain hints, or runtime
execution selection.
