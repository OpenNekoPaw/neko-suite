## Context

The active contract is "domain metadata as serializable orchestration data".
That means routing diagnostics and service-port identities belong in
`neko-types`, while engine/runtime packages consume those contracts without
exposing Bevy, ECS worlds, or concrete service objects.

Five-layer analysis:

- Responsibilities: `domain-routing.ts` owns route result contracts and
  service-port identity constants; operation-tool and engine provider code only
  consume those constants; `engine-types` only records the macro extension note.
- Dependencies: shared types remain runtime-free; extension code depends on
  `@neko/shared`; runtime and engine-types do not depend on TS routing code.
- Interfaces: `DomainRouter.route()` returns
  `{ ok: true, plan } | { ok: false, error }` with stable `error.reason` values.
- Extension: future domains can add service-port IDs in one registry; future
  router policy can enrich error metadata without changing success plans.
- Testing: focused tests cover route success and failure reasons, registry-based
  metadata, provider projection, and architecture import guardrails.

## Decisions

### Decision 1: Use an explicit route result union

`undefined` is replaced with a small discriminated union:

- success: `{ ok: true, plan: DomainRoutePlan }`
- failure: `{ ok: false, error: DomainRouteError }`

Reasons are intentionally coarse and serializable:

- `missing-intent-domain`
- `no-capabilities`
- `capability-filter-empty`
- `domain-mismatch`

### Decision 2: Keep service-port identities in shared type constants

`CREATIVE_DOMAIN_SERVICE_PORT_IDS` and named constants such as
`SCENE_RENDER_SERVICE_PORT_ID` live in `domain-routing.ts`. Provider and
operation-tool metadata import the constants to avoid string drift.

### Decision 3: Leave macro behavior unchanged

The animation macro already serves the known scene/puppet wrapper shape. This
change adds a scoped TODO beside the macro rather than broadening the macro
without a concrete new wrapper requirement.

## Non-Goals

- Do not implement full DomainRouter policy, scoring, fallback routing, or Rust
  `ActionRequest` domain hints.
- Do not change runtime-scene/runtime-puppet animation behavior or serialized
  blend formats.
- Do not introduce runtime, Bevy, ECS, or concrete service imports into shared
  routing contracts.
