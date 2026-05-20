# Deferred Foundation Decisions

This change intentionally lands the remaining shared 2D/3D foundation without
widening the control or orchestration surface beyond animation contract cleanup
and engine tool domain registration. Transform propagation, PuppetService
computation, and Scene3D + Puppet co-rendering are treated as already-landed
foundation guarded by regression tests.

## ArtifactSnapshot

Status: deferred to a future Control-layer change.

Decision:

- Do not add a broad `ArtifactSnapshot` or diff contract in this change.
- Wait until FeedbackBus and ControlDecision consumers exist so the snapshot
  shape is driven by real control-loop needs.
- Keep render/export foundation work independent from artifact diff semantics.

Follow-up trigger:

- Create a dedicated OpenSpec change when Layer 4 Control needs cross-domain
  snapshot comparison, feedback, or rollback planning.

## Full DomainRouter

Status: deferred after the metadata foundation.

Decision:

- Keep this change to serializable domain metadata, tool projection, and a
  dependency-clean router skeleton/contract.
- Do not execute runtime mutations inside routing.
- Do not let router contracts import runtime-scene, runtime-puppet, Bevy, ECS
  world handles, or concrete service implementations.

Follow-up trigger:

- Create a dedicated OpenSpec change when Intent-to-service execution plans need
  policy, prioritization, capability discovery, or multi-domain routing.

## Rust ActionRequest domain hints

Status: deferred to the full routing change.

Decision:

- Do not add a Rust `ActionRequest.domain` or equivalent hint in this foundation
  change.
- First annotate engine tools with serializable metadata and register scene /
  puppet tools through the provider boundary.
- Design request hints together with DomainRouter execution plans so the Rust
  API does not grow a field before the routing consumer is defined.

Follow-up trigger:

- Create a dedicated OpenSpec change when Agent-side routing needs to pass
  selected domain or service-port identity into Rust execution requests.

## engine-ecs-core

Status: deferred until there is an ECS-specific abstraction.

Decision:

- Keep pure animation DTOs and the transform propagation algorithm in
  `engine-types`.
- Do not introduce `engine-ecs-core` only to host zero-Bevy DTOs or generic math.
- Consider `engine-ecs-core` only for future Bevy/ECS-specific abstractions such
  as world handles, generic systems, or ECS scheduling contracts.

Follow-up trigger:

- Create a narrowly scoped OpenSpec change if scene, puppet, or a future runtime
  need to share Bevy/ECS traits rather than pure data or pure algorithms.
