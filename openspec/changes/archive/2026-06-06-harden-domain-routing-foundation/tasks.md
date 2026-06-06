## 1. OpenSpec

- [x] 1.1 Create proposal, design, and delta specs for the routing hardening follow-up.
- [x] 1.2 Validate the change before implementation.

## 2. Domain Routing Contract

- [x] 2.1 Add shared service-port identity constants and a registry in `domain-routing.ts`.
- [x] 2.2 Replace `DomainRouter.route()` `undefined` failures with a serializable `DomainRouteResult` union and stable failure reasons.
- [x] 2.3 Update operation-tool metadata to use the shared service-port registry.
- [x] 2.4 Update operation-tool tests to cover route success, missing domain, empty capabilities, filter misses, domain mismatches, and registry constants.
- [x] 2.5 Keep domain-routing architecture tests proving no runtime/ECS dependencies enter the shared contract.

## 3. Engine Provider Metadata

- [x] 3.1 Update engine capability provider domain constants to consume shared service-port constants.
- [x] 3.2 Update provider tests to assert constants-backed domain metadata remains serializable and command dispatch behavior is unchanged.

## 4. Animation Macro Extension Note

- [x] 4.1 Add a scoped TODO note beside `declare_animation_blend_wrappers!` documenting how future wrapper shapes should extend the shared adapter.
- [x] 4.2 Keep focused animation tests passing after the comment-only Rust change.

## 5. Validation

- [x] 5.1 Run focused `neko-types` tests for operation-tool adapter and domain-routing architecture.
- [x] 5.2 Run focused engine extension provider tests.
- [x] 5.3 Run focused Rust animation tests for `engine-types`, `runtime-scene`, and `runtime-puppet`.
- [x] 5.4 Run `openspec validate harden-domain-routing-foundation`.
