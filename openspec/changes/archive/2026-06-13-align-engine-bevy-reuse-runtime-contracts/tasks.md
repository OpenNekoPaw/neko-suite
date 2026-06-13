## 1. Bevy Reuse Governance

- [x] 1.1 Add an engine Bevy allowlist document or source-level policy covering approved direct crates, deferred crates, and excluded full Bevy runtime/renderer crates.
- [x] 1.2 Add or extend Rust architecture checks that fail on disallowed Bevy App, Schedule ownership, Renderer, Window, AssetServer, or plugin runtime dependencies in engine runtime and renderer crates.
- [x] 1.3 Record current dependency facts in the implementation notes: `bevy_ecs = 0.15`, `bevy_tasks` availability through `bevy_ecs`, and current `glam = 0.29` boundary.
- [x] 1.4 Add a `bevy_math` guard or TODO(P1) gate requiring coordinated `glam` alignment before adoption.

## 2. Animation Leaf Sampler Contracts

- [x] 2.1 Define shared animation leaf sampler DTOs in `engine-types` or the existing zero-Bevy shared animation contract module.
- [x] 2.2 Add serialization and round-trip tests for leaf sample DTOs, including time, duration, track identity, sampled values, and metadata.
- [x] 2.3 Implement a runtime-puppet adapter that samples `AnimationClip2D` into the shared leaf contract without storing graph state in the clip.
- [x] 2.4 Implement a runtime-scene adapter that samples 3D animation clip data into the same leaf contract or a compatibility wrapper.
- [x] 2.5 Add architecture checks ensuring leaf sampler DTOs do not import runtime-scene, runtime-puppet, renderer, host, VSCode, Webview, or Bevy runtime crates.

## 3. Shared Morph And BlendShape GPU Compute

- [x] 3.1 Add a domain-neutral Morph/BlendShape compute primitive module under `engine-gpu`.
- [x] 3.2 Define primitive inputs for base vertex data, delta ranges, weights, output buffers, supported attributes, tolerance metadata, and GPU-local errors.
- [x] 3.3 Add CPU reference fixtures for 2D BlendShape and 3D morph target weighted-delta accumulation.
- [x] 3.4 Add GPU parity tests comparing the shared primitive against CPU references for ordinary 2D and 3D fixtures.
- [x] 3.5 Add an extreme fixture covering more than twenty active shapes or morph targets with large deltas and unusual weight distribution.
- [x] 3.6 Adapt scene renderer GPU morph code to use the shared primitive or document an explicit unsupported/fallback diagnostic if the current layout cannot yet be represented.
- [x] 3.7 Adapt puppet renderer GPU BlendShape code to use the shared primitive or document an explicit unsupported/fallback diagnostic if the current layout cannot yet be represented.
- [x] 3.8 Add architecture checks ensuring `engine-gpu` does not import scene renderer, puppet renderer, runtime-scene, runtime-puppet, kernel service, host, Live2D, or MOC3 internals.

## 4. Runtime-Puppet Parallel CPU Deformation

- [x] 4.1 Add direct `bevy_tasks` usage to runtime-puppet where needed for CPU BlendShape and 2D skinning mesh or vertex batch evaluation.
- [x] 4.2 Preserve the existing serial CPU deformation path as a deterministic fallback and test reference.
- [x] 4.3 Implement parallel pre-skin BlendShape evaluation without changing the required `ControlDriver -> pre-skin BlendShape -> Skinning` ordering.
- [x] 4.4 Implement parallel skinning evaluation and preserve optional post-skin corrective BlendShape behavior.
- [x] 4.5 Add tests comparing serial and parallel outputs for ordinary puppet mesh fixtures.
- [x] 4.6 Add many-shapes with large-delta tests and diagnostics reporting mesh id, vertex id or range, active shape count, maximum error, and failing stage.
- [x] 4.7 Add runtime selection logic or configuration that can force serial fallback for diagnostics, unsupported targets, or small workloads.

## 5. Benchmarks And Default Policy

- [x] 5.1 Add benchmark fixtures for 1k, 10k, and 50k vertex puppet meshes.
- [x] 5.2 Record serial versus parallel deformation timings and identify the workload threshold where parallel evaluation becomes beneficial.
- [x] 5.3 Set the production default policy for parallel CPU deformation from benchmark evidence, keeping serial fallback available.
- [x] 5.4 Document any numeric-stability mitigation decision if f32 accumulation exceeds the configured tolerance.

## 6. Integration Validation

- [x] 6.1 Run `cargo fmt` for the affected Rust crates.
- [x] 6.2 Run targeted `cargo test` for `engine-types`, `engine-gpu`, `runtime-puppet`, `runtime-scene`, and affected renderer crates.
- [x] 6.3 Run architecture tests covering Bevy governance, shared DTO dependencies, runtime-puppet zero-GPU dependency, and engine-gpu domain neutrality.
- [x] 6.4 Run `cd packages/neko-engine && cargo test` or document any platform/tooling blocker with targeted passing evidence.
- [x] 6.5 Run `openspec validate align-engine-bevy-reuse-runtime-contracts --strict`.
- [x] 6.6 Apply the Neko quality review gate and record residual risk for Bevy dependency policy, numeric tolerance, GPU parity coverage, and benchmark default selection.
