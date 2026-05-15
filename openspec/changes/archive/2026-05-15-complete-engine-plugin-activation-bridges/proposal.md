## Why

The plugin system already has manifest validation, trust gates, audit events, and an `EffectRegistryActivator`, but only shader/LUT/effect-preset style capabilities have an activation path. Completing activation bridges for the remaining declared plugin kinds turns the manifest model into a usable extension surface without weakening the native-plugin trust boundary.

## What Changes

- Add activation bridge contracts for `Format`, `Device`, `Exporter`, `Connector`, and `Model` plugin kinds.
- Route each plugin kind through a focused registry/adapter boundary instead of overloading `EffectRegistryActivator`.
- Preserve existing Shader/Lut/EffectPreset behavior and keep effect registration data-driven.
- Add an explicit signature verification service interface so Ed25519 verification can move beyond presence checks without embedding crypto policy into every activator.
- Keep native `cdylib` sandbox limitations documented: host-api audit covers engine calls, not direct syscalls.
- Add tests for plugin activation/deactivation routing, unsupported capability errors, audit behavior, and registry cleanup.

## Capabilities

### New Capabilities
- `engine-plugin-activation-bridges`: Defines activation bridge behavior for all declared engine plugin kinds, registry ownership, signature verification integration, and activation/deactivation cleanup.

### Modified Capabilities
- `market-plugin-governance`: Extends governance requirements by requiring activation to use the existing load gates and explicit signature verification result, while preserving the documented native syscall audit boundary.

## Impact

- Affected Rust modules:
  - `packages/neko-engine/packages/host-api/src/plugin`
  - plugin manager, manifest, auditor, trust/signature validation, and activation handler code.
  - engine registries or adapter modules for format, device, exporter, connector, model, and effect capabilities.
- Affected contracts:
  - plugin activation handler routing and plugin capability validation.
  - signature verification service boundary.
- No marketplace manifest shape change is intended unless tests expose missing optional fields that already exist in the schema.
