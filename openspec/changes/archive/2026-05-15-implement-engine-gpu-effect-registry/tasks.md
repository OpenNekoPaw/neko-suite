## 1. Trait And Registry

- [x] 1.1 Add `GpuEffect` trait and GPU effect parameter wrapper types.
- [x] 1.2 Add registry storage and registration helpers to `EffectDispatcher`.
- [x] 1.3 Add `UnknownEffect` error mapping for registry misses.

## 2. Built-In Effect Migration

- [x] 2.1 Wrap blur processors as `GpuEffect` implementations.
- [x] 2.2 Wrap style processors as `GpuEffect` implementations.
- [x] 2.3 Wrap color and shader preset processors as `GpuEffect` implementations.
- [x] 2.4 Register all existing built-in effects during dispatcher initialization.

## 3. Fallback Removal

- [x] 3.1 Replace hard-coded `apply_single_tex()` match routing with registry lookup.
- [x] 3.2 Remove normal dispatch access to `apply_custom_tex_fallback()`.
- [x] 3.3 Ensure plugin/custom unknown effects fail clearly instead of silently using CPU fallback.

## 4. Verification

- [x] 4.1 Add unit tests for known effect registration and unknown effect errors.
- [x] 4.2 Add visual/parity coverage for representative blur, style, color, and shader preset effects.
- [x] 4.3 Measure frame timing and verify the registry path stays within the baseline tolerance.
- [x] 4.4 Run `cd packages/neko-engine && cargo test` for affected crates.
