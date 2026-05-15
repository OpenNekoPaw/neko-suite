## Context

P0a creates registry-based GPU dispatch, but plugins and clients still need a unified way to discover and register capabilities. Audio DSP also has hard-coded factory routing, and ML integration is still file-oriented. This P1 change wires capability registration and discovery without attempting realtime ML GPU bridge work.

## Goals / Non-Goals

**Goals:**

- Add an audio effect factory registry.
- Implement effect registry activation from plugin manifests.
- Add primitive, zero-internal-dependency effect capability DTOs in `engine-types`.
- Expose capability discovery to host-api and TS clients.
- Add offline ML preprocessing as a project workflow.
- Remove the deprecated P0 rollback flag.

**Non-Goals:**

- Implement ML texture/tensor GPU interop.
- Implement in-place effect optimization.
- Implement transition-as-effect.
- Make plugin manifests require explicit capability ids as a breaking change; derived fallback remains available.

## Decisions

### One Capability Registry

`EffectRegistry` holds queryable `EffectCapability` metadata and references subsystem-specific registries/factories.

Alternatives considered:

- Separate registries per domain. Rejected because plugin activation and TS discovery would duplicate wiring.

### Engine-Types Uses Primitive DTOs

`EffectCapability` and parameter definitions stay in `engine-types` using strings, arrays, enums, and primitive values only.

Alternatives considered:

- Use `wgpu`, `glam`, or runtime component types. Rejected because `engine-types` must remain dependency-light and cross-layer safe.

### ML Starts Offline

ML preprocessing uses existing file I/O model actions and returns source replacement metadata. Realtime or export GPU bridge remains P3.

Alternatives considered:

- Start with GPU bridge. Rejected because platform-specific interop would block the plugin discovery work.

## Risks / Trade-offs

- [Risk] Plugin activation failure blocks capabilities -> Mitigation: validate WGSL/model metadata at activation and report through plugin audit errors.
- [Risk] Dynamic TS discovery changes UI assumptions -> Mitigation: preserve built-in capability metadata and hydrate existing UI from `effects:list-capabilities`.
- [Risk] Derived plugin capability ids collide -> Mitigation: add optional explicit id support and retain deterministic fallback only when absent.

## Migration Plan

1. Add audio effect factory registry and migrate mixdown creation.
2. Add effect capability DTOs and controller action.
3. Add plugin activation handler that registers and unregisters capabilities.
4. Switch TS discovery to engine capability query.
5. Add offline ML preprocessing workflow.
6. Remove the P0 `use_pipeline_sink` rollback flag.
7. Roll back individual plugin capability types by leaving built-ins registered and disabling only plugin activation hooks.
