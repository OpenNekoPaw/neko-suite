## 1. Inventory And Contract Placement

- [x] 1.1 Inventory all `neko_engine_kernel` imports and kernel error/service trait uses in `runtime-device`.
- [x] 1.2 Inventory all `neko_engine_kernel` imports and kernel error/service trait uses in `runtime-ml`.
- [x] 1.3 Classify each shared item as pure DTO, service trait, boundary error, or implementation helper.
- [x] 1.4 Decide the lower-layer home for each pure contract: `engine-types`, runtime-local public contract module, or existing shared type.

## 2. Move Runtime Contracts Down

- [x] 2.1 Move device service traits, request/response DTOs, and boundary errors that cross crate boundaries into lower-layer contract modules.
- [x] 2.2 Move ML service traits, request/response DTOs, and boundary errors that cross crate boundaries into lower-layer contract modules.
- [x] 2.3 Keep cpal/gilrs/midir/ort/ndarray/ffmpeg-dependent implementation details out of `engine-types`.
- [x] 2.4 Add conversion helpers only at the kernel boundary where runtime errors map into kernel errors.

## 3. Remove Runtime-To-Kernel Dependencies

- [x] 3.1 Remove `neko-engine-kernel` from `runtime-device/Cargo.toml` and update imports to lower-layer contracts.
- [x] 3.2 Remove `neko-engine-kernel` from `runtime-ml/Cargo.toml` and update imports to lower-layer contracts.
- [x] 3.3 Update kernel facade/service factory adapters to consume the moved contracts.
- [x] 3.4 Update host-api imports only where contract paths changed, keeping production service graph wiring facade-oriented.

## 4. Architecture Guardrails

- [x] 4.1 Add architecture tests that fail if `runtime-device` or `runtime-ml` declares `neko-engine-kernel` in Cargo.toml.
- [x] 4.2 Add source-scan tests that fail on `neko_engine_kernel` imports under `runtime-device/src` or `runtime-ml/src`.
- [x] 4.3 Add or update tests that prove `engine-types` remains free of runtime implementation dependencies.
- [x] 4.4 Add a runtime-level test or compile check proving runtime services can be instantiated without kernel facade construction.

## 5. Validation

- [x] 5.1 Run `cargo check -p neko-runtime-device`.
- [x] 5.2 Run `cargo check -p neko-runtime-ml` with the supported feature set.
- [x] 5.3 Run `cargo check -p neko-engine-kernel --lib --no-default-features`.
- [x] 5.4 Run host-api targeted checks for affected device and ML controllers.
- [x] 5.5 Run `openspec validate decouple-runtime-device-ml-from-kernel --strict`.
