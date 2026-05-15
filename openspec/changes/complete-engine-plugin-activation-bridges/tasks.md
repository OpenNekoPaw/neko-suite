## 1. Inventory Plugin Kinds And Registries

- [x] 1.1 Inventory all `PluginKind` variants, capability types, and current `EffectRegistryActivator` routing.
- [x] 1.2 Identify existing registries or service boundaries for Format, Device, Exporter, Connector, and Model contributions.
- [x] 1.3 Define typed activation outcomes for registered, unsupported capability, validation failure, trust failure, and rollback failure.
- [x] 1.4 Document native syscall audit limits in plugin activation docs or error comments.

## 2. Add Focused Activation Bridges

- [x] 2.1 Add bridge traits for format, device, exporter, connector, and model plugin contributions.
- [x] 2.2 Implement plugin-id-scoped register and unregister behavior for each bridge or registry adapter.
- [x] 2.3 Update PluginManager activation dispatch to route each PluginKind to its focused bridge.
- [x] 2.4 Keep Shader/Lut/EffectPreset behavior compatible with the existing effect registry path.

## 3. Add Signature Verification Boundary

- [x] 3.1 Introduce a signature verifier trait with explicit valid, invalid, missing, unsupported, and unavailable outcomes.
- [x] 3.2 Replace signature presence-check activation behavior with verifier outcome consumption.
- [x] 3.3 Ensure invalid or unavailable verification prevents native registry registration unless an explicit developer-mode policy allows otherwise.
- [x] 3.4 Add tests for valid, invalid, missing, and unavailable verification outcomes.

## 4. Rollback And Audit

- [x] 4.1 Implement rollback for partial activation failures across multiple registered contributions.
- [x] 4.2 Ensure deactivation unregisters all plugin-scoped contributions.
- [x] 4.3 Emit audit events for activation success, activation failure, deactivation, and rollback failure.
- [x] 4.4 Add architecture tests that prevent non-effect plugin kinds from being hardwired into `EffectRegistryActivator`.

## 5. Validation

- [x] 5.1 Run plugin manager and activation unit tests.
- [x] 5.2 Run host-api plugin controller tests or the closest targeted host-api suite.
- [x] 5.3 Run `cargo check -p neko-engine-host-api --lib --no-default-features`.
- [x] 5.4 Run `openspec validate complete-engine-plugin-activation-bridges --strict`.
