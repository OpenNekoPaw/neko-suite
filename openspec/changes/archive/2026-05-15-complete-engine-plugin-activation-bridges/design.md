## Context

`host-api/src/plugin` already implements manifest parsing, lifecycle, trust tiers, permission audit, and `PluginActivationHandler`. `EffectRegistryActivator` currently maps Shader, Lut, Model-like, and EffectPreset capability types into effect/audio/model registration paths, but the declared `PluginKind` enum also includes Format, Device, Exporter, and Connector. Those kinds can be scanned and enabled, but they do not have focused activation bridges.

五层分析：

- 职责：PluginManager owns lifecycle; activators own kind-specific registration; registries own runtime lookup.
- 依赖：activation bridges should depend on narrow registry traits, not concrete service implementations.
- 接口：each PluginKind needs a clear capability schema and deactivation cleanup contract.
- 扩展：new plugin kinds should add a bridge without editing unrelated effect code.
- 测试：activation routing, trust gates, signature verification results, and cleanup must be independently testable.

## Goals / Non-Goals

**Goals:**

- Provide activation bridge implementations or bridge contracts for Format, Device, Exporter, Connector, and Model plugin kinds.
- Keep Shader, Lut, and EffectPreset activation compatible.
- Introduce a signature verification service boundary with explicit pass/fail/unsupported results.
- Make activation failure deterministic and auditable.
- Ensure deactivation unregisters plugin contributions from each registry.

**Non-Goals:**

- Do not implement a native process sandbox for `cdylib` plugins.
- Do not redesign the market manifest v4 schema.
- Do not require every bridge to support dynamic native code execution in this change; registration-only bridges are acceptable when the runtime implementation is not ready.
- Do not move PluginManager out of host-api in this change.

## Decisions

### Decision 1: Use focused bridge traits per contribution family

Add or formalize bridge traits such as:

- `FormatPluginRegistry`
- `DevicePluginRegistry`
- `ExporterPluginRegistry`
- `ConnectorPluginRegistry`
- `ModelPluginRegistry`

`PluginActivationHandler` dispatches to these bridge traits based on `PluginKind` and validated capabilities.

Alternative considered: expand `EffectRegistryActivator` to handle all plugin kinds. This was rejected because it would turn an effect-specific bridge into a plugin god object.

### Decision 2: Treat unsupported runtime execution as a valid activation error

If a plugin kind has manifest support but no safe runtime execution path yet, activation must fail with a typed unsupported-capability error after load gates. It must not silently enable a plugin that has no registered behavior.

Alternative considered: mark plugin enabled but inert. This was rejected because it makes UI state misleading and complicates audit/debugging.

### Decision 3: Signature verification is a service boundary

Introduce a verifier interface that returns explicit verification outcomes: valid, invalid, missing, unsupported algorithm, incompatible target, or verification unavailable. The plugin load gate consumes this result before activation.

Alternative considered: keep presence-check logic until a later crypto PR. This was rejected for the bridge completion proposal because activation bridges increase the number of executable plugin paths and need a single verification seam.

### Decision 4: Deactivation must be symmetrical

Every registration made during activation must have a plugin-id-scoped cleanup path. Registries should support unregister-by-plugin where practical.

Alternative considered: rely on process restart for cleanup. This was rejected because hot reload and enable/disable are already part of the plugin lifecycle.

## Risks / Trade-offs

- Registry abstractions can multiply quickly -> keep bridge traits tiny and capability-family specific.
- Signature crypto integration may depend on available key material -> implement interface and deterministic failure modes first, then wire actual Ed25519 verification behind it.
- Native plugin syscalls remain outside audit -> document this explicitly in activation errors and governance docs.
- Some plugin kinds may lack production consumers -> provide registration-only or unsupported bridges with tests rather than pretending support is complete.

## Migration Plan

1. Inventory `PluginKind`, `PluginCapability`, and existing activation behavior.
2. Define focused bridge traits and plugin-id cleanup semantics.
3. Implement bridge routing in the plugin activation layer.
4. Add signature verifier interface and route load gates through explicit verification outcomes.
5. Add tests for each PluginKind activation and deactivation path.
6. Add architecture tests that prevent non-effect plugin kinds from being routed through `EffectRegistryActivator`.

## Open Questions

- Should `Connector` plugins register Agent tools, external service endpoints, or both? Default: define connector registration metadata first and leave execution to existing permission/audit gates.
- Should `Model` activation bridge live with runtime-ml or host-api plugin registry? Default: keep the bridge trait in host-api plugin code and inject a runtime-ml-backed registry when the `onnx` feature is enabled.
