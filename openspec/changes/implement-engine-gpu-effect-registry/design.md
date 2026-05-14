## Context

`EffectDispatcher` currently chooses processors through hard-coded effect type matches. This violates open/closed principles and keeps plugin shader effects outside the fast GPU path. The first registry change is independent from PipelineSink because `GpuEffect::apply_tex()` works on GPU textures, not `PipelineOutput`.

## Goals / Non-Goals

**Goals:**

- Add a `GpuEffect` trait for texture-to-texture GPU effects.
- Register built-in effects at dispatcher construction.
- Replace hard-coded routing with registry lookup.
- Remove CPU fallback for unknown GPU effects.
- Preserve current visual output for known effects.

**Non-Goals:**

- Implement plugin activation or TS discovery; that is covered by `implement-engine-effect-plugin-discovery`.
- Implement audio effect factory changes.
- Implement ML GPU bridge or transition-as-effect.
- Optimize in-place texture reuse; that is P2 work.

## Decisions

### Registry Over Match

`EffectDispatcher` owns a `HashMap<String, Box<dyn GpuEffect>>`. Existing processors are wrapped in small effect adapters and registered during initialization.

Alternatives considered:

- Keep match and add more branches. Rejected because it keeps every extension coupled to dispatcher edits.

### Unknown Means Error

Unregistered GPU effects return `UnknownEffect`. They must not trigger CPU readback/upload fallback.

Alternatives considered:

- Keep CPU fallback for unknown effects. Rejected because it hides performance problems and violates the GPU-only hot path.

### Cost And In-Place Are Reserved Defaults

`estimated_cost()` returns `0` and `supports_in_place()` returns `false` in P0. P2 may override them for heavy effects and safe color transforms.

Alternatives considered:

- Delay these methods. Rejected because adding them later would break trait implementers.

## Risks / Trade-offs

- [Risk] Trait dispatch adds tiny per-effect overhead -> Mitigation: measure baseline and accept if within the 5% frame budget.
- [Risk] Adapter wrappers drift from old processor behavior -> Mitigation: visual equivalence tests for each built-in effect family.
- [Risk] Unknown effects now fail user workflows that relied on fallback -> Mitigation: return clear `UnknownEffect` errors and document migration to registered effects.

## Migration Plan

1. Add trait and effect parameter wrapper types.
2. Wrap built-in effect processors.
3. Change dispatcher lookup to registry-based routing.
4. Delete or isolate CPU fallback from normal effect dispatch.
5. Add tests that all known effects resolve through the registry.
6. Roll back by temporarily re-enabling the old match path only for known built-ins if parity issues appear.
