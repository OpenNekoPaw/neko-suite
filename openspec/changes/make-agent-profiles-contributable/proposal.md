## Why

Agent profiles are currently treated mostly as code-owned presets or domain-local descriptors. That makes built-in profiles useful as a standard library, but it risks turning them into a hard platform whitelist: new Skills can only adjust existing profiles instead of contributing their own durable artifact shapes, creation lifecycles, or provider/model expression profiles.

This change makes profiles first-class Agent capability contributions. Skills, domain packages, market packages, and project packages can ship profiles together or separately while the runtime still validates, registers, and composes them through explicit contracts.

## What Changes

- Add a profile contribution contract for Artifact Profiles, Creation Profiles, and Provider/Model Expression Profiles.
- Add profile registries so built-in profiles become default contributions, not the only accepted definitions.
- Allow Skills to declare consumed, produced, preferred, or required profile ids without owning profile definitions privately.
- Allow profile-only packages to be distributed through market/project/personal sources without bundling a Skill.
- Keep skill-local profiles only for non-durable, non-shared temporary structures; durable or cross-Skill profiles must register as independent contracts.
- Define fail-visible behavior for unknown profile ids, duplicate ids, unsupported versions, missing validators, unsafe host requirements, malformed descriptors, and untrusted market profile packages.
- Preserve the current Agent-first Skill activation boundary: profile discovery and catalog projection do not auto-activate Skills.
- Non-goal: do not turn Creation Profiles into a workflow engine or allow profiles to execute side effects. Tools, domain services, approval, and diagnostics remain the execution boundary.
- Non-goal: do not move provider credentials, adapter wire mapping, or user TOML workflow definitions into profile descriptors.

## Capabilities

### New Capabilities

- `agent-profile-contribution-contract`: Defines how Agent profile descriptors are contributed, registered, validated, distributed, referenced by Skills, and injected into Agent prompt/schema/tool-policy composition.

### Modified Capabilities

- `agent-capability-model-config`: Clarifies that provider/model expression profiles may be referenced by model/catalog metadata but profile definitions remain contributed contracts, not user TOML workflow definitions.

## Impact

- `packages/neko-types`: new shared profile descriptor contracts, registry interfaces, validation diagnostics, Skill profile references, and market/profile metadata types.
- `packages/neko-agent/packages/agent`: profile registries, capability runtime registration, prompt/schema composition, creation profile projection, and fail-visible diagnostics.
- `packages/neko-agent/packages/extension` and `packages/neko-agent/packages/cli-tui`: host bootstrap wiring for shared profile registries and capability provider loading.
- `packages/neko-agent/packages/platform`: model/catalog projection may reference provider/model expression profile ids without owning profile definitions.
- `packages/neko-market` / Agent market install targets: profile-only package validation, trust handling, and install locations.
- Existing built-in profiles remain available, but should be registered through the same contribution path used by external profiles.
- Compatibility: Neko Suite is prelaunch, so internal DTOs can change deliberately. Existing durable artifacts with known profile ids must still load or fail with explicit unsupported/missing-profile diagnostics; valuable project data must not be silently rewritten or discarded.
